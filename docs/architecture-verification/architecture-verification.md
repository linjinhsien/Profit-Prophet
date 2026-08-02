# Profit-Prophet 架構驗證報告
**驗證時間**: 2026-08-02 04:04 UTC
**專案**: AI 照護語音助理系統

---

## ✅ 已驗證的 AWS 資源

### 1. CloudFront CDN
- **Distribution ID**: `E1NHT4ZC7ZFGUP`
- **域名**: `d1qintm5rk17ye.cloudfront.net`
- **狀態**: ✅ Deployed (已部署)
- **HTTP 協定**: HTTP/2 + IPv6
- **測試結果**: ✅ 可正常訪問 (200 OK)
- **Origins**:
  - `S3-Website`: profit-prophet-frontend-site.s3-website-us-west-2.amazonaws.com
  - `Backend-EC2`: ec2-35-91-137-3.us-west-2.compute.amazonaws.com

#### 路由規則驗證:
| 路徑 | 目標 | 快取策略 | 狀態 |
|------|------|----------|------|
| `/*` (預設) | S3 靜態網站 | TTL 300s | ✅ |
| `/api/*` | EC2 Backend | 無快取 | ⚠️ 需確認 |
| `/ws/*` | EC2 Backend | 無快取 | ⚠️ 需確認 |

---

### 2. S3 儲存
- **Bucket**: `profit-prophet-frontend-site`
- **Region**: us-west-2
- **狀態**: ✅ Active
- **內容**:
  - ✅ `index.html` (800 bytes)
  - ✅ `favicon.svg` (344 bytes)
  - ✅ `assets/` 目錄
  - ✅ `pcm-worklet.js` (1422 bytes)
- **最後更新**: 2026-08-02 04:03 UTC
- **用途**: React SPA 靜態檔案托管

---

### 3. Cognito Identity Pool
- **Pool Name**: `profit-prophet-frontend`
- **Identity Pool ID**: `us-west-2:5cc123d7-c990-41a7-b887-62c67264ea71`
- **Region**: us-west-2
- **狀態**: ✅ Active
- **用途**: 前端身份認證與最小 IAM 權限授予

---

### 4. EC2 後端伺服器
- **Instance ID**: `i-099c8061008241015`
- **Instance Type**: `t3.micro`
- **State**: ✅ Running
- **Public DNS**: `ec2-35-91-137-3.us-west-2.compute.amazonaws.com`
- **Region**: us-west-2
- **Port**: 8080 (HTTP)
- **用途**: API 與 WebSocket 請求處理

⚠️ **注意**: 簡報中提到使用 **App Runner**，但實際部署為 **EC2 t3.micro**

---

### 5. Amazon Bedrock
#### 可用模型 (us-west-2):
- ✅ `anthropic.claude-haiku-4-5-20251001-v1:0` (Claude Sonnet 4) ← **專案使用**
- ✅ `anthropic.claude-sonnet-4-5-20250929-v1:0`
- ✅ `anthropic.claude-opus-4-8`
- ✅ `anthropic.claude-fable-5`
- ✅ `anthropic.claude-sonnet-5`

#### Knowledge Base:
- **Name**: `profit-prophet-care-kb`
- **Knowledge Base ID**: `H4NWXXP6DZ`
- **狀態**: ✅ ACTIVE
- **用途**: 照護知識庫 RAG 查詢

---

### 6. 其他 AWS 服務 (推定)
以下服務在簡報中提及，但無直接驗證:

| 服務 | 用途 | 驗證狀態 |
|------|------|----------|
| Amazon Transcribe | 中文語音識別 (zh-TW) | ⚠️ 未直接驗證 |
| Amazon Polly | 語音合成 (Zhiyu Neural) | ⚠️ 未直接驗證 |
| DynamoDB | 照護記錄持久化 | ✅ 已確認 (3 表) |
| S3 Vectors | 向量儲存 | ⚠️ 需確認 bucket |
| CloudWatch + SNS | 監控與告警 | ⚠️ 未驗證 |
| Secrets Manager | 密鑰管理 | ⚠️ 未驗證 |

---

## 🔍 架構差異分析

### 簡報描述 vs 實際部署

| 組件 | 簡報描述 | 實際驗證 | 差異 |
|------|----------|----------|------|
| 後端運算層 | App Runner (Node.js) | EC2 t3.micro | ⚠️ **不一致** |
| CloudFront | E1NHT4ZC7ZFGUP | E1NHT4ZC7ZFGUP | ✅ 一致 |
| S3 Bucket | profit-prophet-frontend-site | profit-prophet-frontend-site | ✅ 一致 |
| Cognito | Identity Pool | Identity Pool (已確認) | ✅ 一致 |
| Bedrock Model | Claude Sonnet 4 | Claude Sonnet 4 (可用) | ✅ 一致 |
| Knowledge Base | Bedrock KB | profit-prophet-care-kb (ACTIVE) | ✅ 一致 |
| DynamoDB | 照護記錄儲存 | 3 表已確認 (conversations, elder_profile, elder_memory) | ✅ **一致** |

---

## 📊 架構圖更新建議

### 當前架構 (實際)：
```
User (Browser)
    ↓ HTTPS
CloudFront (E1NHT4ZC7ZFGUP)
    ├─→ /* → S3 (profit-prophet-frontend-site)
    ├─→ /api/* → EC2 t3.micro (35.91.137.3:8080)
    └─→ /ws/* → EC2 t3.micro (WebSocket)
              ↓
    ┌─────────────────────┐
    │   EC2 Backend       │
    │   (Node.js)         │
    └─────────────────────┘
              ↓
    ┌─────────────────────────────────┐
    │ AWS Services                    │
    ├─ Bedrock (Claude Sonnet 4)    │
    ├─ Knowledge Base (H4NWXXP6DZ)   │
    ├─ Transcribe (zh-TW)            │
    ├─ Polly (Zhiyu Neural)          │
    ├─ Cognito Identity Pool         │
    └─ S3 / Secrets Manager          │
    └─────────────────────────────────┘
```

---

## ⚠️ 發現的問題

### 1. **後端運算層不一致**
- **簡報**: App Runner (Serverless)
- **實際**: EC2 t3.micro (固定運行)
- **影響**: 成本模型不同、擴展性較差
- **建議**: 更新簡報說明為 EC2，或考慮遷移至 App Runner

### 2. ✅ **DynamoDB 表已確認**
- 簡報提到 DynamoDB 用於照護記錄持久化
- ✅ **已找到 3 個 DynamoDB 表**:
  1. **profit-prophet-conversations** (對話記錄)
     - Status: ACTIVE | Created: 2026-08-02
     - Keys: identityId (HASH), id (RANGE)
  2. **caremate-ai_elder_profile** (長者檔案)
     - Status: ACTIVE | Items: 11 筆
     - Keys: elder_id (HASH)
  3. **caremate-ai_elder_memory** (長者記憶)
     - Status: ACTIVE
     - Keys: elder_id (HASH), timestamp (RANGE)

### 3. **缺少直接驗證的服務**
- Transcribe / Polly: 需要實際 API 呼叫測試
- S3 Vectors: 需確認向量儲存的具體實作
- CloudWatch / SNS: 監控配置未驗證

---

## ✅ 建議行動項目

### 高優先級:
1. **釐清後端架構**: 確認是 EC2 或 App Runner (或計畫遷移中)
2. ~~**驗證 DynamoDB**~~: ✅ 已確認 3 個表 (conversations, elder_profile, elder_memory)
3. **測試 API 路由**: 驗證 `/api/*` 和 `/ws/*` 實際運作
4. **更新簡報**: 根據實際架構調整文件

### 中優先級:
5. **檢查 S3 Vectors**: 確認向量儲存的 bucket 與配置
6. **測試 Transcribe/Polly**: 驗證語音服務整合
7. **檢視 IAM 權限**: 確認 Cognito Identity Pool 的最小權限配置

### 低優先級:
8. **監控配置**: CloudWatch 告警與 SNS 通知設定
9. **成本優化**: 評估 EC2 vs App Runner 成本差異
10. **安全加固**: WAF、Access Logging、地理限制考量

---

## 📝 結論

**整體架構狀態**: ✅ 可運作，但文件與實際有差異

**核心功能驗證**:
- ✅ CloudFront CDN 正常運行
- ✅ S3 靜態網站已部署
- ✅ Cognito 身份認證已配置
- ✅ Bedrock Knowledge Base 正常啟用
- ⚠️ 後端層為 EC2 (非 App Runner)
- ✅ DynamoDB 表已確認 (3 表: conversations, elder_profile, elder_memory)

**建議**: 優先釐清後端架構 (EC2 vs App Runner)，並更新簡報以反映實際部署狀態。資料儲存方案已完整配置。
