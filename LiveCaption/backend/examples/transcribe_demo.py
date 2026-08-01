#!/usr/bin/env python3
"""Transcribe Streaming 介面的可執行示範。

用法
----
    # 對著麥克風講話，即時看字幕（最像真實產品的試用方式）
    python examples/transcribe_demo.py --mic --engine aws --lang zh-TW

    # 完全離線（沒有 AWS 憑證也能看到效果）
    python examples/transcribe_demo.py --engine mock --seconds 12

    # 餵一個 WAV 檔
    python examples/transcribe_demo.py --engine aws --wav ./sample.wav --lang zh-TW

    # 照服員情境：自動判斷中文/印尼語/越南語
    python examples/transcribe_demo.py --engine aws --wav ./care.wav --auto

WAV 檔若不是 PCM16/16kHz/mono，程式會自動降混與重取樣。
麥克風模式需要 `pip install sounddevice`，按 Ctrl-C 結束。
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import math
import os
import sys
import time
import wave
from collections.abc import AsyncIterator
from dataclasses import replace
from pathlib import Path

# 讓這支腳本可以直接執行（不用先 pip install -e .）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.audio.microphone import (  # noqa: E402
    MicrophoneUnavailableError,
    list_input_devices,
    microphone_chunks,
)
from app.audio.pcm import (  # noqa: E402
    CARE_AUDIO_FORMAT,
    AudioFormat,
    rms_dbfs,
    to_pcm16,
)
from app.config import (  # noqa: E402
    build_recognizer_config,
    load_dotenv,
    load_engine,
)
from app.services.transcribe import (  # noqa: E402
    CaptionSegment,
    RecognizerError,
    open_recognizer,
)

RESET = "\033[0m"
DIM = "\033[2m"
BOLD = "\033[1m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
CYAN = "\033[36m"
RED = "\033[31m"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="安心聽 CareCaption — Transcribe Streaming 介面示範",
    )
    parser.add_argument(
        "--engine",
        choices=("auto", "aws", "elevenlabs", "mock"),
        default=None,
        help=(
            "辨識引擎。未指定時讀環境變數 CARECAPTION_ASR_ENGINE（預設 auto："
            "連得上 AWS 就用，否則自動退回 mock）。"
            "elevenlabs 需要 ELEVENLABS_API_KEY"
        ),
    )
    parser.add_argument(
        "--preset",
        choices=("caregiver", "clinic", "elder"),
        default="clinic",
        help="長照情境預設值",
    )
    parser.add_argument(
        "--mic",
        action="store_true",
        help="從麥克風即時擷取（按 Ctrl-C 結束）",
    )
    parser.add_argument(
        "--list-devices",
        action="store_true",
        help="列出可用的麥克風後結束",
    )
    parser.add_argument(
        "--device",
        default=None,
        help="指定麥克風（裝置編號或名稱片段）",
    )
    parser.add_argument("--wav", type=Path, help="要辨識的 WAV 檔路徑")
    parser.add_argument(
        "--seconds",
        type=float,
        default=12.0,
        help="麥克風模式的錄音上限秒數；沒給 --wav/--mic 時則是合成音訊長度",
    )
    parser.add_argument("--lang", help="固定語言，例如 zh-TW")
    parser.add_argument(
        "--auto",
        action="store_true",
        help="開啟自動語言辨識（中文 / 印尼語 / 越南語 …）",
    )
    parser.add_argument(
        "--region",
        default=None,
        help="AWS 區域。未指定時讀 .env 的 CARECAPTION_AWS_REGION",
    )
    parser.add_argument(
        "--no-dotenv",
        action="store_true",
        help="不要載入 backend/.env（只用目前的環境變數）",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="不依真實時間節奏送音訊（測試用，會比較快跑完）",
    )
    parser.add_argument(
        "--speaker-labels",
        action="store_true",
        help="開啟語者標籤（交班記錄要分辨誰在說話時使用）",
    )
    return parser.parse_args()


# --------------------------------------------------------------------------- #
# 音訊來源
# --------------------------------------------------------------------------- #


def read_wav(path: Path, target: AudioFormat = CARE_AUDIO_FORMAT) -> bytes:
    """讀 WAV 並轉成 Transcribe 需要的 PCM16/16kHz/mono。"""
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        sample_width = handle.getsampwidth()
        frame_rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())

    if sample_width != 2:
        raise SystemExit(
            f"{path} 是 {sample_width * 8}-bit，本示範只處理 16-bit WAV。\n"
            f"請先轉檔：ffmpeg -i {path} -ac 1 -ar 16000 -sample_fmt s16 out.wav"
        )

    source = AudioFormat(sample_rate_hz=frame_rate, channels=channels)
    print(
        f"{DIM}來源音訊：{frame_rate} Hz / {channels}ch / 16-bit，"
        f"長度 {source.duration_ms(len(frames)) / 1000:.1f} 秒{RESET}"
    )
    if (frame_rate, channels) == (target.sample_rate_hz, target.channels):
        return frames
    print(f"{DIM}→ 轉換為 {target.sample_rate_hz} Hz / mono{RESET}")
    return to_pcm16(frames, source, target)


def synth_audio(seconds: float, fmt: AudioFormat = CARE_AUDIO_FORMAT) -> bytes:
    """產生合成音訊（語音節奏的振幅包絡），給 mock 模式墊檔用。"""
    total = int(fmt.sample_rate_hz * seconds)
    out = bytearray()
    for index in range(total):
        t = index / fmt.sample_rate_hz
        envelope = 0.5 * (1 + math.sin(2 * math.pi * 0.4 * t))
        value = int(9000 * envelope * math.sin(2 * math.pi * 180 * t))
        out += int(value).to_bytes(2, "little", signed=True)
    return bytes(out)


async def buffer_chunks(
    audio: bytes,
    chunk_bytes: int,
    bytes_per_second: int,
    *,
    realtime: bool,
) -> AsyncIterator[bytes]:
    """把一段音訊切塊產出，realtime=True 時依真實時間節奏模擬麥克風。"""
    chunk_seconds = chunk_bytes / bytes_per_second
    for offset in range(0, len(audio), chunk_bytes):
        yield audio[offset : offset + chunk_bytes]
        await asyncio.sleep(chunk_seconds if realtime else 0)


async def pump(
    recognizer,
    chunks: AsyncIterator[bytes],
    *,
    show_level: bool = False,
    max_seconds: float | None = None,
) -> None:
    """把音訊來源餵進辨識器，結束時通知辨識器收尾。"""
    fmt = recognizer.config.audio
    sent_seconds = 0.0
    _status["show_level"] = show_level
    try:
        async for chunk in chunks:
            await recognizer.send_audio(chunk)
            sent_seconds += len(chunk) / fmt.bytes_per_second
            render_level(chunk, sent_seconds)
            if max_seconds is not None and sent_seconds >= max_seconds:
                break
    except asyncio.CancelledError:
        raise
    finally:
        await recognizer.stop()


# --------------------------------------------------------------------------- #
# 輸出
# --------------------------------------------------------------------------- #


# 狀態列的內容（音量條與辨識中的文字共用同一行）
_status: dict[str, object] = {
    "level": None,
    "partial": "",
    "elapsed": 0.0,
    "show_level": False,  # 只有麥克風模式才需要音量條
}


def volume_bar(dbfs: float | None, width: int = 20) -> str:
    """把音量畫成長條。

    這條在正式產品裡會是螢幕上一條很粗的橫條，
    讓長者一眼看出「麥克風有沒有收到我的聲音」，比文字提示有效得多。
    """
    if dbfs is None:
        return f"{DIM}{'·' * width}{RESET}"

    if dbfs == float("-inf"):
        filled = 0
    else:
        filled = max(0, min(width, round((dbfs + 60) / 60 * width)))

    if filled == 0:
        colour = DIM
    elif dbfs > -6:
        colour = RED  # 快爆音了
    elif dbfs > -25:
        colour = GREEN  # 剛好
    else:
        colour = YELLOW  # 有點小聲

    return f"{colour}{'█' * filled}{RESET}{DIM}{'·' * (width - filled)}{RESET}"


def redraw_status() -> None:
    line = "  "
    if _status["show_level"]:
        line += f"{volume_bar(_status['level'])}  "  # type: ignore[arg-type]
    line += f"{DIM}{_status['elapsed']:5.1f}s{RESET}"
    if partial := _status["partial"]:
        line += f"  {YELLOW}辨識中{RESET} {DIM}{partial}{RESET}"
    sys.stdout.write("\r\033[K" + line)
    sys.stdout.flush()


def clear_status() -> None:
    sys.stdout.write("\r\033[K")
    sys.stdout.flush()


def render_level(chunk: bytes, elapsed: float) -> None:
    _status["level"] = rms_dbfs(chunk)
    _status["elapsed"] = elapsed
    redraw_status()


def render_partial(segment: CaptionSegment) -> None:
    _status["partial"] = segment.text
    redraw_status()


def render_final(segment: CaptionSegment) -> None:
    clear_status()
    lang = f"{CYAN}[{segment.language or '?'}]{RESET}"
    who = f" {DIM}({'/'.join(segment.speakers)}){RESET}" if segment.speakers else ""
    conf = (
        f" {DIM}conf={segment.confidence:.2f}{RESET}"
        if segment.confidence is not None
        else ""
    )
    stamp = f"{DIM}{segment.start_time:6.2f}s{RESET}"
    print(f"{stamp} {lang}{who} {BOLD}{segment.text}{RESET}{conf}")
    _status["partial"] = ""
    redraw_status()


async def consume(recognizer) -> list[CaptionSegment]:
    finals: list[CaptionSegment] = []
    async for segment in recognizer.segments():
        if segment.is_partial:
            render_partial(segment)
        else:
            finals.append(segment)
            render_final(segment)
    clear_status()
    return finals


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #


def build_config(args: argparse.Namespace):
    """情境預設值 → 命令列參數覆寫。"""
    config = build_recognizer_config(args.preset)

    if args.region:
        config = replace(config, region=args.region)
    if args.lang:
        config = config.for_language(args.lang)
    elif args.auto:
        config = replace(
            config,
            language_code=None,
            identify_language=True,
            identify_multiple_languages=False,
        )
    if args.speaker_labels:
        config = replace(config, show_speaker_label=True)
    return config


def print_header(recognizer, dotenv_path: Path | None = None) -> None:
    config = recognizer.config
    language = config.language_code or f"自動辨識 {'/'.join(config.language_options)}"
    stability = (
        f"開啟（{config.partial_stability}）" if config.stabilize_partials else "關閉"
    )
    engine_note = "" if recognizer.engine != "mock" else f" {DIM}（離線模擬）{RESET}"
    profile = os.environ.get("AWS_PROFILE")

    print(f"{BOLD}安心聽 CareCaption · Transcribe Streaming 介面示範{RESET}")
    if dotenv_path is not None:
        print(f"  設定來源 : {DIM}{dotenv_path.name}{RESET}")
    print(f"  引擎     : {recognizer.engine}{engine_note}")
    print(f"  區域     : {config.region}")
    if profile and recognizer.engine != "mock":
        print(f"  AWS 身分 : profile {profile}")
    print(f"  語言     : {language}")
    print(
        f"  音訊     : {config.audio.sample_rate_hz} Hz / "
        f"{config.audio.channels}ch / PCM16"
    )
    print(f"  字幕穩定 : {stability}")
    print(f"  語者標籤 : {'開啟' if config.show_speaker_label else '關閉'}")
    print(f"  靜音保活 : {'開啟' if config.silence_keepalive else '關閉'}")
    print()


def show_devices() -> int:
    try:
        devices = list_input_devices()
    except MicrophoneUnavailableError as exc:
        print(f"{RED}{exc}{RESET}", file=sys.stderr)
        return 1
    if not devices:
        print(f"{YELLOW}找不到任何輸入裝置{RESET}")
        return 1
    print(f"{BOLD}可用的麥克風{RESET}")
    for index, name, rate in devices:
        print(f"  [{index}] {name} {DIM}（預設 {rate} Hz）{RESET}")
    print(f"\n{DIM}用 --device <編號或名稱片段> 指定{RESET}")
    return 0


def resolve_device(spec: str | None) -> int | str | None:
    """把 --device 的值轉成 sounddevice 認得的裝置指定。"""
    if spec is None:
        return None
    return int(spec) if spec.isdigit() else spec


async def main() -> int:
    args = parse_args()

    if args.list_devices:
        return show_devices()

    # 載入 .env。已存在的環境變數優先，所以臨時用
    # `AWS_PROFILE=other python ...` 覆寫仍然有效。
    dotenv_path: Path | None = None
    if not args.no_dotenv:
        dotenv_path, _ = load_dotenv()

    engine = args.engine or load_engine()
    config = build_config(args)

    # 非麥克風模式先把音訊準備好，避免無謂地佔用 Transcribe 連線
    audio: bytes | None = None
    if not args.mic:
        audio = (
            read_wav(args.wav, config.audio)
            if args.wav
            else synth_audio(args.seconds, config.audio)
        )

    try:
        recognizer = await open_recognizer(config, engine=engine)
    except RecognizerError as exc:
        print(f"{RED}無法啟動辨識器：{exc}{RESET}", file=sys.stderr)
        return 1

    print_header(recognizer, dotenv_path)

    # 組出音訊來源
    if args.mic:
        try:
            chunks = microphone_chunks(
                config.audio,
                chunk_ms=config.chunk_ms,
                device=resolve_device(args.device),
            )
        except MicrophoneUnavailableError as exc:
            await recognizer.aclose()
            print(f"{RED}{exc}{RESET}", file=sys.stderr)
            return 1
        print(f"{BOLD}開始說話{RESET}（按 Ctrl-C 結束，上限 {args.seconds:.0f} 秒）")
        print(f"{DIM}條子越長代表麥克風收到的聲音越大{RESET}\n")
        max_seconds: float | None = args.seconds
        show_level = True
    else:
        assert audio is not None
        print(
            f"{DIM}音訊平均音量 {rms_dbfs(audio):.1f} dBFS，"
            f"共 {len(audio)} bytes{RESET}\n"
        )
        chunks = buffer_chunks(
            audio,
            config.chunk_bytes,
            config.audio.bytes_per_second,
            realtime=not args.fast,
        )
        max_seconds = None
        show_level = False

    started = time.monotonic()
    finals: list[CaptionSegment] = []
    pump_task: asyncio.Task[None] | None = None

    try:
        async with recognizer:
            pump_task = asyncio.create_task(
                pump(
                    recognizer,
                    chunks,
                    show_level=show_level,
                    max_seconds=max_seconds,
                )
            )
            finals = await consume(recognizer)
            await pump_task
    except KeyboardInterrupt:
        # 麥克風模式按 Ctrl-C：停掉擷取，但把已辨識的結果留下
        clear_status()
        print(f"\n{DIM}已停止擷取{RESET}")
        if pump_task is not None:
            pump_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await pump_task
    except RecognizerError as exc:
        clear_status()
        print(f"\n{RED}辨識失敗：{exc}{RESET}", file=sys.stderr)
        return 1

    elapsed = time.monotonic() - started
    print(f"\n{GREEN}完成{RESET}，耗時 {elapsed:.1f} 秒")
    print(f"{DIM}指標：{recognizer.stats.as_dict()}{RESET}")

    if finals:
        print(f"\n{BOLD}逐字稿（{len(finals)} 句）{RESET}")
        for index, segment in enumerate(finals, 1):
            who = f"{'/'.join(segment.speakers)} " if segment.speakers else ""
            print(f"  {index:2d}. [{segment.language or '?'}] {who}{segment.text}")
    else:
        print(f"\n{YELLOW}沒有取得任何 final 結果{RESET}")
        if args.mic:
            print(f"{DIM}可能是講得太小聲，或麥克風權限沒開。{RESET}")
        else:
            print(
                f"{DIM}若走的是真實 AWS，請確認音訊裡真的有人聲；"
                f"--seconds 產生的合成音訊不是語音，Transcribe 會回空結果。{RESET}"
            )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        clear_status()
        print()
        raise SystemExit(130) from None
