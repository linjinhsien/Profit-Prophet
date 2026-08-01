# ASR 語音辨識模型部署指南

## 問題背景

CareMate AI 需要支援**國語（華語）**和**台語（閩南語）**的雙向語音辨識。
Amazon Transcribe 原生只支援 `zh-TW`（國語），**不支援台語**。
因此我們改用支援多語言的 Whisper 模型。

## 推薦方案比較

| 方案 | 模型 | 支援語言 | 延遲 | 成本 | 精確度 |
|------|------|---------|------|------|--------|
| A（推薦） | OpenAI Whisper large-v3 | 99+ 語言含中文、台語 | 5-10s | 中 | 高 |
| B（台灣專用） | Taiwan-Tongues-ASR v2.0 | 華語、台語、客語、英語 | 5-15s | 中 | 台語最高 |
| C（快速低成本） | Whisper large-v3-turbo | 99+ 語言 | 3-5s | 低 | 中高 |

## 方案 A：Whisper large-v3 部署到 SageMaker

### 步驟 1：建立 SageMaker Endpoint

```python
import sagemaker
from sagemaker.huggingface import HuggingFaceModel

role = "arn:aws:iam::YOUR_ACCOUNT:role/SageMakerRole"

# 使用 Hugging Face DLC
huggingface_model = HuggingFaceModel(
    model_data=None,  # 從 Hub 直接下載
    role=role,
    transformers_version="4.37",
    pytorch_version="2.1",
    py_version="py310",
    env={
        "HF_MODEL_ID": "openai/whisper-large-v3",
        "HF_TASK": "automatic-speech-recognition",
    },
)

predictor = huggingface_model.deploy(
    initial_instance_count=1,
    instance_type="ml.g5.xlarge",  # GPU 推論
    endpoint_name="caremate-whisper-v3",
)
```

### 步驟 2：設定環境變數

```bash
export ASR_MODEL_PROVIDER=whisper
export SAGEMAKER_ASR_ENDPOINT=caremate-whisper-v3
```

### 步驟 3：推論格式

**輸入（JSON）：**
```json
{
  "audio": "<base64-encoded-audio>",
  "language": "zh",
  "task": "transcribe",
  "return_timestamps": false
}
```

**輸出：**
```json
{
  "text": "今天天氣很好",
  "language": "zh"
}
```

---

## 方案 B：Taiwan-Tongues-ASR v2.0（數位發展部）

這是台灣數位發展部開源的模型，專門針對台灣多語言環境設計。

### 模型資訊
- 來源：[adi-gov-tw/Taiwan-Tongues-ASR-CE-pretrained-v2.0](https://huggingface.co/adi-gov-tw/Taiwan-Tongues-ASR-CE-pretrained-v2.0)
- 基礎：OpenAI Whisper large-v2
- 支援語言代碼：`zh`（華語）、`nan`（台語）、`hak`（客語）、`en`（英語）、`id`（印尼文）

### 部署到 SageMaker

```python
huggingface_model = HuggingFaceModel(
    role=role,
    transformers_version="4.37",
    pytorch_version="2.1",
    py_version="py310",
    env={
        "HF_MODEL_ID": "adi-gov-tw/Taiwan-Tongues-ASR-CE-pretrained-v2.0",
        "HF_TASK": "automatic-speech-recognition",
    },
)

predictor = huggingface_model.deploy(
    initial_instance_count=1,
    instance_type="ml.g5.xlarge",
    endpoint_name="caremate-taiwan-tongues-asr",
)
```

### 環境設定

```bash
export ASR_MODEL_PROVIDER=taiwan-tongues
export SAGEMAKER_ASR_ENDPOINT=caremate-taiwan-tongues-asr
```

---

## 方案 C：Whisper large-v3-turbo（Lambda + EFS）

適合低成本場景，模型較小（809M 參數），推論更快。

### 架構
- Lambda 函數 + EFS 掛載
- 首次呼叫時從 S3 下載模型到 EFS
- 後續呼叫直接從 EFS 載入（冷啟動 ~20s，暖機後 ~5-10s）

### 參考實作
- [aws-lambda-whisper-adaptor](https://github.com/gabrielkoo/aws-lambda-whisper-adaptor)

---

## 設定切換

在 `backend/shared/config.py` 中修改 `ASR_MODEL_PROVIDER`：

```python
# 使用 Whisper large-v3
ASR_MODEL_PROVIDER = "whisper"
SAGEMAKER_ASR_ENDPOINT = "caremate-whisper-v3"

# 或使用 Taiwan-Tongues
ASR_MODEL_PROVIDER = "taiwan-tongues"
SAGEMAKER_ASR_ENDPOINT = "caremate-taiwan-tongues-asr"

# 或 fallback 到 Amazon Transcribe（不支援台語）
ASR_MODEL_PROVIDER = "transcribe"
```

## TTS（文字轉語音）

目前使用 Amazon Polly（Neural engine, Zhiyu 語音）。
Polly 不原生支援台語，我們的做法是：
1. AI 生成台語漢字文字回應
2. 使用 SSML 調整語速（90%）和音調（-5%），讓中文語音朗讀台語文字更自然
3. 未來可考慮整合其他 TTS 服務（如：Azure 語音服務支援台語）
