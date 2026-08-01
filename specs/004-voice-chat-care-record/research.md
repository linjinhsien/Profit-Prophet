# Research: 語音對話介面與照護紀錄頁面

**Feature**: 004-voice-chat-care-record  
**Date**: 2026-08-01

## Research Summary

本功能大部分技術基礎已在現有程式碼中實現（useVoiceInput, bedrock.ts, polly.ts, conversations.ts）。研究重點在於：多輪對話 UX 模式、照護紀錄頁面設計、以及現有程式碼的重構策略。

---

## R1: 多輪對話 UI 模式

### Decision
採用 **Chat bubble 對話泡泡** UI，類似即時通訊介面。使用者訊息靠右、AI 回覆靠左，支援自動捲動至最新訊息。

### Rationale
- 照護人員已熟悉 LINE / WeChat 等通訊介面，學習成本最低
- 對話泡泡能自然呈現多輪問答的上下文
- 即時轉錄中的文字可用「正在輸入…」狀態泡泡呈現

### Alternatives Considered
| Alternative | 為何不選 |
|---|---|
| Q&A 單次問答（現有模式） | 無法呈現對話歷史，每次重問失去上下文 |
| Thread/摺疊式 | 過於複雜，不適合語音互動情境 |

---

## R2: Transcribe Streaming 整合模式

### Decision
**保留現有 useVoiceInput hook** 的 Web Audio API + ScriptProcessorNode + PCM 編碼方式。不需重構。

### Rationale
- 現有實作已完整：麥克風權限處理、PCM 編碼、Transcribe Streaming 串流、即時轉錄顯示
- `AudioWorklet` 雖然更現代，但目前實作可運作且此次功能重點不在語音底層
- 現有 hook 已處理所有 edge case（權限拒絕、瀏覽器不支援、手動停止）

### Alternatives Considered
| Alternative | 為何不選 |
|---|---|
| 重寫為 AudioWorklet | 效益不大，且增加複雜度和瀏覽器相容風險 |
| 使用 Web Speech API (browser native) | 不支援中文即時轉錄、品質不穩定 |

---

## R3: 對話紀錄儲存模式

### Decision
保留現有 **DynamoDB + AES-GCM 客戶端加密** 模式。每輪對話獨立一筆 record，以 `conversationId` 欄位群組化。

### Rationale
- 現有加密流程已完善（passphrase → PBKDF2 → AES-GCM）
- DynamoDB 的 partition key (identityId) + sort key (timestamp) 結構適合時序查詢
- 新增 `conversationId` 欄位即可關聯同一次對話的所有問答

### Alternatives Considered
| Alternative | 為何不選 |
|---|---|
| 整個對話存為一筆大 record | 更新頻繁造成寫入衝突，且單筆 item 400KB 限制可能不足 |
| 不加密 | 違反 Constitution — 所有資料必須加密 |

---

## R4: Care Event 分類時機

### Decision
**每次 Bedrock 回覆時同步產生分類**（現有設計）。不另外做非同步分類。

### Rationale
- 現有 bedrock.ts 已透過 structured output prompt 同時回傳 answer + category + confidence
- 分類延遲等於回覆延遲，無額外等待
- 簡化架構，無需另外的分類 pipeline

### Alternatives Considered
| Alternative | 為何不選 |
|---|---|
| 對話結束後批次分類 | 增加複雜度，使用者無法即時看到分類結果 |
| 前端規則引擎關鍵字分類 | 準確度低，且已有 LLM 可做 |

---

## R5: 照護紀錄頁面資料載入模式

### Decision
使用現有 **DynamoDB Query** 載入歷史紀錄，前端解密後在記憶體中進行篩選和搜尋。

### Rationale
- 單一使用者的紀錄量有限（< 500 筆預估），全部載入後本地過濾足夠
- DynamoDB 不支援全文搜尋，本地篩選是最簡單方案
- 避免引入 OpenSearch 等額外服務增加成本

### Alternatives Considered
| Alternative | 為何不選 |
|---|---|
| DynamoDB GSI + FilterExpression | 加密資料無法在 server side 過濾 |
| 引入 OpenSearch | 過度設計，超出 MVP 需求 |

---

## R6: 語音自動播放策略

### Decision
AI 回覆產生後**不自動播放語音**，提供「播放語音」按鈕由使用者主動觸發。

### Rationale
- 瀏覽器 autoplay policy 限制未經使用者互動的音訊播放
- 照護場域可能在安靜環境（如夜間），自動播放可能干擾
- 使用者已有「播放語音回覆」按鈕（現有 UI），保持一致

### Alternatives Considered
| Alternative | 為何不選 |
|---|---|
| 語音模式下自動播放 | 瀏覽器可能 block, 且需額外 UX 來關閉 |
| 設定選項讓使用者選擇 | 增加設定複雜度，MVP 階段不需要 |

---

## R7: ChatPage 重構策略

### Decision
將現有 ChatPage **漸進式重構**為多輪對話介面：
1. 新增 `ChatBubble` 和 `ChatHistory` 元件
2. 在 ChatPage 中用 message array 替代單一 answer state
3. 保留現有的輸入區和語音按鈕邏輯

### Rationale
- 最小化風險，保留已測試的核心流程
- 新元件可獨立開發和測試
- 漸進式重構不中斷現有功能

### Alternatives Considered
| Alternative | 為何不選 |
|---|---|
| 從零建立新 ChatPage | 重複實作大量已完成的邏輯 |
| 引入狀態管理庫 (Zustand/Redux) | 過度設計，React state + context 足夠 |
