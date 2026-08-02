"""
SageMaker 自定義推論腳本 - OpenAI Whisper large-v3
用於 CareMate AI 語音辨識（支援國語 + 台語）

此腳本會被 SageMaker Hosting 自動載入，提供：
- model_fn: 載入 Whisper large-v3 模型
- input_fn: 解析輸入（base64 audio）
- predict_fn: 執行語音辨識推論
- output_fn: 格式化輸出結果
"""
import json
import base64
import tempfile
import os
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline


def model_fn(model_dir):
    """
    載入 Whisper large-v3 模型
    SageMaker 會在容器啟動時呼叫此函數一次

    Args:
        model_dir: 模型檔案所在目錄（SageMaker 會自動下載）

    Returns:
        已載入的 ASR pipeline
    """
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    print(f"[Whisper] 載入模型，裝置: {device}, dtype: {torch_dtype}")

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        model_dir,
        torch_dtype=torch_dtype,
        low_cpu_mem_usage=True,
        use_safetensors=True,
    )
    model.to(device)

    processor = AutoProcessor.from_pretrained(model_dir)

    asr_pipeline = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=torch_dtype,
        device=device,
        # 優化推論設定
        chunk_length_s=30,
        batch_size=1,
    )

    print("[Whisper] 模型載入完成")
    return asr_pipeline


def input_fn(request_body, request_content_type):
    """
    解析輸入請求

    預期 JSON 格式：
    {
        "audio": "<base64-encoded-audio-bytes>",
        "language": "zh" | "nan" | null (自動偵測),
        "task": "transcribe" (預設)
    }
    """
    if request_content_type == "application/json":
        data = json.loads(request_body)
        return data
    elif request_content_type in ("audio/webm", "audio/wav", "audio/mp3", "audio/mpeg"):
        # 直接接收音訊二進位
        return {
            "audio_bytes": request_body,
            "language": None,
            "task": "transcribe",
        }
    else:
        raise ValueError(f"不支援的 Content-Type: {request_content_type}")


def predict_fn(input_data, model):
    """
    執行 Whisper 推論

    Args:
        input_data: 來自 input_fn 的解析結果
        model: 來自 model_fn 的 ASR pipeline

    Returns:
        辨識結果 dict
    """
    # 取得音訊資料
    if "audio" in input_data:
        audio_bytes = base64.b64decode(input_data["audio"])
    elif "audio_bytes" in input_data:
        audio_bytes = input_data["audio_bytes"]
    else:
        return {"error": "缺少音訊資料", "text": ""}

    language = input_data.get("language")
    task = input_data.get("task", "transcribe")

    # 將音訊寫入暫存檔
    suffix = ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
        tmp_file.write(audio_bytes)
        tmp_path = tmp_file.name

    try:
        # 建構 generate_kwargs
        generate_kwargs = {"task": task}

        if language:
            # 語言對應：
            # 國語/華語 → "zh" (Chinese)
            # 台語/閩南語 → "zh" (Whisper 會以中文字轉寫台語)
            #   或 None (讓模型自動偵測)
            if language in ("zh-TW", "zh-CN", "zh"):
                generate_kwargs["language"] = "zh"
            elif language in ("nan-TW", "nan"):
                # 台語：不指定語言，讓 Whisper 自動處理
                # Whisper large-v3 能辨識台語但輸出中文字
                # 不設 language 讓模型自行判斷效果更好
                pass
            else:
                generate_kwargs["language"] = language

        # 執行推論
        result = model(
            tmp_path,
            generate_kwargs=generate_kwargs,
            return_timestamps=False,
        )

        text = result.get("text", "").strip()

        # 偵測語言（從 Whisper 內部機制取得）
        detected_language = _detect_language_hint(text)

        return {
            "text": text,
            "language": detected_language,
            "task": task,
        }

    except Exception as e:
        print(f"[Whisper] 推論錯誤: {e}")
        return {"error": str(e), "text": "", "language": "unknown"}

    finally:
        # 清除暫存檔
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def output_fn(prediction, response_content_type):
    """
    格式化輸出

    Returns:
        JSON 格式的辨識結果
    """
    if response_content_type == "application/json":
        return json.dumps(prediction, ensure_ascii=False)
    else:
        return json.dumps(prediction, ensure_ascii=False)


def _detect_language_hint(text: str) -> str:
    """
    根據轉寫文字推測語言（台語或國語）
    """
    taiwanese_markers = [
        "食飽", "食飯", "睏", "歇", "袂", "佮", "啥物",
        "按怎", "咱", "恁", "伊", "厝", "代誌",
        "今仔日", "透早", "暗暝", "欲", "毋", "嘛", "攏",
    ]
    count = sum(1 for m in taiwanese_markers if m in text)
    if count >= 2:
        return "nan"
    return "zh"
