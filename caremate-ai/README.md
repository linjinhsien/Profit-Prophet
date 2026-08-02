# CareMate AI - 生成式 AI 長照陪伴系統

<div align="center">

**利用生成式 AI 降低長照資源落差，為偏鄉長者提供語音互動陪伴**

[![AWS](https://img.shields.io/badge/AWS-Powered-FF9900?logo=amazon-aws)](https://aws.amazon.com/)
[![Bedrock](https://img.shields.io/badge/Amazon_Bedrock-Claude_Sonnet-blue)](https://aws.amazon.com/bedrock/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://reactjs.org/)
[![Terraform](https://img.shields.io/badge/Terraform-IaC-7B42BC?logo=terraform)](https://www.terraform.io/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

</div>

---

## 專案簡介

CareMate AI 是一套部署於 AWS 的生成式 AI 長照陪伴系統，專為台灣偏鄉及長照機構設計。透過語音互動技術，讓長者能以自然對話方式與 AI 助手互動，同時自動記錄生活資訊，協助照護者掌握長者狀況。

### 核心價值

- **降低長照資源落差**：偏鄉長者也能獲得即時的陪伴與關懷
- **多語言支援**：中文、台語，未來可擴充客語
- **智慧生活紀錄**：自動從對話中擷取睡眠、飲食、運動、服藥、情緒資訊
- **照護者 Dashboard**：視覺化呈現長者狀態，提升照護效率

---

## 系統架構

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│              CloudFront + S3 Static Hosting              │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────────┐
│                  API Gateway (HTTP API)                   │
└──┬──────────┬──────────┬──────────┬──────────┬──────────┘
   │          │          │          │          │
┌──▼──┐  ┌───▼──┐  ┌───▼───┐  ┌───▼──┐  ┌───▼───┐
│Chat │  │Speech│  │Summary│  │Memory│  │Profile│
│ λ   │  │  λ   │  │   λ   │  │  λ   │  │   λ   │
└──┬──┘  └───┬──┘  └───┬───┘  └───┬──┘  └───┬───┘
   │         │          │          │          │
   ├─────────┼──────────┼──────────┼──────────┤
   │         │          │          │          │
┌──▼─────────▼──┐  ┌───▼──────────▼──────────▼──┐
│ Amazon Bedrock │  │        DynamoDB             │
│ (Claude Sonnet)│  │  elder_profile | elder_memory│
└───────────────┘  └─────────────────────────────┘
        │
┌───────▼────────┐  ┌──────────────┐  ┌──────────────┐
│ Bedrock KB     │  │  Transcribe  │  │    Polly     │
│ (RAG/長照知識) │  │ (語音→文字)  │  │ (文字→語音)  │
└────────────────┘  └──────────────┘  └──────────────┘
```

---

## 功能模組

### Module A：語音互動陪伴

```
使用者語音 → Transcribe → Bedrock Claude → Polly → 回傳語音
```

- 即時語音/文字對話
- 根據時間自動調整問候語（早安/午安/晚安）
- 保留歷史對話記憶（近 7 天）
- 支援台語模式
- RAG 整合長照知識庫

### Module B：生活紀錄自動擷取

從每次對話中自動擷取並儲存：
- 睡眠狀況
- 飲食紀錄
- 運動/活動
- 服藥情形
- 情緒狀態

輸出 JSON 格式，儲存至 DynamoDB。

### Module C：照護者 Dashboard

- 長者基本資料
- 每日對話次數統計
- 情緒分析圖表
- 飲食/睡眠統計
- 互動趨勢圖
- 近期活動摘要

---

## 技術棧

| 層級 | 技術 |
|------|------|
| Frontend | React 18, Vite, TailwindCSS, Recharts |
| Backend | AWS Lambda, Python 3.12 |
| API | Amazon API Gateway (HTTP API) |
| AI Model | Amazon Bedrock (Anthropic Claude Sonnet) |
| Speech-to-Text | Amazon Transcribe |
| Text-to-Speech | Amazon Polly (Neural) |
| Database | Amazon DynamoDB |
| Knowledge Base | Amazon Bedrock KB + OpenSearch Serverless |
| Storage | Amazon S3 |
| CDN | Amazon CloudFront |
| IaC | Terraform |
| CI/CD | GitHub Actions |

---

## 專案結構

```
caremate-ai/
├── frontend/                    # React 前端
│   ├── src/
│   │   ├── components/         # 共用元件
│   │   ├── pages/              # 頁面元件
│   │   │   ├── VoiceChat.jsx   # 語音互動頁
│   │   │   ├── Dashboard.jsx   # 照護面板
│   │   │   ├── ElderProfile.jsx # 長者資料
│   │   │   └── MemoryView.jsx  # 記憶系統
│   │   ├── hooks/              # 自訂 Hooks
│   │   ├── services/           # API 服務層
│   │   └── test/               # 前端測試
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── backend/                     # Python Lambda 後端
│   ├── shared/                 # 共用模組
│   │   ├── config.py           # 全域設定
│   │   ├── dynamodb.py         # DynamoDB 存取層
│   │   ├── bedrock_client.py   # Bedrock 呼叫層
│   │   ├── audio_service.py    # Transcribe + Polly
│   │   └── response_helper.py  # API 回應工具
│   ├── lambdas/
│   │   ├── chat/handler.py     # POST /chat
│   │   ├── speech/handler.py   # POST /speech
│   │   ├── summary/handler.py  # POST /summary
│   │   ├── memory/handler.py   # GET /memory/{id}
│   │   └── profile/handler.py  # GET|PUT /profile/{id}
│   ├── tests/                  # 後端測試
│   └── requirements.txt
│
├── infra/                       # 基礎設施
│   ├── terraform/              # Terraform IaC
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── dynamodb.tf
│   │   ├── s3.tf
│   │   ├── iam.tf
│   │   ├── lambda.tf
│   │   ├── apigateway.tf
│   │   ├── cloudfront.tf
│   │   └── bedrock.tf
│   └── nginx/                  # Nginx 設定
│
├── docs/                        # 文件
│   ├── api-spec.yaml           # OpenAPI 3.0 規格
│   ├── dynamodb-design.md      # DynamoDB 設計文件
│   └── deployment-guide.md     # AWS 部署手冊
│
├── scripts/                     # 部署腳本
│   ├── deploy.sh
│   └── setup-local.sh
│
├── .github/workflows/           # CI/CD
│   └── deploy.yml
│
├── Dockerfile                   # 前端容器
├── Dockerfile.lambda            # Lambda 容器
├── docker-compose.yml           # 本地開發
├── .gitignore
└── README.md
```

---

## 快速開始

### 前置需求

- Node.js >= 20
- Python >= 3.12
- AWS CLI >= 2.15（已設定憑證）
- Terraform >= 1.5
- Docker（選用，本地開發）

### 本地開發

```bash
# 1. 複製專案
git clone <repository-url>
cd caremate-ai

# 2. 執行設定腳本
chmod +x scripts/setup-local.sh
./scripts/setup-local.sh

# 3. 啟動前端開發伺服器
cd frontend
npm run dev

# 4. 啟動本地 DynamoDB（選用）
docker-compose up -d dynamodb-local
```

### 部署至 AWS

```bash
# 完整部署（含 Terraform + 前端上傳）
chmod +x scripts/deploy.sh
./scripts/deploy.sh dev
```

詳細部署步驟請參閱 [AWS 部署手冊](docs/deployment-guide.md)。

---

## API 文件

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | /chat | 文字對話 |
| POST | /speech | 語音對話（上傳音訊） |
| POST | /summary | 產生每日摘要 |
| GET | /memory/{id} | 取得長者記憶 |
| GET | /profile/{id} | 取得長者資料 |
| PUT | /profile/{id} | 更新長者資料 |

完整 API 規格：[docs/api-spec.yaml](docs/api-spec.yaml)

---

## 資料庫設計

### elder_profile（長者基本資料）

| 欄位 | 類型 | 說明 |
|------|------|------|
| elder_id (PK) | String | 長者唯一識別碼 |
| name | String | 姓名 |
| age | Number | 年齡 |
| language | String | 慣用語言 |
| disease | String | 疾病史 |

### elder_memory（對話記憶）

| 欄位 | 類型 | 說明 |
|------|------|------|
| elder_id (PK) | String | 長者 ID |
| timestamp (SK) | String | 時間戳 |
| question | String | 使用者訊息 |
| answer | String | AI 回應 |
| sleep / food / activity / drug / emotion | String | 生活紀錄 |

完整設計文件：[docs/dynamodb-design.md](docs/dynamodb-design.md)

---

## Knowledge Base（RAG）

系統整合 Amazon Bedrock Knowledge Base，使用以下長照知識來源：

- 衛福部長照 3.0 文件
- 失智症照護手冊
- 跌倒預防手冊
- 高齡營養手冊

使用 Amazon Titan Embeddings V2 建立向量索引，當使用者提問涉及健康相關議題時自動查詢知識庫。

---

## 安全性

- **資料加密**：DynamoDB SSE、S3 SSE-KMS
- **傳輸加密**：HTTPS（CloudFront + API Gateway）
- **存取控制**：IAM Least Privilege 原則
- **PII 保護**：所有個人資訊靜態加密
- **時間點回復**：DynamoDB PITR 啟用
- **自動清理**：TTL 自動清除 90 天以上記錄

---

## 測試

### 後端測試

```bash
cd backend
source .venv/bin/activate
pytest tests/ -v --cov=shared --cov=lambdas
```

### 前端測試

```bash
cd frontend
npm run test
```

---

## 費用估算（100 位長者/月）

| 服務 | 估算費用 |
|------|---------|
| Lambda | ~$5 |
| DynamoDB | ~$1 |
| Bedrock (Claude) | ~$50 |
| Transcribe | ~$30 |
| Polly | ~$10 |
| S3 + CloudFront | ~$3 |
| OpenSearch Serverless | ~$25 |
| **月總計** | **~$124** |

---

## 未來規劃

- [ ] 客語支援
- [ ] LINE Bot 整合
- [ ] 即時異常通知（跌倒偵測、情緒異常）
- [ ] 多長者管理介面
- [ ] 語音喚醒（Wake Word）
- [ ] 離線模式支援
- [ ] 家屬 App（React Native）

---

## 授權

MIT License

---

## 團隊

AWS 2026 雲湧智生臺灣生成式 AI 應用黑客松競賽參賽作品
