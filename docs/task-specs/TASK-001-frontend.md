# TASK-001：前端整合（Care Companion UI → Profit-Prophet API）

## 任務概述

建立 Profit-Prophet 的前端應用，串接 `realtime-qa-api` 的 REST 與 WebSocket 端點。

參考實作：[gyphsophila/care-companion-demo](https://github.com/gyphsophila/care-companion-demo/tree/master/frontend)

該 repo 已有完整的四頁式長照 UI（React 19 + TypeScript + Vite 8 + Tailwind 4），可作為結構與樣式的起點。但 API 層需要重寫，因為後端從本地 FastAPI 換成 API Gateway + Lambda。

## 現況對照

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    care-companion-demo (參考)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  frontend/src/                                                          │
│  ├── pages/                                                             │
│  │   ├── PersonaSelectionPage.tsx      6.5 KB  ← 可直接沿用             │
│  │   ├── ChatPage.tsx                 16.0 KB  ← 需加語音 + 串流        │
│  │   ├── ElderManagementPage.tsx      16.9 KB  ← 可直接沿用             │
│  │   └── CaregiverDashboardPage.tsx   15.7 KB  ← 需改 schema            │
│  ├── api/                                                               │
│  │   ├── config.ts          ← 改：加 API key header                     │
│  │   ├── conversation.ts    ← 改：改打 POST /query                      │
│  │   ├── elders.ts          ← 改：對應 Elder_Subject                    │
│  │   ├── summary.ts         ← 改：對應 Summaries table schema           │
│  │   ├── emergencyAlerts.ts ← 改：對應 emergency_events 分類            │
│  │   ├── personas.ts        ← 保留                                      │
│  │   ├── demo.ts            ← 保留（demo 重設用）                        │
│  │   └── health.ts          ← 保留                                      │
│  ├── components/                       ← 大部分可沿用                   │
│  ├── lib/                              ← 大部分可沿用                   │
│  └── types/                            ← 需依 API schema 重寫           │
│                                                                         │
│  後端：本地 FastAPI (127.0.0.1:8000)，無認證                             │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓ 移植
┌─────────────────────────────────────────────────────────────────────────┐
│                       Profit-Prophet (目標)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  後端：API Gateway + Lambda                                              │
│  ├── POST /query          REST，API key 認證，30s timeout               │
│  ├── WebSocket            串流回應，$connect/$disconnect/$default        │
│  ├── POST /transcribe     語音轉文字                                     │
│  └── GET  /summary        摘要查詢                                       │
│                                                                         │
│  新增需求（care-companion-demo 沒有的）                                  │
│  ├── 語音輸入 UI          麥克風錄音 → 串流到 Transcribe                 │
│  ├── 語音輸出 UI          Polly MP3 播放                                 │
│  ├── 串流回應顯示         WebSocket 逐塊渲染                             │
│  └── Care Event 分類篩選  8 類別 + unclassified                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 技術規格

### 技術棧（沿用參考 repo）

| 項目 | 版本 | 備註 |
|------|------|------|
| React | ^19.2 | |
| TypeScript | ~6.0 | |
| Vite | ^8.2 | |
| Tailwind CSS | ^4.3 | 透過 `@tailwindcss/vite` |
| ESLint | ^10.8 | 沿用參考 repo 的 `eslint.config.js` |

### API 契約

**POST /query**

```typescript
// Request
{
  query_text: string;        // 1-2000 字元，不可空白
  language: 'zh-TW' | 'zh-CN' | 'en-US';
  elder_subject_id: string;  // 1-128 字元
  session_id?: string;       // 選填，1-128 字元
}

// Response
{
  answer: string;            // 1-4000 字元
  confidence: number;        // 0.0-1.0
  category: CareEvent;       // 見下方 enum
  sources: DocumentRef[];    // 0-10 筆
  timestamp: string;         // ISO 8601 UTC
}
```

**Care Event 分類（8 類 + 1 fallback）**

```typescript
type CareEvent =
  | 'health_status'       // 健康狀態
  | 'emotion_state'       // 情緒狀態
  | 'daily_activities'    // 日常活動
  | 'medication_records'  // 用藥紀錄
  | 'emergency_events'    // 緊急事件
  | 'social_interaction'  // 社交互動
  | 'nutrition'           // 營養攝取
  | 'sleep_patterns'      // 睡眠模式
  | 'unclassified';       // 信心 < 0.6 時
```

`unclassified` 時 API 會附帶 top-3 候選與各自信心分數，UI 應提供讓使用者選擇正確分類的介面。

**WebSocket 串流**

```typescript
// 連線確認
{ connection_id: string; timestamp: string }

// 串流片段（每塊 <= 32 KB）
{ sequence: number; text: string; done: false }

// 結束
{ sequence: number; done: true }

// 錯誤
{ error: string; partial_preserved: boolean }
```

限制：訊息 payload 上限 128 KB；閒置 10 分鐘後伺服器關閉連線，前端需處理重連。

### 錯誤狀態對應

| HTTP / 事件 | 情境 | UI 應顯示 |
|------------|------|----------|
| 400 | 欄位驗證失敗 | 逐欄位錯誤提示 |
| 403 | API key 無效 | 設定錯誤提示，不重試 |
| 504 | Lambda 逾時 | 逾時提示 + 重試按鈕 |
| WS close (timeout) | 閒置逾時 | 靜默重連 |
| WS error frame | 串流中斷 | 保留已收到的部分內容 + 錯誤提示 |
| Polly 失敗 | 語音合成失敗 | 降級為純文字，標示語音不可用 |

## 安全注意事項

**API key 不可放在前端 bundle**

`realtime-qa-api` 目前設計是 API Gateway API key 認證。但 Vite 的 `VITE_*` 變數會被打包進瀏覽器 bundle，等於公開金鑰。參考 repo 的 README 也明確警告過這點。

需要在實作前決定其中一種做法：

1. Demo 階段：僅本機執行，key 放 `.env.local`（已 gitignore），不部署到公開網址
2. 若要部署：改用 Cognito 或前面加一層 BFF（backend-for-frontend）代持 key

此決定會影響 `api/config.ts` 的寫法，**必須在 Task 2 之前確認**。

## 子任務拆分

```
┌────────────────────────────────────────────────────────────────┐
│                      前端任務相依關係                            │
└────────────────────────────────────────────────────────────────┘

  T1 專案骨架
  ┌──────────────────────────────────┐
  │ Vite + React + TS + Tailwind      │
  │ ESLint 設定                        │
  │ 目錄結構                           │
  └────────────┬─────────────────────┘
               │
               ↓
  T2 API 層 + 型別         ←── 需先確認 API key 策略
  ┌──────────────────────────────────┐
  │ types/ 依 API schema 定義          │
  │ api/config.ts (base URL + auth)  │
  │ api/query.ts (POST /query)       │
  │ 錯誤處理與型別守衛                  │
  └────┬─────────────┬───────────────┘
       │             │
       ↓             ↓
  T3 靜態頁面    T4 WebSocket 串流
  ┌───────────┐ ┌──────────────────┐
  │ Persona   │ │ 連線生命週期       │
  │ Selection │ │ 逐塊渲染          │
  │ Elder Mgmt│ │ 重連邏輯          │
  └─────┬─────┘ └────────┬─────────┘
        │                │
        └────────┬───────┘
                 ↓
  T5 Chat 頁     T6 Dashboard
  ┌───────────┐ ┌──────────────────┐
  │ 文字輸入   │ │ 8 分類篩選         │
  │ 串流顯示   │ │ 摘要卡片          │
  │ 分類標籤   │ │ 風險等級標示       │
  └─────┬─────┘ └──────────────────┘
        │
        ↓
  T7 語音 I/O（可獨立後做）
  ┌──────────────────────────────────┐
  │ MediaRecorder 錄音                │
  │ 串流上傳到 /transcribe            │
  │ Polly MP3 播放                    │
  │ 權限被拒的降級處理                 │
  └──────────────────────────────────┘
```

### T1：專案骨架

- 在 repo 建立 `frontend/`，用 Vite 初始化 React + TS 專案
- 裝 Tailwind 4（`@tailwindcss/vite` plugin 方式，非 PostCSS）
- 沿用參考 repo 的 `eslint.config.js`、`tsconfig.*.json`、`vite.config.ts`
- 建立 `.env.example`（只放 `VITE_API_BASE_URL`，不放任何 key）
- 確認 `npm run dev`、`npm run build`、`npm run lint` 三個指令都能跑

### T2：API 層與型別定義

- `src/types/` 依上方 API 契約定義 request/response 型別與 `CareEvent` union
- `src/api/config.ts`：base URL 讀 `VITE_API_BASE_URL`，認證方式依安全決策實作
- `src/api/query.ts`：`POST /query` 客戶端，含 400/403/504 的分別處理
- 加型別守衛（type guard）驗證回應形狀，不信任後端一定符合契約
- 提供可切換的 mock 模式，讓前端能在後端未部署時獨立開發

### T3：靜態頁面移植

- `PersonaSelectionPage`：長者選擇，可大量沿用參考實作
- `ElderManagementPage`：長者資料 CRUD，注意刪除需二次確認
- 兩頁的表單驗證對齊 API 的欄位長度限制（如 `elder_subject_id` 上限 128 字元）

### T4：WebSocket 串流層

- 封裝成 hook（如 `useStreamingQuery`），管理連線生命週期
- 處理 `$connect` 確認、逐塊累加、`done` 結束
- 閒置 10 分鐘被關閉後自動重連
- 錯誤時保留已接收的部分內容，不清空畫面
- payload 超過 128 KB 前先在前端擋掉

### T5：Chat 頁

- 文字輸入 + 送出，串接 T4 的串流 hook
- 逐塊渲染 AI 回應（打字機效果）
- 顯示 Care Event 分類標籤 + 信心分數
- `unclassified` 時顯示 top-3 候選讓使用者選
- 顯示來源引用（sources），可展開查看

### T6：Caregiver Dashboard

- 依 8 個 Care Event 分類提供篩選
- 摘要卡片顯示：分類、信心、時間、來源數
- 對話歷史列表，每次最多 50 筆，時間倒序
- 無資料時顯示空狀態，不顯示載入中卡住

### T7：語音輸入輸出

- `MediaRecorder` 錄音，格式對齊後端支援清單（mp3/mp4/wav/flac/ogg/webm）
- 錄音檔大小上限 200 MB，前端先擋
- 串流模式下即時上傳音訊片段
- Polly 回傳的 MP3 播放控制（播放/暫停/進度）
- 麥克風權限被拒時降級為純文字輸入，明確告知使用者

## 驗收條件

- [ ] `npm run build` 無 TypeScript 錯誤
- [ ] `npm run lint` 無 error（warning 可接受但需說明）
- [ ] 所有 API 回應都經過型別守衛驗證，不直接 `as` 斷言
- [ ] 400 / 403 / 504 三種錯誤各有對應的 UI 呈現，不是統一「發生錯誤」
- [ ] WebSocket 閒置逾時後能自動重連，且不遺失已顯示內容
- [ ] 8 個 Care Event 分類都有對應的中文標籤與視覺樣式
- [ ] `unclassified` 情境有 top-3 候選選擇介面
- [ ] 麥克風權限被拒時仍可正常使用文字輸入
- [ ] Polly 失敗時降級為純文字，不阻擋對話流程
- [ ] `.env.example` 不含任何金鑰或憑證
- [ ] 無任何 API key 硬編碼在原始碼中
- [ ] 鍵盤可完整操作（Tab 順序合理，focus 可見）
- [ ] 表單欄位有對應的 label，錯誤訊息與欄位有 `aria-describedby` 關聯

## 不在此任務範圍

- 後端 API 實作（屬 `realtime-qa-api` spec 的其他任務）
- CDK 部署設定
- 認證機制的後端部分（Cognito / BFF 若採用，另開任務）
- 單元測試框架建置（建議另開任務，避免此任務過大）

## 待確認事項

1. **API key 策略**（阻塞 T2）：本機 demo 還是要部署？決定認證做法
2. **後端可用時間**：若後端還沒部署，T2 需先做 mock 模式
3. **參考 repo 授權**：care-companion-demo 是否可直接複製程式碼，或只能參考結構
4. **Care Event 中文標籤**：8 個分類的正式中文名稱是否就用 requirements.md 裡的版本
