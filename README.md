# Profit-Prophet

AI 驅動的照護人員語音助理。照護人員用中文語音或文字提問，系統從照護知識庫檢索並回答，同時自動分類 Care Event。

> **目前版本**：v2 — 24 小時 MVP，無後端運算層（前端直呼 AWS 服務）

## 架構圖

🔗 [Profit-Prophet Architecture (Miro)](https://miro.com/app/board/uXjVKGfJMCY=/)

Board 上包含 v1（原設計）與 **v2（現行 24h MVP）** 兩組圖表：

- v2 整體系統架構（24h MVP / 無 Lambda）
- v2 資料流程圖（前端直呼 AWS）
- v2 Care Event 分類（合併至單一 Bedrock 呼叫）

完整架構說明、IAM 權限範圍與 24 小時排程請見 [docs/architecture.md](docs/architecture.md)。

## 技術棧

| 層級 | 服務 |
|------|------|
| Frontend | React + Vite + TypeScript, AWS SDK for JavaScript v3 |
| Auth | Amazon Cognito Identity Pool（最小權限 IAM） |
| 語音辨識 | Amazon Transcribe Streaming (zh-TW) |
| 問答 + 分類 | Amazon Bedrock Knowledge Bases + Claude Haiku 4.5 |
| 語音合成 | Amazon Polly (Zhiyu, Neural) |
| 向量庫 | Amazon S3 Vectors |
| 資料 | Amazon S3, Amazon DynamoDB |

服務總數 6 個，無 API Gateway、無 Lambda。

## 與 v1 的主要差異

- 移除 API Gateway + Lambda：前端透過 Cognito 臨時憑證直接呼叫 AWS 服務
- OpenSearch Serverless → **S3 Vectors**：成本降約 90%，無 collection 需管理
- Claude 3 Sonnet → **Claude Haiku 4.5**
- 移除 Amazon Comprehend：Care Event 分類併入 Bedrock 的 structured output
- 自建 RAG → **Bedrock Knowledge Bases** `RetrieveAndGenerate` 單一 API

## ⚠️ 安全性限制

此架構無後端層，因此**無法做 rate limiting 或伺服器端輸入驗證**。IAM policy 的資源範圍是唯一防線，存在 Bedrock 成本被濫用的風險。

**適用於 PoC / Demo / 內部驗證。上生產前需補回一層後端**（Lambda 或 Bedrock AgentCore）處理配額、驗證與稽核。詳見 [docs/architecture.md](docs/architecture.md#安全性限制重要)。
