"""ElevenLabs Scribe v2 Realtime 實作。

跟 `TranscribeStreamingRecognizer` 一樣實作 `StreamingRecognizer`，
所以上層（WebSocket 端點、CLI 示範、延遲量測）換引擎不用改一行程式碼：

    recognizer = await open_recognizer(config, engine="elevenlabs")

協議摘要（`wss://api.elevenlabs.io/v1/speech-to-text/realtime`）
-------------------------------------------------------------
送出   ``{"message_type": "input_audio_chunk", "audio_base_64": …,
          "commit": bool, "sample_rate": 16000}``
收到   ``session_started`` → ``partial_transcript`` → ``committed_transcript``
       （``include_timestamps=true`` 時額外收到
       ``committed_transcript_with_timestamps``，帶 word 級時間、語者、logprob）
錯誤   ``auth_error`` / ``quota_exceeded`` / ``unaccepted_terms`` / … 之後關閉連線

與 Amazon Transcribe 的三個實質差異
--------------------------------
1. **語言代碼格式不同。** Transcribe 用 ``zh-TW``（BCP-47 含地區），
   Scribe 用 ISO 639-1/639-3（``zh``）。`_to_iso_language()` 負責轉換。
2. **術語強化不需要事先建立資源。** Transcribe 要先在主控台建 Custom
   Vocabulary 再用名稱引用；Scribe 直接把詞吃進 ``keyterms`` 查詢參數，
   所以 `RecognizerConfig.keyterms` 對這個引擎才有作用。
3. **斷句由 VAD 決定。** Transcribe 自己決定何時給 final；Scribe 可選
   ``commit_strategy=vad``（自動）或 ``manual``（由我們送 ``commit=true``）。
   這裡用 VAD，並在 `stop()` 時補一次手動 commit 把尾巴收乾淨。
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import math
import os
import time
from typing import Any, Final
from urllib.parse import urlencode

from app.audio.pcm import iter_chunks, silence, validate_pcm16
from app.services.transcribe import (
    CaptionSegment,
    RecognizerConfig,
    RecognizerError,
    RecognizerState,
    RecognizerUnavailableError,
    StreamingRecognizer,
)

logger = logging.getLogger(__name__)

__all__ = [
    "ELEVENLABS_MODEL_ID",
    "ElevenLabsStreamingRecognizer",
    "ElevenLabsUnavailableError",
]

#: 即時辨識模型。批次用的 scribe_v2 延遲太高，不能用在字幕上。
ELEVENLABS_MODEL_ID: Final[str] = "scribe_v2_realtime"

_WS_BASE: Final[str] = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"

#: Scribe 接受的 PCM 取樣率（對應 audio_format 參數）
_SUPPORTED_SAMPLE_RATES: Final[frozenset[int]] = frozenset(
    {8000, 16000, 22050, 24000, 44100, 48000}
)

#: 這些錯誤代表「這個引擎現在用不了」，屬於可退場的情況。
#: 其餘錯誤（transcriber_error 等）是暫時性失敗，照實往上丟。
_UNAVAILABLE_ERRORS: Final[frozenset[str]] = frozenset(
    {"auth_error", "quota_exceeded", "unaccepted_terms"}
)

#: 文件列出的所有錯誤事件。列成集合而不是靠字串比對，
#: 是為了避免新增的錯誤型別被當成未知事件靜默忽略。
_ERROR_CODES: Final[frozenset[str]] = _UNAVAILABLE_ERRORS | frozenset(
    {
        "error",
        "transcriber_error",
        "input_error",
        "commit_throttled",
        "rate_limited",
        "queue_overflow",
        "resource_exhausted",
        "session_time_limit_exceeded",
        "chunk_size_exceeded",
        "insufficient_audio_activity",
    }
)

#: 錯誤代碼 → 看得懂的修復建議
_ERROR_HINTS: Final[dict[str, str]] = {
    "auth_error": "ELEVENLABS_API_KEY 無效或未設定，請到 "
    "https://elevenlabs.io/app/settings/api-keys 確認",
    "quota_exceeded": "ElevenLabs 額度用完了，請查看訂閱方案的剩餘 credits",
    "unaccepted_terms": "尚未接受 Scribe 的服務條款，請先到 ElevenLabs 主控台同意",
    "rate_limited": "請求太頻繁被限流，請降低併發數或稍後再試",
    "chunk_size_exceeded": "單次送出的音訊太大，請調小 chunk_ms",
    "insufficient_audio_activity": "太久沒有有效音訊，連線被關閉；"
    "請開啟 silence_keepalive",
    "session_time_limit_exceeded": "單一 session 已達時間上限，需要重新建立連線",
}


class ElevenLabsUnavailableError(RecognizerUnavailableError):
    """無法使用 ElevenLabs Scribe（缺套件、缺金鑰、額度用盡或條款未同意）。"""


def _to_iso_language(language_code: str | None) -> str | None:
    """``zh-TW`` → ``zh``。Scribe 要 ISO 639-1/639-3，不吃地區後綴。

    注意這會讓「繁體／簡體」的區別消失 —— Scribe 靠模型自行判斷字體，
    無法像 Transcribe 那樣用 ``zh-TW`` 明確指定繁體輸出。
    """
    if not language_code:
        return None
    return language_code.split("-")[0].lower()


class ElevenLabsStreamingRecognizer(StreamingRecognizer):
    """ElevenLabs Scribe v2 Realtime 實作。

    金鑰從環境變數 ``ELEVENLABS_API_KEY`` 讀取，不接受寫在程式碼或設定檔裡。
    """

    def __init__(
        self,
        config: RecognizerConfig,
        *,
        api_key: str | None = None,
        model_id: str = ELEVENLABS_MODEL_ID,
        connect: Any = None,
    ) -> None:
        super().__init__(config)
        self._api_key = api_key or os.environ.get("ELEVENLABS_API_KEY")
        self._model_id = model_id
        #: 可注入的連線函式，測試時換成假的 WebSocket
        self._connect = connect
        self._ws: Any = None
        self._reader_task: asyncio.Task[None] | None = None
        self._keepalive_task: asyncio.Task[None] | None = None
        self._send_lock = asyncio.Lock()
        self._last_audio_at: float = 0.0
        self._session_id: str | None = None
        #: 送出的音訊秒數，用來當作字幕的時間軸
        #: （partial_transcript 事件沒有時間資訊，只能自己記）
        self._timeline: float = 0.0
        self._segment_start: float = 0.0
        self._seq = 0

    @property
    def engine(self) -> str:
        return f"elevenlabs-{self._model_id}"

    @property
    def session_id(self) -> str | None:
        """ElevenLabs 的 session ID，回報問題時要用。"""
        return self._session_id

    # -- 查詢參數 -----------------------------------------------------------

    def to_query_params(self) -> dict[str, str]:
        """把 RecognizerConfig 轉成 WebSocket 的查詢參數。

        獨立成公開方法，這樣不連線也能驗證對應關係是否正確。
        """
        config = self._config
        params: dict[str, str] = {
            "model_id": self._model_id,
            "audio_format": f"pcm_{config.audio.sample_rate_hz}",
            # VAD 自動斷句，行為最接近 Transcribe
            "commit_strategy": "vad",
        }

        if language := _to_iso_language(config.language_code):
            params["language_code"] = language

        if config.auto_detect_language:
            # 自動判定語言：不指定主語言，把候選語言當作次要語言提示，
            # 並要求回傳偵測結果（不然不知道判成哪一種）
            secondary = [
                iso
                for option in config.language_options
                if (iso := _to_iso_language(option))
            ]
            if preferred := _to_iso_language(config.preferred_language):
                params["language_code"] = preferred
                secondary = [iso for iso in secondary if iso != preferred]
            if secondary:
                params["secondary_languages"] = ",".join(dict.fromkeys(secondary))
            params["include_language_detection"] = "true"

        # 語者標籤與信賴度只存在於帶時間戳的事件裡，需要時才開，
        # 因為它會多一輪訊息（延遲代價與 Transcribe 的語者標籤同理）
        if config.show_speaker_label:
            params["include_timestamps"] = "true"

        if config.keyterms:
            params["keyterms"] = ",".join(config.keyterms)

        return params

    @property
    def url(self) -> str:
        return f"{_WS_BASE}?{urlencode(self.to_query_params())}"

    # -- 生命週期 -----------------------------------------------------------

    async def start(self) -> None:
        if self._state is not RecognizerState.IDLE:
            raise RecognizerError(f"重複啟動：目前狀態 {self._state.value}")

        if self._config.audio.sample_rate_hz not in _SUPPORTED_SAMPLE_RATES:
            raise ElevenLabsUnavailableError(
                f"Scribe Realtime 不支援 {self._config.audio.sample_rate_hz} Hz，"
                f"可用：{sorted(_SUPPORTED_SAMPLE_RATES)}"
            )
        if self._config.audio.channels != 1:
            raise ElevenLabsUnavailableError(
                f"Scribe Realtime 需要單聲道，收到 {self._config.audio.channels} 聲道；"
                "請先用 downmix_to_mono() 降混"
            )
        if not self._api_key:
            raise ElevenLabsUnavailableError(
                "找不到 ELEVENLABS_API_KEY。請執行 "
                "`export ELEVENLABS_API_KEY=...`（金鑰可在 "
                "https://elevenlabs.io/app/settings/api-keys 取得）"
            )

        self._state = RecognizerState.STARTING
        connect = self._connect or _load_connect()

        try:
            self._ws = await connect(
                self.url,
                additional_headers={"xi-api-key": self._api_key},
                max_size=None,
                ping_interval=20,
            )
        except Exception as exc:  # noqa: BLE001 - 統一轉成本層錯誤
            self._state = RecognizerState.FAILED
            raise ElevenLabsUnavailableError(
                f"無法連上 ElevenLabs Scribe：{exc}"
            ) from exc

        self._state = RecognizerState.RUNNING
        self._stats.started_at = time.time()
        self._last_audio_at = time.monotonic()

        self._reader_task = asyncio.create_task(
            self._read_results(), name="elevenlabs-reader"
        )
        if self._config.silence_keepalive:
            self._keepalive_task = asyncio.create_task(
                self._keepalive_loop(), name="elevenlabs-keepalive"
            )

        logger.info(
            "Scribe Realtime 串流已開啟 model=%s language=%s",
            self._model_id,
            self._config.language_code or "auto",
        )

    async def send_audio(self, pcm16: bytes) -> None:
        self._require_running()
        if not pcm16:
            return
        validate_pcm16(pcm16, self._config.audio)
        await self._send_raw(pcm16)
        self._last_audio_at = time.monotonic()

    async def stop(self) -> None:
        if self._state in (RecognizerState.CLOSED, RecognizerState.IDLE):
            return
        if self._state is RecognizerState.FAILED:
            await self.aclose()
            return

        self._state = RecognizerState.STOPPING
        await _cancel(self._keepalive_task)
        self._keepalive_task = None

        # VAD 可能還在等靜音才斷句，補一個靜音幀並手動 commit，
        # 把最後一句話收出來，不然講完最後一句就關會掉字。
        with contextlib.suppress(Exception):
            await self._send_chunk(
                silence(self._config.chunk_ms, self._config.audio), commit=True
            )

        if self._reader_task is not None:
            try:
                await asyncio.wait_for(self._reader_task, timeout=10.0)
            except TimeoutError:
                logger.warning("等待 Scribe 收尾逾時，強制關閉")
                await _cancel(self._reader_task)
            except Exception:  # noqa: BLE001
                logger.exception("Scribe 收尾時發生錯誤")
            self._reader_task = None

        with contextlib.suppress(Exception):
            await self._ws.close()

        self._state = RecognizerState.CLOSED

    async def aclose(self) -> None:
        if self._state is RecognizerState.CLOSED:
            return
        self._state = RecognizerState.STOPPING

        await _cancel(self._keepalive_task)
        await _cancel(self._reader_task)
        self._keepalive_task = None
        self._reader_task = None

        if self._ws is not None:
            with contextlib.suppress(Exception):
                await self._ws.close()

        self._state = RecognizerState.CLOSED
        await self._finish()

    # -- 送出 ---------------------------------------------------------------

    async def _send_chunk(self, pcm16: bytes, *, commit: bool = False) -> None:
        message = {
            "message_type": "input_audio_chunk",
            "audio_base_64": base64.b64encode(pcm16).decode("ascii"),
            "commit": commit,
            "sample_rate": self._config.audio.sample_rate_hz,
        }
        await self._ws.send(json.dumps(message))

    async def _send_raw(self, pcm16: bytes) -> None:
        """切塊送出。用鎖避免保活靜音與音訊交錯寫進同一條連線。"""
        async with self._send_lock:
            for chunk in iter_chunks(pcm16, self._config.chunk_bytes):
                await self._send_chunk(chunk)
        seconds = len(pcm16) / self._config.audio.bytes_per_second
        self._stats.audio_bytes_sent += len(pcm16)
        self._stats.audio_seconds_sent += seconds
        self._timeline += seconds

    async def _keepalive_loop(self) -> None:
        """閒置時補靜音。

        Scribe 在長時間沒有有效音訊時會回 ``insufficient_audio_activity``
        並關閉連線，跟 Transcribe 的行為一樣，所以沿用同一套保活策略 ——
        長者講話停頓數十秒是常態。
        """
        interval = self._config.keepalive_interval_seconds
        idle_threshold = self._config.keepalive_idle_seconds
        frame = silence(self._config.chunk_ms, self._config.audio)

        try:
            while self._state is RecognizerState.RUNNING:
                await asyncio.sleep(interval)
                if self._state is not RecognizerState.RUNNING:
                    break
                if time.monotonic() - self._last_audio_at < idle_threshold:
                    continue
                try:
                    await self._send_raw(frame)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("送出保活靜音失敗：%s", exc)
                    break
                self._stats.keepalive_frames += 1
        except asyncio.CancelledError:
            raise

    # -- 接收 ---------------------------------------------------------------

    async def _read_results(self) -> None:
        failure: BaseException | None = None
        try:
            async for raw in self._ws:
                event = json.loads(raw)
                if (segment := self._handle_event(event)) is not None:
                    await self._emit(segment)
        except asyncio.CancelledError:
            raise
        except _ScribeRemoteError as exc:
            failure = exc.as_recognizer_error()
            self._state = RecognizerState.FAILED
            logger.error("Scribe 回報錯誤：%s", exc)
        except Exception as exc:  # noqa: BLE001
            failure = RecognizerError(f"Scribe 事件流中斷：{exc}")
            self._state = RecognizerState.FAILED
            logger.error("Scribe 事件流中斷：%s", exc)
        finally:
            await self._finish(failure)

    def _handle_event(self, event: dict[str, Any]) -> CaptionSegment | None:
        """把一個事件轉成 CaptionSegment（沒有對應結果時回 None）。"""
        kind = event.get("message_type")

        if kind == "session_started":
            self._session_id = event.get("session_id")
            logger.info("Scribe session=%s", self._session_id)
            return None

        if kind in _ERROR_CODES:
            raise _ScribeRemoteError(kind or "error", event.get("error", ""))

        if kind == "partial_transcript":
            return self._build_segment(event, is_partial=True)

        if kind == "committed_transcript":
            # 開啟時間戳時，final 一律等帶時間戳的版本，避免同一句送兩次
            if self._config.show_speaker_label:
                return None
            return self._build_segment(event, is_partial=False)

        if kind == "committed_transcript_with_timestamps":
            if not self._config.show_speaker_label:
                return None
            return self._build_segment(event, is_partial=False)

        if kind != "committed_transcript_entities":
            logger.debug("忽略未知的 Scribe 事件：%s", kind)
        return None

    def _build_segment(
        self, event: dict[str, Any], *, is_partial: bool
    ) -> CaptionSegment | None:
        text = (event.get("text") or "").strip()
        if not text:
            return None

        words = event.get("words") or ()
        speakers = tuple(
            dict.fromkeys(
                speaker
                for word in words
                if (speaker := word.get("speaker_id")) is not None
            )
        )

        starts = [w["start"] for w in words if w.get("start") is not None]
        ends = [w["end"] for w in words if w.get("end") is not None]
        start_time = min(starts) if starts else self._segment_start
        end_time = max(ends) if ends else self._timeline

        if not is_partial:
            # 下一句從這句結束的地方開始算
            self._segment_start = end_time
            self._seq += 1

        return CaptionSegment(
            text=text,
            is_partial=is_partial,
            language=event.get("language_code") or self._config.language_code,
            start_time=float(start_time),
            end_time=float(end_time),
            result_id=f"{self._session_id or 'scribe'}-{self._seq}",
            speakers=speakers,
            confidence=_confidence_from_words(words),
            stable=not is_partial,
        )


# --------------------------------------------------------------------------- #
# 內部輔助
# --------------------------------------------------------------------------- #


class _ScribeRemoteError(Exception):
    """Scribe 從伺服器端回報的錯誤事件。"""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        hint = _ERROR_HINTS.get(code)
        message = f"{code}：{detail}" if detail else code
        super().__init__(f"{message}（{hint}）" if hint else message)

    def as_recognizer_error(self) -> RecognizerError:
        """可退場的錯誤轉成 Unavailable，其餘照實往上丟。"""
        if self.code in _UNAVAILABLE_ERRORS:
            return ElevenLabsUnavailableError(str(self))
        return RecognizerError(str(self))


def _confidence_from_words(words: Any) -> float | None:
    """word 級 logprob 平均後換回機率，對齊 Transcribe 的 confidence 語意。

    logprob 範圍是 (-inf, 0]，0 代表完全確定。
    """
    logprobs = [
        word["logprob"]
        for word in words or ()
        if word.get("logprob") is not None and word.get("type") == "word"
    ]
    if not logprobs:
        return None
    return round(math.exp(sum(logprobs) / len(logprobs)), 4)


def _load_connect() -> Any:
    try:
        from websockets.asyncio.client import connect
    except ImportError as exc:  # pragma: no cover
        raise ElevenLabsUnavailableError(
            "缺少 websockets 套件，請執行 `pip install websockets`"
        ) from exc
    return connect


async def _cancel(task: asyncio.Task[Any] | None) -> None:
    if task is None or task.done():
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
