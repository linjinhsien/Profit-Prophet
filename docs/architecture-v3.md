# Profit-Prophet 系統架構圖 — v3（程式碼實況）

> **版本**：v3 — 依 `master` 分支實際程式碼繪製，非設計提案
> **繪製日期**：2026-08-02
> **用途**：v1（board 上的原設計）與 v2（`docs/architecture.md`）都已與程式碼脫節，本文件是唯一與程式碼一致的架構描述

每個節點都對應到實際檔案。若圖與程式碼不符，以程式碼為準並回頭修這份文件。

---

## 與 v2 文件的三個關鍵差異

| 項目 | v2 文件寫的 | 程式碼實際做的 | 證據 |
|------|-----------|--------------|------|
| 運算層 | 無後端，前端直呼所有 AWS 服務 | **語音走後端**：FastAPI on App Runner 代呼 Transcribe | `LiveCaption/backend/app/main.py:160` `/ws/captions`；`frontend/src/lib/useVoiceInput.ts` |
| 語音辨識路徑 | 瀏覽器 → Transcribe（直呼） | 瀏覽器 → WebSocket → 後端 → Transcribe | `frontend/package.json` 沒有 `@aws-sdk/client-transcribe-streaming`；`frontend/src/api/transcribe.ts` 不存在 |
| Hosting | AWS Amplify Hosting | **S3 靜態網站**（CloudFront 存在但無 IaC） | `cdk/bin/frontend-stack.ts`；CloudFront 只以 CORS origin 字串出現於 `main.py:52` |

v2 的「無後端層 → 無法做 rate limiting」結論因此需要改寫：後端層已經存在，只是還沒在上面做配額與驗證。

---

## 圖 1：整體系統架構

```mermaid
graph TB
    subgraph Browser["前端 瀏覽器 React 19 + Vite + TS"]
        UI["5 個頁面 Persona / Elder / Chat / Dashboard / LiveCaption"]
        MIC["麥克風擷取 AudioWorklet pcm-chunker 16kHz PCM16 100ms"]
        SPK["音訊播放 AudioPlayer"]
        CRYPTO["AES-GCM 加密 conversationCrypto"]
    end

    subgraph Hosting["靜態託管"]
        S3W["S3 profit-prophet-frontend-site 公開讀取"]
        CF["CloudFront d1qintm5rk17ye 無 IaC 定義"]
    end

    subgraph Compute["運算層 us-west-2"]
        AR["App Runner profit-prophet-backend FastAPI 0.25vCPU 0.5GB port 8080"]
    end

    subgraph Auth["身分層"]
        COG["Cognito Identity Pool logins 為選用 支援 guest"]
        IAMC["Identity Pool IAM Role 無 IaC 定義"]
        IAMB["BackendInstanceRole Transcribe + SecretsManager"]
    end

    subgraph STT["語音辨識 二選一"]
        TRANS["Amazon Transcribe Streaming"]
        EL["ElevenLabs Scribe v2 非 AWS 需 API key"]
    end

    subgraph AI["AI 服務 前端直呼"]
        BR["Bedrock RetrieveAndGenerate modelArn 由 runtime 帶入"]
        POLLY["Amazon Polly Zhiyu neural cmn-CN mp3 16kHz"]
    end

    subgraph Data["資料層"]
        KB["Bedrock Knowledge Base 無 IaC 定義"]
        DDB["DynamoDB PK identityId 無 IaC 定義"]
        SM["Secrets Manager profit-prophet/env"]
    end

    S3W --> CF
    CF --> UI
    UI -->|"GET /api/aws-config"| AR
    AR -->|"GetSecretValue 快取 5 分鐘"| SM
    AR --> IAMB

    MIC -->|"WebSocket 二進位 PCM16 幀"| AR
    AR --> TRANS
    AR --> EL
    AR -->|"字幕 JSON partial / final"| UI

    UI --> COG
    COG --> IAMC
    IAMC -->|"臨時憑證"| BR
    IAMC -->|"臨時憑證"| POLLY
    IAMC -->|"臨時憑證"| DDB

    BR <--> KB
    BR -->|"answer + category + confidence"| UI
    UI --> POLLY
    POLLY --> SPK
    UI --> CRYPTO
    CRYPTO -->|"ciphertext + iv + salt"| DDB
```

**交付路徑**（不在上圖，避免混淆）：
`buildspec.yml` CodeBuild → `docker build`（`python:3.13-slim`）→ push ECR `056724761684.dkr.ecr.us-west-2.amazonaws.com/profit-prophet-backend:latest` → App Runner 手動部署（`autoDeploymentsEnabled: false`）。

---

## 圖 2：資料流

### 2a. 語音字幕流

```mermaid
sequenceDiagram
    participant U as 使用者
    participant B as 瀏覽器
    participant A as App Runner FastAPI
    participant T as Transcribe Streaming

    B->>A: GET /api/aws-config
    A-->>B: region / identityPoolId / kbId / modelArn / tableName
    Note over B: 失敗則顯示「即時字幕後端未連線」

    U->>B: 點「開始說話」
    B->>B: requestMicrophone mono + echoCancellation
    B->>B: AudioContext sampleRate 16000 + AudioWorklet
    B->>A: WS /ws/captions?preset=clinic&lang=zh-TW
    A->>T: StartStreamTranscription
    A-->>B: ready engine / region / language / sampleRate

    loop 每 100ms
        B->>A: PCM16 二進位幀
        A->>T: AudioEvent
        T-->>A: TranscriptEvent
        A-->>B: partial 黃字 或 final 白字
    end

    Note over A,T: 閒置 3 秒自動補靜音幀 長者停頓不斷線

    U->>B: 點「結束」
    B->>A: {"type":"stop"}
    A->>T: end_stream
    T-->>A: 剩餘 final
    A-->>B: final 收尾 最長等 10 秒
    A-->>B: done + stats 送出秒數 / keepalive 次數 / partial final 筆數
```

### 2b. 問答與紀錄流

```mermaid
sequenceDiagram
    participant U as 照護人員
    participant B as 瀏覽器
    participant C as Cognito Identity Pool
    participant R as Bedrock RetrieveAndGenerate
    participant K as Knowledge Base
    participant P as Polly
    participant D as DynamoDB

    U->>B: 送出問題 1 到 2000 字 且需選定個案
    B->>C: 取得臨時憑證 logins 選用
    C-->>B: scoped credentials + identityId

    B->>R: RetrieveAndGenerate + STRUCTURED_OUTPUT_PROMPT
    R<<->>K: 向量檢索
    R-->>B: JSON answer / category / confidence / candidates
    Note over B: 解析失敗則標記 usedStructuredOutputFallback
    B->>B: citations 上限 10 筆 uri 過 isSafeExternalUrl

    B->>U: 顯示答案 + CareEventBadge + CitationList + 免責標記

    opt 播放語音回覆
        B->>P: SynthesizeSpeech 按句切 每段上限 3000 字
        P-->>B: mp3 分段
        B->>U: 合併 Blob audio/mpeg 播放
    end

    opt 儲存 需勾合成資料 + 通關密語 12 字以上
        B->>B: AES-GCM 加密整筆紀錄
        B->>D: PutItem identityId / id / timestamp / encryptedPayload
    end

    U->>B: 開啟照護總覽
    B->>D: Query PK identityId 最新 50 筆
    D-->>B: 加密資料
    B->>B: 解密並丟棄 id timestamp 不符的列
```

### 2c. Care Event 分類

分類與回答在**同一次** Bedrock 呼叫內完成，沒有 Comprehend。

```mermaid
graph TD
    Q["照護人員查詢"] --> BR["Bedrock RetrieveAndGenerate"]
    BR --> OUT["結構化輸出 answer + category + confidence"]
    OUT --> CHK{"confidence >= 0.6"}
    CHK -->|"是"| CAT["採用分類"]
    CHK -->|"否"| UN["unclassified + Top 3 候選"]

    CAT --> C1["health_status 健康狀態"]
    CAT --> C2["emotion_state 情緒狀態"]
    CAT --> C3["daily_activities 日常活動"]
    CAT --> C4["medication_records 用藥紀錄"]
    CAT --> C5["emergency_events 緊急事件"]
    CAT --> C6["social_interaction 社交互動"]
    CAT --> C7["nutrition 營養攝取"]
    CAT --> C8["sleep_patterns 睡眠模式"]
```

---

## 圖 3：IaC 覆蓋率與安全旗標

```mermaid
graph LR
    subgraph InCDK["CDK 管理中 僅 4 項"]
        A1["S3 FrontendBucket"]
        A2["App Runner CfnService"]
        A3["IAM BackendInstanceRole"]
        A4["IAM BackendAccessRole"]
    end

    subgraph NoIaC["手動建立 無 IaC 無法重建"]
        B1["Cognito Identity Pool"]
        B2["Identity Pool IAM Role"]
        B3["DynamoDB Table"]
        B4["Bedrock Knowledge Base + Data Source"]
        B5["S3 知識文件 Bucket"]
        B6["S3 Vectors 索引"]
        B7["ECR Repository"]
        B8["CloudFront Distribution"]
        B9["Secret profit-prophet/env"]
    end

    subgraph Risk["安全旗標"]
        R1["ws/captions 零身分驗證"]
        R2["Cognito 允許 guest 取憑證"]
        R3["S3 公開讀取 + BlockPublicAccess 全關"]
        R4["transcribe 資源範圍為 星號"]
        R5["backend/.env 已進版控"]
    end
```

### IaC 缺口明細

`cdk.json` 的 `app` 只指向 `bin/frontend-stack.ts`，所以直接跑 `cdk deploy` 只會部署前端；後端要顯式加 `--app`。兩個 stack 各自 `new cdk.App()`，沒有共用 App。

上表 9 項手動資源的 ID 與名稱只存在於 Secrets Manager 與 `backend/.env`，repo 內查不到。`scripts/check-infra.ps1` 是目前唯一的驗證手段。

### 安全旗標明細

| # | 問題 | 位置 | 衝突的規範 |
|---|------|------|-----------|
| R1 | WebSocket 端點無任何身分驗證，任何連得到的人都能消耗 AWS 額度 | `LiveCaption/backend/app/main.py:160`（docstring 自述） | SECURITY-RULES §2 所有 API 端點需認證 |
| R2 | `hasAuthenticatedCognitoLogin()` 無條件回 `true`，未帶 logins 即 guest 模式取得憑證 | `frontend/src/lib/credentials.ts` | SECURITY-RULES §2 |
| R3 | `publicReadAccess: true` 且四個 `BlockPublicAccess` 全設 `false`，但同檔註解寫「public read blocked per Constitution」 | `cdk/bin/frontend-stack.ts` | SECURITY-RULES §7 S3 預設封鎖公開存取 |
| R4 | `transcribe:StartStreamTranscription` 的 `resources: ['*']` | `cdk/bin/backend-stack.ts` | SECURITY-RULES §2 最小權限 |
| R5 | `LiveCaption/backend/.env` 已進版控 | repo | SECURITY-RULES §1 `.env` 不得 commit |

R1 與 R2 疊加的效果是：整條 AI 鏈路（Transcribe、Bedrock、Polly）對匿名使用者開放，沒有配額上限。

---

## 區域設定

| 位置 | 值 | 說明 |
|------|-----|------|
| `frontend/src/lib/config.ts` | 型別限 `us-east-1` \| `us-west-2` | 符合 Constitution |
| `LiveCaption/backend/app/config.py` | 預設 `ap-northeast-1` | Transcribe Streaming 無台北區域，就近選東京 |
| App Runner 環境變數 | `AWS_REGION=us-west-2` | 實際生效值，覆寫上面的預設 |

程式碼預設值（東京）與實際部署值（奧勒岡）不同。若有人在本機不帶環境變數跑後端，會連到東京，而 workshop 帳號的 `ws-default-policy` 明確拒絕東京。

---

## 語音辨識情境預設

| preset | 場景 | 語言 | 語者標籤 | 穩定度 | 實測字幕落後 |
|--------|------|------|---------|--------|-------------|
| `clinic` | 看診／衛教 | 固定 zh-TW | 關 | high | 0.17s |
| `caregiver` | 照服員與長者 | 自動辨識 | 開 | high | 0.44s |
| `elder` | 長者自己用 | 固定 zh-TW | 關 | medium | — |

語者標籤是最大的延遲來源（2.6 倍），不是字幕穩定化。量測方法與完整數據見 `LiveCaption/backend/README.md`。

---

## 對應檔案索引

| 圖上節點 | 檔案 |
|---------|------|
| 麥克風擷取 / WebSocket 客戶端 | `frontend/src/lib/useVoiceInput.ts`、`frontend/src/pages/LiveCaptionPage.tsx` |
| Bedrock 呼叫與結構化輸出解析 | `frontend/src/api/bedrock.ts` |
| Polly 合成與分段 | `frontend/src/api/polly.ts` |
| DynamoDB 讀寫與加密 | `frontend/src/api/conversations.ts`、`frontend/src/lib/conversationCrypto.ts` |
| Cognito 憑證 | `frontend/src/lib/credentials.ts` |
| Runtime 設定載入 | `frontend/src/lib/config.ts` |
| WebSocket 端點與 Secrets 橋接 | `LiveCaption/backend/app/main.py` |
| Transcribe 介面層 | `LiveCaption/backend/app/services/transcribe.py` |
| ElevenLabs 引擎 | `LiveCaption/backend/app/services/elevenlabs_stt.py` |
| 情境預設值 | `LiveCaption/backend/app/config.py` |
| App Runner + IAM | `cdk/bin/backend-stack.ts` |
| S3 靜態站 | `cdk/bin/frontend-stack.ts` |
| 容器交付 | `LiveCaption/backend/Dockerfile`、`LiveCaption/backend/buildspec.yml` |
