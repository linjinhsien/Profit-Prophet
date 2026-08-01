"""PCM16 音訊工具 —— Amazon Transcribe Streaming 的輸入格式守門層。

Transcribe Streaming 的硬性要求：
  * encoding = pcm（16-bit signed integer，little-endian）
  * mono（單聲道）
  * sample rate 8000 或 16000 Hz（高品質語音用 16000）

長照現場的音訊來源很雜（平板內建麥克風、藍牙助聽器、床邊對講機），
格式不一定符合，所以這一層提供轉檔/重取樣/降混，讓上層不用管。
"""

from __future__ import annotations

import math
import sys
from array import array
from collections.abc import Iterator
from dataclasses import dataclass

__all__ = [
    "AudioFormat",
    "AudioFormatError",
    "downmix_to_mono",
    "iter_chunks",
    "resample_linear",
    "rms_dbfs",
    "silence",
    "to_pcm16",
    "validate_pcm16",
]

_NATIVE_LITTLE_ENDIAN = sys.byteorder == "little"

# PCM16 的滿刻度值，用來換算 dBFS
_FULL_SCALE = 32768.0


class AudioFormatError(ValueError):
    """音訊格式不符合 Transcribe Streaming 的要求。"""


@dataclass(frozen=True, slots=True)
class AudioFormat:
    """描述一份 PCM 音訊的格式。

    預設值就是 Transcribe Streaming 最推薦的組合，
    也是前端 AudioWorklet 應該輸出的格式。
    """

    sample_rate_hz: int = 16_000
    channels: int = 1
    encoding: str = "pcm"
    sample_width_bytes: int = 2

    #: Transcribe Streaming 只接受這兩種取樣率
    SUPPORTED_SAMPLE_RATES = (8_000, 16_000)

    def __post_init__(self) -> None:
        if self.encoding != "pcm":
            raise AudioFormatError(
                f"Transcribe Streaming 只支援 encoding='pcm'，收到 {self.encoding!r}"
            )
        if self.sample_width_bytes != 2:
            raise AudioFormatError(
                "只支援 16-bit（2 bytes）取樣，"
                f"收到 {self.sample_width_bytes} bytes"
            )
        if self.channels < 1:
            raise AudioFormatError(f"channels 必須 >= 1，收到 {self.channels}")
        if self.sample_rate_hz <= 0:
            raise AudioFormatError(
                f"sample_rate_hz 必須為正整數，收到 {self.sample_rate_hz}"
            )

    @property
    def frame_bytes(self) -> int:
        """一個取樣點（所有聲道）佔幾個 byte。"""
        return self.sample_width_bytes * self.channels

    @property
    def bytes_per_second(self) -> int:
        return self.frame_bytes * self.sample_rate_hz

    def bytes_for_ms(self, milliseconds: float) -> int:
        """算出指定毫秒數需要幾個 byte，並對齊到 frame 邊界。"""
        raw = int(self.bytes_per_second * milliseconds / 1000)
        return max(self.frame_bytes, raw - (raw % self.frame_bytes))

    def duration_ms(self, num_bytes: int) -> float:
        return num_bytes * 1000 / self.bytes_per_second

    def assert_streamable(self) -> None:
        """確認這個格式可以直接餵給 Transcribe Streaming。"""
        if self.channels != 1:
            raise AudioFormatError(
                "Transcribe Streaming 單聲道模式需要 channels=1，"
                f"收到 {self.channels}；請先用 downmix_to_mono() 降混"
            )
        if self.sample_rate_hz not in self.SUPPORTED_SAMPLE_RATES:
            raise AudioFormatError(
                "Transcribe Streaming 只支援 "
                f"{self.SUPPORTED_SAMPLE_RATES} Hz，收到 {self.sample_rate_hz} Hz；"
                "請先用 resample_linear() 重取樣"
            )


#: 前後端之間約定的標準格式
CARE_AUDIO_FORMAT = AudioFormat(sample_rate_hz=16_000, channels=1)


def _as_int16_array(data: bytes) -> array:
    """把 little-endian PCM16 bytes 轉成 array('h')。"""
    samples = array("h")
    samples.frombytes(data)
    if not _NATIVE_LITTLE_ENDIAN:
        samples.byteswap()
    return samples


def _to_bytes(samples: array) -> bytes:
    """把 array('h') 轉回 little-endian bytes。"""
    if not _NATIVE_LITTLE_ENDIAN:
        samples = samples[:]  # 複製一份，避免改動呼叫者的資料
        samples.byteswap()
    return samples.tobytes()


def validate_pcm16(data: bytes, fmt: AudioFormat = CARE_AUDIO_FORMAT) -> None:
    """檢查 bytes 長度是否對齊 frame 邊界，不對齊就代表格式錯了。"""
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise AudioFormatError(f"音訊必須是 bytes-like，收到 {type(data).__name__}")
    if len(data) % fmt.frame_bytes:
        raise AudioFormatError(
            f"音訊長度 {len(data)} bytes 無法被 frame 大小 "
            f"{fmt.frame_bytes} bytes 整除，格式可能不是 "
            f"PCM16/{fmt.channels}ch"
        )


def iter_chunks(data: bytes, chunk_bytes: int) -> Iterator[bytes]:
    """把音訊切成固定大小的小塊。

    Transcribe 對單一 audio event 有大小上限，而且小塊送出延遲較低，
    對「即時字幕」體驗差很多，所以一律切塊再送。
    """
    if chunk_bytes <= 0:
        raise ValueError("chunk_bytes 必須大於 0")
    for offset in range(0, len(data), chunk_bytes):
        yield bytes(data[offset : offset + chunk_bytes])


def silence(milliseconds: float, fmt: AudioFormat = CARE_AUDIO_FORMAT) -> bytes:
    """產生一段靜音。

    用途：長者說話慢、停頓長，Transcribe 若一段時間收不到音訊就會斷線，
    所以閒置時要餵靜音保活。
    """
    return b"\x00" * fmt.bytes_for_ms(milliseconds)


def rms_dbfs(data: bytes) -> float:
    """計算音量（dBFS，0 為滿刻度，越負越安靜）。

    前端拿這個值畫超大的音量條，讓長者一眼看出「麥克風有沒有收到我的聲音」，
    比純文字提示有效得多。
    """
    if not data:
        return -math.inf
    samples = _as_int16_array(data)
    if not samples:
        return -math.inf
    mean_square = sum(s * s for s in samples) / len(samples)
    if mean_square <= 0:
        return -math.inf
    return 20 * math.log10(math.sqrt(mean_square) / _FULL_SCALE)


def downmix_to_mono(data: bytes, channels: int) -> bytes:
    """把交錯排列的多聲道 PCM16 平均成單聲道。"""
    if channels < 1:
        raise AudioFormatError(f"channels 必須 >= 1，收到 {channels}")
    if channels == 1:
        return bytes(data)

    samples = _as_int16_array(data)
    usable = len(samples) - (len(samples) % channels)
    mono = array("h")
    for index in range(0, usable, channels):
        total = 0
        for offset in range(channels):
            total += samples[index + offset]
        mono.append(int(total / channels))
    return _to_bytes(mono)


def resample_linear(data: bytes, source_rate: int, target_rate: int) -> bytes:
    """線性插值重取樣（單聲道 PCM16）。

    純 Python、零額外依賴，品質對語音辨識足夠。
    若之後要更高品質，可換成 soxr / scipy，介面不用動。
    """
    if source_rate <= 0 or target_rate <= 0:
        raise AudioFormatError("取樣率必須為正整數")
    if source_rate == target_rate:
        return bytes(data)

    samples = _as_int16_array(data)
    source_len = len(samples)
    if source_len == 0:
        return b""
    if source_len == 1:
        return _to_bytes(samples)

    target_len = max(1, int(source_len * target_rate / source_rate))
    ratio = (source_len - 1) / max(1, target_len - 1) if target_len > 1 else 0.0

    out = array("h", bytes(2 * target_len))
    for i in range(target_len):
        position = i * ratio
        left = int(position)
        right = min(left + 1, source_len - 1)
        weight = position - left
        value = samples[left] * (1.0 - weight) + samples[right] * weight
        out[i] = max(-32768, min(32767, int(round(value))))
    return _to_bytes(out)


def to_pcm16(
    data: bytes,
    source: AudioFormat,
    target: AudioFormat = CARE_AUDIO_FORMAT,
) -> bytes:
    """一次搞定「任意 PCM16 格式 → Transcribe 可用格式」。

    先降混成單聲道，再重取樣到目標取樣率。
    """
    validate_pcm16(data, source)
    target.assert_streamable()

    mono = downmix_to_mono(data, source.channels)
    return resample_linear(mono, source.sample_rate_hz, target.sample_rate_hz)
