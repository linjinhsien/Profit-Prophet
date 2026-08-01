"""麥克風擷取（開發與 Demo 用）。

正式產品的音訊來自瀏覽器的 AudioWorklet，不需要這個模組；
但在還沒接前端之前，能對著筆電麥克風講話看字幕，是驗證整條管線最快的方式。

依賴 `sounddevice`（選用）：

    pip install sounddevice

macOS 第一次執行會跳出麥克風權限請求，要按允許。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

from app.audio.pcm import CARE_AUDIO_FORMAT, AudioFormat

logger = logging.getLogger(__name__)

__all__ = [
    "MicrophoneUnavailableError",
    "list_input_devices",
    "microphone_chunks",
]


class MicrophoneUnavailableError(RuntimeError):
    """無法使用麥克風（缺少套件、沒有裝置、或權限被拒）。"""


def _load_sounddevice() -> Any:
    try:
        import sounddevice
    except OSError as exc:  # PortAudio 載入失敗
        raise MicrophoneUnavailableError(
            f"無法載入音訊後端（PortAudio）：{exc}"
        ) from exc
    except ImportError as exc:
        raise MicrophoneUnavailableError(
            "缺少 sounddevice 套件，請執行 `pip install sounddevice`"
        ) from exc
    return sounddevice


def list_input_devices() -> list[tuple[int, str, int]]:
    """回傳可用的輸入裝置 (index, 名稱, 預設取樣率)。"""
    sounddevice = _load_sounddevice()
    devices = []
    for index, device in enumerate(sounddevice.query_devices()):
        if device["max_input_channels"] > 0:
            devices.append(
                (index, device["name"], int(device["default_samplerate"]))
            )
    return devices


async def microphone_chunks(
    fmt: AudioFormat = CARE_AUDIO_FORMAT,
    *,
    chunk_ms: float = 100.0,
    device: int | str | None = None,
    queue_maxsize: int = 64,
) -> AsyncIterator[bytes]:
    """持續產出麥克風的 PCM16 音訊塊。

    直接請 CoreAudio 以 16 kHz / 單聲道 / int16 擷取，
    所以拿到的 bytes 可以原封不動送進 Transcribe，不必再轉檔。

    這個 generator 不會自己結束，由呼叫端 break 或取消任務來停止。
    """
    sounddevice = _load_sounddevice()

    frames_per_chunk = fmt.bytes_for_ms(chunk_ms) // fmt.frame_bytes
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=queue_maxsize)
    overflows = 0

    def callback(indata, frames, time_info, status) -> None:  # noqa: ANN001
        """由 PortAudio 的執行緒呼叫，不能在這裡做阻塞的事。"""
        nonlocal overflows
        if status:
            logger.debug("麥克風狀態旗標：%s", status)
        payload = bytes(indata)

        def push() -> None:
            nonlocal overflows
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                overflows += 1

        loop.call_soon_threadsafe(push)

    try:
        stream = sounddevice.RawInputStream(
            samplerate=fmt.sample_rate_hz,
            channels=fmt.channels,
            dtype="int16",
            blocksize=frames_per_chunk,
            device=device,
            callback=callback,
        )
    except Exception as exc:  # noqa: BLE001
        raise MicrophoneUnavailableError(
            f"無法開啟麥克風：{exc}｜"
            "macOS 請到「系統設定 → 隱私權與安全性 → 麥克風」確認已授權執行的終端機程式"
        ) from exc

    with stream:
        logger.info(
            "麥克風已開啟：%d Hz / %dch / 每塊 %.0f ms",
            fmt.sample_rate_hz,
            fmt.channels,
            chunk_ms,
        )
        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk
        finally:
            if overflows:
                logger.warning(
                    "有 %d 塊音訊因為處理不及被丟棄（佇列滿）", overflows
                )
