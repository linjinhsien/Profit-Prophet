"""WebSocket 服務：瀏覽器麥克風 → Transcribe Streaming → 即時字幕。

啟動（AWS profile 與區域讀 backend/.env，不用在指令裡指定）：

    ../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

然後開 http://127.0.0.1:8000

注意：這個端點沒有任何身分驗證，任何能連到這個埠的人都能用你的 AWS 額度。
只綁 127.0.0.1 給本機開發與 Demo 用；要對外開放必須先加上驗證與連線數限制。
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import replace
from pathlib import Path
from typing import Any, get_args

from fastapi import FastAPI, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import (
    CARE_PRESETS,
    build_recognizer_config,
    load_dotenv,
    load_engine,
)
from app.services.transcribe import (
    Engine,
    RecognizerConfig,
    RecognizerError,
    open_recognizer,
)

logger = logging.getLogger(__name__)

# 在建立任何 AWS 用戶端之前載入 backend/.env，
# 這樣 AWS_PROFILE 與區域設定就不必寫在 uvicorn 指令裡。
# 已存在的環境變數優先，所以臨時覆寫（AWS_PROFILE=other uvicorn ...）仍然有效。
_DOTENV_PATH, _ = load_dotenv()

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

app = FastAPI(title="安心聽 CareCaption", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://profit-prophet-frontend-site.s3-website-us-west-2.amazonaws.com",
        "https://d1qintm5rk17ye.cloudfront.net",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/config")
async def api_config() -> dict[str, Any]:
    """前端開頁時用來顯示目前設定（不含任何憑證資訊）。"""
    config = build_recognizer_config()
    return {
        "engine": load_engine(),
        "region": config.region,
        "presets": sorted(CARE_PRESETS),
        "languageOptions": list(config.language_options),
        "sampleRate": config.audio.sample_rate_hz,
        "chunkMs": config.chunk_ms,
        "settingsSource": _DOTENV_PATH.name if _DOTENV_PATH else "環境變數",
    }


def _read_secrets_manager(secret_name: str, region: str) -> dict[str, str]:
    """從 AWS Secrets Manager 讀取 JSON secret。結果會快取 5 分鐘。"""
    import json
    import time

    import boto3

    cache = getattr(_read_secrets_manager, "_cache", None)
    now = time.time()
    if cache and cache["name"] == secret_name and now - cache["ts"] < 300:
        return cache["data"]

    session = boto3.Session()
    client = session.client("secretsmanager", region_name=region)
    resp = client.get_secret_value(SecretId=secret_name)
    data = json.loads(resp["SecretString"])

    _read_secrets_manager._cache = {"name": secret_name, "data": data, "ts": now}  # type: ignore[attr-defined]
    return data


@app.get("/api/aws-config")
async def api_aws_config() -> dict[str, Any]:
    """從 Secrets Manager 讀取前端需要的 AWS 設定，不含任何金鑰。

    前端開頁時呼叫這個端點取得 Cognito Identity Pool ID、
    Bedrock KB ID 等設定，不需要寫死在 build 裡。
    """
    import os

    secret_name = os.environ.get("CARECAPTION_SECRET_NAME", "profit-prophet/env")
    region = os.environ.get("AWS_REGION", "us-west-2")

    try:
        secrets = _read_secrets_manager(secret_name, region)
    except Exception as exc:
        logger.warning("讀取 Secrets Manager 失敗：%s", exc)
        return {"error": f"無法讀取設定：{exc}"}

    # 只回傳前端需要的設定，不回傳任何金鑰
    return {
        "region": secrets.get("VITE_AWS_REGION", "us-west-2"),
        "identityPoolId": secrets.get("VITE_COGNITO_IDENTITY_POOL_ID", ""),
        "knowledgeBaseId": secrets.get("VITE_BEDROCK_KB_ID", ""),
        "modelArn": secrets.get("VITE_BEDROCK_MODEL_ARN", ""),
        "tableName": secrets.get("VITE_DDB_TABLE_NAME", ""),
        "backendUrl": secrets.get("VITE_BACKEND_URL", ""),
    }


def _build_config(
    preset: str,
    lang: str | None,
    speakers: bool | None,
    region: str | None,
) -> RecognizerConfig:
    """情境預設值 → 查詢參數覆寫。與 CLI 示範的邏輯一致。"""
    config = build_recognizer_config(preset)

    if region:
        config = replace(config, region=region)
    if lang and lang.lower() != "auto":
        config = config.for_language(lang)
    elif lang and lang.lower() == "auto":
        config = replace(
            config,
            language_code=None,
            identify_language=True,
            identify_multiple_languages=False,
        )
    if speakers is not None:
        config = replace(config, show_speaker_label=speakers)
    return config


@app.websocket("/ws/captions")
async def ws_captions(
    websocket: WebSocket,
    preset: str = Query("clinic"),
    lang: str | None = Query(None, description="語言代碼或 auto"),
    engine: str | None = Query(None, description="auto / aws / mock"),
    speakers: bool | None = Query(None),
    region: str | None = Query(None),
) -> None:
    """收 PCM16 二進位幀，推回字幕 JSON。

    音訊與字幕是兩條獨立的路，所以長者講話的同時字幕就會回來，不會互相卡住。
    """
    await websocket.accept()

    try:
        if engine is not None and engine not in get_args(Engine):
            raise ValueError(f"engine 必須是 {get_args(Engine)}，收到 {engine!r}")
        config = _build_config(preset, lang, speakers, region)
    except ValueError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1008)
        return

    try:
        recognizer = await open_recognizer(config, engine=engine or load_engine())
    except RecognizerError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)
        return

    language = config.language_code or f"auto:{','.join(config.language_options)}"
    await websocket.send_json(
        {
            "type": "ready",
            "engine": recognizer.engine,
            "region": config.region,
            "language": language,
            "preset": preset,
            "sampleRate": config.audio.sample_rate_hz,
            "speakerLabels": config.show_speaker_label,
            "stability": config.partial_stability
            if config.stabilize_partials
            else None,
        }
    )

    async def push_captions() -> None:
        async for segment in recognizer.segments():
            await websocket.send_json(segment.as_message())

    pusher = asyncio.create_task(push_captions())
    stopped = False

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if (chunk := message.get("bytes")) is not None:
                await recognizer.send_audio(chunk)
                continue

            # 前端送 {"type": "stop"} 表示講完了，要收尾剩下的 final
            if message.get("text") is not None:
                await recognizer.stop()
                stopped = True
                break
    except RecognizerError as exc:
        logger.warning("辨識失敗：%s", exc)
        with contextlib.suppress(Exception):
            await websocket.send_json({"type": "error", "message": str(exc)})
    except Exception:  # 連線異常中斷
        logger.debug("WebSocket 連線中斷", exc_info=True)
    finally:
        if not stopped:
            with contextlib.suppress(Exception):
                await recognizer.stop()

        with contextlib.suppress(asyncio.CancelledError, Exception):
            await asyncio.wait_for(pusher, timeout=10.0)
        pusher.cancel()

        with contextlib.suppress(Exception):
            await websocket.send_json(
                {"type": "done", "stats": recognizer.stats.as_dict()}
            )
        await recognizer.aclose()
        with contextlib.suppress(Exception):
            await websocket.close()
