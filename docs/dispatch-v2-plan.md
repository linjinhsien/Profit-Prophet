# v2 派工計畫（依 2026-08-01 現況重新編排）

| 項目 | 內容 |
| --- | --- |
| 架構版本 | v2 無後端（`docs/architecture.md`） |
| 任務來源 | `specs/004-voice-chat-care-record/tasks.md` T001–T029 |
| 併入項 | `docs/compliance/audit-report-2026-08-01.md` 的 F-03、F-04、F-07、C-1、B-8、D-1 |
| 現況 commit | `a1bcd10`（audit 執行於 `32d76ca`，之後多了一個 docs commit） |
| gh 環境 | 2.93.0，帳號 `linjinhsien`，repo `linjinhsien/Profit-Prophet` |

## 現況核對結果

specs/004 的 29 項任務**一項都未動**。逐檔驗證（非依賴 tasks.md 的勾選狀態）：

| 目標檔案 | 狀態 |
| --- | --- |
| `src/types/conversation.ts` | MISSING |
| `vitest.config.ts` | MISSING |
| `src/lib/useConversation.ts` | MISSING |
| `src/lib/formatTime.ts` | MISSING |
| `src/components/ChatBubble.tsx` | MISSING |
| `src/components/ChatHistory.tsx` | MISSING |
| `src/components/VoiceButton.tsx` | MISSING |
| `src/components/RecordCard.tsx` | MISSING |
| `src/lib/useCareRecords.ts` | MISSING |
| `src/components/RecordFilters.tsx` | MISSING |
| `src/components/ErrorBoundary.tsx` | MISSING |
| `src/components/Skeleton.tsx` | MISSING |

`src/api/conversations.ts` 內查無 `conversationId`，確認 T004 未開始。

**已存在可用的基礎**（不需重做）：`api/bedrock.ts`、`api/polly.ts`、`lib/credentials.ts`、`lib/config.ts`、`lib/conversationCrypto.ts`、`lib/guards.ts`、`lib/serviceErrors.ts`、`lib/useVoiceInput.ts`、4 個頁面、5 個元件。lint 與 tsc 目前皆零錯誤。

## 派工波次

```text
Wave 0（可立即並行，三人）
  TASK-002  版控衛生            10 min   無依賴
  TASK-003  對話基礎層          2 hr     無依賴，阻塞 Wave 1+
  TASK-004  測試框架 + CI       2 hr     無依賴

Wave 1（TASK-003 完成後，兩人並行）
  TASK-005  US1 語音對話 UI     3 hr     不同頁面
  TASK-006  US3 照護紀錄瀏覽    2.5 hr   不同頁面

Wave 2
  TASK-007  US2 文字對話        1.5 hr   依賴 TASK-005（共用 ChatPage）
  TASK-008  US4 篩選搜尋        1.5 hr   依賴 TASK-006（共用元件）

Wave 3
  TASK-009  Polish + 無障礙 + 刪除能力   2 hr   依賴全部
```

依賴圖：

```text
TASK-002 ─┐
TASK-004 ─┼─→（獨立，不阻塞任何人）
          │
TASK-003 ─┴─→ TASK-005 ──→ TASK-007 ─┐
              TASK-006 ──→ TASK-008 ─┴─→ TASK-009
```

## 任務對照表

| Task | 標題 | spec 任務 | 併入 audit 發現 | Contract |
| --- | --- | --- | --- | --- |
| TASK-002 | 版控衛生修復 | — | F-03, F-04 | ✅ 已產出 |
| TASK-003 | 對話基礎層 | T001, T003, T004, T005, T006, T015 | — | ✅ 已產出 |
| TASK-004 | 測試框架 + CI | T002 | F-07, D-1 | ✅ 已產出 |
| TASK-005 | US1 語音對話 UI | T007–T012 | C-1（ChatBubble 免責聲明） | 待 Wave 1 產出 |
| TASK-006 | US3 照護紀錄瀏覽 | T016–T020 | C-1（Dashboard 免責聲明） | 待 Wave 1 產出 |
| TASK-007 | US2 文字對話 | T013, T014 | — | 待 Wave 2 產出 |
| TASK-008 | US4 篩選搜尋 | T021–T024 | — | 待 Wave 2 產出 |
| TASK-009 | Polish + 無障礙 | T025–T029 | B-8（資料刪除能力） | 待 Wave 3 產出 |

`TASK-001`（issue #4）為既有的前端整合任務，已產出目前的 frontend 程式碼，不重新派工。

spec 的 T015（每則訊息自動存檔）刻意從 US2 移到 TASK-003，因為它屬於 `useConversation` 的職責。留在 US2 會導致 ChatPage 重工。

## 兩個 v1/v2 不一致，派工前需處理

**板上的架構圖是 v1。** `Profit-Prophet 整體系統架構`（Miro）畫的是 API Gateway + Lambda + OpenSearch Serverless + Comprehend + Claude 3 Sonnet。`docs/contracts/revision-note.md` 已將該版標為作廢。照該圖派工會產出廢棄工作。此計畫一律以 `docs/architecture.md` 的 v2 為準。

**`.kiro/steering/PIPELINE.md` 的 Project Context 也是 v1。** 它列 Python 3.11 Lambda、CDK TypeScript、OpenSearch Serverless、Claude 3 Sonnet、API Gateway REST + WebSocket。該檔為 `inclusion: always`，每次對話都載入，會持續把實作方向拉回 v1。建議由 Architect 更新該段落，否則後續每個 agent 都會收到矛盾的專案上下文。

## 派工操作步驟

Wave 0 三個任務可同時開票。以 TASK-003 為例：

```powershell
# 1. 建立 Issue
gh issue create `
  --title "[v2] 多輪對話基礎層：型別、useConversation、conversations API v2" `
  --body-file specs/004-voice-chat-care-record/tasks.md `
  --label "unit-of-work,frontend"

# 2. 把回傳的 Issue 編號填進 Contract 的 issue: null，然後寫入 comment
gh issue comment <N> --body-file docs/contracts/TASK-003-conversation-foundation.yaml

# 3. 建立 linked branch 與 worktree（由負責人在自己機器執行）
gh issue develop <N> --name feature-conversation-foundation --checkout
cd ..
git worktree add Profit-Prophet.worktrees/feature-conversation-foundation feature-conversation-foundation
```

分支名一律 `<type>-<desc>` 用 `-` 不用 `/`（coding-standards 規定，且部分 gh 版本對含斜線分支名有已知問題）。

三個 Wave 0 任務的分支名：`fix-repo-hygiene`、`feature-conversation-foundation`、`test-frontend-ci`。

完成回報與 PR 流程沿用 `docs/dispatch-task-001.md` 的 Step 5–7，不重複。

## 尚未執行的事

以下都還沒做，需要你確認後才動：

- 未建立任何 Issue（`gh auth status` 顯示 keyring 登入失敗，需先 `gh auth login` 重新認證）
- 未建立任何 branch 或 worktree
- 未將 Contract 寫入 Issue comment
- TASK-005 之後的 Contract 尚未產出，待 Wave 0 收斂後再依實際結果編寫

原本列的 4 項 blocking decision，經 context-gather 查證後 2 項解除：

| 決策 | 狀態 | 影響 |
| --- | --- | --- |
| 舊紀錄是否做 conversationId migration | ✅ 解除 — 不需 migration | TASK-003 改用欄位缺失偵測 |
| LiveCaption/backend 是否仍屬 v2 範圍 | ✅ 解除 — 已證實為孤立程式碼 | F-01/F-02/F-05/F-06 歸屬改變 |
| 覆蓋率門檻是否現在就設 80% | ⬜ 待 QA 裁決 | TASK-004 T4 workflow |
| PIPELINE.md 專案上下文是否更新為 v2 | ⬜ 待 Architect 裁決 | 後續所有 agent 的預設認知 |

## context-gather 查證結果（2026-08-01）

### LiveCaption/backend 是孤立程式碼

四項獨立證據：frontend/src 全域查無 `ws://` / `localhost` / port 8000 / `/ws/captions`（唯一命中是 `useVoiceInput.ts:95` 的 PCM 常數 `sample * 0x8000`）；全 repo 排除該目錄後查無 `LiveCaption` 或 `ElevenLabs` 字面引用；前端已在 `useVoiceInput.ts:248` 自行用 `TranscribeStreamingClient` 做 zh-TW 瀏覽器直連 STT，功能與該後端重疊；git 紀錄顯示 `c01c6c6` 單一 commit 34 檔全在 `LiveCaption/` 之下，5 分鐘後由 PR #7 合併，無整合修改，之後未再被碰過。它還自帶一套完整獨立 UI（`web/index.html` + `app.js`），產品名是「安心聽 CareCaption」。

**影響**：audit 的 F-01（區域違規）、F-02（無認證）兩個 S1，加上 F-05、F-06，全部指向這份沒有任何呼叫者的程式碼。修它不會降低實際風險。建議 Architect 決定移除或標註 archived，而不是排修復工。這也讓 audit 的「生產 NO-GO」判定需要重新計算——若 LiveCaption 移出範圍，S1 歸零。

### 對話資料層沒有版本標記，不需 migration

全 `frontend/src` 查無 `version` / `schemaVersion` 欄位。DynamoDB Item、`EncryptedConversationPayload`、`ConversationRecord` 都沒有。舊紀錄可由「無 schemaVersion」唯一識別，所以 v2 payload 用欄位缺失偵測即可。唯一約束：新標記要放明文 Item 屬性，不能只放 ciphertext，否則 `parseStoredConversation`（conversations.ts:145）無法在解密前分流。

### 順帶發現一個既有 bug（已納入 TASK-003 T5）

`conversations.ts:181` 的 sort key 是 `crypto.randomUUID()`，但 line 217-218 用 `ScanIndexForward: false` + `Limit: 50` 取「最新 50 筆」。sort key 是隨機值不是時間，所以 DynamoDB 回的是**任意** 50 筆，不是最新 50 筆；line 238 的 in-memory `timestamp` 排序只能排這批錯誤的子集。超過 50 筆後會靜默遺漏紀錄。

這是 TASK-006（照護紀錄瀏覽）的前置條件——那頁正是用來驗收 US3 的，資料集錯了驗收就沒意義。已列為 TASK-003 的 T5，工量估計從 2 小時調整為 2.5 小時。
