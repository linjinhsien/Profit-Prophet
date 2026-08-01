# Implementation Plan: 語音對話介面與照護紀錄頁面

**Branch**: `004-voice-chat-care-record` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/004-voice-chat-care-record/spec.md`

## Summary

為 Profit-Prophet 照護人員智慧助理建構完整的語音對話介面和照護紀錄頁面。前端使用 React + Vite + TypeScript + Tailwind CSS，直接呼叫 AWS 服務（Transcribe Streaming、Bedrock Knowledge Bases、Polly、DynamoDB）。核心目標是讓照護人員透過語音或文字提問、即時取得知識庫回覆，並自動將對話分類為 Care Event 儲存至照護紀錄。

## Technical Context

**Language/Version**: TypeScript 6.0 (frontend), React 19.2, Vite 8.2  
**Primary Dependencies**: @aws-sdk/client-transcribe-streaming, @aws-sdk/client-bedrock-agent-runtime, @aws-sdk/client-polly, @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb, Tailwind CSS 4.3  
**Storage**: DynamoDB (對話紀錄), S3 Vectors (知識庫向量索引)  
**Testing**: Vitest (unit), Playwright (e2e, optional)  
**Target Platform**: 現代瀏覽器 (Chrome, Edge, Safari) — 支援 Web Audio API + MediaRecorder  
**Project Type**: web-service (SPA frontend, serverless backend via direct AWS SDK calls)  
**Performance Goals**: 語音轉錄啟動 < 5s, Bedrock 回覆 < 10s, 紀錄頁面載入 < 3s  
**Constraints**: Bedrock < 1 RPS, 僅合成資料, region 限 us-east-1 / us-west-2, 無 Lambda 中介層  
**Scale/Scope**: 單一使用者介面, ~5 頁面, ~20 components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constraint | Status | Notes |
|-----------|--------|-------|
| Region: us-east-1 or us-west-2 only | ✅ PASS | Config 限制 `AwsRegion` 型別僅允許這兩個 region |
| Only synthetic data | ✅ PASS | UI 包含合成資料確認 checkbox, 不使用真實患者資料 |
| Bedrock < 1 RPS | ✅ PASS | 單人使用介面，不可能超過 1 RPS |
| Least privilege IAM | ✅ PASS | Cognito Identity Pool 提供 scoped credentials |
| No hardcoded secrets | ✅ PASS | 所有設定透過 .env.local 環境變數 |
| AI output disclaimer | ✅ PASS | FR-012 要求所有 AI 回覆帶免責聲明 |
| Encrypted data in transit | ✅ PASS | AWS SDK 全部走 HTTPS/TLS |
| No public S3 buckets | ✅ PASS | S3 Vectors 由 Bedrock KB 管理, 非公開 |

**Gate Result**: ✅ ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/004-voice-chat-care-record/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── ui-contracts.md  # Component interface contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── api/
│   │   ├── bedrock.ts           # [existing] Bedrock KB query
│   │   ├── polly.ts             # [existing] Speech synthesis
│   │   ├── conversations.ts     # [existing] DynamoDB conversation CRUD
│   │   └── transcribe.ts        # [new] Transcribe Streaming client
│   ├── components/
│   │   ├── AudioPlayer.tsx      # [existing] Audio playback
│   │   ├── CareEventBadge.tsx   # [existing] Care event category badge
│   │   ├── CategoryCandidates.tsx # [existing] Category selection
│   │   ├── CitationList.tsx     # [existing] Citation display
│   │   ├── ErrorAlert.tsx       # [existing] Error display
│   │   ├── ChatBubble.tsx       # [new] Single message bubble
│   │   ├── ChatHistory.tsx      # [new] Scrollable chat message list
│   │   ├── VoiceButton.tsx      # [new] Mic button with status indicator
│   │   ├── RecordCard.tsx       # [new] Care record summary card
│   │   └── RecordFilters.tsx    # [new] Filter/search controls
│   ├── pages/
│   │   ├── ChatPage.tsx         # [refactor] Multi-turn conversation UI
│   │   ├── CaregiverDashboardPage.tsx  # [refactor] → CareRecordPage
│   │   ├── ElderManagementPage.tsx     # [existing] 
│   │   └── PersonaSelectionPage.tsx    # [existing]
│   ├── lib/
│   │   ├── config.ts            # [existing] AWS config
│   │   ├── credentials.ts      # [existing] Cognito credentials
│   │   ├── conversationCrypto.ts # [existing] AES-GCM encryption
│   │   ├── guards.ts           # [existing] Type guards
│   │   ├── serviceErrors.ts    # [existing] Error handling
│   │   └── useVoiceInput.ts    # [refactor] Transcribe streaming hook
│   ├── types/
│   │   └── care.ts             # [extend] Add multi-turn types
│   └── App.tsx                  # [refactor] Route updates
└── tests/
    └── unit/                    # [new] Vitest unit tests
```

**Structure Decision**: 延續現有的 frontend SPA 單專案結構。新增 components 拆分 ChatPage 中的重複邏輯，增加 `transcribe.ts` API 模組支援 Transcribe Streaming。重構 CaregiverDashboardPage 為更完整的照護紀錄瀏覽頁面。
