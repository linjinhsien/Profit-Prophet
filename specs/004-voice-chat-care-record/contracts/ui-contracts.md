# UI Component Contracts: 語音對話介面與照護紀錄頁面

**Feature**: 004-voice-chat-care-record  
**Date**: 2026-08-01

## Overview

定義本功能新增和重構的 React 元件 public interface（props + 行為）。

---

## New Components

### ChatBubble

單一對話氣泡，根據角色決定排版方向和樣式。

```typescript
interface ChatBubbleProps {
  message: ChatMessage
  onPlayAudio?: (text: string) => void
  isPlaying?: boolean
}
```

**Behavior**:
- `role === 'user'` → 靠右顯示, 背景色 teal
- `role === 'assistant'` → 靠左顯示, 背景色 white, 顯示免責聲明
- assistant 訊息包含「播放語音」按鈕（觸發 `onPlayAudio`）
- 顯示 timestamp（相對時間格式：「剛剛」、「5 分鐘前」）
- 如果有 `careAnswer.category`，顯示 CareEventBadge

**Accessibility**:
- `role="article"` + `aria-label="[user/assistant] 訊息"`
- 時間使用 `<time datetime="...">`

---

### ChatHistory

可捲動的訊息清單容器。

```typescript
interface ChatHistoryProps {
  messages: ChatMessage[]
  isLoading?: boolean
  onPlayAudio?: (text: string) => void
  playingMessageId?: string
}
```

**Behavior**:
- 自動捲動至最新訊息（新訊息加入時）
- 使用者手動捲動後暫停自動捲動
- `isLoading` 時在底部顯示載入動畫（typing indicator）
- 空狀態顯示引導文字

**Accessibility**:
- `role="log"` + `aria-live="polite"`
- `aria-label="對話歷史"`

---

### VoiceButton

麥克風按鈕，整合 useVoiceInput 狀態顯示。

```typescript
interface VoiceButtonProps {
  status: VoiceInputStatus
  isSupported: boolean
  disabled?: boolean
  onToggle: () => void
  interimTranscript?: string
}
```

**Behavior**:
- `idle` → 麥克風圖示
- `listening` → 紅色脈衝動畫 + 「正在聽…」文字
- `permission-denied` → 灰色 + tooltip 提示
- `error` → 錯誤圖示
- 下方顯示 `interimTranscript`（即時轉錄預覽）

**Accessibility**:
- `aria-pressed` 反映 listening 狀態
- `aria-label` 根據狀態動態變更

---

### RecordCard

照護紀錄卡片，用於紀錄清單中的單一項目。

```typescript
interface RecordCardProps {
  record: CareRecord
  onExpand: (conversationId: string) => void
  isExpanded?: boolean
}
```

**Behavior**:
- 摺疊狀態：顯示時間、主要分類 badge、摘要（截斷 80 字）
- 展開狀態：顯示完整摘要、所有分類標籤、訊息數、查看完整對話按鈕
- 點擊切換展開/摺疊

**Accessibility**:
- 使用 `<details>` / `<summary>` 或 `aria-expanded`
- 支援鍵盤 Enter/Space 展開

---

### RecordFilters

篩選和搜尋控制項。

```typescript
interface RecordFiltersProps {
  selectedCategory: CareEvent | 'all'
  searchQuery: string
  onCategoryChange: (category: CareEvent | 'all') => void
  onSearchChange: (query: string) => void
}
```

**Behavior**:
- 類別篩選：下拉選單，包含「全部」+ 各 CareEvent 類別
- 關鍵字搜尋：debounced 文字輸入（300ms delay）
- 篩選結果即時更新（本地過濾）

**Accessibility**:
- 搜尋框有 `aria-label="搜尋照護紀錄"`
- 篩選結果數量用 `aria-live="polite"` 通知

---

## Refactored Components

### ChatPage (refactor)

從單次 Q&A 重構為多輪對話介面。

```typescript
interface ChatPageProps {
  elder: ElderSubject | undefined
  historyPassphrase: string
  onConversationSaved: (record: ConversationRecord) => void
  onHistoryPassphraseChange: (value: string) => void
}
```

**Key Changes**:
- State: `answer: CareAnswer` → `messages: ChatMessage[]`
- 新增 `conversationId` state（每次新對話產生新 UUID）
- 送出查詢後：先加一則 user message 到 messages → 等待回覆 → 加一則 assistant message
- 保留加密儲存 fieldset
- 保留 voice input 整合（useVoiceInput hook 不變）

---

### CaregiverDashboardPage → CareRecordPage (refactor)

重構為完整的照護紀錄瀏覽頁面。

```typescript
interface CareRecordPageProps {
  historyPassphrase: string
  onHistoryPassphraseChange: (value: string) => void
}
```

**Key Changes**:
- 自行管理 records state（從 DynamoDB 載入 + 解密 + 轉換為 CareRecord）
- 新增 RecordFilters 支援篩選/搜尋
- 新增 RecordCard 替代原有的平面列表
- 支援點擊紀錄展開查看完整對話

---

## Shared Hooks

### useConversation (new)

管理多輪對話狀態的自訂 hook。

```typescript
interface UseConversationReturn {
  conversationId: string
  messages: ChatMessage[]
  isQuerying: boolean
  error: string | undefined
  sendMessage: (text: string, inputMethod: 'voice' | 'text') => Promise<void>
  resetConversation: () => void
}

function useConversation(options: {
  elderId: string | undefined
  passphrase: string
  onSaved?: (record: ConversationRecord) => void
}): UseConversationReturn
```

**Behavior**:
- `sendMessage` 加入 user message → 呼叫 bedrock → 加入 assistant message → 存入 DynamoDB
- `resetConversation` 產生新 conversationId 並清空 messages
- 自動處理加密儲存（如 passphrase 有效）

---

## Event Flow

```
User speaks/types → sendMessage(text, method)
  → append user ChatMessage to messages[]
  → call queryKnowledgeBase(text)
  → append assistant ChatMessage (with careAnswer) to messages[]
  → call saveConversation(message, passphrase)
  → trigger onSaved callback
```
