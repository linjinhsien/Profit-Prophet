#!/usr/bin/env python3
"""量測不同設定對「字幕延遲」與「辨識正確率」的影響。

速度和正確率常常是互相拉扯的，所以不要憑感覺調參數，量出來再決定。

用法
----
    AWS_PROFILE=... python examples/bench_latency.py --wav samples/clinic.wav \
        --expect "阿嬤，你的血壓有一點高…" --region us-west-2

    # 只跑其中幾組
    python examples/bench_latency.py --wav samples/clinic.wav --only baseline,stability-low

量什麼
------
音訊依真實時間節奏送出，所以「牆上時鐘」約等於「音訊位置」。
一段字幕在 wall_clock=T 抵達、它涵蓋的音訊在 end_time=E 結束，
落後量就是 T − E：長者從「話講完」到「看到字」要等多久。

- 首個 partial 落後：畫面多久才開始有反應（體感速度的關鍵）
- partial 平均落後：字幕追著嘴巴跑的緊密程度
- 首個 final 落後：定稿多久才出現（要送翻譯／存逐字稿的起算點）
- CER：與 --expect 比對的字元錯誤率（沒給 --expect 就不算）
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
import time
import unicodedata
import wave
from dataclasses import dataclass, replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.audio.pcm import CARE_AUDIO_FORMAT, AudioFormat, to_pcm16  # noqa: E402
from app.config import build_recognizer_config  # noqa: E402
from app.services.transcribe import (  # noqa: E402
    CaptionSegment,
    RecognizerConfig,
    RecognizerError,
    open_recognizer,
)

BOLD = "\033[1m"
DIM = "\033[2m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
RESET = "\033[0m"


# --------------------------------------------------------------------------- #
# 待測設定
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Variant:
    name: str
    note: str
    overrides: dict[str, object]


VARIANTS: tuple[Variant, ...] = (
    Variant("baseline", "情境預設值原樣（對照組）", {}),
    Variant("speakers-on", "開啟語者標籤", {"show_speaker_label": True}),
    Variant("stability-medium", "穩定度降到 medium", {"partial_stability": "medium"}),
    Variant("stability-low", "穩定度降到 low", {"partial_stability": "low"}),
    Variant("no-stabilization", "完全關掉穩定化", {"stabilize_partials": False}),
    Variant("chunk-50ms", "音訊塊 100ms → 50ms", {"chunk_ms": 50.0}),
    Variant("chunk-20ms", "音訊塊 100ms → 20ms", {"chunk_ms": 20.0}),
    Variant("no-speakers", "關掉語者標籤", {"show_speaker_label": False}),
    Variant(
        "fastest",
        "延遲優先組合：low + 20ms + 無語者標籤",
        {
            "partial_stability": "low",
            "chunk_ms": 20.0,
            "show_speaker_label": False,
        },
    ),
)


# --------------------------------------------------------------------------- #
# 量測
# --------------------------------------------------------------------------- #


@dataclass
class Result:
    variant: str
    note: str
    first_partial_lag: float | None = None
    mean_partial_lag: float | None = None
    first_final_lag: float | None = None
    partials: int = 0
    finals: int = 0
    text: str = ""
    cer: float | None = None
    error: str | None = None


def read_wav(path: Path, target: AudioFormat = CARE_AUDIO_FORMAT) -> bytes:
    with wave.open(str(path), "rb") as handle:
        if handle.getsampwidth() != 2:
            raise SystemExit(f"{path} 不是 16-bit WAV")
        source = AudioFormat(
            sample_rate_hz=handle.getframerate(), channels=handle.getnchannels()
        )
        frames = handle.readframes(handle.getnframes())
    if (source.sample_rate_hz, source.channels) == (
        target.sample_rate_hz,
        target.channels,
    ):
        return frames
    return to_pcm16(frames, source, target)


_CN_DIGITS = "零一二三四五六七八九"


def _digits_to_cn(text: str) -> str:
    """把阿拉伯數字轉成中文數字寫法，讓「152」和「一百五十二」能公平比較。

    Transcribe 開啟語者標籤時會輸出「一百五十二」，關閉時輸出「152」。
    這是同一句話的兩種寫法，不該被算成辨識錯誤。
    """

    def convert(match: re.Match[str]) -> str:
        value = int(match.group())
        if value < 10:
            return _CN_DIGITS[value]
        if value < 20:
            return "十" + (_CN_DIGITS[value % 10] if value % 10 else "")
        if value < 100:
            tens, ones = divmod(value, 10)
            return _CN_DIGITS[tens] + "十" + (_CN_DIGITS[ones] if ones else "")
        if value < 1000:
            hundreds, rest = divmod(value, 100)
            out = _CN_DIGITS[hundreds] + "百"
            if rest == 0:
                return out
            if rest < 10:
                return out + "零" + _CN_DIGITS[rest]
            return out + convert(re.match(r"\d+", str(rest)))  # type: ignore[arg-type]
        return match.group()

    return re.sub(r"\d+", convert, text)


def normalize(text: str) -> str:
    """比對正確率前的正規化：去標點空白、統一數字寫法。"""
    text = unicodedata.normalize("NFKC", text)
    text = _digits_to_cn(text)
    return re.sub(r"[\s、。，,.?？!！:：;；\-—…·]", "", text)


def char_error_rate(hypothesis: str, reference: str) -> float:
    """Levenshtein 距離 / 參考長度。"""
    hyp, ref = normalize(hypothesis), normalize(reference)
    if not ref:
        return 0.0

    previous = list(range(len(hyp) + 1))
    for j, ref_char in enumerate(ref, 1):
        current = [j]
        for i, hyp_char in enumerate(hyp, 1):
            current.append(
                min(
                    previous[i] + 1,  # 刪除
                    current[i - 1] + 1,  # 插入
                    previous[i - 1] + (hyp_char != ref_char),  # 取代
                )
            )
        previous = current
    return previous[len(hyp)] / len(ref)


async def measure(
    config: RecognizerConfig,
    audio: bytes,
    variant: Variant,
    expect: str | None,
    engine: str = "aws",
) -> Result:
    result = Result(variant=variant.name, note=variant.note)

    try:
        recognizer = await open_recognizer(config, engine=engine)  # type: ignore[arg-type]
    except RecognizerError as exc:
        result.error = str(exc)
        return result

    partial_lags: list[float] = []
    finals: list[CaptionSegment] = []
    started = time.monotonic()

    async def consume() -> None:
        async for segment in recognizer.segments():
            lag = (time.monotonic() - started) - segment.end_time
            if segment.is_partial:
                partial_lags.append(lag)
                if result.first_partial_lag is None:
                    result.first_partial_lag = lag
            else:
                finals.append(segment)
                if result.first_final_lag is None:
                    result.first_final_lag = lag

    async def feed() -> None:
        chunk = config.chunk_bytes
        period = chunk / config.audio.bytes_per_second
        next_at = time.monotonic()
        for offset in range(0, len(audio), chunk):
            await recognizer.send_audio(audio[offset : offset + chunk])
            next_at += period
            if (delay := next_at - time.monotonic()) > 0:
                await asyncio.sleep(delay)
        await recognizer.stop()

    try:
        async with recognizer:
            consumer = asyncio.create_task(consume())
            await feed()
            await asyncio.wait_for(consumer, timeout=20)
    except (RecognizerError, asyncio.TimeoutError) as exc:
        result.error = f"{type(exc).__name__}: {exc}"
    finally:
        await recognizer.aclose()

    result.partials = len(partial_lags)
    result.finals = len(finals)
    result.mean_partial_lag = (
        sum(partial_lags) / len(partial_lags) if partial_lags else None
    )
    result.text = " ".join(segment.text for segment in finals)
    if expect and result.text:
        result.cer = char_error_rate(result.text, expect)
    return result


# --------------------------------------------------------------------------- #
# 輸出
# --------------------------------------------------------------------------- #


def fmt(value: float | None, unit: str = "s") -> str:
    return f"{value:.2f}{unit}" if value is not None else "—"


def print_table(results: list[Result]) -> None:
    header = (
        f"{'設定':<18} {'首個partial':>11} {'partial平均':>11} "
        f"{'首個final':>10} {'partial數':>9} {'CER':>7}"
    )
    print(f"\n{BOLD}{header}{RESET}")
    print("-" * len(header))

    baseline = next((r for r in results if r.variant == "baseline"), None)

    for result in results:
        if result.error:
            print(f"{result.variant:<18} {RED}失敗：{result.error}{RESET}")
            continue

        cer = "—" if result.cer is None else f"{result.cer * 100:.1f}%"
        colour = ""
        if baseline and result is not baseline and baseline.mean_partial_lag:
            if (result.mean_partial_lag or 0) < baseline.mean_partial_lag * 0.9:
                colour = GREEN
            elif (result.mean_partial_lag or 0) > baseline.mean_partial_lag * 1.1:
                colour = YELLOW

        print(
            f"{colour}{result.variant:<18}{RESET} "
            f"{fmt(result.first_partial_lag):>11} "
            f"{colour}{fmt(result.mean_partial_lag):>11}{RESET} "
            f"{fmt(result.first_final_lag):>10} "
            f"{result.partials:>9} {cer:>7}"
        )

    print(f"\n{DIM}落後量 = 字幕抵達時間 − 該段音訊結束時間，越小越即時{RESET}")
    print(f"{DIM}CER = 字元錯誤率，越小越準{RESET}\n")

    for result in results:
        if result.text:
            print(f"{DIM}{result.variant}:{RESET} {result.text}")


# --------------------------------------------------------------------------- #


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe 延遲／正確率量測")
    parser.add_argument("--wav", type=Path, required=True)
    parser.add_argument("--expect", help="正確逐字稿，用來算 CER")
    parser.add_argument("--region", default=None)
    parser.add_argument("--lang", default="zh-TW")
    parser.add_argument("--preset", default="clinic")
    parser.add_argument("--vocabulary", help="額外測一組掛上此 Custom Vocabulary")
    parser.add_argument(
        "--engine",
        default="aws",
        choices=("aws", "elevenlabs", "mock"),
        help="要量測的辨識引擎（不含 auto，量測不該被靜默退場影響）",
    )
    parser.add_argument(
        "--keyterms",
        help="逗號分隔的術語清單，只有 ElevenLabs 引擎會用到",
    )
    parser.add_argument("--only", help="只跑指定的設定，逗號分隔")
    parser.add_argument(
        "--repeat", type=int, default=1, help="每組重複幾次取最好的一次"
    )
    return parser.parse_args()


async def main() -> int:
    args = parse_args()
    audio = read_wav(args.wav)

    base = build_recognizer_config(args.preset)
    if args.region:
        base = replace(base, region=args.region)
    if args.lang:
        base = base.for_language(args.lang)
    if args.keyterms:
        base = replace(
            base,
            keyterms=tuple(t.strip() for t in args.keyterms.split(",") if t.strip()),
        )

    variants = list(VARIANTS)
    if args.keyterms:
        variants.append(
            Variant("no-keyterms", "拿掉術語清單當對照", {"keyterms": ()})
        )
    if args.vocabulary:
        variants.append(
            Variant(
                "vocabulary",
                f"掛上 Custom Vocabulary {args.vocabulary}",
                {"vocabulary_name": args.vocabulary},
            )
        )
        variants.append(
            Variant(
                "vocabulary+fastest",
                "詞彙表 + 延遲優先組合",
                {
                    "vocabulary_name": args.vocabulary,
                    "partial_stability": "low",
                    "chunk_ms": 20.0,
                    "show_speaker_label": False,
                },
            )
        )

    if args.only:
        wanted = {name.strip() for name in args.only.split(",")}
        variants = [v for v in variants if v.name in wanted]

    seconds = len(audio) / base.audio.bytes_per_second
    print(f"{BOLD}音訊{RESET} {args.wav.name}  {seconds:.1f} 秒")
    print(f"{BOLD}引擎{RESET} {args.engine}")
    print(f"{BOLD}區域{RESET} {base.region}   {BOLD}語言{RESET} {base.language_code}")
    print(
        f"{DIM}共 {len(variants)} 組設定 × {args.repeat} 次，"
        f"預估 {len(variants) * args.repeat * (seconds + 2) / 60:.1f} 分鐘{RESET}"
    )

    results: list[Result] = []
    for index, variant in enumerate(variants, 1):
        print(f"\n[{index}/{len(variants)}] {variant.name} — {variant.note}")
        best: Result | None = None
        for _ in range(args.repeat):
            config = replace(base, **variant.overrides)  # type: ignore[arg-type]
            result = await measure(config, audio, variant, args.expect, args.engine)
            if best is None or (
                result.mean_partial_lag is not None
                and (best.mean_partial_lag is None
                     or result.mean_partial_lag < best.mean_partial_lag)
            ):
                best = result
            print(
                f"    首個 partial {fmt(result.first_partial_lag)}  "
                f"平均 {fmt(result.mean_partial_lag)}  "
                f"partial {result.partials}  final {result.finals}"
                + (f"  {RED}{result.error}{RESET}" if result.error else "")
            )
        assert best is not None
        results.append(best)

    print_table(results)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
