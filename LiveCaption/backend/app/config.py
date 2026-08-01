"""環境變數 → RecognizerConfig。

刻意不依賴額外套件，讓 Transcribe 介面層可以獨立使用。
所有設定都有長照場景的合理預設值，`.env` 不填也能跑。
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Final, get_args

from app.audio.pcm import AudioFormat
from app.services.transcribe import (
    CARE_LANGUAGE_OPTIONS,
    Engine,
    PartialStability,
    RecognizerConfig,
)

__all__ = [
    "ASR_ENGINE",
    "build_recognizer_config",
    "load_dotenv",
    "load_engine",
]

_PREFIX: Final[str] = "CARECAPTION_"

#: 長照現場的三種預設情境
CARE_PRESETS: Final[dict[str, dict[str, object]]] = {
    # 照服員與長者溝通：需要自動判語言（可能是印尼語/越南語）
    "caregiver": {
        "language_code": None,
        "identify_language": True,
        "show_speaker_label": True,
    },
    # 看診/衛教：醫師講中文，重點是字幕穩定、術語要準
    #
    # 語者標籤刻意關閉。實測（examples/bench_latency.py，clinic.wav ×3）：
    #   開啟  字幕平均落後 0.44s，首個 final 0.99s，CER 4.0%
    #   關閉  字幕平均落後 0.17s，首個 final 0.37s，CER 4.0%
    # 正確率一樣，但慢 2.6 倍。長者在診間即時讀字幕不需要知道「誰說的」，
    # 要留交班記錄再用 caregiver 情境或事後的批次辨識。
    "clinic": {
        "language_code": "zh-TW",
        "identify_language": False,
        "show_speaker_label": False,
        "partial_stability": "high",
    },
    # 長者自己用：只講中文，最低延遲、不需要語者分離
    "elder": {
        "language_code": "zh-TW",
        "identify_language": False,
        "show_speaker_label": False,
        "partial_stability": "medium",
    },
}


#: `.env` 預設位置：backend/.env
_DEFAULT_DOTENV: Final[Path] = Path(__file__).resolve().parent.parent / ".env"


def load_dotenv(
    path: Path | None = None,
    *,
    override: bool = False,
) -> tuple[Path | None, list[str]]:
    """讀取 `.env` 檔並寫進 `os.environ`。

    刻意不用 python-dotenv，少一個依賴；格式支援註解、空行、`export` 前綴、
    以及用單/雙引號包住的值。

    注意這個函式**不會自動被呼叫**。要載入的程式（例如示範腳本）要自己叫，
    這樣驗證腳本才不會被開發者本機的 `.env` 影響而得到不可重現的結果。

    回傳 (實際讀到的檔案, 設定的變數名稱清單)。
    `override=False` 時已存在的環境變數優先，
    所以命令列臨時指定的值不會被 `.env` 蓋掉。
    """
    target = path or _DEFAULT_DOTENV
    if not target.is_file():
        return None, []

    applied: list[str] = []
    for raw_line in target.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        if "=" not in line:
            continue

        key, _, value = line.partition("=")
        key = key.strip()
        if not key:
            continue

        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]

        if not override and key in os.environ:
            continue
        os.environ[key] = value
        applied.append(key)

    return target, applied


def _env(name: str, default: str | None = None) -> str | None:
    raw = os.environ.get(f"{_PREFIX}{name}")
    if raw is None:
        raw = os.environ.get(name)
    if raw is None:
        return default
    raw = raw.strip()
    return raw or default


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_list(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = _env(name)
    if raw is None:
        return default
    items = tuple(part.strip() for part in raw.split(",") if part.strip())
    return items or default


def load_engine() -> Engine:
    """讀取 ``CARECAPTION_ASR_ENGINE``（auto / aws / mock）。"""
    value = (_env("ASR_ENGINE", "auto") or "auto").lower()
    if value not in get_args(Engine):
        raise ValueError(
            f"CARECAPTION_ASR_ENGINE 必須是 {get_args(Engine)}，收到 {value!r}"
        )
    return value  # type: ignore[return-value]


ASR_ENGINE: Final[str] = "ASR_ENGINE"


def build_recognizer_config(preset: str | None = None) -> RecognizerConfig:
    """組出 RecognizerConfig：情境預設值 → 環境變數覆寫。"""
    preset_name = (preset or _env("CARE_PRESET", "caregiver") or "caregiver").lower()
    if preset_name not in CARE_PRESETS:
        raise ValueError(
            f"未知的情境 {preset_name!r}，可用：{sorted(CARE_PRESETS)}"
        )
    base = dict(CARE_PRESETS[preset_name])

    audio = AudioFormat(
        sample_rate_hz=_env_int("SAMPLE_RATE", 16_000),
        channels=_env_int("AUDIO_CHANNELS", 1),
    )

    # 語言設定：環境變數若指定 SOURCE_LANG 就切成固定語言模式
    source_lang = _env("SOURCE_LANG")
    if source_lang and source_lang.lower() != "auto":
        base["language_code"] = source_lang
        base["identify_language"] = False
        base["identify_multiple_languages"] = False
    elif source_lang and source_lang.lower() == "auto":
        base["language_code"] = None
        base["identify_language"] = True

    stability = _env("PARTIAL_STABILITY", str(base.get("partial_stability", "high")))
    if stability not in get_args(PartialStability):
        raise ValueError(
            f"PARTIAL_STABILITY 必須是 {get_args(PartialStability)}，收到 {stability!r}"
        )

    return RecognizerConfig(
        region=_env("AWS_REGION", "ap-northeast-1") or "ap-northeast-1",
        language_code=base.get("language_code"),  # type: ignore[arg-type]
        identify_language=bool(base.get("identify_language", False)),
        identify_multiple_languages=bool(
            base.get("identify_multiple_languages", False)
        ),
        language_options=_env_list("LANGUAGE_OPTIONS", CARE_LANGUAGE_OPTIONS),
        preferred_language=_env("PREFERRED_LANGUAGE", "zh-TW"),
        audio=audio,
        chunk_ms=_env_float("CHUNK_MS", 100.0),
        stabilize_partials=_env_bool("STABILIZE_PARTIALS", True),
        partial_stability=stability,  # type: ignore[arg-type]
        show_speaker_label=_env_bool(
            "SHOW_SPEAKER_LABEL", bool(base.get("show_speaker_label", False))
        ),
        vocabulary_name=_env("VOCABULARY_NAME"),
        keyterms=_env_list("KEYTERMS", ()),
        vocabulary_filter_name=_env("VOCABULARY_FILTER_NAME"),
        vocabulary_filter_method=_env("VOCABULARY_FILTER_METHOD"),  # type: ignore[arg-type]
        silence_keepalive=_env_bool("SILENCE_KEEPALIVE", True),
        keepalive_idle_seconds=_env_float("KEEPALIVE_IDLE_SECONDS", 3.0),
        keepalive_interval_seconds=_env_float("KEEPALIVE_INTERVAL_SECONDS", 0.5),
    )
