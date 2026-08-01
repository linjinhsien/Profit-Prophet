# Tasks: 語音對話介面與照護紀錄頁面

**Input**: Design documents from `specs/004-voice-chat-care-record/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)

---

## Phase 1: Setup

**Purpose**: Project initialization and shared type extensions

- [ ] T001 Extend TypeScript types with ChatMessage and Conversation interfaces in `frontend/src/types/care.ts`
- [ ] T002 [P] Add Vitest dev dependency and configure in `frontend/vitest.config.ts`
- [ ] T003 [P] Create `frontend/src/types/conversation.ts` with multi-turn conversation types (ChatMessage, Conversation, CareRecord, CareEventSummary)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core hooks and API extensions that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Extend `frontend/src/api/conversations.ts` with `conversationId` field support and version-2 payload format (backward compatible with legacy records)
- [ ] T005 [P] Create `frontend/src/lib/useConversation.ts` hook — manages multi-turn state: messages array, conversationId, sendMessage(), resetConversation()
- [ ] T006 [P] Create `frontend/src/lib/formatTime.ts` — relative time formatting utility (「剛剛」「5 分鐘前」「昨天」)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — 語音對話提問 (Priority: P1) 🎯 MVP

**Goal**: 照護人員按下麥克風用中文語音提問，系統即時轉錄、檢索知識庫、以語音和文字回覆

**Independent Test**: 開啟應用 → 按下麥克風說話 → 看到轉錄文字出現 → 收到語音及文字回覆 → 歷史訊息以泡泡呈現

### Implementation for User Story 1

- [ ] T007 [P] [US1] Create `frontend/src/components/ChatBubble.tsx` — single message bubble with role-based alignment, timestamp, CareEventBadge, play audio button
- [ ] T008 [P] [US1] Create `frontend/src/components/ChatHistory.tsx` — scrollable message list with auto-scroll, loading indicator, empty state
- [ ] T009 [P] [US1] Create `frontend/src/components/VoiceButton.tsx` — mic button with status indicator (idle/listening/error), interim transcript display
- [ ] T010 [US1] Refactor `frontend/src/pages/ChatPage.tsx` — replace single-answer state with useConversation hook, render ChatHistory + ChatBubble, integrate VoiceButton, keep encryption fieldset
- [ ] T011 [US1] Add AI disclaimer text to all assistant ChatBubble messages in `frontend/src/components/ChatBubble.tsx` (FR-012: 「此為 AI 產生建議，請依專業判斷確認」)
- [ ] T012 [US1] Wire voice transcript into sendMessage flow — when user stops recording and transcript is ready, auto-populate or auto-send in `frontend/src/pages/ChatPage.tsx`

**Checkpoint**: User Story 1 完成 — 可獨立使用語音或文字進行多輪對話，訊息以 chat bubble 呈現

---

## Phase 4: User Story 2 — 文字對話提問 (Priority: P1)

**Goal**: 照護人員透過文字輸入框輸入問題，系統以文字和語音回覆，支援多輪對話歷史

**Independent Test**: 在輸入框輸入問題文字 → 送出 → 看到 user bubble + assistant bubble → 可繼續提問看到歷史保留

### Implementation for User Story 2

- [ ] T013 [US2] Ensure text input form in `frontend/src/pages/ChatPage.tsx` uses sendMessage(text, 'text') and clears input after send
- [ ] T014 [US2] Add conversation reset button (「新對話」) to `frontend/src/pages/ChatPage.tsx` — calls resetConversation() to start fresh session
- [ ] T015 [US2] Implement auto-save per message in `frontend/src/lib/useConversation.ts` — after each assistant response, encrypt and save to DynamoDB with conversationId

**Checkpoint**: User Story 2 完成 — 文字對話完整流程可用，支援連續問答

---

## Phase 5: User Story 3 — 照護紀錄自動產生與瀏覽 (Priority: P2)

**Goal**: 對話結束後自動分類為 Care Event，照護紀錄頁面可瀏覽所有歷史紀錄

**Independent Test**: 完成對話 → 切換到照護紀錄頁面 → 看到該筆對話紀錄卡片含分類標籤 → 點擊可展開看完整對話

### Implementation for User Story 3

- [ ] T016 [P] [US3] Create `frontend/src/components/RecordCard.tsx` — care record summary card with collapse/expand, category badge, timestamp, message count, summary excerpt
- [ ] T017 [P] [US3] Create `frontend/src/lib/useCareRecords.ts` — hook to load conversation history from DynamoDB, decrypt, group by conversationId, derive CareRecord view models
- [ ] T018 [US3] Refactor `frontend/src/pages/CaregiverDashboardPage.tsx` into care record browsing page — use useCareRecords hook, render RecordCard list sorted by time descending
- [ ] T019 [US3] Add conversation detail expansion in RecordCard — when expanded, show full message list (reuse ChatBubble component)
- [ ] T020 [US3] Update `frontend/src/App.tsx` — rename nav label from 「照護總覽」 to 「照護紀錄」, pass updated props to refactored page

**Checkpoint**: User Story 3 完成 — 所有對話自動出現在照護紀錄頁面，可瀏覽和展開查看

---

## Phase 6: User Story 4 — 照護紀錄篩選與搜尋 (Priority: P3)

**Goal**: 照護人員可依 Care Event 類別或關鍵字篩選照護紀錄

**Independent Test**: 在紀錄頁面選擇類別篩選 → 結果只顯示該類別 → 輸入關鍵字 → 結果進一步篩選

### Implementation for User Story 4

- [ ] T021 [P] [US4] Create `frontend/src/components/RecordFilters.tsx` — category dropdown (all + each CareEvent) + debounced keyword search input
- [ ] T022 [US4] Integrate RecordFilters into `frontend/src/pages/CaregiverDashboardPage.tsx` — local state for selectedCategory and searchQuery, filter records in render
- [ ] T023 [US4] Implement client-side filtering logic in `frontend/src/lib/useCareRecords.ts` — filter by category match and keyword match on summary/queryText fields
- [ ] T024 [US4] Add results count display with `aria-live="polite"` in `frontend/src/pages/CaregiverDashboardPage.tsx` — 「顯示 N 筆紀錄」

**Checkpoint**: User Story 4 完成 — 篩選和搜尋功能可用

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T025 [P] Add error boundary wrapper in `frontend/src/components/ErrorBoundary.tsx` for graceful crash recovery
- [ ] T026 [P] Add loading skeleton components for ChatHistory and RecordCard list in `frontend/src/components/Skeleton.tsx`
- [ ] T027 Accessibility audit — verify all new components have proper aria attributes, keyboard navigation, focus management in ChatPage and CareRecordPage
- [ ] T028 [P] Run `npx tsc --noEmit` and `npm run lint` — fix all type errors and lint issues
- [ ] T029 Validate against quickstart.md — ensure dev setup instructions work end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001/T003 for types)
- **User Story 1 (Phase 3)**: Depends on Phase 2 (useConversation hook)
- **User Story 2 (Phase 4)**: Depends on Phase 2 + partially on Phase 3 (shared ChatPage)
- **User Story 3 (Phase 5)**: Depends on Phase 2 (conversations API) — can parallel with US1/US2
- **User Story 4 (Phase 6)**: Depends on Phase 5 (RecordCard and useCareRecords)
- **Polish (Phase 7)**: Depends on all user stories

### User Story Dependencies

- **US1 (語音對話)**: Phase 2 complete → independent
- **US2 (文字對話)**: Phase 2 complete → shares ChatPage with US1 (sequential after US1)
- **US3 (照護紀錄瀏覽)**: Phase 2 complete → independent of US1/US2
- **US4 (紀錄篩選搜尋)**: US3 complete → depends on US3 components

### Parallel Opportunities

- T002, T003 can run parallel with T001
- T005, T006 can run parallel with T004
- T007, T008, T009 can all run in parallel (different files)
- T016, T017 can run in parallel
- US1 and US3 can run in parallel (different pages)
- All Polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# All new components in parallel (different files):
Task T007: "ChatBubble.tsx"
Task T008: "ChatHistory.tsx"
Task T009: "VoiceButton.tsx"

# Then sequential integration:
Task T010: "Refactor ChatPage.tsx (depends on T007, T008, T009)"
Task T011: "Add disclaimer (depends on T007)"
Task T012: "Wire voice transcript (depends on T010)"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup (types)
2. Complete Phase 2: Foundational (useConversation + API extension)
3. Complete Phase 3: US1 — 語音對話
4. Complete Phase 4: US2 — 文字對話
5. **STOP and VALIDATE**: Multi-turn voice + text conversation works
6. Deploy/demo as MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 + US2 → 對話功能完整 → **MVP** 🎯
3. US3 → 照護紀錄可瀏覽 → Demo v2
4. US4 → 篩選搜尋 → Complete feature
5. Polish → Production-ready

### Estimated Effort

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Setup | 3 | 30 min |
| Foundational | 3 | 1.5 hr |
| US1 (語音對話) | 6 | 3 hr |
| US2 (文字對話) | 3 | 1.5 hr |
| US3 (照護紀錄) | 5 | 2.5 hr |
| US4 (篩選搜尋) | 4 | 1.5 hr |
| Polish | 5 | 2 hr |
| **Total** | **29** | **~12.5 hr** |
