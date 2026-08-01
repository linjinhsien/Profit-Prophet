# Requirements Document

## Introduction

建立 Kiro IDE × GitHub 共同開發工作流的基礎設施，全程使用 gh CLI 操作 GitHub（不接 GitHub MCP server），支援 Git Worktree 多 Agent 協同開發。本系統為 Hackathon 專案 (Profit-Prophet)，遵循 AWS 帳戶安全規範。

### 系統架構總覽

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Kiro IDE × GitHub 共同開發工作流                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         三層架構                                       │  │
│  │                                                                       │  │
│  │  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────────┐   │  │
│  │  │  隔離層      │    │  紀律層          │    │  把關層              │   │  │
│  │  │  Git        │    │  Steering Files │    │  Security Review    │   │  │
│  │  │  Worktree   │    │  Custom Agents  │    │  Code Review Gate   │   │  │
│  │  │             │    │  Contracts      │    │  CI/CD              │   │  │
│  │  └─────────────┘    └─────────────────┘    └─────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      開發流程 (Stage -1 → Stage 6)                     │  │
│  │                                                                       │  │
│  │  Stage -1          Stage 0         Stage 0.5        Stage 1           │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐       │  │
│  │  │ GitHub   │───→│ 需求釐清  │───→│ 視覺化   │───→│ Issue +  │       │  │
│  │  │ 初始化   │    │ 架構設計  │    │ 分工     │    │ Worktree │       │  │
│  │  └──────────┘    └──────────┘    └──────────┘    └──────────┘       │  │
│  │       │                                                ↓              │  │
│  │       │          Stage 5         Stage 4         Stage 2/3            │  │
│  │       │         ┌──────────┐    ┌──────────┐    ┌──────────┐         │  │
│  │       │    ┌───→│ PR 整理  │←───│ 安全審查 │←───│ 多 Agent │         │  │
│  │       │    │    │ gh pr    │    │ Diff審查  │    │ 協作開發  │         │  │
│  │       │    │    └──────────┘    └──────────┘    └──────────┘         │  │
│  │       │    │         ↓                                                │  │
│  │       │    │    Stage 6                                               │  │
│  │       │    │    ┌──────────┐                                          │  │
│  │       │    └────│ Review   │                                          │  │
│  │       │         │ + 合併   │                                          │  │
│  │       │         └──────────┘                                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    介面層：gh CLI（非 MCP）                             │  │
│  │                                                                       │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │ gh repo    │  │ gh issue   │  │ gh pr      │  │ gh api     │     │  │
│  │  │ create     │  │ create     │  │ create     │  │ (邀請/     │     │  │
│  │  │ clone      │  │ develop    │  │ comment    │  │  保護)     │     │  │
│  │  │ edit       │  │ comment    │  │ merge      │  │            │     │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### .kiro/ 目錄結構

```
your-repo/
├── .kiro/
│   ├── agents/
│   │   ├── requirement-sync.md      ← 需求釐清 Agent
│   │   ├── architect.md             ← 架構設計 Agent
│   │   ├── worktree-manager.md      ← Worktree + gh 管理
│   │   ├── security-reviewer.md     ← 安全審查 Agent
│   │   └── pr-writer.md             ← PR 撰寫 Agent
│   ├── powers/
│   │   └── github-workflow/
│   │       ├── POWER.md             ← Power 定義（關鍵字觸發）
│   │       └── steering/
│   │           └── gh-cli-commands.md  ← 允許的 gh 指令清單
│   ├── steering/
│   │   ├── coding-standards.md      ← inclusion: always
│   │   └── contracts.md             ← inclusion: always
│   └── specs/
│       └── github-workflow-infrastructure/
│           └── requirements.md      ← 本文件
├── .github/
│   └── workflows/
│       └── security-review.yml      ← CI 安全審查 Action
└── (程式碼)
```

### 限制條件（來自 Constitution）

- 所有 AWS 資源限 us-east-1 或 us-west-2
- 不得使用個人/敏感資料，僅限合成資料
- Bedrock 請求 < 1 RPS
- 遵循最小權限原則

## Glossary

- **gh_CLI**: GitHub CLI 命令列工具，用於操作 GitHub 的所有互動
- **Worktree**: Git Worktree，讓多個分支同時在不同目錄中 checkout 出來平行開發
- **Power**: Kiro Power 機制，透過 POWER.md + steering 動態載入 Agent 能力
- **Steering**: Kiro Steering Files，提供 Agent 的行為準則與專案規範
- **Agent**: Kiro Custom Agent，具備特定角色與限制的 AI 協作者
- **Contract**: Task Contract，Producer 與 Specialist 之間的任務交接格式
- **Review_Gate**: 程式碼合併前的品質檢查關卡
- **Producer**: 負責拆任務、分派、追蹤進度的協調角色
- **Specialist**: 負責實際執行開發任務的專業角色（backend/frontend/qa）

## Requirements

### Requirement 1: GitHub CLI Power 建立

**User Story:** 身為開發者，我希望 Agent 在需要操作 GitHub 時能自動載入 gh CLI 指令知識，這樣不用每次都重新說明怎麼用 gh。

#### Acceptance Criteria

1. WHEN the `.kiro/powers/github-workflow/` 資料夾被建立, THE POWER.md SHALL 包含正確的 frontmatter（name、displayName、description、keywords、author）
2. THE POWER.md keywords SHALL 包含 "github", "gh", "pull request", "issue", "worktree", "pr" 等觸發詞
3. WHEN Agent 遇到 GitHub 相關任務, THE Power SHALL 被動態載入並提供 gh CLI 指令參考
4. THE steering/gh-cli-commands.md SHALL 列出所有允許的 gh 指令：gh issue create/develop/comment、gh pr create/comment/merge、gh api、gh repo create/clone
5. THE Power SHALL NOT 包含 mcp.json，不引入常駐 MCP server process

```
┌─────────────────────────────────────────────────┐
│         github-workflow Power                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  POWER.md                                       │
│  ┌───────────────────────────────────────────┐  │
│  │ name: "github-workflow"                   │  │
│  │ keywords: [github, gh, pr, issue, ...]    │  │
│  │ → 關鍵字觸發時動態載入                      │  │
│  │ → 用完自動釋放，不佔 context               │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  steering/gh-cli-commands.md                    │
│  ┌───────────────────────────────────────────┐  │
│  │ 允許指令：                                  │  │
│  │  • gh issue create / develop / comment    │  │
│  │  • gh pr create / comment / merge         │  │
│  │  • gh api (邀請協作者、分支保護)            │  │
│  │  • gh repo create / clone                 │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ❌ 不包含 mcp.json                             │
│  ❌ 不常駐 MCP server process                   │
└─────────────────────────────────────────────────┘
```

### Requirement 2: Custom Agents 建立

**User Story:** 身為團隊成員，我希望每個 Agent 有明確的角色分工與限制，這樣不會越權做超出職責的事。

#### Acceptance Criteria

1. THE `requirement-sync.md` Agent SHALL 只釐清需求，不給架構、不推薦技術、不自行補假設，一次只問一個最有價值的問題
2. THE `architect.md` Agent SHALL 前置條件為 PRD 完成，輸出完整 Architecture Document（可用 Mermaid 圖），但不寫程式碼
3. THE `worktree-manager.md` Agent SHALL 負責呼叫 gh issue develop 建立 linked branch 和 git worktree add/remove，不修改程式碼
4. THE `security-reviewer.md` Agent SHALL 實施三步驟安全審查：讀 diff → 平行驗證 → 只回報信心分數 >= 8/10 的發現
5. THE `pr-writer.md` Agent SHALL 整理 commit 訊息、產生 PR 描述、呼叫 gh pr create，但不自動 push，需人工確認

```
┌────────────────────────────────────────────────────────────────────┐
│                        Agent 協作架構                               │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────┐         ┌──────────────────┐                │
│  │ requirement-     │────────→│ architect.md     │                │
│  │ sync.md          │ 需求藍圖 │ 架構設計         │                │
│  │                  │         │                  │                │
│  │ • 只釐清需求     │         │ • 前置：PRD 完成 │                │
│  │ • 不給架構       │         │ • 輸出 Arch Doc  │                │
│  │ • 一次一個問題   │         │ • 不寫程式碼     │                │
│  └──────────────────┘         └────────┬─────────┘                │
│                                        │ units of work             │
│                                        ↓                           │
│  ┌──────────────────┐         ┌──────────────────┐                │
│  │ worktree-        │←────────│ Producer         │                │
│  │ manager.md       │  分派    │ (人工/未來自動)  │                │
│  │                  │         └──────────────────┘                │
│  │ • gh issue develop         ↗        ↓        ↘                │
│  │ • git worktree add    Specialist  Specialist  Specialist       │
│  │ • 清理 worktree       (backend)   (frontend)  (qa)            │
│  └──────────────────┘                   │                         │
│                                         ↓                         │
│  ┌──────────────────┐         ┌──────────────────┐                │
│  │ security-        │←────────│ pr-writer.md     │                │
│  │ reviewer.md      │  審查後  │                  │                │
│  │                  │         │ • 整理 commit    │                │
│  │ • 讀 git diff    │         │ • 產生 PR 描述   │                │
│  │ • 5 大安全類別   │         │ • gh pr create   │                │
│  │ • 信心 < 8 丟棄  │         │                  │                │
│  └──────────────────┘         └──────────────────┘                │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Requirement 3: Steering Files 建立

**User Story:** 身為開發者，我希望 Agent 每次都自動載入專案規範，不用每次對話都重新交代命名規則和 Contract 格式。

#### Acceptance Criteria

1. THE `coding-standards.md` SHALL 使用 `inclusion: always` frontmatter，確保每次對話都自動載入
2. THE `coding-standards.md` SHALL 定義命名規範、目錄結構規範、測試覆蓋率門檻
3. THE `contracts.md` SHALL 使用 `inclusion: always` frontmatter
4. THE `contracts.md` SHALL 定義 Task Contract YAML 格式，包含 id、title、issue、worktree、assigned_to、input、output、acceptance_criteria、review_gate 欄位
5. WHEN a Specialist 完成任務, THE Contract 結果 SHALL 透過 `gh issue comment` 寫回對應 Issue

### Requirement 4: GitHub Actions CI 整合

**User Story:** 身為團隊負責人，我希望 PR 合併前一定要通過安全審查，這樣不會有未經檢查的程式碼進入 main。

#### Acceptance Criteria

1. THE `.github/workflows/security-review.yml` SHALL 在 PR opened/synchronize 事件時自動觸發
2. THE workflow SHALL 使用 anthropics/claude-code-security-review Action 執行安全審查
3. THE workflow SHALL 將審查結果以留言形式寫入 PR
4. THE `branch-protection.json` SHALL 設定 required_status_checks 包含 "security-review"
5. THE branch protection SHALL 要求至少 1 個 approving review 才能合併
6. IF security-review status check 未通過, THEN PR 的合併按鈕 SHALL 被停用

```
┌─────────────────────────────────────────────────────────────┐
│                  CI 安全關卡流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  開發者推 code                                               │
│       ↓                                                     │
│  ┌──────────────┐     ┌──────────────┐                      │
│  │ gh pr create │────→│ GitHub       │                      │
│  └──────────────┘     │ Actions 觸發 │                      │
│                       └──────┬───────┘                      │
│                              ↓                              │
│                 ┌────────────────────────┐                  │
│                 │ security-review Action │                  │
│                 │ (claude-code-security- │                  │
│                 │  review)               │                  │
│                 └────────────┬───────────┘                  │
│                              ↓                              │
│              ┌───────────────────────────────┐              │
│              │ Branch Protection 檢查         │              │
│              │ • required_status_checks 通過？│              │
│              │ • 至少 1 個 approving review？ │              │
│              └───────────────┬───────────────┘              │
│                              ↓                              │
│                    ┌─────────────────┐                      │
│                    │  ✓ 允許合併      │                      │
│                    │  gh pr merge    │                      │
│                    └─────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Requirement 5: Worktree 工作流生命週期

**User Story:** 身為開發者，我希望每個 Issue 都有獨立的 worktree 開發環境，這樣多人/多 Agent 平行開發時不會互相干擾。

#### Acceptance Criteria

1. WHEN worktree-manager 收到任務分派, IT SHALL 先確認對應 Issue 存在，沒有就先用 `gh issue create` 建立
2. THE worktree-manager SHALL 使用 `gh issue develop <issue-number> --name <branch-name> --checkout` 建立 linked branch
3. THE branch 名稱 SHALL 避免使用 "/" 字元（部分 gh 版本有已知 bug）
4. THE worktree-manager SHALL 使用 `git worktree add` 在主專案外層建立獨立工作目錄
5. WHEN PR 合併完成後, THE worktree-manager SHALL 執行 `git worktree remove` 和 `git branch -d` 清理資源
6. THE linked branch 建立後 SHALL 自動與 Issue 綁定，PR 開出時自動連結回 Issue

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Worktree 完整生命週期                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 建立 Issue                                                      │
│     gh issue create --title "..." --label "unit-of-work"            │
│          ↓                                                          │
│  2. 建立 Linked Branch                                              │
│     gh issue develop 12 --name feature-login --checkout             │
│          ↓                                                          │
│  3. 建立 Worktree（隔離開發環境）                                    │
│     git worktree add ../repo.worktrees/feature-login feature-login  │
│          ↓                                                          │
│  4. Agent 在 Worktree 中開發                                        │
│     ┌─────────────────────────────────────────────┐                 │
│     │  Specialist Agent 在隔離環境工作              │                 │
│     │  • 不影響 main                               │                 │
│     │  • 不影響其他 worktree                       │                 │
│     │  • Contract 寫入 Issue comment               │                 │
│     └─────────────────────────────────────────────┘                 │
│          ↓                                                          │
│  5. 安全審查 + PR                                                   │
│     security-reviewer → pr-writer → gh pr create                    │
│          ↓                                                          │
│  6. Review Gate + 合併                                              │
│     gh pr merge --squash --delete-branch                            │
│          ↓                                                          │
│  7. 清理 Worktree                                                   │
│     git worktree remove ../repo.worktrees/feature-login             │
│     git branch -d feature-login                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Requirement 6: 多 Agent 協作（Producer + Specialist）

**User Story:** 身為 Producer，我希望有一個標準的任務交接機制，這樣 Specialist 拿到任務時就知道該做什麼、做到什麼程度。

#### Acceptance Criteria

1. THE Producer SHALL 產出 Task Contract 並透過 `gh issue comment` 寫入對應 Issue
2. THE Contract SHALL 包含：id、title、issue number、worktree 名稱、assigned_to、input（spec 路徑）、output（程式碼/測試路徑）、acceptance_criteria、review_gate
3. WHEN Specialist 完成任務, IT SHALL 用 `gh issue comment` 回報結果到同一 Issue
4. THE Producer SHALL 透過 `gh issue view --comments` 讀取完整交接歷程
5. IF Kiro 尚未支援 subagent 自動互呼, THEN 流程 SHALL 由人工明確切換 Agent，不假裝已自動委派

### Requirement 7: 漸進式擴充支援

**User Story:** 身為一人開發者，我希望這套工作流可以從最小規模開始用，不需要一次建立所有基礎設施。

#### Acceptance Criteria

1. THE 工作流 SHALL 支援 Solo Dev 模式：只需 Producer + 2-3 個 Specialist、手動 worktree、不啟用 Review Gate
2. THE 工作流 SHALL 支援 Small Team 模式：依 Issue 自動開 worktree、基本 Review Gate、Organization + Team 權限
3. THE 工作流 SHALL 支援 Enterprise 模式：跨團隊 Orchestrator、CI 自動建立/銷毀 worktree、完整 Review Gate + 稽核紀錄
4. EACH 模式的切換 SHALL 只需要增加檔案，不需要修改現有設定

```
┌───────────────────────────────────────────────────────────────┐
│                    漸進式擴充路線圖                             │
├──────────────┬──────────────────┬─────────────────────────────┤
│  Solo Dev    │  Small Team      │  Enterprise                 │
├──────────────┼──────────────────┼─────────────────────────────┤
│ Producer +   │ + Team Lead 分工 │ + 跨團隊 Portfolio          │
│ 2-3 個       │ + 更多           │   Orchestrator              │
│ Specialist   │   Specialist     │                             │
├──────────────┼──────────────────┼─────────────────────────────┤
│ 手動開       │ 依 Issue 自動開  │ 搭配 CI 自動建立/銷毀       │
│ 2-3 個       │                  │                             │
│ worktree     │                  │                             │
├──────────────┼──────────────────┼─────────────────────────────┤
│ 不啟用       │ 基本             │ 完整 Review Gate            │
│ Review Gate  │ Review Gate      │ + 稽核紀錄                  │
├──────────────┼──────────────────┼─────────────────────────────┤
│ 個人 repo    │ Organization     │ Organization + SSO          │
│ + 少量協作者 │ + Team 權限      │ (IAM Identity Center)       │
└──────────────┴──────────────────┴─────────────────────────────┘
```
