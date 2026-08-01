"""AWS 服務封裝層。"""

from app.services.transcribe import (
    CARE_LANGUAGE_OPTIONS,
    CaptionSegment,
    MockStreamingRecognizer,
    RecognizerConfig,
    RecognizerError,
    RecognizerState,
    StreamingRecognizer,
    TranscribeStreamingRecognizer,
    TranscribeUnavailableError,
    create_recognizer,
    open_recognizer,
)

__all__ = [
    "CARE_LANGUAGE_OPTIONS",
    "CaptionSegment",
    "MockStreamingRecognizer",
    "RecognizerConfig",
    "RecognizerError",
    "RecognizerState",
    "StreamingRecognizer",
    "TranscribeStreamingRecognizer",
    "TranscribeUnavailableError",
    "create_recognizer",
    "open_recognizer",
]
