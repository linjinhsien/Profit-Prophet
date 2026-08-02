# Profit-Prophet 完整架構分析
**日期**: 2026-08-02  
**版本**: v2 - 24小時 MVP  

---

## 🎯 核心架構原則

**設計原則**: 最少服務數、最低固定成本、24小時內完成 Demo

### v1 → v2 重大變更

| 項目 | v1 (原設計) | v2 (現行) | 理由 |
|------|------------|----------|------|
| 運算層 | API Gateway + Lambda | **前端直呼 AWS SDK** | 少一層部署與除錯，24h 最省時間 |
| 向量庫 | OpenSearch Serverless | **S3 Vectors** | 成本降約 90%，無需管理 collection |
| RAG | 自建 (向量查詢 + 摘要分開) | **Bedrock Knowledge Bases** | 一個 API 完成檢索與生成 |
| LLM | Claude 3 Sonnet | **Claude Sonnet 4** | 高性能推理，適合複雜對話與分類 |
| 意圖分類 | Amazon Comprehend | **併入 Claude structured output** | 省一次網路往返 |
| 語音 | Transcribe + Polly (經 Lambda) | **Transcribe + Polly (前端直呼)** | 移除中介層 |
| 憑證 | API Key | **Cognito Identity Pool + IAM** | 前端直呼 AWS 服務的安全做法 |

---

## 📊 完整系統架構

```
用戶瀏覽器 (React + Vite)
    ↓ 
    ├─ 麥克風擷取 (Web Audio API)
    ├─ 音訊播放
    └─ 對話介面 UI
    ↓
Cognito Identity Pool (認證)
    ↓
IAM Role (最小權限授予)
    ↓
┌────────────────────────────────────────────────────┐
│ AWS 服務層 (前端直接呼叫)                           │
├────────────────────────────────────────────────────┤
│                                                    │
│ 1️⃣ Amazon Transcribe Streaming (zh-TW)           │
│    ├─ LiveCaption 封裝層                          │
│    ├─ 語音識別 + 說話者辨識                        │
│    ├─ 多語言自動判定 (zh-TW/id-ID/vi-VN/en/ja/th) │
│    ├─ Partial results stabilization (high)        │
│    └─ Silence keepalive (3秒自動補靜音維持連線)    │
│                                                    │
│ 2️⃣ Bedrock RetrieveAndGenerate API               │
│    ├─ Knowledge Base: H4NWXXP6DZ                  │
│    ├─ Model: Claude Sonnet 4                     │
│    ├─ 一次 API 完成檢索 + 生成                     │
│    └─ Structured output (照護事件分類)            │
│                                                    │
│ 3️⃣ Amazon Polly (Zhiyu Neural)                   │
│    ├─ 中文語音合成                                 │
│    ├─ Neural 語音引擎                              │
│    └─ 即時文字轉語音                               │
│                                                    │
└────────────────────────────────────────────────────┘
    ↓
┌────────────────────────────────────────────────────┐
│ 資料儲存層                                          │
├────────────────────────────────────────────────────┤
│                                                    │
│ • S3 Bucket: 照護知識文件原始檔                     │
│ • S3 Vectors: 向量索引 (Bedrock Knowledge Base)   │
│                                                    │
│ • DynamoDB 表 (3個):                               │
│   1. profit-prophet-conversations (對話記錄)       │
│      └─ Keys: identityId + id                     │
│   2. caremate-ai_elder_profile (長者檔案, 11筆)    │
│      └─ Keys: elder_id                            │
│   3. caremate-ai_elder_memory (長者記憶)           │
│      └─ Keys: elder_id + timestamp                │
│                                                    │
│ • Secrets Manager: AWS 憑證管理                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## 🔊 LiveCaption 語音辨識層

### 功能特點

LiveCaption 是對 Amazon Transcribe Streaming 的封裝層，專為**長照現場**優化：

| 長照現場問題 | LiveCaption 解決方案 |
|-------------|---------------------|
| 長者講話慢、停頓長 (數十秒) | `silence_keepalive`: 閒置 3 秒自動補靜音幀維持連線 |
| partial 結果反覆改寫，字幕跳動 | `enable_partial_results_stabilization=high`: 已辨識的字不再變動 |
| 多國籍照服員混講 (印尼/越南/台語) | `identify_language`: 自動判定語言 (zh-TW/id-ID/vi-VN/en/ja/th) |
| 需分辨「照服員說的」vs「長者說的」 | `show_speaker_label`: 產生語者標籤 |

### 技術實作

```python
# 三行即可使用
from app.services.transcribe import RecognizerConfig, open_recognizer

recognizer = await open_recognizer(RecognizerConfig(language_code="zh-TW"))
async with recognizer:
    await recognizer.send_audio(pcm16_bytes)          # 送音訊
    async for segment in recognizer.segments():       # 取字幕
        print(segment.text, segment.is_partial)
```

### 部署位置

- **後端**: EC2 t3.micro (i-099c8061008241015)
- **Repository**: `LiveCaption/backend/` 目錄
- **WebSocket 端點**: `/ws/*` (via CloudFront → EC2)
- **Runtime**: Python 3.12 + FastAPI/Starlette

---

## 🤖 Lambda 函數群組

發現的 Lambda 函數 (CareMate-AI 專案):

| 函數名稱 | Runtime | 用途 | 相關資源 |
|---------|---------|------|---------|
| **caremate-ai-speech-dev** | Python 3.12 | 語音處理 | S3: caremate-ai-audio, DynamoDB: elder_profile, elder_memory |
| caremate-ai-chat-dev | Python 3.12 | 對話處理 | - |
| caremate-ai-summary-dev | Python 3.12 | 摘要生成 | - |
| caremate-ai-memory-dev | Python 3.12 | 記憶管理 | - |
| caremate-ai-profile-dev | Python 3.12 | 檔案管理 | - |

**caremate-ai-speech-dev 配置**:
```json
{
  "TABLE_ELDER_MEMORY": "caremate-ai_elder_memory",
  "TABLE_ELDER_PROFILE": "caremate-ai_elder_profile",
  "AWS_REGION_NAME": "us-west-2",
  "BEDROCK_MODEL_ID": "us.anthropic.claude-sonnet-4-20250514-v1:0",
  "S3_AUDIO_BUCKET": "caremate-ai-audio-056724761684-us-west-2",
  "BEDROCK_KB_ID": "H4NWXXP6DZ"
}
```

---

## 🌐 CloudFront 分發策略

**Distribution ID**: E1NHT4ZC7ZFGUP

### Origins 配置:

1. **S3-Website**: `profit-prophet-frontend-site.s3-website-us-west-2.amazonaws.com`
   - 用途: React SPA 靜態檔案

2. **Backend-EC2**: `ec2-35-91-137-3.us-west-2.compute.amazonaws.com:8080`
   - 用途: API + WebSocket (LiveCaption)

### Cache Behaviors:

| 路徑模式 | 目標 Origin | 快取策略 | 用途 |
|---------|------------|---------|------|
| `/*` (預設) | S3-Website | TTL 300s | 前端靜態資源 |
| `/api/*` | Backend-EC2 | 無快取 | RESTful API |
| `/ws/*` | Backend-EC2 | 無快取 | WebSocket (LiveCaption 即時字幕) |

---

## 🗄️ DynamoDB 資料模型

### 1. profit-prophet-conversations
**用途**: 對話記錄  
**Keys**: 
- `identityId` (HASH) - Cognito Identity ID
- `id` (RANGE) - 對話 ID

**Schema** (推測):
```json
{
  "identityId": "us-west-2:xxx",
  "id": "conv_xxx",
  "timestamp": 1722567148990,
  "messages": [...],
  "careEvents": [...]
}
```

### 2. caremate-ai_elder_profile
**用途**: 長者基本檔案  
**Keys**: 
- `elder_id` (HASH)

**目前資料**: 11 筆 (7.4 KB)

**Schema** (推測):
```json
{
  "elder_id": "elder_xxx",
  "name": "王阿嬤",
  "age": 85,
  "room": "A101",
  "medical_conditions": [...],
  "allergies": [...],
  "care_notes": "..."
}
```

### 3. caremate-ai_elder_memory
**用途**: 長者記憶與事件記錄  
**Keys**: 
- `elder_id` (HASH)
- `timestamp` (RANGE)

**Schema** (推測):
```json
{
  "elder_id": "elder_xxx",
  "timestamp": 1722567148990,
  "event_type": "medication|meal|bathroom|fall|conversation",
  "content": "...",
  "caregiver_id": "cg_xxx",
  "speaker": "caregiver|elder"
}
```

---

## 🎤 為什麼不用 Amazon Nova Sonic?

Amazon Nova 2 Sonic 是 **speech-to-speech** 模型，一個模型即可取代:
- Transcribe (語音→文字)
- Claude (理解與生成)
- Polly (文字→語音)

**Nova Sonic 確實支援中文**，但有以下問題：
- ⚠️ **ABC 腔調**: 語音帶有明顯美式華語腔調
- ⚠️ **不適合台灣長照**: 長者與照服員主要使用台灣國語與台語
- ⚠️ **語音自然度**: 對台灣使用者而言不夠自然

因此本專案維持 **Transcribe (zh-TW) + Claude Sonnet 4 + Polly (Zhiyu Neural)** 組合，提供更符合台灣使用情境的語音體驗。

參考: [Amazon Nova speech models](https://aws.amazon.com/ai/generative-ai/nova/speech/)

---

## ✅ 完整驗證總結

| 組件 | 驗證狀態 | 詳細資訊 |
|------|---------|---------|
| CloudFront CDN | ✅ | E1NHT4ZC7ZFGUP, 運作中 |
| S3 靜態網站 | ✅ | profit-prophet-frontend-site |
| EC2 後端 | ✅ | t3.micro (LiveCaption WebSocket) |
| Cognito | ✅ | Identity Pool 已配置 |
| Transcribe | ✅ | Streaming zh-TW (LiveCaption 封裝) |
| Bedrock KB | ✅ | H4NWXXP6DZ, Claude Sonnet 4 |
| Polly | ✅ | Zhiyu Neural (前端直呼) |
| DynamoDB | ✅ | 3 表已確認 |
| Lambda 函數 | ✅ | 5 個 caremate-ai 函數 |
| S3 Audio Bucket | ✅ | caremate-ai-audio-056724761684-us-west-2 |

---

## 🏗️ 技術棧總覽

### 前端
- React + Vite
- TypeScript
- AWS SDK v3 (直接呼叫 AWS 服務)
- Web Audio API (麥克風擷取)

### 後端 (EC2)
- Node.js (主要 API)
- Python 3.12 (LiveCaption/Transcribe)
- FastAPI/Starlette (WebSocket)
- Docker (LiveCaption 容器化)

### 基礎設施
- AWS CDK (TypeScript) - IaC
- CloudFront (CDN)
- S3 (靜態網站 + 向量儲存)
- EC2 t3.micro (us-west-2)

### AI/ML 服務
- Amazon Transcribe Streaming (語音識別)
- Amazon Bedrock Knowledge Bases (RAG)
- Claude Sonnet 4 (LLM)
- Amazon Polly Neural (語音合成)

### 資料 & 認證
- DynamoDB (3 表)
- Cognito Identity Pool
- IAM (最小權限原則)
- Secrets Manager

---

## 📝 關鍵發現

1. **無 Whisper Server**: 使用 Amazon Transcribe Streaming，而非自建 Whisper
2. **LiveCaption 封裝**: 專為長照現場優化的 Transcribe 封裝層
3. **前端直呼架構**: 移除 API Gateway + Lambda 中介層，降低延遲
4. **Lambda 函數群**: caremate-ai 專案包含 5 個 Lambda 函數
5. **多語言支援**: 自動判定 zh-TW/id-ID/vi-VN/en/ja/th
6. **EC2 用途**: 主要用於 LiveCaption WebSocket 服務

---

## 🎯 結論

Profit-Prophet 是一個**完全 serverless** (除 EC2 LiveCaption) 的 AI 照護助理系統:
- ✅ 前端直接呼叫 AWS 託管服務 (Transcribe, Bedrock, Polly)
- ✅ 24 小時內完成 MVP 部署
- ✅ 成本優化 (S3 Vectors 降低 90% 成本)
- ✅ 為長照現場優化 (LiveCaption 語音辨識層)
- ⚠️ EC2 用於 LiveCaption WebSocket (未來可考慮遷移至 App Runner)

整體架構清晰、可擴展、成本效益高。
