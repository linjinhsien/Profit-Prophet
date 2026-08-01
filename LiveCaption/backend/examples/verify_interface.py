#!/usr/bin/env python3
"""不需要 AWS 憑證的介面自我檢查。

驗證三件事：
1. `RecognizerConfig.to_request_kwargs()` 產生的參數能綁定到 SDK 簽名
2. 這些參數真的序列化成正確的 Transcribe HTTP headers
3. 設定驗證會擋掉錯誤組合（台北區域、語言設定衝突…）

用法：python examples/verify_interface.py
"""

from __future__ import annotations

import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from amazon_transcribe.client import TranscribeStreamingClient  # noqa: E402
from amazon_transcribe.model import StartStreamTranscriptionRequest  # noqa: E402
from amazon_transcribe.serialize import TranscribeStreamingSerializer  # noqa: E402

from app.audio.pcm import (  # noqa: E402
    AudioFormat,
    AudioFormatError,
    downmix_to_mono,
    resample_linear,
    rms_dbfs,
    silence,
)
from app.config import build_recognizer_config  # noqa: E402
from app.services.transcribe import (  # noqa: E402
    RecognizerConfig,
    TranscribeUnavailableError,
)

ENDPOINT = "https://transcribestreaming.ap-northeast-1.amazonaws.com"
_failures: list[str] = []


def isolate_env() -> list[str]:
    """清掉 CARECAPTION_* 環境變數。

    這支腳本驗的是「情境預設值」本身，所以不能受開發者本機的 .env 影響，
    否則同一份程式碼在不同人的機器上會得到不同結果。
    """
    import os

    removed = sorted(name for name in os.environ if name.startswith("CARECAPTION_"))
    for name in removed:
        del os.environ[name]
    return removed


def check(label: str, condition: bool, detail: str = "") -> None:
    mark = "PASS" if condition else "FAIL"
    print(f"  [{mark}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        _failures.append(label)


def expect_error(label: str, fn, error_type: type[Exception]) -> None:
    try:
        fn()
    except error_type as exc:
        check(label, True, str(exc).split("｜")[0][:70])
    except Exception as exc:  # noqa: BLE001
        check(label, False, f"丟出的是 {type(exc).__name__}: {exc}")
    else:
        check(label, False, "沒有丟出預期的錯誤")


def headers_for(config: RecognizerConfig) -> dict[str, str]:
    kwargs = config.to_request_kwargs()
    # 參數名稱必須完全對得上 SDK
    inspect.signature(TranscribeStreamingClient.start_stream_transcription).bind(
        None, **kwargs
    )
    request = StartStreamTranscriptionRequest(**kwargs)
    http = TranscribeStreamingSerializer().serialize_start_stream_transcription_request(
        endpoint=ENDPOINT, request_shape=request
    )
    return {
        key: value
        for key, value in http.headers.items()
        if key.startswith("x-amzn-transcribe")
    }


def section(title: str) -> None:
    print(f"\n{title}")
    print("-" * len(title))


def main() -> int:
    if removed := isolate_env():
        print(f"（已忽略 {len(removed)} 個 CARECAPTION_* 環境變數以確保結果可重現）")

    section("1. 三種長照情境 → Transcribe 請求參數")
    for preset in ("clinic", "caregiver", "elder"):
        config = build_recognizer_config(preset)
        headers = headers_for(config)
        check(f"{preset} 參數可綁定並序列化", True, f"{len(headers)} 個 header")
        for key in sorted(headers):
            print(f"         {key}: {headers[key]}")

    section("2. 關鍵 header 內容正確")
    clinic = headers_for(build_recognizer_config("clinic"))
    check(
        "clinic 固定語言 zh-TW",
        clinic.get("x-amzn-transcribe-language-code") == "zh-TW",
        clinic.get("x-amzn-transcribe-language-code", "<缺>"),
    )
    check(
        "clinic 開啟字幕穩定化 high",
        clinic.get("x-amzn-transcribe-enable-partial-results-stabilization") == "True"
        and clinic.get("x-amzn-transcribe-partial-results-stability") == "high",
        "長者讀得完，字幕不跳動",
    )
    check(
        "取樣率 16000",
        clinic.get("x-amzn-transcribe-sample-rate") == "16000",
    )
    check(
        "encoding = pcm",
        clinic.get("x-amzn-transcribe-media-encoding") == "pcm",
    )

    caregiver = headers_for(build_recognizer_config("caregiver"))
    check(
        "caregiver 自動語言辨識已開啟",
        caregiver.get("x-amzn-transcribe-identify-language") == "True",
    )
    check(
        "caregiver 未送出 language-code（自動辨識時必須省略）",
        "x-amzn-transcribe-language-code" not in caregiver,
    )
    check(
        "caregiver 候選語言含印尼語與越南語",
        "id-ID" in caregiver.get("x-amzn-transcribe-language-options", "")
        and "vi-VN" in caregiver.get("x-amzn-transcribe-language-options", ""),
        caregiver.get("x-amzn-transcribe-language-options", "<缺>"),
    )
    check(
        "語者標籤已開啟（交班記錄要分辨誰在說）",
        caregiver.get("x-amzn-transcribe-show-speaker-label") == "True",
    )

    section("3. 自動語言辨識時詞彙參數改用複數形式")
    auto_vocab = RecognizerConfig(
        language_code=None,
        identify_language=True,
        vocabulary_name="care-terms-zh",
    )
    auto_headers = headers_for(auto_vocab)
    check(
        "送出 vocabulary-names（複數）",
        auto_headers.get("x-amzn-transcribe-vocabulary-names") == "care-terms-zh",
        auto_headers.get("x-amzn-transcribe-vocabulary-names", "<缺>"),
    )
    check(
        "沒有送出 vocabulary-name（單數）",
        "x-amzn-transcribe-vocabulary-name" not in auto_headers,
    )
    fixed_vocab = RecognizerConfig(language_code="zh-TW", vocabulary_name="care-terms-zh")
    fixed_headers = headers_for(fixed_vocab)
    check(
        "固定語言時送出 vocabulary-name（單數）",
        fixed_headers.get("x-amzn-transcribe-vocabulary-name") == "care-terms-zh",
    )

    section("4. 錯誤設定會被擋下來")
    expect_error(
        "台北區域（Transcribe Streaming 尚未支援）",
        lambda: RecognizerConfig(region="ap-east-2"),
        TranscribeUnavailableError,
    )
    expect_error(
        "自動辨識卻同時指定 language_code",
        lambda: RecognizerConfig(language_code="zh-TW", identify_language=True),
        ValueError,
    )
    expect_error(
        "兩種自動辨識模式同時開啟",
        lambda: RecognizerConfig(
            language_code=None,
            identify_language=True,
            identify_multiple_languages=True,
        ),
        ValueError,
    )
    expect_error(
        "候選語言不足兩種",
        lambda: RecognizerConfig(
            language_code=None,
            identify_language=True,
            language_options=("zh-TW",),
            preferred_language="zh-TW",
        ),
        ValueError,
    )
    expect_error(
        "取樣率 44100 Hz（Transcribe 不支援）",
        lambda: RecognizerConfig(audio=AudioFormat(sample_rate_hz=44_100)),
        AudioFormatError,
    )
    expect_error(
        "立體聲（必須先降混）",
        lambda: RecognizerConfig(audio=AudioFormat(channels=2)),
        AudioFormatError,
    )
    expect_error(
        "詞彙過濾器缺少 method",
        lambda: RecognizerConfig(vocabulary_filter_name="profanity"),
        ValueError,
    )

    section("5. 音訊轉換工具")
    stereo_44k = AudioFormat(sample_rate_hz=44_100, channels=2)
    one_second = b"\x00\x10" * (44_100 * 2)  # 1 秒立體聲
    mono = downmix_to_mono(one_second, 2)
    check(
        "立體聲 → 單聲道長度減半",
        len(mono) == len(one_second) // 2,
        f"{len(one_second)} → {len(mono)} bytes",
    )
    resampled = resample_linear(mono, 44_100, 16_000)
    expected = 16_000 * 2
    check(
        "44.1kHz → 16kHz 長度約為 1 秒",
        abs(len(resampled) - expected) <= 4,
        f"{len(resampled)} bytes（預期約 {expected}）",
    )
    check(
        "1 秒靜音 = 32000 bytes",
        len(silence(1000)) == 32_000,
        f"{len(silence(1000))} bytes",
    )
    check("靜音音量為 -inf dBFS", rms_dbfs(silence(100)) == float("-inf"))
    check(
        "有訊號時音量可量測",
        -60 < rms_dbfs(b"\x00\x10" * 1000) < 0,
        f"{rms_dbfs(b'\x00\x10' * 1000):.1f} dBFS",
    )
    check(
        "長度未對齊 frame 會被擋下",
        _raises(lambda: __import__("app.audio.pcm", fromlist=["validate_pcm16"]).validate_pcm16(b"\x00\x01\x02", stereo_44k)),
    )

    print()
    if _failures:
        print(f"{len(_failures)} 項未通過：")
        for name in _failures:
            print(f"  - {name}")
        return 1
    print("全部檢查通過。")
    return 0


def _raises(fn) -> bool:
    try:
        fn()
    except Exception:  # noqa: BLE001
        return True
    return False


if __name__ == "__main__":
    raise SystemExit(main())
