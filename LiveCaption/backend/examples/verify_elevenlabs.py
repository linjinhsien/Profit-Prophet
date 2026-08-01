#!/usr/bin/env python3
"""驗證 ElevenLabs Scribe Realtime 實作 —— 不需要 API 金鑰，不連網。

做法是注入一個假的 WebSocket，讓它吐出官方文件記載的事件格式，
所以驗到的是實際會跑的解析邏輯：設定 → 查詢參數、事件 → CaptionSegment、
錯誤分類、保活、stop() 的手動 commit。

用法：
    cd backend && ../.venv/bin/python examples/verify_elevenlabs.py
"""

from __future__ import annotations

import asyncio
import base64
import json
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.audio.pcm import CARE_AUDIO_FORMAT, AudioFormat  # noqa: E402
from app.services.elevenlabs_stt import (  # noqa: E402
    ElevenLabsStreamingRecognizer,
    ElevenLabsUnavailableError,
)
from app.services.transcribe import (  # noqa: E402
    RecognizerConfig,
    RecognizerError,
    RecognizerState,
    RecognizerUnavailableError,
    create_recognizer,
    open_recognizer,
)

GREEN = "\033[32m"
RED = "\033[31m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"

_passed = 0
_failed = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global _passed, _failed
    if ok:
        _passed += 1
        suffix = f" {DIM}— {detail}{RESET}" if detail else ""
        print(f"  {GREEN}[PASS]{RESET} {label}{suffix}")
    else:
        _failed += 1
        print(f"  {RED}[FAIL]{RESET} {label} {DIM}— {detail}{RESET}")


def section(title: str) -> None:
    print(f"\n{BOLD}{title}{RESET}")
    print("-" * max(12, len(title)))


# --------------------------------------------------------------------------- #
# 假 WebSocket
# --------------------------------------------------------------------------- #


class FakeWebSocket:
    """記錄送出的訊息，並依腳本吐回事件。"""

    def __init__(self, script: list[dict[str, Any]], *, hold_open: bool = False) -> None:
        self.sent: list[dict[str, Any]] = []
        self.closed = False
        self._script = list(script)
        self._hold_open = hold_open
        self._queue: asyncio.Queue[str | None] = asyncio.Queue()
        for event in self._script:
            self._queue.put_nowait(json.dumps(event))
        if not hold_open:
            self._queue.put_nowait(None)

    async def send(self, raw: str) -> None:
        if self.closed:
            raise RuntimeError("WebSocket 已關閉")
        self.sent.append(json.loads(raw))

    async def close(self) -> None:
        self.closed = True
        await self._queue.put(None)

    def feed(self, event: dict[str, Any]) -> None:
        self._queue.put_nowait(json.dumps(event))

    def __aiter__(self) -> FakeWebSocket:
        return self

    async def __anext__(self) -> str:
        item = await self._queue.get()
        if item is None:
            raise StopAsyncIteration
        return item


def fake_connect(script: list[dict[str, Any]], *, hold_open: bool = False) -> Any:
    """回傳可注入 recognizer 的 connect 函式，同時保留 socket 供斷言。"""
    holder: dict[str, Any] = {}

    async def connect(url: str, **kwargs: Any) -> FakeWebSocket:
        holder["url"] = url
        holder["kwargs"] = kwargs
        socket = FakeWebSocket(script, hold_open=hold_open)
        holder["socket"] = socket
        return socket

    connect.holder = holder  # type: ignore[attr-defined]
    return connect


def make_recognizer(
    config: RecognizerConfig,
    script: list[dict[str, Any]],
    *,
    hold_open: bool = False,
) -> tuple[ElevenLabsStreamingRecognizer, Any]:
    connect = fake_connect(script, hold_open=hold_open)
    recognizer = ElevenLabsStreamingRecognizer(
        config, api_key="test-key", connect=connect
    )
    return recognizer, connect


async def collect(
    recognizer: ElevenLabsStreamingRecognizer,
) -> tuple[list[Any], BaseException | None]:
    segments: list[Any] = []
    error: BaseException | None = None
    try:
        async for segment in recognizer.segments():
            segments.append(segment)
    except RecognizerError as exc:
        error = exc
    return segments, error


# --------------------------------------------------------------------------- #
# 1. 設定 → 查詢參數
# --------------------------------------------------------------------------- #


def verify_query_params() -> None:
    section("1. 設定會正確轉成 WebSocket 查詢參數")

    fixed = RecognizerConfig(language_code="zh-TW", show_speaker_label=False)
    params = ElevenLabsStreamingRecognizer(fixed, api_key="k").to_query_params()

    check(
        "model 用即時版而非批次版",
        params["model_id"] == "scribe_v2_realtime",
        params["model_id"],
    )
    check(
        "zh-TW 轉成 ISO 639-1 的 zh（Scribe 不吃地區後綴）",
        params["language_code"] == "zh",
        params["language_code"],
    )
    check(
        "audio_format 對應取樣率",
        params["audio_format"] == "pcm_16000",
        params["audio_format"],
    )
    check(
        "用 VAD 自動斷句",
        params["commit_strategy"] == "vad",
        params["commit_strategy"],
    )
    check(
        "沒開語者標籤就不要時間戳（少一輪訊息）",
        "include_timestamps" not in params,
        f"keys={sorted(params)}",
    )

    speakers = replace(fixed, show_speaker_label=True)
    params = ElevenLabsStreamingRecognizer(speakers, api_key="k").to_query_params()
    check(
        "開語者標籤時要求時間戳（語者只存在於該事件）",
        params.get("include_timestamps") == "true",
        str(params.get("include_timestamps")),
    )

    auto = RecognizerConfig(
        language_code=None,
        identify_language=True,
        language_options=("zh-TW", "id-ID", "vi-VN", "en-US"),
        preferred_language="zh-TW",
    )
    params = ElevenLabsStreamingRecognizer(auto, api_key="k").to_query_params()
    check(
        "自動辨識時偏好語言放 language_code",
        params["language_code"] == "zh",
        params["language_code"],
    )
    check(
        "其餘候選語言放 secondary_languages 且不重複偏好語言",
        params["secondary_languages"] == "id,vi,en",
        params["secondary_languages"],
    )
    check(
        "自動辨識時要求回傳偵測到的語言",
        params.get("include_language_detection") == "true",
        str(params.get("include_language_detection")),
    )

    terms = replace(fixed, keyterms=("鼻胃管", "抽痰", "巴氏量表"))
    params = ElevenLabsStreamingRecognizer(terms, api_key="k").to_query_params()
    check(
        "keyterms 直接內嵌（不需先建立 Custom Vocabulary 資源）",
        params["keyterms"] == "鼻胃管,抽痰,巴氏量表",
        params["keyterms"],
    )

    url = ElevenLabsStreamingRecognizer(terms, api_key="k").url
    query = parse_qs(urlparse(url).query)
    check(
        "URL 組出來可被正確解析（中文有 percent-encode）",
        query["keyterms"] == ["鼻胃管,抽痰,巴氏量表"],
        url.split("?")[1][:60] + "…",
    )
    check(
        "端點路徑正確",
        urlparse(url).path == "/v1/speech-to-text/realtime",
        urlparse(url).path,
    )


# --------------------------------------------------------------------------- #
# 2. 事件 → CaptionSegment
# --------------------------------------------------------------------------- #


async def verify_events() -> None:
    section("2. 事件正確轉成 CaptionSegment")

    script = [
        {"message_type": "session_started", "session_id": "sess-1", "config": {}},
        {"message_type": "partial_transcript", "text": "阿嬤你的血壓"},
        {"message_type": "partial_transcript", "text": "阿嬤你的血壓有一點高"},
        {
            "message_type": "committed_transcript",
            "text": "阿嬤，你的血壓有一點高。",
        },
    ]
    config = RecognizerConfig(language_code="zh-TW", silence_keepalive=False)
    recognizer, connect = make_recognizer(config, script)

    await recognizer.start()
    await recognizer.send_audio(b"\x00\x00" * 1600)  # 100ms
    segments, error = await collect(recognizer)
    await recognizer.aclose()

    check("沒有錯誤", error is None, str(error))
    check("session_id 被記下來", recognizer.session_id == "sess-1", str(recognizer.session_id))
    check("收到 2 個 partial + 1 個 final", len(segments) == 3, f"{len(segments)} 段")

    partials = [s for s in segments if s.is_partial]
    finals = [s for s in segments if not s.is_partial]
    check("partial 標記正確", len(partials) == 2, f"{len(partials)} 個")
    check(
        "final 內容正確",
        finals[0].text == "阿嬤，你的血壓有一點高。",
        finals[0].text,
    )
    check("final 的 stable 為 True", finals[0].stable is True)
    check(
        "沒有時間戳時用送出的音訊秒數當時間軸",
        abs(finals[0].end_time - 0.1) < 1e-6,
        f"end_time={finals[0].end_time}",
    )
    check(
        "語言回填設定值",
        finals[0].language == "zh-TW",
        str(finals[0].language),
    )
    check(
        "指標有累計",
        recognizer.stats.partial_segments == 2
        and recognizer.stats.final_segments == 1,
        str(recognizer.stats.as_dict()),
    )

    message = finals[0].as_message()
    check(
        "as_message() 產出前端要的欄位",
        message["type"] == "final" and "original" in message,
        str(sorted(message)),
    )


async def verify_speaker_events() -> None:
    section("3. 語者標籤與信賴度（帶時間戳的事件）")

    script = [
        {"message_type": "session_started", "session_id": "sess-2", "config": {}},
        # 開啟時間戳時兩個事件都會來，不能把同一句送兩次
        {"message_type": "committed_transcript", "text": "重複的句子"},
        {
            "message_type": "committed_transcript_with_timestamps",
            "text": "重複的句子",
            "language_code": "zh",
            "words": [
                {
                    "text": "重複",
                    "start": 1.0,
                    "end": 1.4,
                    "type": "word",
                    "speaker_id": "speaker_0",
                    "logprob": -0.1,
                },
                {"text": " ", "type": "spacing", "logprob": -5.0},
                {
                    "text": "的句子",
                    "start": 1.4,
                    "end": 2.2,
                    "type": "word",
                    "speaker_id": "speaker_1",
                    "logprob": -0.3,
                },
            ],
        },
    ]
    config = RecognizerConfig(
        language_code="zh-TW", show_speaker_label=True, silence_keepalive=False
    )
    recognizer, _ = make_recognizer(config, script)

    await recognizer.start()
    segments, error = await collect(recognizer)
    await recognizer.aclose()

    check("沒有錯誤", error is None, str(error))
    check("同一句只送一次（不重複計入）", len(segments) == 1, f"{len(segments)} 段")

    final = segments[0]
    check(
        "語者依出現順序去重",
        final.speakers == ("speaker_0", "speaker_1"),
        str(final.speakers),
    )
    check(
        "時間取 word 的最小 start 與最大 end",
        (final.start_time, final.end_time) == (1.0, 2.2),
        f"{final.start_time}–{final.end_time}",
    )
    check(
        "logprob 只取 word（不含 spacing）換算成機率",
        final.confidence is not None and 0.80 < final.confidence < 0.83,
        f"confidence={final.confidence}",
    )
    check(
        "偵測到的語言優先於設定值",
        final.language == "zh",
        str(final.language),
    )


# --------------------------------------------------------------------------- #
# 4. 送出格式
# --------------------------------------------------------------------------- #


async def verify_send_format() -> None:
    section("4. 音訊送出格式與 stop() 收尾")

    config = RecognizerConfig(
        language_code="zh-TW", chunk_ms=100.0, silence_keepalive=False
    )
    recognizer, connect = make_recognizer(
        config,
        [{"message_type": "session_started", "session_id": "s", "config": {}}],
        hold_open=True,
    )

    await recognizer.start()
    # 250ms 音訊 → 應該被切成 3 塊（100 + 100 + 50）
    await recognizer.send_audio(b"\x01\x02" * 4000)
    socket = connect.holder["socket"]

    audio_messages = [m for m in socket.sent if m["message_type"] == "input_audio_chunk"]
    check("音訊被切成 3 塊送出", len(audio_messages) == 3, f"{len(audio_messages)} 塊")
    check(
        "每塊都帶 sample_rate",
        all(m["sample_rate"] == 16000 for m in audio_messages),
    )
    check(
        "串流中不 commit（交給 VAD 斷句）",
        all(m["commit"] is False for m in audio_messages),
    )
    decoded = base64.b64decode(audio_messages[0]["audio_base_64"])
    check(
        "base64 解回來是原始 PCM，長度為一個 chunk",
        decoded == b"\x01\x02" * 1600,
        f"{len(decoded)} bytes",
    )
    check(
        "帶上 xi-api-key 標頭",
        connect.holder["kwargs"]["additional_headers"]["xi-api-key"] == "test-key",
    )

    await recognizer.stop()
    tail = socket.sent[-1]
    check(
        "stop() 補一個靜音幀並手動 commit（避免掉最後一句）",
        tail["commit"] is True
        and base64.b64decode(tail["audio_base_64"]) == b"\x00" * 3200,
        f"commit={tail['commit']}",
    )
    check("stop() 後連線已關閉", socket.closed is True)
    check(
        "狀態轉為 closed",
        recognizer.state is RecognizerState.CLOSED,
        recognizer.state.value,
    )


async def verify_keepalive() -> None:
    section("5. 靜音保活（長者停頓數十秒也不斷線）")

    config = RecognizerConfig(
        language_code="zh-TW",
        chunk_ms=20.0,
        silence_keepalive=True,
        keepalive_idle_seconds=0.05,
        keepalive_interval_seconds=0.02,
    )
    recognizer, connect = make_recognizer(
        config,
        [{"message_type": "session_started", "session_id": "s", "config": {}}],
        hold_open=True,
    )

    await recognizer.start()
    await asyncio.sleep(0.25)
    frames = recognizer.stats.keepalive_frames
    await recognizer.aclose()

    check("閒置時自動補靜音", frames > 0, f"{frames} 幀")
    socket = connect.holder["socket"]
    silent = [
        m
        for m in socket.sent
        if base64.b64decode(m["audio_base_64"]) == b"\x00" * 640
    ]
    check("補出去的是靜音幀", len(silent) > 0, f"{len(silent)} 個")


# --------------------------------------------------------------------------- #
# 6. 錯誤處理
# --------------------------------------------------------------------------- #


async def verify_errors() -> None:
    section("6. 錯誤分類與可讀訊息")

    cases = [
        ("auth_error", "invalid api key", True, "API_KEY"),
        ("quota_exceeded", "no credits left", True, "credits"),
        ("unaccepted_terms", "", True, "條款"),
        ("transcriber_error", "internal", False, "transcriber_error"),
        ("chunk_size_exceeded", "too big", False, "chunk_ms"),
    ]

    for code, detail, should_be_unavailable, hint_fragment in cases:
        config = RecognizerConfig(language_code="zh-TW", silence_keepalive=False)
        recognizer, _ = make_recognizer(
            config,
            [
                {"message_type": "session_started", "session_id": "s", "config": {}},
                {"message_type": code, "error": detail},
            ],
        )
        await recognizer.start()
        segments, error = await collect(recognizer)
        await recognizer.aclose()

        check(
            f"{code} 會讓 segments() 丟錯而不是靜默結束",
            error is not None,
            str(error)[:60],
        )
        cause = error.__cause__ if error else None
        is_unavailable = isinstance(cause, ElevenLabsUnavailableError)
        check(
            f"{code} 分類為 {'可退場' if should_be_unavailable else '一般錯誤'}",
            is_unavailable == should_be_unavailable,
            type(cause).__name__ if cause else "None",
        )
        check(
            f"{code} 訊息含修復線索「{hint_fragment}」",
            hint_fragment in str(error),
            str(error)[:80],
        )


async def verify_preflight() -> None:
    section("7. 連線前就擋下不可能成功的設定")

    no_key = ElevenLabsStreamingRecognizer(
        RecognizerConfig(language_code="zh-TW"), api_key=""
    )
    try:
        await no_key.start()
        check("缺金鑰會被擋下", False, "沒有丟錯")
    except ElevenLabsUnavailableError as exc:
        check("缺金鑰會被擋下並指出環境變數名稱", "ELEVENLABS_API_KEY" in str(exc))

    bad_rate_blocked = False
    try:
        RecognizerConfig(
            language_code="zh-TW",
            audio=AudioFormat(sample_rate_hz=22050, channels=1),
        )
    except Exception:  # noqa: BLE001 - AudioFormatError
        bad_rate_blocked = True

    check(
        "共用設定取最嚴格交集：22050 Hz 被擋（Scribe 支援但 Transcribe 不支援）",
        bad_rate_blocked,
        "專案統一走 16 kHz，兩個引擎都能用，所以不受影響",
    )

    try:
        await ElevenLabsStreamingRecognizer(
            RecognizerConfig(language_code="zh-TW", audio=CARE_AUDIO_FORMAT),
            api_key="k",
            connect=fake_connect([]),
        ).start()
        check("正常設定可以啟動", True)
    except Exception as exc:  # noqa: BLE001
        check("正常設定可以啟動", False, str(exc))


# --------------------------------------------------------------------------- #
# 8. 與既有介面的整合
# --------------------------------------------------------------------------- #


async def verify_integration() -> None:
    section("8. 與既有引擎切換機制整合")

    config = RecognizerConfig(language_code="zh-TW")

    recognizer = create_recognizer(config, engine="elevenlabs")
    check(
        "create_recognizer 認得 engine='elevenlabs'",
        isinstance(recognizer, ElevenLabsStreamingRecognizer),
        type(recognizer).__name__,
    )
    check(
        "engine 名稱含模型版本（量測報告要能分辨）",
        recognizer.engine == "elevenlabs-scribe_v2_realtime",
        recognizer.engine,
    )
    check(
        "ElevenLabsUnavailableError 屬於可退場錯誤",
        issubclass(ElevenLabsUnavailableError, RecognizerUnavailableError),
    )

    # engine="elevenlabs" 不退場：缺金鑰要直接丟錯，不能靜默變成假資料
    import os

    saved = os.environ.pop("ELEVENLABS_API_KEY", None)
    try:
        try:
            await open_recognizer(config, engine="elevenlabs")
            check("engine='elevenlabs' 缺金鑰時不退場", False, "沒有丟錯")
        except ElevenLabsUnavailableError:
            check("engine='elevenlabs' 缺金鑰時不退場，錯誤直接往上丟", True)
    finally:
        if saved is not None:
            os.environ["ELEVENLABS_API_KEY"] = saved

    check(
        "auto 模式不會擅自使用 ElevenLabs（那是另一組付費金鑰）",
        not isinstance(
            create_recognizer(config, engine="auto"), ElevenLabsStreamingRecognizer
        ),
    )


# --------------------------------------------------------------------------- #


async def main() -> int:
    print(f"{BOLD}ElevenLabs Scribe Realtime 實作驗證{RESET}")
    print(f"{DIM}不需要 API 金鑰，不連網{RESET}")

    verify_query_params()
    await verify_events()
    await verify_speaker_events()
    await verify_send_format()
    await verify_keepalive()
    await verify_errors()
    await verify_preflight()
    await verify_integration()

    print()
    if _failed:
        print(f"{RED}{_failed} 項失敗{RESET}，{_passed} 項通過")
        return 1
    print(f"{GREEN}全部檢查通過。{RESET}（{_passed} 項）")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
