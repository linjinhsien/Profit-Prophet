# Data Model: 語音對話介面與照護紀錄頁面

**Feature**: 004-voice-chat-care-record  
**Date**: 2026-08-01

## Overview

本功能的資料模型建立在現有的 DynamoDB 對話儲存之上，擴展為支援多輪對話的結構。所有資料在客戶端以 AES-GCM 加密後才寫入 DynamoDB。

---

## Entities

### 1. ChatMessage

代表對話中的單一訊息（使用者問題或 AI 回覆）。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | ✅ | 唯一訊息 ID |
| role | `'user' \| 'assistant'` | ✅ | 發送者角色 |
| content | string | ✅ | 訊息文字內容 |
| timestamp | string (ISO 8601) | ✅ | 建立時間 |
| inputMethod | `'voice' \| 'text'` | ✅ (user only) | 輸入方式 |
| careAnswer | CareAnswer \| undefined | ❌ (assistant only) | AI 回覆的結構化資料 |

**Validation Rules**:
- `content` 不可為空字串，最大 10,000 字元
- `role` 必須為 `'user'` 或 `'assistant'`
- `timestamp` 必須是有效 ISO 8601 格式

---

### 2. Conversation

代表一次完整的對話 session，包含多個 ChatMessage。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | ✅ | 對話唯一 ID（= conversationId） |
| elderId | string | ✅ | 關聯的照護個案 ID |
| startedAt | string (ISO 8601) | ✅ | 對話開始時間 |
| lastMessageAt | string (ISO 8601) | ✅ | 最後一則訊息時間 |
| messages | ChatMessage[] | ✅ | 對話中所有訊息 |
| careEvents | CareEventSummary[] | ✅ | 本次對話產生的所有 Care Event 摘要 |
| summary | string \| undefined | ❌ | 對話摘要（由最後一則 AI 回覆產生） |

**State Transitions**:
- `active` → 對話進行中（使用者仍在問問題）
- `completed` → 使用者離開對話或超過 30 分鐘無互動

---

### 3. CareEventSummary

從對話中提取的照護事件摘要，用於紀錄頁面展示。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| category | CareEvent | ✅ | 照護事件分類 |
| confidence | number (0-1) | ✅ | 分類信心度 |
| queryText | string | ✅ | 觸發此分類的使用者問題 |
| answerExcerpt | string | ✅ | AI 回覆的前 200 字元摘要 |
| messageId | string | ✅ | 關聯的 AI 回覆 message ID |

---

### 4. CareRecord (View Model)

照護紀錄頁面使用的顯示模型，由 Conversation 衍生。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| conversationId | string | ✅ | 來源對話 ID |
| elderId | string | ✅ | 照護個案 ID |
| timestamp | string (ISO 8601) | ✅ | 對話時間（= startedAt） |
| primaryCategory | CareEvent | ✅ | 主要分類（信心度最高者） |
| categories | CareEvent[] | ✅ | 本次對話涉及的所有分類 |
| summary | string | ✅ | 對話摘要或首則 AI 回覆摘要 |
| messageCount | number | ✅ | 對話訊息總數 |

---

### 5. CareEvent (Enum — existing, extended)

已存在於 `types/care.ts`，無需修改。

```typescript
type CareEvent =
  | 'health_status'
  | 'emotion_state'
  | 'daily_activities'
  | 'medication_records'
  | 'emergency_events'
  | 'social_interaction'
  | 'nutrition'
  | 'sleep_patterns'
  | 'unclassified'
```

---

## DynamoDB Table Schema

### 現有 Table: `${VITE_DDB_TABLE_NAME}`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| identityId | String | Partition Key | Cognito Identity ID |
| id | String | Sort Key | Record UUID |
| timestamp | String | — | ISO 8601 |
| conversationId | String | — | **[NEW]** 群組化對話 |
| encryptedPayload | Map | — | 加密後的對話資料 |

**New GSI (optional, future)**:
- `conversationId-index`: PK = identityId, SK = conversationId — 用於按對話群組查詢

**Access Patterns**:
| Pattern | Query | Notes |
|---------|-------|-------|
| 載入所有紀錄 | Query(identityId, ScanIndexForward=false, Limit=50) | 現有 |
| 按對話群組載入 | 前端 filter by conversationId | 加密資料無法 server-side filter |
| 儲存訊息 | PutItem(identityId, id, timestamp, conversationId, encryptedPayload) | 每則訊息獨立一筆 |

---

## Encrypted Payload Structure

加密前的明文 JSON（即 `encryptedPayload` 解密後的結構）：

```typescript
// 現有格式（向後相容）
interface LegacyDecryptedPayload {
  id: string
  timestamp: string
  queryText: string
  answer: string
  category: CareEvent
  confidence: number
  candidates: CareEventCandidate[]
  citations: Citation[]
  usedStructuredOutputFallback: boolean
}

// 新格式（多輪對話）
interface ConversationDecryptedPayload {
  version: 2
  conversationId: string
  message: ChatMessage
  elderId: string
}
```

**向後相容策略**：
- 無 `version` 欄位 → legacy 格式，視為單輪對話
- `version: 2` → 新格式，按 `conversationId` 群組化

---

## Relationships

```
ElderSubject (1) ←──── (N) Conversation
Conversation (1) ←──── (N) ChatMessage
ChatMessage  (1) ───→ (0..1) CareAnswer
Conversation (1) ───→ (N) CareEventSummary
CareRecord   (1) ←──── (1) Conversation (derived view)
```
