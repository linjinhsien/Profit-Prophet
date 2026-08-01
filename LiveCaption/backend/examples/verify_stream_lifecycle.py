#!/usr/bin/env python3
"""驗證 TranscribeStreamingRecognizer 的串流生命週期（不需要 AWS 憑證）。

做法是把一個假的串流注入 `TranscribeStreamingRecognizer`，
但事件物件用的是 amazon-transcribe SDK 真正的 model 類別，
所以解析邏輯（partial/final、語者、信賴度、穩定度）驗到的是實際會跑的程式碼。

驗證項目：
  1. 音訊會被切成設定好的塊大小再送出
  2. partial / final 事件正確轉成 CaptionSegment
  3. 語者標籤與信賴度平均值正確
  4. 閒置時自動補靜音（長者停頓久也不斷線）
  5. stop() 會把收尾的 final 收完才關閉
  6. 服務端錯誤會轉成帶修復提示的 RecognizerError

用法：python examples/verify_stream_lifecycle.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from amazon_transcribe.exceptions import BadRequestException  # noqa: E402
from awscrt.exceptions import AwsCrtError  # noqa: E402
from amazon_transcribe.model import (  # noqa: E402
    Alternative,
    Item,
    Result,
    Transcript,
    TranscriptEvent,
)

from app.services import transcribe as tx  # noqa: E402
from app.services.transcribe import (  # noqa: E402
    RecognizerConfig,
    RecognizerError,
    RecognizerState,
    TranscribeStreamingRecognizer,
)

_failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if condition else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        _failures.append(label)


def section(title: str) -> None:
    print(f"\n{title}")
    print("-" * len(title))


# --------------------------------------------------------------------------- #
# 假串流
# --------------------------------------------------------------------------- #


class FakeOutputStream:
    """可以從測試端推事件進去的假事件流。"""

    def __init__(self) -> None:
        self._queue: asyncio.Queue = asyncio.Queue()

    def push(self, event: object) -> None:
        self._queue.put_nowait(event)

    def fail(self, exc: BaseException) -> None:
        self._queue.put_nowait(exc)

    def close(self) -> None:
        self._queue.put_nowait(None)

    def __aiter__(self) -> FakeOutputStream:
        return self

    async def __anext__(self) -> object:
        item = await self._queue.get()
        if item is None:
            raise StopAsyncIteration
        if isinstance(item, BaseException):
            raise item
        return item


class FakeInputStream:
    def __init__(self, output: FakeOutputStream) -> None:
        self.chunks: list[bytes] = []
        self.ended = False
        self._output = output

    async def send_audio_event(self, audio_chunk: bytes) -> None:
        self.chunks.append(audio_chunk)

    async def end_stream(self) -> None:
        self.ended = True
        self._output.close()


class FakeResponse:
    request_id = "fake-request-id-123"


class FakeStream:
    def __init__(self) -> None:
        self.output_stream = FakeOutputStream()
        self.input_stream = FakeInputStream(self.output_stream)
        self.response = FakeResponse()


class FakeClient:
    last_kwargs: dict = {}
    last_stream: FakeStream | None = None
    #: 設成例外物件時，start_stream_transcription 會直接丟出它
    start_failure: BaseException | None = None

    def __init__(self, *, region: str) -> None:
        self.region = region

    async def start_stream_transcription(self, **kwargs):
        FakeClient.last_kwargs = kwargs
        if FakeClient.start_failure is not None:
            raise FakeClient.start_failure
        FakeClient.last_stream = FakeStream()
        return FakeClient.last_stream


def install_fake_client() -> None:
    tx._load_transcribe_client = lambda: FakeClient  # type: ignore[assignment]
    # 讓 create_recognizer 的 auto 模式一定選 AWS 分支，才能驗到退場邏輯
    tx._has_aws_credentials = lambda: True  # type: ignore[assignment]


# --------------------------------------------------------------------------- #
# 事件建構工具
# --------------------------------------------------------------------------- #


def make_event(
    text: str,
    *,
    is_partial: bool,
    result_id: str = "result-1",
    language: str | None = "zh-TW",
    start: float = 0.0,
    end: float = 2.0,
    speakers: tuple[str, ...] = (),
    confidences: tuple[float, ...] = (),
    stable: bool | None = None,
) -> TranscriptEvent:
    items = []
    characters = list(text) or [""]
    for index, char in enumerate(characters):
        items.append(
            Item(
                start_time=start,
                end_time=end,
                item_type="pronunciation",
                content=char,
                speaker=speakers[index % len(speakers)] if speakers else None,
                confidence=confidences[index % len(confidences)] if confidences else None,
                stable=stable,
            )
        )
    alternative = Alternative(transcript=text, items=items, entities=[])
    result = Result(
        result_id=result_id,
        start_time=start,
        end_time=end,
        is_partial=is_partial,
        alternatives=[alternative],
        channel_id=None,
        language_code=language,
    )
    return TranscriptEvent(transcript=Transcript(results=[result]))


async def collect(recognizer, limit: int) -> list:
    """收集指定數量的 segment（避免測試卡住）。"""
    out = []
    async for segment in recognizer.segments():
        out.append(segment)
        if len(out) >= limit:
            break
    return out


# --------------------------------------------------------------------------- #
# 驗證項目
# --------------------------------------------------------------------------- #


async def test_chunking() -> None:
    section("1. 音訊切塊")
    recognizer = TranscribeStreamingRecognizer(
        RecognizerConfig(chunk_ms=100.0, silence_keepalive=False)
    )
    await recognizer.start()
    stream = FakeClient.last_stream
    assert stream is not None

    check(
        "start() 後狀態為 running",
        recognizer.state is RecognizerState.RUNNING,
        recognizer.state.value,
    )
    check(
        "request_id 有帶出來",
        recognizer.request_id == "fake-request-id-123",
        str(recognizer.request_id),
    )

    # 250ms 音訊 = 8000 bytes，chunk 為 100ms = 3200 bytes
    await recognizer.send_audio(b"\x00\x01" * 4000)
    sizes = [len(chunk) for chunk in stream.input_stream.chunks]
    check("切成 3 塊", len(sizes) == 3, str(sizes))
    check("前兩塊各 3200 bytes", sizes[:2] == [3200, 3200], str(sizes[:2]))
    check("最後一塊 1600 bytes", sizes[-1] == 1600, str(sizes[-1]))
    check(
        "統計的音訊秒數正確",
        abs(recognizer.stats.audio_seconds_sent - 0.25) < 1e-6,
        f"{recognizer.stats.audio_seconds_sent:.3f}s",
    )

    stream.output_stream.close()
    await recognizer.stop()
    check("stop() 後狀態為 closed", recognizer.state is RecognizerState.CLOSED)


async def test_segments() -> None:
    section("2. partial / final 解析")
    recognizer = TranscribeStreamingRecognizer(
        RecognizerConfig(
            language_code=None,
            identify_language=True,
            show_speaker_label=True,
            silence_keepalive=False,
        )
    )
    await recognizer.start()
    stream = FakeClient.last_stream
    assert stream is not None

    stream.output_stream.push(
        make_event("阿嬤早安", is_partial=True, language="zh-TW", stable=True)
    )
    stream.output_stream.push(
        make_event(
            "Nenek, obat pagi sudah diminum",
            is_partial=False,
            result_id="result-2",
            language="id-ID",
            start=2.0,
            end=5.5,
            speakers=("spk_0", "spk_1"),
            confidences=(0.90, 1.00),
        )
    )

    segments = await collect(recognizer, 2)
    partial, final = segments

    check("第一筆是 partial", partial.is_partial)
    check("partial 文字正確", partial.text == "阿嬤早安", partial.text)
    check("partial 標記為 stable", partial.stable is True)
    check("partial 語言 zh-TW", partial.language == "zh-TW", str(partial.language))

    check("第二筆是 final", final.is_partial is False)
    check(
        "final 語言由 Transcribe 自動判定為 id-ID",
        final.language == "id-ID",
        str(final.language),
    )
    check("final 一定是 stable", final.stable is True)
    check(
        "語者標籤去重且保持順序",
        final.speakers == ("spk_0", "spk_1"),
        str(final.speakers),
    )
    check(
        "信賴度取平均",
        final.confidence is not None and abs(final.confidence - 0.95) < 0.01,
        str(final.confidence),
    )
    check("時間軸正確", (final.start_time, final.end_time) == (2.0, 5.5))
    check("duration 正確", abs(final.duration - 3.5) < 1e-9, f"{final.duration}")

    message = final.as_message()
    check(
        "as_message() 欄位對齊前端協定",
        message["type"] == "final"
        and message["original"] == "Nenek, obat pagi sudah diminum"
        and message["lang"] == "id-ID"
        and message["segmentId"] == "result-2",
        str({k: message[k] for k in ("type", "lang", "segmentId")}),
    )
    check(
        "統計數字正確",
        recognizer.stats.partial_segments == 1
        and recognizer.stats.final_segments == 1,
        str(recognizer.stats.as_dict()),
    )

    stream.output_stream.close()
    await recognizer.stop()


async def test_empty_results_skipped() -> None:
    section("3. 空結果會被忽略")
    recognizer = TranscribeStreamingRecognizer(
        RecognizerConfig(silence_keepalive=False)
    )
    await recognizer.start()
    stream = FakeClient.last_stream
    assert stream is not None

    stream.output_stream.push(make_event("   ", is_partial=True))
    stream.output_stream.push(
        TranscriptEvent(transcript=Transcript(results=[]))
    )
    stream.output_stream.push(make_event("有內容", is_partial=False))
    stream.output_stream.close()

    segments = [s async for s in recognizer.segments()]
    check("只留下有內容的那一筆", len(segments) == 1, f"{len(segments)} 筆")
    check("內容正確", segments[0].text == "有內容", segments[0].text)
    await recognizer.stop()


async def test_keepalive() -> None:
    section("4. 閒置自動補靜音（長者停頓久也不斷線）")
    recognizer = TranscribeStreamingRecognizer(
        RecognizerConfig(
            chunk_ms=100.0,
            silence_keepalive=True,
            keepalive_idle_seconds=0.05,
            keepalive_interval_seconds=0.02,
        )
    )
    await recognizer.start()
    stream = FakeClient.last_stream
    assert stream is not None

    await asyncio.sleep(0.30)  # 模擬長者思考、沒說話
    frames = recognizer.stats.keepalive_frames
    check("閒置期間有送出保活靜音", frames > 0, f"{frames} frames")
    check(
        "保活內容確實是靜音",
        bool(stream.input_stream.chunks)
        and set(stream.input_stream.chunks[0]) == {0},
        f"chunk 大小 {len(stream.input_stream.chunks[0])} bytes",
    )

    # 有音訊進來之後就不該再補靜音
    await recognizer.send_audio(b"\x11\x11" * 1600)
    before = recognizer.stats.keepalive_frames
    await asyncio.sleep(0.03)
    check(
        "剛送過音訊時不補靜音",
        recognizer.stats.keepalive_frames == before,
        f"{before} → {recognizer.stats.keepalive_frames}",
    )

    stream.output_stream.close()
    await recognizer.stop()
    check("stop() 會停掉保活任務", recognizer.state is RecognizerState.CLOSED)


async def test_stop_drains_finals() -> None:
    section("5. stop() 會收完最後的 final")
    recognizer = TranscribeStreamingRecognizer(
        RecognizerConfig(silence_keepalive=False)
    )
    await recognizer.start()
    stream = FakeClient.last_stream
    assert stream is not None

    collected: list = []

    async def consumer() -> None:
        async for segment in recognizer.segments():
            collected.append(segment)

    task = asyncio.create_task(consumer())
    await asyncio.sleep(0)

    stream.output_stream.push(make_event("最後一句交班內容", is_partial=False))
    await recognizer.stop()
    await asyncio.wait_for(task, timeout=2.0)

    check("結尾的 final 沒有漏掉", len(collected) == 1, f"{len(collected)} 筆")
    check(
        "內容正確",
        bool(collected) and collected[0].text == "最後一句交班內容",
        collected[0].text if collected else "<空>",
    )
    check("input_stream 已正常結束", stream.input_stream.ended is True)


async def test_error_translation() -> None:
    section("6. 服務端錯誤轉成可行動的訊息")
    recognizer = TranscribeStreamingRecognizer(
        RecognizerConfig(language_code="zh-XX", silence_keepalive=False)
    )
    await recognizer.start()
    stream = FakeClient.last_stream
    assert stream is not None

    stream.output_stream.fail(BadRequestException("LanguageCode is not supported"))

    raised: Exception | None = None
    try:
        async for _ in recognizer.segments():
            pass
    except RecognizerError as exc:
        raised = exc

    check("丟出 RecognizerError", isinstance(raised, RecognizerError))
    check(
        "訊息含原始錯誤",
        raised is not None and "LanguageCode is not supported" in str(raised),
    )
    check(
        "訊息含修復提示（語言代碼 / 取樣率）",
        raised is not None and "取樣率" in str(raised),
        str(raised)[:90] + "…",
    )
    check("狀態轉為 failed", recognizer.state is RecognizerState.FAILED)
    await recognizer.aclose()


async def test_guards() -> None:
    section("7. 使用錯誤會被擋下")
    recognizer = TranscribeStreamingRecognizer(
        RecognizerConfig(silence_keepalive=False)
    )

    raised = False
    try:
        await recognizer.send_audio(b"\x00\x00")
    except RecognizerError:
        raised = True
    check("未 start() 就送音訊會報錯", raised)

    await recognizer.start()
    stream = FakeClient.last_stream
    assert stream is not None

    raised = False
    try:
        await recognizer.start()
    except RecognizerError:
        raised = True
    check("重複 start() 會報錯", raised)

    raised = False
    try:
        await recognizer.send_audio(b"\x00\x00\x00")  # 奇數長度，不是 PCM16
    except Exception as exc:  # noqa: BLE001
        raised = type(exc).__name__ == "AudioFormatError"
    check("長度未對齊的音訊會被擋下", raised)

    stream.output_stream.close()
    await recognizer.stop()

    raised = False
    try:
        async for _ in recognizer.segments():
            pass
        async for _ in recognizer.segments():
            pass
    except RecognizerError:
        raised = True
    check("segments() 只允許單一消費者", raised)


async def test_credential_fallback() -> None:
    section("8. 憑證失效時 auto 模式自動退回 Mock（Demo 不開天窗）")

    # awscrt 丟出的憑證錯誤，型別上看不出來是憑證問題，只能靠訊息判斷
    crt_error = AwsCrtError(
        code=6146,
        name="AWS_AUTH_CREDENTIALS_PROVIDER_IMDS_SOURCE_FAILURE",
        message=(
            "AWS_AUTH_CREDENTIALS_PROVIDER_IMDS_SOURCE_FAILURE: "
            "Valid credentials could not be sourced by the IMDS provider"
        ),
    )

    translated = tx._translate_aws_error(crt_error, RecognizerConfig())
    check(
        "AwsCrtError 的憑證錯誤被歸類為 TranscribeUnavailableError",
        isinstance(translated, tx.TranscribeUnavailableError),
        type(translated).__name__,
    )
    check(
        "訊息含具體修復步驟（aws configure / Task Role）",
        "aws configure" in str(translated) and "Task Role" in str(translated),
    )

    FakeClient.start_failure = crt_error
    try:
        recognizer = await tx.open_recognizer(RecognizerConfig(), engine="auto")
        check(
            "auto 模式退回 Mock 辨識器",
            recognizer.engine == "mock",
            recognizer.engine,
        )
        check(
            "退回後的辨識器已啟動",
            recognizer.state is RecognizerState.RUNNING,
            recognizer.state.value,
        )

        # 退回後仍然是可用的完整介面
        await recognizer.send_audio(b"\x00\x00" * 16_000 * 3)
        segments = await collect(recognizer, 2)
        check(
            "退回後仍能產出字幕",
            len(segments) == 2 and segments[1].is_partial is False,
            segments[1].text if len(segments) > 1 else "<空>",
        )
        await recognizer.stop()

        # engine="aws" 時不該退場，錯誤要直接往上丟
        raised: BaseException | None = None
        try:
            await tx.open_recognizer(RecognizerConfig(), engine="aws")
        except tx.TranscribeUnavailableError as exc:
            raised = exc
        check(
            "engine='aws' 不退場，錯誤直接往上丟",
            isinstance(raised, tx.TranscribeUnavailableError),
            type(raised).__name__ if raised else "<沒有丟錯>",
        )
    finally:
        FakeClient.start_failure = None


async def test_context_manager_reentry() -> None:
    section("9. async with 接受已啟動的辨識器")
    recognizer = await tx.open_recognizer(
        RecognizerConfig(silence_keepalive=False), engine="mock"
    )
    check("open_recognizer 回傳已啟動的辨識器", recognizer.state is RecognizerState.RUNNING)

    async with recognizer as same:
        check("async with 不會重複啟動而報錯", same is recognizer)
    check("離開 with 區塊後已關閉", recognizer.state is RecognizerState.CLOSED)


async def main() -> int:
    install_fake_client()
    print("TranscribeStreamingRecognizer 生命週期驗證（注入假串流，不連線 AWS）")

    for test in (
        test_chunking,
        test_segments,
        test_empty_results_skipped,
        test_keepalive,
        test_stop_drains_finals,
        test_error_translation,
        test_guards,
        test_credential_fallback,
        test_context_manager_reentry,
    ):
        await test()

    print()
    if _failures:
        print(f"{len(_failures)} 項未通過：")
        for name in _failures:
            print(f"  - {name}")
        return 1
    print("全部檢查通過。")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
