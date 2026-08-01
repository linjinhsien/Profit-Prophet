#!/usr/bin/env python3
"""端到端驗證 WebSocket 服務（不需要瀏覽器）。

模擬前端行為：連上 /ws/captions、依真實時間節奏送 PCM16 幀、
送 {"type":"stop"} 收尾，然後檢查收到的字幕訊息。

用法：
    python examples/verify_websocket.py                       # 用 mock 引擎，不花錢
    python examples/verify_websocket.py --engine aws           # 打真實 AWS
    python examples/verify_websocket.py --wav samples/clinic.wav --engine aws
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BACKEND = Path(__file__).resolve().parent.parent
_failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if condition else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        _failures.append(label)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="WebSocket 端到端驗證")
    parser.add_argument("--engine", default="mock", choices=("auto", "aws", "mock"))
    parser.add_argument("--preset", default="clinic")
    parser.add_argument("--lang", default="zh-TW")
    parser.add_argument("--wav", type=Path, default=None)
    parser.add_argument("--seconds", type=float, default=6.0)
    parser.add_argument("--port", type=int, default=8123)
    parser.add_argument(
        "--realtime",
        action="store_true",
        help="依真實時間節奏送音訊（打真實 AWS 時必須開）",
    )
    return parser.parse_args()


def load_audio(args: argparse.Namespace) -> bytes:
    if args.wav is None:
        # 靜音：足夠驗證管線，但不會有辨識結果
        return b"\x00\x00" * int(16_000 * args.seconds)
    with wave.open(str(args.wav), "rb") as handle:
        if (handle.getframerate(), handle.getnchannels(), handle.getsampwidth()) != (
            16_000,
            1,
            2,
        ):
            raise SystemExit(f"{args.wav} 不是 16 kHz / mono / 16-bit")
        return handle.readframes(handle.getnframes())


async def wait_for_server(port: int, timeout: float = 30.0) -> bool:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
        except OSError:
            await asyncio.sleep(0.3)
            continue
        writer.close()
        await writer.wait_closed()
        return True
    return False


async def main() -> int:
    args = parse_args()
    audio = load_audio(args)

    try:
        import websockets
    except ImportError:
        print("需要 websockets 套件：pip install websockets", file=sys.stderr)
        return 1

    print(f"啟動 uvicorn（port {args.port}）…")
    server = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(args.port),
        "--log-level",
        "warning",
        cwd=str(BACKEND),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    try:
        if not await wait_for_server(args.port):
            print("伺服器啟動逾時", file=sys.stderr)
            return 1

        # --- /api/config ---
        print("\n1. GET /api/config")
        print("-" * 20)
        reader, writer = await asyncio.open_connection("127.0.0.1", args.port)
        writer.write(
            b"GET /api/config HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        )
        await writer.drain()
        raw = await reader.read(-1)
        writer.close()
        await writer.wait_closed()
        body = raw.split(b"\r\n\r\n", 1)[1]
        config_payload = json.loads(body)
        check("回傳 JSON", isinstance(config_payload, dict))
        check(
            "有讀到 .env",
            config_payload.get("settingsSource", "").endswith(".env"),
            str(config_payload.get("settingsSource")),
        )
        check(
            "region 來自 .env",
            bool(config_payload.get("region")),
            str(config_payload.get("region")),
        )
        check(
            "sampleRate 為 16000",
            config_payload.get("sampleRate") == 16_000,
            str(config_payload.get("sampleRate")),
        )
        check(
            "三種長照情境都有",
            set(config_payload.get("presets", [])) == {"caregiver", "clinic", "elder"},
            str(config_payload.get("presets")),
        )

        # --- WebSocket ---
        print("\n2. WebSocket /ws/captions")
        print("-" * 26)
        url = (
            f"ws://127.0.0.1:{args.port}/ws/captions"
            f"?preset={args.preset}&lang={args.lang}&engine={args.engine}"
        )
        messages: list[dict] = []

        async with websockets.connect(url, max_size=None) as socket:
            ready = json.loads(await asyncio.wait_for(socket.recv(), timeout=30))
            check("先收到 ready", ready.get("type") == "ready", str(ready.get("type")))
            check("ready 帶引擎名稱", bool(ready.get("engine")), str(ready.get("engine")))
            check(
                "ready 帶語言",
                ready.get("language") == args.lang,
                str(ready.get("language")),
            )

            chunk_bytes = 3200  # 100 ms
            chunk_seconds = chunk_bytes / 32_000

            async def collect() -> None:
                try:
                    async for raw_message in socket:
                        messages.append(json.loads(raw_message))
                except Exception:  # 連線關閉
                    pass

            collector = asyncio.create_task(collect())

            for offset in range(0, len(audio), chunk_bytes):
                await socket.send(audio[offset : offset + chunk_bytes])
                await asyncio.sleep(chunk_seconds if args.realtime else 0)

            await socket.send(json.dumps({"type": "stop"}))
            await asyncio.wait_for(collector, timeout=30)

        kinds = [m.get("type") for m in messages]
        finals = [m for m in messages if m.get("type") == "final"]
        partials = [m for m in messages if m.get("type") == "partial"]

        check("收到 done 收尾訊息", "done" in kinds, str(sorted(set(kinds))))
        done = next((m for m in messages if m.get("type") == "done"), {})
        stats = done.get("stats", {})
        check(
            "done 帶指標",
            "audioSecondsSent" in stats,
            f"送出 {stats.get('audioSecondsSent')} 秒",
        )
        check(
            "伺服器收到的音訊長度正確",
            abs(stats.get("audioSecondsSent", 0) - len(audio) / 32_000) < 0.2,
            f"{stats.get('audioSecondsSent')} vs {len(audio) / 32_000:.2f}",
        )
        check("沒有 error 訊息", "error" not in kinds, str([m for m in messages if m.get("type") == "error"]))

        if args.wav is not None or args.engine == "mock":
            check(
                "有拿到 final 字幕",
                bool(finals),
                f"{len(partials)} partial / {len(finals)} final",
            )
            for message in finals:
                check(
                    "final 欄位齊全（original/lang/segmentId）",
                    all(k in message for k in ("original", "lang", "segmentId")),
                    message.get("original", "")[:40],
                )
                break
            if finals:
                print("\n  逐字稿：")
                for index, message in enumerate(finals, 1):
                    print(f"    {index}. [{message.get('lang')}] {message.get('original')}")
        else:
            print(f"  {DIM if False else ''}（送靜音，預期沒有 final：{len(finals)} 筆）")

        print()
        if _failures:
            print(f"{len(_failures)} 項未通過：")
            for name in _failures:
                print(f"  - {name}")
            return 1
        print("全部檢查通過。")
        return 0
    finally:
        server.terminate()
        try:
            await asyncio.wait_for(server.wait(), timeout=10)
        except TimeoutError:
            server.kill()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
