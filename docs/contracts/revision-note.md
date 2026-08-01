## ⚠️ 規格改版通知：v1 → v2

先前這個 Issue 的規格是基於 **v1 架構**（API Gateway + Lambda + OpenSearch + Claude 3 Sonnet），但專案已改為 **v2 無後端架構**。Issue 內容已更新，請以現在的版本為準。

### 實際改到什麼

| 舊規格（作廢） | 現行 v2 |
|---|---|
| `POST /query` (API Gateway) | `BedrockAgentRuntimeClient.RetrieveAndGenerateCommand` |
| WebSocket 串流 API | `TranscribeStreamingClient` 直接接麥克風 |
| API key 認證 | Cognito Identity Pool 臨時憑證 |
| Claude 3 Sonnet | Claude Haiku 4.5 |
| OpenSearch + 自建 RAG | Bedrock Knowledge Bases（S3 Vectors 後端） |
| Comprehend 做分類 | 併入同一次 Bedrock 呼叫的 structured output |

### 兩個好消息

原本列為阻塞的「API key 會被打包進 bundle」問題，v2 從架構上就解決了 — 憑證由 Cognito 在執行時發放，不進 bundle。`VITE_*` 只放非機密識別碼。

分類不再需要第二次 API 呼叫，`RetrieveAndGenerate` 一次就回傳 answer + category + confidence + citations。

### 一個要注意的地方

v2 沒有後端，所以**沒有 rate limiting、沒有伺服器端輸入驗證**。architecture.md 已明確接受這個取捨，適用範圍僅 PoC / Demo。前端該做的是基本長度檢查與 UX 防呆，不要把它當成安全機制。

另外 DynamoDB 的 IAM policy 用 `dynamodb:LeadingKeys` 限制存取範圍，所以 **partition key 必須是 Cognito identity ID**，用自訂 elder ID 當 PK 會被擋掉。

### 子任務重排

改為對齊 architecture.md 的 24 小時排程：

```text
前置（不在此任務）  0-2h Cognito + IAM
                   2-4h S3 + Bedrock KB
                        ↓
T1  4-7h 前半   骨架 + Cognito 憑證
T2  4-7h 後半   Bedrock 文字問答
T3  7-11h       Transcribe zh-TW      ← 準確度風險，需盡早實測
T4  11-13h      Polly 播放
T5  13-16h      分類 UI + citations
T6  16-18h      DynamoDB 對話紀錄
T7  18-21h      錯誤處理 + 無障礙
```

### 現在卡住的四件事

1. Cognito Identity Pool 建好了嗎？需要 identity pool ID（阻塞 T1）
2. Bedrock KB 建立同步了嗎？需要 KB ID 與 Claude Haiku 4.5 的 inference profile ARN（阻塞 T2）
3. care-companion-demo 沒有 LICENSE 檔案，UI 程式碼可直接複製還是只能參考結構？
4. Bedrock structured output 的 prompt 誰寫？分類要靠 prompt 讓模型輸出固定 JSON

前兩項是基礎設施，不解決 T1/T2 都動不了。
