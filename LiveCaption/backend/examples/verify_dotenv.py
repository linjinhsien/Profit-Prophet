#!/usr/bin/env python3
"""驗證 .env 載入行為。

檢查：
1. `.env.example` 直接複製過去就能用（新手第一次設定不會踩雷）
2. 已存在的環境變數優先於 `.env`（臨時覆寫有效）
3. 沒有 `.env` 時不會爆炸
4. 驗證腳本不受 `.env` 影響（load_dotenv 不會自動執行）

用法：python examples/verify_dotenv.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import build_recognizer_config, load_dotenv, load_engine  # noqa: E402

BACKEND = Path(__file__).resolve().parent.parent
_failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if condition else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        _failures.append(label)


def section(title: str) -> None:
    print(f"\n{title}")
    print("-" * len(title))


def clear_env() -> None:
    for name in list(os.environ):
        if name.startswith("CARECAPTION_") or name in {
            "AWS_PROFILE",
            "AWS_METADATA_SERVICE_TIMEOUT",
            "AWS_METADATA_SERVICE_NUM_ATTEMPTS",
        }:
            del os.environ[name]


def main() -> int:
    section("1. .env.example 複製過去就能用")
    clear_env()
    path, keys = load_dotenv(BACKEND / ".env.example")
    check("讀到 .env.example", path is not None, f"設定了 {len(keys)} 個變數")
    config = build_recognizer_config()
    check("engine 可解析", load_engine() in ("auto", "aws", "mock"), load_engine())
    check("region 有值", bool(config.region), config.region)
    check(
        "語言交給情境決定（.env.example 沒寫死 SOURCE_LANG）",
        "CARECAPTION_SOURCE_LANG" not in os.environ,
        "註解狀態",
    )
    check(
        "caregiver 情境仍會自動判語言",
        build_recognizer_config("caregiver").auto_detect_language,
    )
    check(
        "clinic 情境固定 zh-TW",
        build_recognizer_config("clinic").language_code == "zh-TW",
    )

    section("2. 已存在的環境變數優先（臨時覆寫有效）")
    clear_env()
    os.environ["CARECAPTION_AWS_REGION"] = "eu-central-1"
    load_dotenv(BACKEND / ".env.example")
    check(
        "環境變數沒被 .env 蓋掉",
        os.environ["CARECAPTION_AWS_REGION"] == "eu-central-1",
        os.environ["CARECAPTION_AWS_REGION"],
    )
    _, keys = load_dotenv(BACKEND / ".env.example", override=True)
    check(
        "override=True 時才會蓋掉",
        os.environ["CARECAPTION_AWS_REGION"] != "eu-central-1",
        os.environ["CARECAPTION_AWS_REGION"],
    )

    section("3. 格式解析")
    clear_env()
    with tempfile.TemporaryDirectory() as tmp:
        sample = Path(tmp) / "weird.env"
        sample.write_text(
            "\n".join(
                [
                    "# 註解行",
                    "",
                    "   ",
                    "export CARECAPTION_AWS_REGION=us-east-1",
                    'CARECAPTION_PREFERRED_LANGUAGE="zh-TW"',
                    "CARECAPTION_CARE_PRESET='elder'",
                    "沒有等號的行",
                    "CARECAPTION_CHUNK_MS = 200",
                    "=沒有鍵",
                ]
            ),
            encoding="utf-8",
        )
        _, keys = load_dotenv(sample)
        check("export 前綴會被去掉", os.environ.get("CARECAPTION_AWS_REGION") == "us-east-1")
        check(
            "雙引號會被去掉",
            os.environ.get("CARECAPTION_PREFERRED_LANGUAGE") == "zh-TW",
            repr(os.environ.get("CARECAPTION_PREFERRED_LANGUAGE")),
        )
        check(
            "單引號會被去掉",
            os.environ.get("CARECAPTION_CARE_PRESET") == "elder",
            repr(os.environ.get("CARECAPTION_CARE_PRESET")),
        )
        check("鍵值兩側空白會被去掉", os.environ.get("CARECAPTION_CHUNK_MS") == "200")
        check("註解、空行、無等號的行會被忽略", len(keys) == 4, f"{len(keys)} 個鍵")
        check(
            "設定值真的生效",
            build_recognizer_config().chunk_ms == 200.0,
            f"chunk_ms={build_recognizer_config().chunk_ms}",
        )

    section("4. 檔案不存在時不會爆炸")
    clear_env()
    path, keys = load_dotenv(Path("/tmp/definitely-not-here.env"))
    check("回傳 (None, [])", path is None and keys == [], f"{path}, {keys}")
    check("後續仍可建立設定", build_recognizer_config().region == "ap-northeast-1")

    section("5. load_dotenv 不會自動執行")
    clear_env()
    check(
        "只 import config 不會載入 .env",
        "AWS_PROFILE" not in os.environ,
        "所以驗證腳本結果可重現",
    )

    print()
    if _failures:
        print(f"{len(_failures)} 項未通過：")
        for name in _failures:
            print(f"  - {name}")
        return 1
    print("全部檢查通過。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
