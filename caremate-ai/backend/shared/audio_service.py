"""
語音服務模組 - CareMate AI
============================================================
STT（語音轉文字）：
    使用 OpenAI Whisper large-v3 部署於 AWS SageMaker Endpoint
    - 支援國語（zh）和台語（nan / Taiwanese Hokkien）
    - 自動語言偵測
    - Fallback: Amazon Transcribe（僅國語）

TTS（文字轉語音）：
    使用 Amazon Polly Neural Engine
    - 國語：Zhiyu 語音
    - 台語：Zhiyu 語音 + SSML 調整語速/音調

架構：
    Lambda → SageMaker Endpoint (Whisper large-v3, ml.g5.xlarge)
           → Amazon Polly (Neural TTS)
============================================================
"""
import boto3
import uuid
import json
import base64
import os
from typing import Optional

from .config import (
    AWS_REGION,
    S3_AUDIO_BUCKET,
    POLLY_VOICE_ZH,
    POLLY_VOICE_NAN,
    SAGEMAKER_ASR_ENDPOINT,
    ASR_MODEL_PROVIDER,
    TRANSCRIBE_VOCABULARY_NAME,
)

# AWS 服務客戶端
s3_client = boto3.client("s3", region_name=AWS_REGION)
polly_client = boto3.client("polly", region_name=AWS_REGION)
sagemaker_runtime = boto3.client("sagemaker-runtime", region_name=AWS_REGION)
transcribe_client = boto3.client("transcribe", region_name=AWS_REGION)


# ============================================================
# STT：語音轉文字
# ============================================================

def transcribe_audio(audio_bytes: bytes, language: str = "zh-TW") -> str:
    """
    語音轉文字主入口

    根據 ASR_MODEL_PROVIDER 環境變數決定使用哪個引擎：
    - 'whisper': OpenAI Whisper large-v3 via SageMaker（推薦）
    - 'transcribe': Amazon Transcribe（fallback）

    Args:
        audio_bytes: WebM/Opus 格式的音訊二進位資料
        language: 'zh-TW'（國語）或 'nan-TW'（台語）

    Returns:
        辨識出的文字，辨識失敗回傳空字串
    """
    provider = ASR_MODEL_PROVIDER

    if provider == "whisper":
        return _transcribe_whisper_sagemaker(audio_bytes, language)
    else:
        # fallback to Amazon Transcribe
        return _transcribe_aws(audio_bytes, language)


def _transcribe_whisper_sagemaker(audio_bytes: bytes, language: str) -> str:
    """
    使用 SageMaker 上的 Whisper large-v3 進行語音辨識

    推論流程：
    1. 將音訊 bytes 編碼為 base64
    2. 呼叫 SageMaker Endpoint
    3. 解析回傳的 JSON 結果

    Whisper large-v3 語言對應：
    - 國語/華語 → language="zh"
    - 台語 → language=None（讓模型自動偵測，效果最佳）
      Whisper 能辨識台語口說，但輸出以中文字為主

    SageMaker Endpoint 期望的輸入格式：
    {
        "audio": "<base64-encoded-bytes>",
        "language": "zh" | null,
        "task": "transcribe"
    }

    回傳格式：
    {
        "text": "辨識結果文字",
        "language": "zh" | "nan"
    }
    """
    endpoint_name = SAGEMAKER_ASR_ENDPOINT
    if not endpoint_name:
        print("[ASR] SAGEMAKER_ASR_ENDPOINT 未設定，fallback 到 Transcribe")
        return _transcribe_aws(audio_bytes, language)

    # 決定傳給 Whisper 的語言參數
    whisper_lang = None
    if language == "zh-TW":
        whisper_lang = "zh"
    elif language in ("nan-TW", "nan"):
        # 台語：不指定語言讓 Whisper 自動偵測
        # 測試發現不指定時，Whisper 對台語的辨識效果更好
        whisper_lang = None

    # 組建 payload
    payload = {
        "audio": base64.b64encode(audio_bytes).decode("utf-8"),
        "language": whisper_lang,
        "task": "transcribe",
    }

    try:
        response = sagemaker_runtime.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType="application/json",
            Body=json.dumps(payload),
            # 設定較長 timeout（語音辨識可能需要數秒）
            InvocationTimeout=60,
        )

        result = json.loads(response["Body"].read().decode("utf-8"))
        text = result.get("text", "").strip()
        detected = result.get("language", "unknown")

        print(f"[Whisper-SageMaker] 偵測語言={detected}, 文字={text[:60]}...")
        return text

    except sagemaker_runtime.exceptions.ModelError as e:
        print(f"[Whisper-SageMaker] 模型推論錯誤: {e}")
        return _transcribe_aws(audio_bytes, language)

    except sagemaker_runtime.exceptions.InternalFailure as e:
        print(f"[Whisper-SageMaker] SageMaker 內部錯誤: {e}")
        return _transcribe_aws(audio_bytes, language)

    except Exception as e:
        print(f"[Whisper-SageMaker] 未預期錯誤: {e}, fallback 到 Transcribe")
        return _transcribe_aws(audio_bytes, language)


def _transcribe_aws(audio_bytes: bytes, language: str) -> str:
    """
    Fallback: 使用 Amazon Transcribe 進行語音辨識

    注意限制：
    - 僅支援國語 zh-TW，台語無法正確辨識
    - 需要先上傳音訊到 S3，較慢（同步等待）
    - 適合作為 SageMaker 不可用時的降級方案
    """
    import time

    job_name = f"caremate-{uuid.uuid4().hex[:8]}-{int(time.time())}"
    audio_key = f"audio-input/{job_name}.webm"

    # 上傳到 S3
    s3_client.put_object(
        Bucket=S3_AUDIO_BUCKET,
        Key=audio_key,
        Body=audio_bytes,
        ContentType="audio/webm",
    )

    # Amazon Transcribe 只支援 zh-TW
    lang_code = "zh-TW"

    transcribe_client.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": f"s3://{S3_AUDIO_BUCKET}/{audio_key}"},
        MediaFormat="webm",
        LanguageCode=lang_code,
        OutputBucketName=S3_AUDIO_BUCKET,
        OutputKey=f"transcribe-output/{job_name}.json",
        # 使用自訂台語/客語詞彙庫提升辨識準確度
        **(_get_vocabulary_settings()),
    )

    # 同步等待（生產環境建議改用非同步）
    max_wait = 60
    elapsed = 0
    while elapsed < max_wait:
        status = transcribe_client.get_transcription_job(
            TranscriptionJobName=job_name
        )
        job_status = status["TranscriptionJob"]["TranscriptionJobStatus"]

        if job_status == "COMPLETED":
            break
        elif job_status == "FAILED":
            reason = status["TranscriptionJob"].get("FailureReason", "Unknown")
            raise Exception(f"Transcribe 失敗: {reason}")

        time.sleep(2)
        elapsed += 2

    if elapsed >= max_wait:
        raise Exception("Transcribe 逾時")

    # 讀取結果
    result_obj = s3_client.get_object(
        Bucket=S3_AUDIO_BUCKET,
        Key=f"transcribe-output/{job_name}.json",
    )
    result = json.loads(result_obj["Body"].read().decode("utf-8"))
    transcripts = result.get("results", {}).get("transcripts", [])

    if transcripts:
        return transcripts[0].get("transcript", "")
    return ""


def _get_vocabulary_settings() -> dict:
    """
    取得 Transcribe 自訂詞彙庫設定

    如果有設定 TRANSCRIBE_VOCABULARY_NAME 環境變數，
    會在轉寫任務中使用自訂詞彙庫來提升台語/客語相關詞彙的辨識準確度。
    """
    vocab_name = TRANSCRIBE_VOCABULARY_NAME
    if vocab_name:
        return {"Settings": {"VocabularyName": vocab_name}}
    return {}


# ============================================================
# TTS：文字轉語音
# ============================================================

def synthesize_speech(text: str, language: str = "zh-TW") -> dict:
    """
    使用 Amazon Polly 將文字轉為語音

    - 國語：直接使用 Neural Zhiyu 語音
    - 台語：使用 SSML 調整語速（90%）和音調（-5%），
            讓中文語音朗讀台語漢字更自然

    Args:
        text: 要合成語音的文字
        language: 'zh-TW' 或 'nan-TW'

    Returns:
        {
            "audio_url": "S3 presigned URL（1小時有效）",
            "audio_base64": "base64 encoded MP3"
        }
    """
    if language in ("nan-TW", "nan"):
        voice_id = POLLY_VOICE_NAN
        # 台語文字使用 SSML 讓朗讀更自然
        ssml_text = _build_taiwanese_ssml(text)
        synthesis_params = {
            "Text": ssml_text,
            "TextType": "ssml",
            "OutputFormat": "mp3",
            "VoiceId": voice_id,
            "Engine": "neural",
        }
    else:
        voice_id = POLLY_VOICE_ZH
        synthesis_params = {
            "Text": text,
            "TextType": "text",
            "OutputFormat": "mp3",
            "VoiceId": voice_id,
            "LanguageCode": "cmn-CN",
            "Engine": "neural",
        }

    # 呼叫 Polly 合成
    response = polly_client.synthesize_speech(**synthesis_params)
    audio_stream = response["AudioStream"].read()

    # 上傳到 S3
    audio_key = f"audio-output/{uuid.uuid4().hex}.mp3"
    s3_client.put_object(
        Bucket=S3_AUDIO_BUCKET,
        Key=audio_key,
        Body=audio_stream,
        ContentType="audio/mpeg",
    )

    # 產生 presigned URL
    audio_url = s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_AUDIO_BUCKET, "Key": audio_key},
        ExpiresIn=3600,
    )

    return {
        "audio_url": audio_url,
        "audio_base64": base64.b64encode(audio_stream).decode("utf-8"),
    }


def _build_taiwanese_ssml(text: str) -> str:
    """
    為台語文字建構 SSML

    調整：
    - 語速降到 90%（台語節奏較慢）
    - 音調降低 5%（更親切自然）
    - 在標點處加入停頓
    """
    ssml_text = text.replace("。", '。<break time="400ms"/>')
    ssml_text = ssml_text.replace("，", '，<break time="250ms"/>')
    ssml_text = ssml_text.replace("？", '？<break time="350ms"/>')
    ssml_text = ssml_text.replace("！", '！<break time="300ms"/>')

    return f'<speak><prosody rate="90%" pitch="-5%">{ssml_text}</prosody></speak>'


# ============================================================
# 輔助功能
# ============================================================

def detect_language_from_text(text: str) -> str:
    """
    根據文字內容判斷語言（台語或國語）

    使用台語特徵詞彙比對，偵測到 2 個以上台語詞彙判定為台語

    Args:
        text: 輸入文字

    Returns:
        'nan-TW'（台語）或 'zh-TW'（國語）
    """
    taiwanese_markers = [
        "食飽", "食飯", "睏", "歇", "袂", "佮", "甲", "啥物",
        "按怎", "遮", "彼", "咱", "恁", "伊", "厝", "代誌",
        "今仔日", "昨昏", "明仔載", "透早", "暗暝", "下晡",
        "是按怎", "欲", "毋", "嘛", "攏", "閣", "較",
        "好無", "敢有", "阮", "逐工", "逐日",
    ]

    count = sum(1 for marker in taiwanese_markers if marker in text)
    if count >= 2:
        return "nan-TW"
    return "zh-TW"
