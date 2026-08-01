#!/usr/bin/env python3
"""/ws/captions WebSocket 煙霧測試。

Newman（Postman CLI）不支援 WebSocket，所以字幕主流程用這支腳本測。
預設走 ``engine=mock``，不會呼叫 AWS、不燒額度。

用法::

    LiveCaption/.venv/bin/python postman/ws-smoke-test.py
    LiveCaption/.venv/bin/python postman/ws-smoke-test.py --port 8001 --engine mock

離開碼 0 表示全部通過，1 表示有失敗。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import struct
import sys
from typing import Any

import websockets

SAMPLE_RATE = 16_000
CHUNK_MS = 100
CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_MS // 1000

#: 送 4 秒音訊。MockStreamingRecognizer 每 2.5 秒才吐一行，
#: 少於 2.5 秒會完全收不到字幕，測試就失去意義。
AUDIO_SECONDS = 4.0
TOTAL_CHUNKS = int(AUDIO_SECONDS * 1000 / CHUNK_MS)

#: chunk 之間的間隔。mock 不需要真實時間節奏，壓縮以縮短測試時間；
#: 測 engine=aws 時建議設成 CHUNK_MS / 1000 以貼近真實串流。
SEND_INTERVAL_S = 0.02


def build_tone_chunk(chunk_index: int, freq_hz: float = 440.0) -> bytes:
    """產生一段 PCM16 單聲道正弦波，當作假的麥克風輸入。

    Args:
        chunk_index: 第幾個 chunk，用來讓相位連續
        freq_hz: 音高

    Returns:
        PCM16 little-endian 的位元組
    """
    start = chunk_index * CHUNK_SAMPLES
    samples = [
        int(8000 * math.sin(2 * math.pi * freq_hz * (start + n) / SAMPLE_RATE))
        for n in range(CHUNK_SAMPLES)
    ]
    return struct.pack(f"<{len(samples)}h", *samples)


class Results:
    """收集斷言結果。"""

    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0

    def check(self, name: str, condition: bool, detail: str = "") -> None:
        if condition:
            self.passed += 1
            print(f"  \033[32m✓\033[0m  {name}")
        else:
            self.failed += 1
            suffix = f" — {detail}" if detail else ""
            print(f"  \033[31m✗\033[0m  {name}{suffix}")


async def run(host: str, port: int, engine: str, preset: str) -> int:
    url = f"ws://{host}:{port}/ws/captions?preset={preset}&engine={engine}"
    results = Results()
    print(f"\n❏ WebSocket /ws/captions  (engine={engine}, preset={preset})")
    print(f"↳ {url}\n")

    messages: list[dict[str, Any]] = []

    try:
        async with websockets.connect(url, max_size=None) as ws:
            # 1) 第一封必須是 ready
            raw = await asyncio.wait_for(ws.recv(), timeout=15)
            ready = json.loads(raw)
            messages.append(ready)

            results.check(
                "連線後收到 ready", ready.get("type") == "ready", f"實際收到 {ready.get('type')!r}"
            )
            results.check(
                "ready 含 engine/region/language",
                all(k in ready for k in ("engine", "region", "language")),
                f"欄位: {sorted(ready)}",
            )
            results.check(
                "[Constitution] region 在允許清單內",
                ready.get("region") in {"us-east-1", "us-west-2"},
                f"region={ready.get('region')!r}",
            )
            results.check(
                "sampleRate 為 16000",
                ready.get("sampleRate") == SAMPLE_RATE,
                f"實際 {ready.get('sampleRate')!r}",
            )

            # 2) 推音訊
            interval = SEND_INTERVAL_S if engine == "mock" else CHUNK_MS / 1000
            for i in range(TOTAL_CHUNKS):
                await ws.send(build_tone_chunk(i))
                await asyncio.sleep(interval)
            results.check(f"推送 {AUDIO_SECONDS:g} 秒 PCM16 音訊未被中斷", True)

            # 3) 送 stop 收尾
            await ws.send(json.dumps({"type": "stop"}))

            # 4) 收到 done（中間可能夾 partial/final/error）
            got_done = False
            got_error: str | None = None
            deadline = asyncio.get_running_loop().time() + 20
            while asyncio.get_running_loop().time() < deadline:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5)
                except (TimeoutError, asyncio.TimeoutError):
                    break
                except websockets.exceptions.ConnectionClosed:
                    break

                msg = json.loads(raw)
                messages.append(msg)
                if msg.get("type") == "error":
                    got_error = msg.get("message")
                if msg.get("type") == "done":
                    got_done = True
                    break

            results.check("沒有收到 error 訊息", got_error is None, str(got_error))
            results.check("送出 stop 後收到 done", got_done)

            done = next((m for m in messages if m.get("type") == "done"), None)
            results.check(
                "done 帶 stats",
                isinstance(done, dict) and isinstance(done.get("stats"), dict),
                f"stats={None if done is None else done.get('stats')}",
            )

            types = [m.get("type") for m in messages]
            results.check(
                "有收到字幕訊息 (partial 或 final)",
                any(t in ("partial", "final") for t in types),
                f"收到的訊息型別: {types}",
            )

    except (OSError, websockets.exceptions.WebSocketException) as exc:
        print(f"  \033[31m✗\033[0m  無法建立 WebSocket 連線 — {exc}")
        results.failed += 1

    total = results.passed + results.failed
    print(f"\n  assertions: {total}   passed: {results.passed}   failed: {results.failed}\n")
    return 1 if results.failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--engine", default="mock", choices=["auto", "aws", "mock"])
    parser.add_argument("--preset", default="clinic")
    args = parser.parse_args()
    return asyncio.run(run(args.host, args.port, args.engine, args.preset))


if __name__ == "__main__":
    sys.exit(main())
