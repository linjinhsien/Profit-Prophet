# Developer Quickstart: 語音對話介面與照護紀錄頁面

**Feature**: 004-voice-chat-care-record  
**Branch**: `004-voice-chat-care-record`

## Prerequisites

- Node.js >= 20
- pnpm or npm
- AWS Account 已設定 Cognito Identity Pool, Bedrock Knowledge Base, DynamoDB Table
- 現代瀏覽器（Chrome 推薦，支援 Web Audio API）

## Setup

```bash
# 切換到 feature branch
git checkout 004-voice-chat-care-record

# 進入前端目錄
cd frontend

# 安裝依賴
npm install

# 建立環境變數檔案
cp .env.example .env.local
```

## Environment Variables (.env.local)

```env
VITE_AWS_REGION=us-east-1
VITE_COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_BEDROCK_KB_ID=XXXXXXXXXX
VITE_BEDROCK_MODEL_ARN=arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0
VITE_DDB_TABLE_NAME=profit-prophet-conversations
```

## Run Development Server

```bash
npm run dev
# → http://localhost:5173
```

## Key Files to Modify

| Priority | File | Change |
|----------|------|--------|
| 1 | `src/types/care.ts` | 新增 ChatMessage, Conversation interfaces |
| 2 | `src/lib/useConversation.ts` | 新增多輪對話 hook |
| 3 | `src/components/ChatBubble.tsx` | 新增對話氣泡元件 |
| 4 | `src/components/ChatHistory.tsx` | 新增對話歷史容器 |
| 5 | `src/components/VoiceButton.tsx` | 新增語音按鈕元件 |
| 6 | `src/pages/ChatPage.tsx` | 重構為多輪對話 UI |
| 7 | `src/components/RecordCard.tsx` | 新增紀錄卡片元件 |
| 8 | `src/components/RecordFilters.tsx` | 新增篩選元件 |
| 9 | `src/pages/CaregiverDashboardPage.tsx` | 重構為照護紀錄頁面 |
| 10 | `src/api/conversations.ts` | 擴展支援 conversationId |
| 11 | `src/App.tsx` | 更新路由和 state 管理 |

## Architecture Notes

- **No backend**: Frontend calls AWS services directly via Cognito temporary credentials
- **Encryption**: All conversation data encrypted client-side (AES-GCM) before DynamoDB write
- **Voice**: Transcribe Streaming via Web Audio API → PCM → WebSocket
- **AI**: Bedrock Knowledge Bases `RetrieveAndGenerate` with structured output prompt
- **TTS**: Amazon Polly Zhiyu Neural voice (manual play, not auto-play)

## Testing

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Unit tests (after adding vitest)
npx vitest run
```

## Constraints Reminder

- ⚠️ Only synthetic data — never use real patient information
- ⚠️ Bedrock < 1 RPS — single user OK, don't add auto-retry loops
- ⚠️ Region must be us-east-1 or us-west-2
- ⚠️ All AI responses must include disclaimer text
- ⚠️ Passphrase never persisted to storage or transmitted to server

## Related Documentation

- [Spec](./spec.md) — Feature specification
- [Plan](./plan.md) — Implementation plan
- [Research](./research.md) — Technical decisions
- [Data Model](./data-model.md) — Entity definitions
- [UI Contracts](./contracts/ui-contracts.md) — Component interfaces
- [Architecture](../../docs/architecture.md) — System architecture
