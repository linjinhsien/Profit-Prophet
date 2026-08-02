# Feature Specification: 語音對話介面與照護紀錄頁面

**Feature Branch**: `004-voice-chat-care-record`  
**Created**: 2026-08-01  
**Status**: Draft  
**Input**: User description: "語音對話介面、照護紀錄頁面"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 語音對話提問 (Priority: P1)

照護人員開啟應用後，按下麥克風按鈕用中文語音提問照護相關問題，系統即時轉錄語音為文字、從知識庫檢索答案，並以語音和文字同步回覆。

**Why this priority**: 這是核心功能，直接解決照護人員雙手忙碌時無法打字查詢的痛點，提供最直覺的互動方式。

**Independent Test**: 可單獨測試 — 開啟應用、按下麥克風說一句照護問題、確認收到語音及文字回覆。

**Acceptance Scenarios**:

1. **Given** 照護人員已開啟應用且已取得授權, **When** 按下麥克風按鈕並說出「老人家血壓突然升高怎麼辦？」, **Then** 畫面即時顯示轉錄文字，且在數秒內收到語音和文字回答
2. **Given** 照護人員正在語音錄製中, **When** 按下停止按鈕, **Then** 系統結束錄音並開始處理查詢
3. **Given** 系統正在產生回覆, **When** 回覆產生完成, **Then** 自動播放語音回覆並同步顯示文字回覆與引用來源

---

### User Story 2 - 文字對話提問 (Priority: P1)

照護人員透過文字輸入框輸入問題，系統檢索知識庫後以文字和語音回覆。

**Why this priority**: 與語音並列為核心對話功能，適用於安靜環境或不方便語音的場合。

**Independent Test**: 在對話輸入框輸入問題文字、送出、確認收到文字回覆及可選的語音播放。

**Acceptance Scenarios**:

1. **Given** 照護人員已開啟應用, **When** 在輸入框輸入「如何幫助失智長輩進食？」並按送出, **Then** 系統顯示文字回答並提供語音播放選項
2. **Given** 對話進行中有多則訊息, **When** 使用者向上捲動, **Then** 可瀏覽完整對話歷史

---

### User Story 3 - 照護紀錄自動產生與瀏覽 (Priority: P2)

每次對話結束後，系統自動將對話分類為 Care Event（例如：健康諮詢、用藥提醒、緊急處理等），照護人員可在照護紀錄頁面瀏覽所有歷史紀錄。

**Why this priority**: 照護紀錄是對話的延伸價值，免去手動記錄的麻煩，但需建立在對話功能完成的基礎上。

**Independent Test**: 完成一次對話後切換到照護紀錄頁面，確認該筆對話已被分類並列於紀錄清單中。

**Acceptance Scenarios**:

1. **Given** 一段對話已完成, **When** 系統收到 Bedrock 回覆含 Care Event 分類, **Then** 自動建立一筆照護紀錄並歸類
2. **Given** 照護人員進入照護紀錄頁面, **When** 頁面載入, **Then** 顯示所有歷史紀錄清單，按時間倒序排列
3. **Given** 照護人員在紀錄清單中, **When** 點選某筆紀錄, **Then** 展開顯示完整對話內容與分類標籤

---

### User Story 4 - 照護紀錄篩選與搜尋 (Priority: P3)

照護人員可依 Care Event 類別或關鍵字篩選照護紀錄，快速找到特定紀錄。

**Why this priority**: 提升紀錄使用效率，但屬錦上添花功能，核心流程不依賴此功能。

**Independent Test**: 在照護紀錄頁面使用類別篩選或關鍵字搜尋，確認結果正確篩選。

**Acceptance Scenarios**:

1. **Given** 照護紀錄頁面已有多筆紀錄, **When** 選擇「健康諮詢」類別篩選, **Then** 僅顯示該類別的紀錄
2. **Given** 照護紀錄頁面已有多筆紀錄, **When** 輸入關鍵字搜尋, **Then** 顯示包含該關鍵字的紀錄

---

### Edge Cases

- 麥克風權限被使用者拒絕時，顯示明確提示並引導使用文字輸入
- 網路斷線時，對話中途中斷應顯示錯誤訊息並保留已輸入的內容
- 語音辨識結果為空（背景噪音或無語音）時，提示使用者重新錄音
- Bedrock 回覆逾時或失敗時，顯示友善錯誤訊息並提供重試選項
- 對話紀錄儲存失敗時，提示使用者並提供重試機制
- 長時間無操作後 Cognito 憑證過期時，自動重新取得或提示使用者

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系統 MUST 支援麥克風語音輸入，即時串流至 Transcribe 並顯示轉錄結果
- **FR-002**: 系統 MUST 支援文字輸入，送出後查詢 Bedrock Knowledge Bases
- **FR-003**: 系統 MUST 以文字顯示 AI 回覆，並標示引用來源
- **FR-004**: 系統 MUST 提供語音播放功能，將回覆文字透過 Polly 轉為語音播放
- **FR-005**: 系統 MUST 自動將每次對話標記 Care Event 類別（基於 Bedrock 回傳的分類結果）
- **FR-006**: 系統 MUST 將對話紀錄存入持久化儲存，並於照護紀錄頁面顯示
- **FR-007**: 照護紀錄頁面 MUST 以時間倒序展示所有歷史紀錄
- **FR-008**: 照護紀錄頁面 MUST 支援依 Care Event 類別篩選
- **FR-009**: 照護紀錄頁面 MUST 支援關鍵字搜尋
- **FR-010**: 系統 MUST 在載入時透過 Cognito Identity Pool 取得 AWS 臨時憑證
- **FR-011**: 系統 MUST 在語音轉錄時顯示即時轉錄狀態指示
- **FR-012**: AI 回覆 MUST 包含免責聲明標記，提醒內容為 AI 產生建議
- **FR-013**: 系統 MUST 提供單筆刪除與「刪除我的全部紀錄」功能，IAM DeleteItem 權限由 CloudOps 於實作前手動加入

### Key Entities

- **Conversation（對話）**: 包含一組問答訊息、時間戳記、Care Event 分類
- **Message（訊息）**: 單則訊息，包含角色（user/assistant）、文字內容、時間戳記
- **CareRecord（照護紀錄）**: 對話的紀錄化呈現，包含分類標籤、摘要、原始對話引用
- **CareEventCategory（照護事件類別）**: 分類標籤（如健康諮詢、用藥提醒、緊急處理、日常照護等）

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 照護人員可在 5 秒內從按下麥克風到看見轉錄文字開始出現
- **SC-002**: 從送出問題到收到完整文字回覆不超過 10 秒
- **SC-003**: 90% 的使用者首次使用即能成功完成一次語音對話（無需額外指引）
- **SC-004**: 照護紀錄頁面載入歷史紀錄（100 筆以內）不超過 3 秒
- **SC-005**: Care Event 自動分類準確率達 80% 以上（與人工標記比對）
- **SC-006**: 100% 的 AI 回覆帶有免責聲明標記

## Assumptions

- 使用者使用現代瀏覽器（Chrome, Edge, Safari），支援 Web Audio API 和 MediaRecorder
- 使用者具備穩定的網路連線（行動網路 4G 以上或 Wi-Fi）
- 目標語言為繁體中文（zh-TW）
- 照護知識庫已預先建置並可透過 Bedrock Knowledge Bases 檢索
- 每位使用者的對話紀錄相互隔離，不會看到他人紀錄
- 初版不含多人協作功能，為單一使用者操作介面
- Care Event 類別由 Bedrock Claude 的 structured output 自動產生，無需另外訓練模型
- 前端直接呼叫 AWS 服務（v2 架構），無 API Gateway 或 Lambda 中介層
- LiveCaption/backend 為孤立程式碼，不屬 v2 功能範圍；相關 audit 發現以排除說明處理
- .kiro/steering/PIPELINE.md 的 Project Context 將於派工 Wave 0 前更新為 v2 描述
- CI 覆蓋率報告僅產出數字不設門檻，待測試補齊後逐步收緊（記入 risk-register）

## Clarifications

### Session 2026-08-01

- Q: 是否立即更新 PIPELINE.md Project Context 為 v2？ → A: Wave 0 前由 Architect 直接改完 commit，不另建 TASK
- Q: CI workflow 中覆蓋率的處理方式？ → A: 產出覆蓋率報告但不設門檻，逐步調高（記入 risk-register）
- Q: TASK-009 T3 資料刪除的 IAM 權限如何解決？ → A: TASK-009 開始前先由 CloudOps 手動加好 DeleteItem 權限
- Q: LiveCaption/backend 的處置方式？ → A: 暫不處理，僅在 audit 加註範圍排除說明
