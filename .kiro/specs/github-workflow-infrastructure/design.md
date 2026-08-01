# Design Document

## Overview

本設計文件說明 GitHub 工作流基礎設施的實作架構。系統以「檔案即設定」為核心原則：所有 Agent 行為、Power 能力、Steering 紀律都以 Markdown 檔案定義，不引入常駐 process。

完整系統架構圖請參照專案架構文件：

#[[file:../../../docs/architecture.md]]

## Architecture

### 元件關係圖

```
┌────────────────────────────────────────────────────────────────────────┐
│                        設定檔載入時序                                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Kiro 啟動                                                             │
│      │                                                                 │
│      ├──→ 掃描 .kiro/steering/*.md                                     │
│      │        └──→ inclusion: always ──→ 立即載入 context              │
│      │        └──→ inclusion: fileMatch ──→ 等檔案匹配才載入           │
│      │        └──→ inclusion: manual ──→ 等 # 引用才載入               │
│      │                                                                 │
│      ├──→ 掃描 .kiro/powers/*/POWER.md                                 │
│      │        └──→ 讀 frontmatter keywords ──→ 建立觸發索引            │
│      │              （不載入內容，等關鍵字命中）                         │
│      │                                                                 │
│      └──→ 掃描 .kiro/agents/*.md                                       │
│               └──→ 註冊為可切換的 Custom Agent                          │
│                                                                        │
│  使用者對話中出現 "github" / "pr" / "issue"                             │
│      │                                                                 │
│      └──→ 命中 github-workflow Power keywords                          │
│               └──→ 動態載入 POWER.md + steering/gh-cli-commands.md      │
│               └──→ 任務結束後釋放                                       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 檔案職責矩陣

| 檔案 | 載入時機 | 職責 | 依賴 |
|------|---------|------|------|
| `steering/coding-standards.md` | always | 命名/結構/測試門檻 | 無 |
| `steering/contracts.md` | always | Task Contract 格式 | 無 |
| `powers/github-workflow/POWER.md` | keyword | gh CLI 使用原則 | 無 |
| `powers/github-workflow/steering/gh-cli-commands.md` | 隨 Power | 指令白名單 | POWER.md |
| `agents/requirement-sync.md` | 手動切換 | 需求釐清 | steering (always) |
| `agents/architect.md` | 手動切換 | 架構設計 | requirement-sync 輸出 |
| `agents/worktree-manager.md` | 手動切換 | 分支/Worktree | github-workflow Power |
| `agents/security-reviewer.md` | 手動切換 | 安全審查 | git diff |
| `agents/pr-writer.md` | 手動切換 | PR 撰寫 | github-workflow Power |
| `.github/workflows/security-review.yml` | PR 事件 | CI 安全防線 | GitHub Secrets |

## Components and Interfaces

### 1. github-workflow Power

**輸入契約**：Agent 對話中出現 keywords 之一
**輸出契約**：載入 gh CLI 指令白名單到 context

POWER.md frontmatter 結構：
```yaml
---
name: "github-workflow"
displayName: "GitHub CLI Workflow"
description: "透過 gh CLI 操作 GitHub，不依賴 GitHub MCP server"
keywords: ["github", "gh", "pull request", "issue", "分支", "worktree", "邀請協作者", "合併", "pr"]
author: "profit-prophet-team"
---
```

指令白名單分組：

```
┌──────────────────────────────────────────────────────────┐
│                  gh CLI 指令白名單                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Repo 層級                                               │
│  ├─ gh repo create <owner>/<name> --private --clone      │
│  ├─ gh repo clone <owner>/<name>                         │
│  └─ gh repo edit --help          （版本能力探測）          │
│                                                          │
│  Issue 層級                                              │
│  ├─ gh issue create --title --body --label --assignee    │
│  ├─ gh issue develop <n> --name <branch> --checkout      │
│  ├─ gh issue comment <n> --body-file <file>              │
│  └─ gh issue view <n> --comments                         │
│                                                          │
│  PR 層級                                                 │
│  ├─ gh pr create --title --body-file --base              │
│  ├─ gh pr comment <n> --body-file <file>                 │
│  ├─ gh pr merge <n> --squash --delete-branch             │
│  └─ gh pr view <n> --json statusCheckRollup              │
│                                                          │
│  API 層級（最底層，保證可用）                              │
│  ├─ gh api --method PUT repos/.../collaborators/<user>   │
│  ├─ gh api --method PUT orgs/.../teams/.../repos/...     │
│  └─ gh api --method PUT repos/.../branches/main/protection│
│           --input branch-protection.json                 │
│                                                          │
│  ❌ 禁止：gh auth token（避免洩漏憑證到 context）           │
│  ❌ 禁止：gh repo delete（不可逆）                         │
│  ❌ 禁止：--force / -f 相關的破壞性操作                     │
└──────────────────────────────────────────────────────────┘
```

### 2. Custom Agents

每個 Agent 檔案採統一結構：

```markdown
---
name: <agent-name>
description: <一句話說明>
tools: [<允許的工具清單>]
---

## 角色
<角色定義>

## 必須做
<正向規範>

## 禁止做
<負向規範，明確列出邊界>

## 輸出格式
<固定的輸出模板>

## 完成條件
<何時算完成，交給誰>
```

Agent 交接鏈：

```
requirement-sync ──需求藍圖──→ architect ──units of work──→ (人工) Producer
                                                                  │
                                            ┌─────────────────────┤
                                            ↓                     ↓
                                    worktree-manager      Specialist Agents
                                            │                     │
                                            │              (在 worktree 開發)
                                            │                     │
                                            └──────────┬──────────┘
                                                       ↓
                                              security-reviewer
                                                       ↓
                                                  pr-writer
                                                       ↓
                                              (CI + 人工 Review)
```

### 3. CI Workflow

```
┌─────────────────────────────────────────────────────────┐
│  .github/workflows/security-review.yml                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  on:                                                    │
│    pull_request:                                        │
│      types: [opened, synchronize, reopened]             │
│                                                         │
│  permissions:                                           │
│    contents: read        ← 最小權限                      │
│    pull-requests: write  ← 只為了留言                    │
│                                                         │
│  jobs:                                                  │
│    security-review:      ← 此名稱須對應                  │
│      │                     branch protection 的          │
│      │                     required_status_checks        │
│      ├─ actions/checkout@v4 (fetch-depth: 0)            │
│      └─ anthropics/claude-code-security-review          │
│           with:                                          │
│             claude-api-key: ${{ secrets.* }}            │
│             comment-pr: true                             │
└─────────────────────────────────────────────────────────┘
```

## Data Models

### Task Contract

Producer 與 Specialist 之間的任務交接格式。存放位置為 GitHub Issue comment（非本地檔案），確保有歷史紀錄可追。

```yaml
task:
  id: string              # TASK-NNN
  title: string
  issue: number           # GitHub Issue number
  worktree: string        # worktree 目錄名（= 分支名）
  assigned_to: string     # org/team 或 agent 名稱
  input:
    spec: string          # 規格檔路徑
    depends_on: [string]  # 前置 TASK-NNN 清單
  output:
    code: [string]        # 產出程式碼路徑
    tests: [string]       # 產出測試路徑
  acceptance_criteria: [string]
  review_gate: enum       # none | security_review | full_review
  status: enum            # pending | in_progress | review | done
```

### Branch Protection 設定

用於 `gh api --input` 帶入的 JSON 結構：

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["security-review"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null
}
```

### Security Finding

security-reviewer Agent 的輸出結構：

```yaml
finding:
  file: string            # 檔案路徑
  line: number            # 行號
  severity: enum          # low | medium | high | critical
  category: enum          # injection | auth | crypto | deserialization | data_leak
  description: string
  exploit_scenario: string
  remediation: string
  confidence: number      # 1-10，< 8 者丟棄不回報
```

### Agent Frontmatter

所有 Agent 檔案共用的 metadata 結構：

```yaml
name: string              # Agent 識別名
description: string       # 一句話說明
tools: [string]           # 允許使用的工具清單
```

## Correctness Properties

以下性質應在流程演練時驗證。

### Property 1: Worktree 隔離性

在 worktree A 的變更不影響 worktree B 或 main。

驗證方式：同時開兩個 worktree 各改同一檔案，確認互不干擾。

**Validates: Requirements 5.4**

### Property 2: Issue-分支綁定

透過 `gh issue develop` 建立的分支，其 PR 必自動連結回原 Issue。

驗證方式：開 PR 後檢查 Issue 頁面的 linked PR 區塊。

**Validates: Requirements 5.2, 5.6**

### Property 3: Contract 可追溯性

任一 TASK-NNN 都能從 Issue comments 還原完整交接歷程。

驗證方式：`gh issue view <n> --comments` 檢視。

**Validates: Requirements 6.1, 6.3, 6.4**

### Property 4: Power 載入冪等性

同一對話中多次觸發 keywords，Power 內容不重複累積。

驗證方式：連續提及 GitHub 相關詞彙，觀察 context 大小。

**Validates: Requirements 1.3**

### Property 5: Steering always 保證

任何對話開頭，coding-standards 與 contracts 皆已在 context 中。

驗證方式：新對話直接問「Contract 格式是什麼」，應能直接答出而不需讀檔。

**Validates: Requirements 3.1, 3.3**

### Property 6: 清理完整性

worktree remove 後，`git worktree list` 不再列出該項且實體目錄已刪除。

驗證方式：清理後執行 `git worktree list` 與目錄檢查。

**Validates: Requirements 5.5**

### Property 7: CI Gate 有效性

security-review status check 未通過時，PR 無法被合併。

驗證方式：開一個含硬編碼密鑰的測試 PR，確認合併按鈕停用。

**Validates: Requirements 4.1, 4.6**

### Property 8: 指令白名單封閉性

Agent 只使用 gh-cli-commands.md 白名單內的 gh 子命令，不使用禁止清單中的破壞性操作。

驗證方式：觀察 Agent 執行紀錄中的 shell 指令。

**Validates: Requirements 1.4, 1.5**

## Error Handling

| 情境 | 偵測方式 | 處理策略 |
|------|---------|---------|
| gh 未登入 | `gh auth status` 非 0 | 停止並提示執行 `gh auth login` |
| Issue 不存在 | `gh issue view <n>` 失敗 | 先建 Issue 再繼續 |
| 分支名含 `/` | 建立前字串檢查 | 改用 `-` 分隔並告知使用者 |
| worktree 目錄已存在 | `git worktree list` 比對 | 詢問是否重用或改名 |
| 分支保護 API 403 | HTTP status | 提示需 admin 權限，跳過此步 |
| CI secret 未設定 | Action 執行失敗 | 文件註明需先設定 secret |
| worktree 有未 commit 變更 | `git status --porcelain` | 拒絕 remove，要求先處理 |

## Testing Strategy

因為產出物是設定檔而非可執行程式，測試以「結構驗證 + 流程演練」為主：

1. **Frontmatter 驗證**：確認每個 Power/Steering/Agent 檔案的 YAML frontmatter 可被正確解析，必填欄位齊全
2. **關鍵字觸發測試**：在對話中提及 "開個 PR"，確認 github-workflow Power 被載入
3. **Agent 邊界測試**：對 `requirement-sync` 直接問「該用什麼資料庫」，確認它拒答並回到釐清需求
4. **端到端流程演練**：在測試 repo 上跑一次 Stage -1 → Stage 6，記錄卡點
5. **CI 觸發測試**：開一個含明顯安全問題的測試 PR（如硬編碼密鑰），確認 Action 有偵測並留言

## 待驗證的前提假設

以下項目在實作前需先確認，避免建立在錯誤假設上：

1. Kiro Custom Agent 之間是否支援 subagent 自動委派？若不支援，Producer 只能產出 Contract 後提示人工切換
2. 安裝的 gh 版本是否支援 `gh repo edit --add-collaborator`？先跑 `gh repo edit --help` 確認
3. `anthropics/claude-code-security-review` Action 需要哪些 secrets？需查閱該 Action 的 README
4. 專案的 branch protection 設定是否需要 org admin 權限？
