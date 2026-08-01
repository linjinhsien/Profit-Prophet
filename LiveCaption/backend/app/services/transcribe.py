"""Amazon Transcribe Streaming 介面層（安心聽 CareCaption）。

上層（WebSocket 端點）只需要知道三件事：

    recognizer = create_recognizer(RecognizerConfig(language_code="zh-TW"))
    async with recognizer:
        await recognizer.send_audio(pcm16_bytes)      # 丟音訊進去
        async for segment in recognizer.segments():   # 拿字幕出來
            ...

其餘全部封裝在這一層，包含長照現場的四個實際問題：

1. 長者講話慢、停頓久
   Transcribe Streaming 一段時間收不到音訊就會斷開連線。
   → `silence_keepalive` 在閒置時自動補靜音，維持連線。

2. 字幕在螢幕上跳動，長者根本讀不完
   Transcribe 的 partial 結果會反覆改寫。
   → 預設開啟 partial results stabilization 並設為 high，
     已辨識的字就不再變動，長者才讀得下去。

3. 外籍看護講印尼語/越南語，長者講中文，混在同一段對話
   → 支援 `identify_language`（整段自動判定）與
     `identify_multiple_languages`（同一段中英夾雜也能切）。

4. 交班記錄需要分辨「誰說的」
   → `show_speaker_label` 產生語者標籤，寫進逐字稿。

另外提供 `MockStreamingRecognizer`：沒有 AWS 憑證（或在飛機上寫 code）
也能跑完整條管線，Demo 不會開天窗。
"""

from __future__ import annotations

import abc
import asyncio
import contextlib
import logging
import random
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Any, Final, Literal

from app.audio.pcm import (
    CARE_AUDIO_FORMAT,
    AudioFormat,
    AudioFormatError,
    iter_chunks,
    silence,
    validate_pcm16,
)

logger = logging.getLogger(__name__)

__all__ = [
    "CARE_LANGUAGE_OPTIONS",
    "CaptionSegment",
    "MockStreamingRecognizer",
    "PartialStability",
    "RecognizerConfig",
    "RecognizerError",
    "RecognizerState",
    "RecognizerUnavailableError",
    "StreamingRecognizer",
    "TranscribeStreamingRecognizer",
    "TranscribeUnavailableError",
    "create_recognizer",
    "open_recognizer",
]

PartialStability = Literal["low", "medium", "high"]

#: 預設支援的語言：中文與英文。
CARE_LANGUAGE_OPTIONS: Final[tuple[str, ...]] = (
    "zh-TW",  # 中文（台灣）
    "en-US",  # 英語
)

#: Transcribe Streaming 目前沒有台北區域，設成台北會直接連不上。
#: 這是第一次用最常踩的坑，所以在設定階段就擋掉並給替代建議。
_REGIONS_WITHOUT_STREAMING: Final[dict[str, str]] = {
    "ap-east-2": "台北區域尚未提供 Transcribe Streaming，請改用 ap-northeast-1（東京）",
}

#: 每次送出的音訊塊大小（毫秒）。100ms 是延遲與請求數的折衷點。
_DEFAULT_CHUNK_MS: Final[float] = 100.0

#: 佇列結束哨符
_SENTINEL: Final[object] = object()


class RecognizerError(RuntimeError):
    """語音辨識過程發生錯誤。"""


class RecognizerUnavailableError(RecognizerError):
    """辨識引擎無法使用（缺少 SDK、憑證或設定不支援）。

    `open_recognizer(engine="auto")` 會接住這個錯誤並退回 Mock，
    所以任何新增的引擎只要丟這個型別（或其子類），退場機制就會生效。
    """


class TranscribeUnavailableError(RecognizerUnavailableError):
    """無法使用 Amazon Transcribe Streaming（缺少 SDK、憑證或區域不支援）。"""


class RecognizerState(str, Enum):
    IDLE = "idle"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    CLOSED = "closed"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class CaptionSegment:
    """一段辨識結果。

    `is_partial=True` 代表還在講、文字可能會被改寫；
    `is_partial=False` 是這句話的定稿，可以送去翻譯、寫進逐字稿。
    """

    text: str
    is_partial: bool
    language: str | None = None
    start_time: float = 0.0
    end_time: float = 0.0
    result_id: str = ""
    speakers: tuple[str, ...] = ()
    confidence: float | None = None
    stable: bool = False
    received_at: float = field(default_factory=time.time)

    @property
    def duration(self) -> float:
        return max(0.0, self.end_time - self.start_time)

    def as_message(self) -> dict[str, Any]:
        """轉成 WebSocket 訊息格式（欄位名對齊前端）。"""
        return {
            "type": "partial" if self.is_partial else "final",
            "segmentId": self.result_id,
            "original": self.text,
            "lang": self.language,
            "startTime": round(self.start_time, 3),
            "endTime": round(self.end_time, 3),
            "speakers": list(self.speakers),
            "confidence": self.confidence,
            "stable": self.stable,
            "ts": self.received_at,
        }


@dataclass(frozen=True, slots=True)
class RecognizerConfig:
    """Transcribe Streaming 的設定。

    預設值就是長照場景調好的組合，直接用即可。
    """

    # --- 連線 ---
    region: str = "ap-northeast-1"

    # --- 語言 ---
    #: 固定語言。要用自動語言辨識時設為 None。
    language_code: str | None = "zh-TW"
    #: 自動判定整段音訊的語言（適合「這位看護講印尼語」）
    identify_language: bool = False
    #: 同一段音訊中切換多語（適合中印夾雜的照護對話）
    identify_multiple_languages: bool = False
    #: 自動辨識時的候選語言，至少兩種
    language_options: tuple[str, ...] = CARE_LANGUAGE_OPTIONS
    #: 候選語言中的偏好語言，可加快判定
    preferred_language: str | None = "zh-TW"

    # --- 音訊 ---
    audio: AudioFormat = CARE_AUDIO_FORMAT
    chunk_ms: float = _DEFAULT_CHUNK_MS

    # --- 字幕品質（長者可讀性的關鍵）---
    stabilize_partials: bool = True
    partial_stability: PartialStability = "high"

    # --- 照護記錄 ---
    show_speaker_label: bool = False

    # --- 照護術語 ---
    #: Custom Vocabulary 名稱，放「鼻胃管、抽痰、翻身拍背、血氧」等術語
    vocabulary_name: str | None = None
    #: 詞彙過濾器（例如過濾不雅字詞）
    vocabulary_filter_name: str | None = None
    vocabulary_filter_method: Literal["remove", "mask", "tag"] | None = None

    #: 直接內嵌的術語清單，讓模型偏向這些詞（長照術語、人名、藥名）。
    #: Amazon Transcribe 需要先在主控台建立 Custom Vocabulary 才能用，
    #: 所以它只看 `vocabulary_name`；ElevenLabs Scribe 支援直接傳
    #: `keyterms`，不需要事先建立資源，這個欄位就是給它用的。
    keyterms: tuple[str, ...] = ()

    # --- 連線維持 ---
    #: 閒置時自動補靜音，避免長者停頓太久被斷線
    silence_keepalive: bool = True
    #: 閒置超過幾秒開始補靜音
    keepalive_idle_seconds: float = 3.0
    #: 補靜音的檢查間隔
    keepalive_interval_seconds: float = 0.5

    #: 續接既有 session（斷線重連時用）
    session_id: str | None = None

    def __post_init__(self) -> None:
        self.validate()

    # -- 驗證 ---------------------------------------------------------------

    def validate(self) -> None:
        if hint := _REGIONS_WITHOUT_STREAMING.get(self.region):
            raise TranscribeUnavailableError(hint)

        self.audio.assert_streamable()

        if self.chunk_ms <= 0:
            raise ValueError("chunk_ms 必須大於 0")

        auto_modes = (self.identify_language, self.identify_multiple_languages)
        if all(auto_modes):
            raise ValueError(
                "identify_language 與 identify_multiple_languages 不能同時開啟，"
                "請選一種：整段單一語言 或 段內多語切換"
            )

        auto_detect = any(auto_modes)
        if auto_detect:
            if self.language_code is not None:
                raise ValueError(
                    "開啟自動語言辨識時 language_code 必須為 None"
                    "（Transcribe 不接受同時指定固定語言）"
                )
            if len(set(self.language_options)) < 2:
                raise ValueError("自動語言辨識需要至少兩種 language_options")
            if (
                self.preferred_language is not None
                and self.preferred_language not in self.language_options
            ):
                raise ValueError(
                    f"preferred_language={self.preferred_language!r} "
                    "必須是 language_options 之一"
                )
        elif not self.language_code:
            raise ValueError(
                "未開啟自動語言辨識時必須指定 language_code（例如 'zh-TW'）"
            )

        if self.stabilize_partials and self.partial_stability not in (
            "low",
            "medium",
            "high",
        ):
            raise ValueError(
                f"partial_stability 必須是 low/medium/high，收到 {self.partial_stability!r}"
            )

        if self.vocabulary_filter_name and not self.vocabulary_filter_method:
            raise ValueError(
                "指定 vocabulary_filter_name 時必須同時指定 vocabulary_filter_method"
            )

    # -- 衍生值 -------------------------------------------------------------

    @property
    def auto_detect_language(self) -> bool:
        return self.identify_language or self.identify_multiple_languages

    @property
    def chunk_bytes(self) -> int:
        return self.audio.bytes_for_ms(self.chunk_ms)

    def for_language(self, language_code: str) -> RecognizerConfig:
        """複製一份設定並改成固定語言（關掉自動辨識）。"""
        return replace(
            self,
            language_code=language_code,
            identify_language=False,
            identify_multiple_languages=False,
        )

    def to_request_kwargs(self) -> dict[str, Any]:
        """組出 `start_stream_transcription()` 的參數。

        None 值會被 SDK 自動省略，所以不需要額外過濾。
        """
        kwargs: dict[str, Any] = {
            "language_code": self.language_code,
            "media_sample_rate_hz": self.audio.sample_rate_hz,
            "media_encoding": self.audio.encoding,
            "session_id": self.session_id,
        }

        if self.auto_detect_language:
            kwargs["language_options"] = list(self.language_options)
            kwargs["preferred_language"] = self.preferred_language
            if self.identify_language:
                kwargs["identify_language"] = True
            else:
                kwargs["identify_multiple_languages"] = True

            # 自動語言辨識模式下，Transcribe 只接受複數形式的詞彙參數
            if self.vocabulary_name:
                kwargs["vocabulary_names"] = [self.vocabulary_name]
            if self.vocabulary_filter_name:
                kwargs["vocab_filter_names"] = [self.vocabulary_filter_name]
        else:
            if self.vocabulary_name:
                kwargs["vocabulary_name"] = self.vocabulary_name
            if self.vocabulary_filter_name:
                kwargs["vocab_filter_name"] = self.vocabulary_filter_name

        if self.vocabulary_filter_method:
            kwargs["vocab_filter_method"] = self.vocabulary_filter_method

        if self.stabilize_partials:
            kwargs["enable_partial_results_stabilization"] = True
            kwargs["partial_results_stability"] = self.partial_stability

        if self.show_speaker_label:
            kwargs["show_speaker_label"] = True

        return kwargs


@dataclass
class RecognizerStats:
    """簡單的觀測指標，Demo 時可以顯示在畫面角落。"""

    audio_bytes_sent: int = 0
    audio_seconds_sent: float = 0.0
    keepalive_frames: int = 0
    partial_segments: int = 0
    final_segments: int = 0
    started_at: float | None = None

    @property
    def uptime_seconds(self) -> float:
        return 0.0 if self.started_at is None else time.time() - self.started_at

    def as_dict(self) -> dict[str, Any]:
        return {
            "audioBytesSent": self.audio_bytes_sent,
            "audioSecondsSent": round(self.audio_seconds_sent, 2),
            "keepaliveFrames": self.keepalive_frames,
            "partialSegments": self.partial_segments,
            "finalSegments": self.final_segments,
            "uptimeSeconds": round(self.uptime_seconds, 2),
        }


class StreamingRecognizer(abc.ABC):
    """即時語音辨識的抽象介面。

    有兩個實作：`TranscribeStreamingRecognizer`（真的打 AWS）
    與 `MockStreamingRecognizer`（離線 Demo）。
    上層程式碼只依賴這個介面，換引擎不用改。
    """

    def __init__(self, config: RecognizerConfig) -> None:
        self._config = config
        self._state = RecognizerState.IDLE
        self._stats = RecognizerStats()
        self._queue: asyncio.Queue[CaptionSegment | object] = asyncio.Queue()
        self._failure: BaseException | None = None
        self._segments_claimed = False

    # -- 唯讀屬性 -----------------------------------------------------------

    @property
    def config(self) -> RecognizerConfig:
        return self._config

    @property
    def state(self) -> RecognizerState:
        return self._state

    @property
    def stats(self) -> RecognizerStats:
        return self._stats

    @property
    def engine(self) -> str:
        raise NotImplementedError

    @property
    def is_running(self) -> bool:
        return self._state is RecognizerState.RUNNING

    # -- 生命週期 -----------------------------------------------------------

    @abc.abstractmethod
    async def start(self) -> None:
        """建立辨識串流。"""

    @abc.abstractmethod
    async def send_audio(self, pcm16: bytes) -> None:
        """送出 PCM16/mono 音訊。"""

    @abc.abstractmethod
    async def stop(self) -> None:
        """停止送音訊，等待剩餘的 final 結果送完後關閉。"""

    @abc.abstractmethod
    async def aclose(self) -> None:
        """立即關閉，不等待剩餘結果。"""

    # -- 結果串流 -----------------------------------------------------------

    async def segments(self) -> AsyncIterator[CaptionSegment]:
        """非同步迭代辨識結果，直到串流結束。

        只允許單一消費者。
        """
        if self._segments_claimed:
            raise RecognizerError("segments() 已被取用，只支援單一消費者")
        self._segments_claimed = True

        while True:
            item = await self._queue.get()
            if item is _SENTINEL:
                break
            assert isinstance(item, CaptionSegment)
            yield item

        if self._failure is not None:
            raise RecognizerError(
                f"辨識串流異常中斷：{self._failure}"
            ) from self._failure

    # -- context manager ----------------------------------------------------

    async def __aenter__(self) -> StreamingRecognizer:
        # 允許傳入已經啟動的辨識器（例如 open_recognizer() 的回傳值），
        # 這樣 `async with await open_recognizer(...)` 也能正常運作。
        if self._state is RecognizerState.IDLE:
            await self.start()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if exc_type is None:
            await self.stop()
        else:
            await self.aclose()

    # -- 內部工具 -----------------------------------------------------------

    def _require_running(self) -> None:
        if self._state is not RecognizerState.RUNNING:
            raise RecognizerError(
                f"辨識器狀態為 {self._state.value}，無法送出音訊；請先呼叫 start()"
            )

    async def _emit(self, segment: CaptionSegment) -> None:
        if segment.is_partial:
            self._stats.partial_segments += 1
        else:
            self._stats.final_segments += 1
        await self._queue.put(segment)

    async def _finish(self, failure: BaseException | None = None) -> None:
        if failure is not None and self._failure is None:
            self._failure = failure
        await self._queue.put(_SENTINEL)


class TranscribeStreamingRecognizer(StreamingRecognizer):
    """Amazon Transcribe Streaming 實作。

    需要 IAM 權限 `transcribe:StartStreamTranscription`。
    憑證走預設鏈（EC2 Instance Role / ECS Task Role / 環境變數 / ~/.aws），
    請不要把 Access Key 寫進程式碼。
    """

    def __init__(self, config: RecognizerConfig) -> None:
        super().__init__(config)
        self._stream: Any = None
        self._reader_task: asyncio.Task[None] | None = None
        self._keepalive_task: asyncio.Task[None] | None = None
        self._send_lock = asyncio.Lock()
        self._last_audio_at: float = 0.0
        self._request_id: str | None = None

    @property
    def engine(self) -> str:
        return "amazon-transcribe-streaming"

    @property
    def request_id(self) -> str | None:
        """AWS 請求 ID，回報問題給 AWS Support 時要用。"""
        return self._request_id

    # -- 生命週期 -----------------------------------------------------------

    async def start(self) -> None:
        if self._state is not RecognizerState.IDLE:
            raise RecognizerError(f"重複啟動：目前狀態 {self._state.value}")

        self._state = RecognizerState.STARTING
        client_cls = _load_transcribe_client()

        try:
            client = client_cls(region=self._config.region)
            self._stream = await client.start_stream_transcription(
                **self._config.to_request_kwargs()
            )
        except Exception as exc:  # noqa: BLE001 - 統一轉成本層的錯誤型別
            self._state = RecognizerState.FAILED
            raise _translate_aws_error(exc, self._config) from exc

        self._request_id = getattr(self._stream.response, "request_id", None)
        self._state = RecognizerState.RUNNING
        self._stats.started_at = time.time()
        self._last_audio_at = time.monotonic()

        self._reader_task = asyncio.create_task(
            self._read_results(), name="transcribe-reader"
        )
        if self._config.silence_keepalive:
            self._keepalive_task = asyncio.create_task(
                self._keepalive_loop(), name="transcribe-keepalive"
            )

        logger.info(
            "Transcribe 串流已開啟 region=%s language=%s request_id=%s",
            self._config.region,
            self._config.language_code or "auto",
            self._request_id,
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

        # 告訴 Transcribe 音訊送完了，它會把最後幾句 final 吐出來
        with contextlib.suppress(Exception):
            await self._stream.input_stream.end_stream()

        if self._reader_task is not None:
            try:
                await asyncio.wait_for(self._reader_task, timeout=10.0)
            except TimeoutError:
                logger.warning("等待 Transcribe 收尾逾時，強制關閉")
                await _cancel(self._reader_task)
            except Exception:  # noqa: BLE001
                logger.exception("Transcribe 收尾時發生錯誤")
            self._reader_task = None

        self._state = RecognizerState.CLOSED

    async def aclose(self) -> None:
        if self._state is RecognizerState.CLOSED:
            return
        self._state = RecognizerState.STOPPING

        await _cancel(self._keepalive_task)
        await _cancel(self._reader_task)
        self._keepalive_task = None
        self._reader_task = None

        if self._stream is not None:
            with contextlib.suppress(Exception):
                await self._stream.input_stream.end_stream()

        self._state = RecognizerState.CLOSED
        await self._finish()

    # -- 內部 ---------------------------------------------------------------

    async def _send_raw(self, pcm16: bytes) -> None:
        """切塊並送出，用鎖避免 keepalive 與音訊交錯寫入同一條串流。"""
        chunk_bytes = self._config.chunk_bytes
        async with self._send_lock:
            for chunk in iter_chunks(pcm16, chunk_bytes):
                await self._stream.input_stream.send_audio_event(audio_chunk=chunk)
        self._stats.audio_bytes_sent += len(pcm16)
        self._stats.audio_seconds_sent += (
            len(pcm16) / self._config.audio.bytes_per_second
        )

    async def _read_results(self) -> None:
        """把 Transcribe 事件流轉成 CaptionSegment 推進佇列。"""
        transcript_event_cls = _load_transcript_event()
        failure: BaseException | None = None
        try:
            async for event in self._stream.output_stream:
                if not isinstance(event, transcript_event_cls):
                    continue
                for result in event.transcript.results or ():
                    segment = _segment_from_result(result, self._config)
                    if segment is not None:
                        await self._emit(segment)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            failure = _translate_aws_error(exc, self._config)
            self._state = RecognizerState.FAILED
            logger.error("Transcribe 事件流中斷：%s", exc)
        finally:
            await self._finish(failure)

    async def _keepalive_loop(self) -> None:
        """閒置時補靜音，避免長者停頓太久導致串流被關閉。"""
        interval = self._config.keepalive_interval_seconds
        idle_threshold = self._config.keepalive_idle_seconds
        frame = silence(self._config.chunk_ms, self._config.audio)

        try:
            while self._state is RecognizerState.RUNNING:
                await asyncio.sleep(interval)
                if self._state is not RecognizerState.RUNNING:
                    break
                idle_for = time.monotonic() - self._last_audio_at
                if idle_for < idle_threshold:
                    continue
                try:
                    await self._send_raw(frame)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("送出保活靜音失敗：%s", exc)
                    break
                self._stats.keepalive_frames += 1
        except asyncio.CancelledError:
            raise


class MockStreamingRecognizer(StreamingRecognizer):
    """離線用的假辨識器。

    存在理由很實際：黑客松現場網路可能不通、Bedrock 權限可能還沒開，
    但 Demo 不能停。它會依照送進來的音訊長度，
    按節奏吐出長照情境的逐字稿（含 partial → final 的節奏）。
    """

    #: 長照現場的示範腳本（照服員 / 長者 / 家屬）
    DEFAULT_SCRIPT: Final[tuple[tuple[str, str], ...]] = (
        ("zh-TW", "阿嬤，早安，我們現在來量血壓好嗎"),
        ("zh-TW", "我今天早上覺得頭有點暈，胸口悶悶的"),
        ("en-US", "Blood pressure is one forty-five over eighty-eight"),
        ("zh-TW", "血壓一百四十五，八十八，血氧九十七"),
        ("zh-TW", "昨天晚上她起來上廁所的時候差一點跌倒"),
        ("en-US", "She almost fell when going to the bathroom last night"),
        ("zh-TW", "下午三點要記得帶她去日照中心做復健"),
    )

    def __init__(
        self,
        config: RecognizerConfig,
        script: tuple[tuple[str, str], ...] | None = None,
        *,
        seconds_per_line: float = 2.5,
        seed: int | None = None,
    ) -> None:
        super().__init__(config)
        self._script = script or self.DEFAULT_SCRIPT
        self._seconds_per_line = max(0.2, seconds_per_line)
        self._random = random.Random(seed)
        self._cursor = 0
        self._audio_seconds = 0.0
        self._next_emit_at = 0.0
        self._timeline = 0.0

    @property
    def engine(self) -> str:
        return "mock"

    async def start(self) -> None:
        if self._state is not RecognizerState.IDLE:
            raise RecognizerError(f"重複啟動：目前狀態 {self._state.value}")
        self._state = RecognizerState.RUNNING
        self._stats.started_at = time.time()
        self._next_emit_at = self._seconds_per_line
        logger.info("使用 Mock 辨識器（未連線 AWS）")

    async def send_audio(self, pcm16: bytes) -> None:
        self._require_running()
        if not pcm16:
            return
        validate_pcm16(pcm16, self._config.audio)

        self._stats.audio_bytes_sent += len(pcm16)
        duration = len(pcm16) / self._config.audio.bytes_per_second
        self._stats.audio_seconds_sent += duration
        self._audio_seconds += duration

        while self._audio_seconds >= self._next_emit_at:
            await self._emit_next_line()
            self._next_emit_at += self._seconds_per_line

    async def stop(self) -> None:
        if self._state in (RecognizerState.CLOSED, RecognizerState.IDLE):
            return
        self._state = RecognizerState.CLOSED
        await self._finish()

    async def aclose(self) -> None:
        await self.stop()

    async def _emit_next_line(self) -> None:
        language, text = self._script[self._cursor % len(self._script)]
        self._cursor += 1

        result_id = str(uuid.uuid4())
        start_time = self._timeline
        end_time = start_time + self._seconds_per_line
        self._timeline = end_time

        if self._config.language_code is not None:
            language = self._config.language_code

        # 模擬 partial 逐漸長出來的過程
        cut = max(1, len(text) // 2)
        await self._emit(
            CaptionSegment(
                text=text[:cut],
                is_partial=True,
                language=language,
                start_time=start_time,
                end_time=end_time,
                result_id=result_id,
                stable=self._config.stabilize_partials,
            )
        )
        await self._emit(
            CaptionSegment(
                text=text,
                is_partial=False,
                language=language,
                start_time=start_time,
                end_time=end_time,
                result_id=result_id,
                speakers=("spk_0",) if self._config.show_speaker_label else (),
                confidence=round(self._random.uniform(0.88, 0.99), 3),
                stable=True,
            )
        )


# --------------------------------------------------------------------------- #
# Factory
# --------------------------------------------------------------------------- #

Engine = Literal["auto", "aws", "mock", "elevenlabs"]


def create_recognizer(
    config: RecognizerConfig | None = None,
    *,
    engine: Engine = "auto",
) -> StreamingRecognizer:
    """依環境挑選辨識器實作。

    engine:
      * ``"aws"``         強制使用 Amazon Transcribe Streaming，不可用就丟錯
      * ``"elevenlabs"``  強制使用 ElevenLabs Scribe v2 Realtime，不可用就丟錯
      * ``"mock"``        強制離線模擬
      * ``"auto"``        偵測得到 SDK 與憑證就走 AWS，否則退回 mock

    ``"auto"`` 刻意不會挑 ElevenLabs：它需要另一組付費金鑰，
    不該在使用者沒明確要求時被動用。
    """
    config = config or RecognizerConfig()

    if engine == "mock":
        return MockStreamingRecognizer(config)

    if engine == "aws":
        _load_transcribe_client()  # 缺 SDK 會在這裡直接丟出明確錯誤
        return TranscribeStreamingRecognizer(config)

    if engine == "elevenlabs":
        return _load_elevenlabs_recognizer()(config)

    if engine != "auto":
        raise ValueError(f"未知的 engine：{engine!r}")

    try:
        _load_transcribe_client()
    except TranscribeUnavailableError as exc:
        logger.warning("%s → 退回 Mock 辨識器", exc)
        return MockStreamingRecognizer(config)

    if not _has_aws_credentials():
        logger.warning(
            "找不到 AWS 憑證（環境變數 / ~/.aws / Instance Role）→ 退回 Mock 辨識器"
        )
        return MockStreamingRecognizer(config)

    return TranscribeStreamingRecognizer(config)


async def open_recognizer(
    config: RecognizerConfig | None = None,
    *,
    engine: Engine = "auto",
) -> StreamingRecognizer:
    """建立並啟動辨識器，回傳的物件已經在 running 狀態。

    這是 `create_recognizer()` + `start()` 的組合，差別在於
    ``engine="auto"`` 時多了一層真實的退場機制：

    `create_recognizer()` 只能用「環境裡有沒有憑證跡象」做啟發式判斷，
    但憑證存在不代表有效（例如機器上有 ``~/.aws`` 卻沒設好、
    或在本機誤走 IMDS）。這種情況要等真的連線才會爆。
    這裡把啟動失敗接起來，退回 Mock 辨識器，Demo 就不會開天窗。

    ``engine="aws"`` 時不會退場，錯誤會直接往上丟。
    """
    config = config or RecognizerConfig()
    recognizer = create_recognizer(config, engine=engine)

    try:
        await recognizer.start()
    except RecognizerUnavailableError as exc:
        if engine != "auto":
            raise
        logger.warning("辨識引擎無法使用 → 改用 Mock 辨識器：%s", exc)
        await recognizer.aclose()
        recognizer = MockStreamingRecognizer(config)
        await recognizer.start()

    return recognizer


# --------------------------------------------------------------------------- #
# 內部輔助
# --------------------------------------------------------------------------- #


def _load_elevenlabs_recognizer() -> Any:
    """延遲匯入，避免 transcribe 與 elevenlabs_stt 互相 import。"""
    from app.services.elevenlabs_stt import ElevenLabsStreamingRecognizer

    return ElevenLabsStreamingRecognizer


def _load_transcribe_client() -> Any:
    try:
        from amazon_transcribe.client import TranscribeStreamingClient
    except ImportError as exc:  # pragma: no cover
        raise TranscribeUnavailableError(
            "缺少 amazon-transcribe 套件，請執行 `pip install amazon-transcribe`"
        ) from exc
    return TranscribeStreamingClient


def _load_transcript_event() -> Any:
    from amazon_transcribe.model import TranscriptEvent

    return TranscriptEvent


def _has_aws_credentials() -> bool:
    """粗略判斷環境裡有沒有可用的 AWS 憑證。

    這只是啟發式判斷，用來決定 Demo 要不要退回 mock；
    真正的驗證還是由 AWS 端做。
    """
    import os
    from pathlib import Path

    env_signals = (
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_PROFILE",
        "AWS_ROLE_ARN",
        "AWS_WEB_IDENTITY_TOKEN_FILE",
        "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",  # ECS Task Role
        "AWS_CONTAINER_CREDENTIALS_FULL_URI",
    )
    if any(os.environ.get(name) for name in env_signals):
        return True

    aws_dir = Path(os.environ.get("AWS_CONFIG_FILE", "~/.aws/config")).expanduser()
    credentials = Path("~/.aws/credentials").expanduser()
    return aws_dir.exists() or credentials.exists()


def _segment_from_result(result: Any, config: RecognizerConfig) -> CaptionSegment | None:
    """把 Transcribe 的 Result 物件轉成 CaptionSegment。"""
    alternatives = result.alternatives or ()
    if not alternatives:
        return None

    best = alternatives[0]
    text = (best.transcript or "").strip()
    if not text:
        return None

    items = best.items or ()

    # 語者標籤：保持出現順序並去重
    speakers = tuple(
        dict.fromkeys(item.speaker for item in items if item.speaker is not None)
    )

    confidences = [item.confidence for item in items if item.confidence is not None]
    confidence = round(sum(confidences) / len(confidences), 4) if confidences else None

    is_partial = bool(result.is_partial)
    if is_partial:
        stable_flags = [item.stable for item in items if item.stable is not None]
        stable = bool(stable_flags) and all(stable_flags)
    else:
        stable = True

    return CaptionSegment(
        text=text,
        is_partial=is_partial,
        language=result.language_code or config.language_code,
        start_time=float(result.start_time or 0.0),
        end_time=float(result.end_time or 0.0),
        result_id=result.result_id or str(uuid.uuid4()),
        speakers=speakers,
        confidence=confidence,
        stable=stable,
    )


#: 憑證問題的辨識特徵。
#: awscrt 丟出的是 AwsCrtError，型別本身看不出是憑證問題，只能比對訊息。
_CREDENTIAL_ERROR_MARKERS: Final[tuple[str, ...]] = (
    "AWS_AUTH_CREDENTIALS",
    "CREDENTIALS_PROVIDER",
    "CREDENTIALS COULD NOT BE SOURCED",
    "NOCREDENTIALPROVIDERS",
    "UNABLE TO LOCATE CREDENTIALS",
)

_CREDENTIAL_HINT: Final[str] = (
    "找不到可用的 AWS 憑證。本機請跑 `aws configure` 或設定 AWS_PROFILE；"
    "部署在 AWS 上請確認 EC2 Instance Role / ECS Task Role 已掛上並具備 "
    "transcribe:StartStreamTranscription 權限。"
    "想先跳過 AWS 做 Demo 可改用 engine='mock'。"
    "不要把 Access Key 寫進程式碼或 commit 上去。"
)


def _is_credential_error(exc: BaseException, message: str) -> bool:
    if type(exc).__name__ == "CredentialsException":
        return True
    upper = message.upper()
    return any(marker in upper for marker in _CREDENTIAL_ERROR_MARKERS)


def _unpack_service_error(exc: BaseException) -> tuple[str | None, str]:
    """從 SDK 的例外取出 (AWS 錯誤代碼, 可讀訊息)。

    amazon-transcribe 對於沒有對應類別的錯誤會統一包成
    `UnknownServiceException`，把資訊放在 args = (狀態碼, 錯誤代碼, 訊息)。
    只看 `type(exc).__name__` 會抓不到真正的錯誤代碼，
    而 `str(exc)` 會印出整個 tuple，很難讀 —— 所以要在這裡拆開。
    """
    args = getattr(exc, "args", ())
    if len(args) == 3 and isinstance(args[1], str) and isinstance(args[2], str):
        return args[1], args[2]
    if len(args) == 2 and isinstance(args[1], str):
        return None, args[1]
    return None, str(exc) or type(exc).__name__


def _translate_aws_error(exc: BaseException, config: RecognizerConfig) -> RecognizerError:
    """把 SDK 的例外轉成帶「怎麼修」提示的錯誤訊息。"""
    error_code, message = _unpack_service_error(exc)
    lookup_key = error_code or type(exc).__name__

    if _is_credential_error(exc, message) or lookup_key == "CredentialsException":
        return TranscribeUnavailableError(f"{message}｜{_CREDENTIAL_HINT}")

    hints: dict[str, str] = {
        "BadRequestException": (
            "請求參數不合法。常見原因："
            f"語言代碼 {config.language_code!r} 在 Transcribe Streaming 不支援、"
            "或取樣率與實際音訊不符。"
        ),
        "LimitExceededException": (
            "超過並行串流上限。Demo 時請避免同時開太多分頁，"
            "或到 Service Quotas 申請調高。"
        ),
        "AccessDeniedException": (
            "IAM 權限不足。請確認角色具備 transcribe:StartStreamTranscription，"
            f"並且該權限沒有被區域條件限制住（目前用 {config.region}）。"
            "工作坊或教學帳號常會只開放特定區域，換個區域再試一次。"
        ),
        "ServiceUnavailableException": (
            f"Transcribe 服務暫時不可用，請稍後重試或換區域（目前 {config.region}）。"
        ),
        "AwsCrtError": (
            "底層連線失敗，請確認網路可連到 "
            f"transcribestreaming.{config.region}.amazonaws.com:443。"
        ),
    }

    if hint := hints.get(lookup_key):
        message = f"{message}｜{hint}"
    elif isinstance(exc, AudioFormatError):
        message = f"{message}｜音訊格式錯誤，請確認前端輸出 PCM16 / 16kHz / mono"

    if error_code and error_code not in message:
        message = f"[{error_code}] {message}"

    return RecognizerError(message)


async def _cancel(task: asyncio.Task[Any] | None) -> None:
    if task is None or task.done():
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError, Exception):
        await task
