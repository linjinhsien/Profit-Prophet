# Implementation Plan

## Overview

本計畫將 GitHub 工作流基礎設施拆為 8 個階段。產出物以 Markdown 設定檔為主（Agent、Power、Steering），加上 CI workflow 與操作手冊。

Phase 0 為前提驗證，必須先完成才知道後續哪些任務需要調整——特別是 gh 版本能力與 Kiro subagent 委派支援度，這兩項會直接改變 Task 3.2 與 5.4 的寫法。

## Task Dependency Graph

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          任務相依關係                                      │
└──────────────────────────────────────────────────────────────────────────┘

  Phase 0  前提驗證（阻塞後續）
  ┌─────────────────────────────────────────┐
  │  1.1 gh 能力探測                         │
  │  1.2 subagent 委派驗證                   │
  │  1.3 Action secrets 需求                 │
  └────┬──────────┬──────────────┬───────────┘
       │          │              │
       │ 影響     │ 影響          │ 影響
       ↓          ↓              ↓
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ 3.2     │  │ 5.4     │  │ 7.1     │
  │ 白名單  │  │ Producer│  │ CI yml  │
  └─────────┘  └─────────┘  └─────────┘

  Phase 1  紀律層（無外部依賴，可最先做）
  ┌─────────────────────────────────────────┐
  │  2.1 coding-standards.md                │
  │  2.2 contracts.md ──────────────┐       │
  │  2.3 驗證 always 載入            │       │
  └─────────────────────────────────┼───────┘
                                    │ Contract schema
  Phase 2  Power                    │
  ┌─────────────────────────────────┼───────┐
  │  3.1 POWER.md                   │       │
  │  3.2 gh-cli-commands.md ←── 1.1 │       │
  │  3.3 驗證關鍵字觸發              │       │
  └────┬────────────────────────────┼───────┘
       │ Power 提供指令參考           │
       ↓                            ↓
  Phase 3  Agents
  ┌─────────────────────────────────────────┐
  │  4.1 requirement-sync ──┐               │
  │  4.2 architect ←────────┘ 需求藍圖       │
  │  4.3 驗證前段邊界                        │
  │                                         │
  │  5.1 worktree-manager  ←── 需 Power     │
  │  5.2 security-reviewer                  │
  │  5.3 pr-writer         ←── 需 Power     │
  │  5.4 Producer 交接 ←── 1.2 + 2.2        │
  └────┬────────────────────────────────────┘
       │
       ↓
  Phase 4  GitHub 資產            Phase 5  CI
  ┌──────────────────────┐       ┌──────────────────────┐
  │  6.1 branch-         │──────→│  7.1 security-       │
  │      protection.json │ job   │      review.yml      │
  │  6.2 setup 手冊      │ 名稱  │  7.2 驗證 CI Gate    │
  └──────────────────────┘ 對應  └──────┬───────────────┘
                                        │
                                        ↓
  Phase 6  端到端演練（需前面全部完成）
  ┌─────────────────────────────────────────┐
  │  8.1 Worktree 生命週期                   │
  │  8.2 隔離性驗證                          │
  │  8.3 Contract 交接演練                   │
  │  8.4 記錄卡點並回寫 ──┐                  │
  └───────────────────────┼─────────────────┘
                          │ 可能觸發回頭修正
       ┌──────────────────┘
       ↓
  Phase 7  擴充文件
  ┌─────────────────────────────────────────┐
  │  9.1 三階段採用指南                       │
  └─────────────────────────────────────────┘
```

關鍵路徑：`1.1 → 3.2 → 5.1 → 8.1`（gh 能力決定白名單，白名單決定 worktree-manager 能做什麼，才能演練生命週期）

同一 wave 內的任務可平行執行：

```json
{
  "waves": [
    {
      "wave": 1,
      "description": "前提驗證與紀律層（無外部依賴，可全部平行）",
      "tasks": ["1.1", "1.2", "1.3", "2.1", "2.2"]
    },
    {
      "wave": 2,
      "description": "Power 建立與 Steering 驗證",
      "tasks": ["2.3", "3.1", "3.2"]
    },
    {
      "wave": 3,
      "description": "Power 觸發驗證與前段 Agent",
      "tasks": ["3.3", "4.1", "4.2"]
    },
    {
      "wave": 4,
      "description": "後段 Agent 與前段邊界驗證",
      "tasks": ["4.3", "5.1", "5.2", "5.3", "5.4"]
    },
    {
      "wave": 5,
      "description": "GitHub 資產與 CI workflow",
      "tasks": ["6.1", "6.2", "7.1"]
    },
    {
      "wave": 6,
      "description": "CI Gate 驗證",
      "tasks": ["7.2"]
    },
    {
      "wave": 7,
      "description": "端到端演練",
      "tasks": ["8.1", "8.2", "8.3"]
    },
    {
      "wave": 8,
      "description": "回寫文件與擴充指南",
      "tasks": ["8.4", "9.1"]
    }
  ]
}
```

## Tasks

- [ ] 1. Phase 0：驗證前提假設
- [ ] 1.1 探測 gh CLI 版本能力
  - 執行 `gh --version` 記錄版本號
  - 執行 `gh auth status` 確認登入狀態，未登入則提示 `gh auth login`
  - 執行 `gh repo edit --help`，記錄是否支援 `--add-collaborator`
  - 執行 `gh issue develop --help`，確認 `--name` 與 `--checkout` 參數可用
  - 把結果寫進 `docs/gh-capability-notes.md`，後續 Power 白名單依此調整
  - _Requirements: 1.4_

- [ ] 1.2 確認 Kiro subagent 委派能力
  - 查閱 Kiro 文件或實測 Custom Agent 之間能否自動互相呼叫
  - 若不支援，在 `docs/gh-capability-notes.md` 註明「Producer 只產出 Contract 並提示人工切換」
  - 此結論直接影響 Task 5.x 的 Agent 設計
  - _Requirements: 6.5_

- [ ] 1.3 查明 security-review Action 的 secrets 需求
  - 讀 `anthropics/claude-code-security-review` 的 README，列出必要 secrets 名稱
  - 記錄到 `docs/gh-capability-notes.md`
  - _Requirements: 4.2_

- [ ] 2. Phase 1：建立紀律層 Steering Files
- [ ] 2.1 建立 coding-standards.md
  - 建立 `.kiro/steering/coding-standards.md`，frontmatter 設 `inclusion: always`
  - 定義命名規範：檔案、變數、函式、分支名稱（明訂分支名用 `-` 不用 `/`）
  - 定義目錄結構規範
  - 定義測試覆蓋率門檻
  - 納入 Constitution 約束：AWS region 限 us-east-1 / us-west-2、僅用合成資料、Bedrock < 1 RPS、最小權限
  - _Requirements: 3.1, 3.2_

- [ ] 2.2 建立 contracts.md
  - 建立 `.kiro/steering/contracts.md`，frontmatter 設 `inclusion: always`
  - 寫入 design.md 的 Task Contract YAML schema（id、title、issue、worktree、assigned_to、input、output、acceptance_criteria、review_gate、status）
  - 明訂 Contract 一律透過 `gh issue comment` 寫入 Issue，不留在對話中
  - 附一個填好的完整範例
  - _Requirements: 3.3, 3.4, 3.5_

- [ ] 2.3 驗證 Steering always 載入
  - 開新對話直接問「Contract 格式是什麼」，確認能不讀檔就答出
  - 對應 design.md Property 5
  - _Requirements: 3.1, 3.3_

- [ ] 3. Phase 2：建立 github-workflow Power
- [ ] 3.1 建立 POWER.md
  - 建立 `.kiro/powers/github-workflow/POWER.md`
  - 寫入 frontmatter：name、displayName、description、keywords、author
  - keywords 須含 github、gh、pull request、issue、分支、worktree、邀請協作者、合併、pr
  - 內文明訂：一律用 gh CLI 透過 shell 執行，不假設有 GitHub MCP tool
  - 內文明訂：建分支前先確認 Issue 存在，沒有就先 `gh issue create`
  - _Requirements: 1.1, 1.2, 1.5_

- [ ] 3.2 建立 gh-cli-commands.md 指令白名單
  - 建立 `.kiro/powers/github-workflow/steering/gh-cli-commands.md`
  - 依 design.md 的四層分組寫入：Repo 層、Issue 層、PR 層、API 層
  - 每個指令附帶參數說明與使用時機
  - 明列禁止指令：`gh auth token`、`gh repo delete`、任何 `--force`
  - 依 Task 1.1 的探測結果調整（例如 `--add-collaborator` 支不支援）
  - _Requirements: 1.4, 1.5_

- [ ] 3.3 驗證 Power 關鍵字觸發
  - 在對話中提及「幫我開個 PR」，確認 Power 被載入
  - 連續多次提及 GitHub 相關詞彙，確認內容不重複累積（design.md Property 4）
  - _Requirements: 1.3_

- [ ] 4. Phase 3：建立 Custom Agents（前段：需求與架構）
- [ ] 4.1 建立 requirement-sync.md
  - 建立 `.kiro/agents/requirement-sync.md`，採 design.md 的統一 Agent 結構
  - 禁止項明訂：不給架構、不推薦技術棧、不自行補假設
  - 行為約束：一次只問一個最有價值的問題
  - 輸出格式：需求藍圖（專案摘要、目標、功能/非功能需求、限制、假設、風險、驗收條件）
  - _Requirements: 2.1_

- [ ] 4.2 建立 architect.md
  - 建立 `.kiro/agents/architect.md`
  - 前置條件檢查：PRD 未完成則拒絕開始
  - 固定流程：Project Idea → Requirement Sync → Project Brief → PRD → Architecture
  - 每次回覆固定四段：目前理解 → 架構決策 → 風險/待決事項 → 下一個問題
  - 禁止項：不寫程式碼、不建 migration、不寫 CI/CD 設定
  - 最終輸出：Architecture Document，可用 Mermaid 圖
  - _Requirements: 2.2_

- [ ] 4.3 驗證前段 Agent 邊界
  - 對 requirement-sync 直接問「該用什麼資料庫」，確認它拒答並回到釐清需求
  - 對 architect 在無 PRD 狀態下要求設計，確認它先要求補 PRD
  - _Requirements: 2.1, 2.2_

- [ ] 5. Phase 3：建立 Custom Agents（後段：執行與把關）
- [ ] 5.1 建立 worktree-manager.md
  - 建立 `.kiro/agents/worktree-manager.md`
  - 職責：`gh issue create`（若 Issue 不存在）→ `gh issue develop --name --checkout` → `git worktree add`
  - 分支命名檢查：拒絕含 `/` 的分支名，改用 `-`
  - 清理流程：`git worktree remove` + `git branch -d`
  - 安全檢查：remove 前先跑 `git status --porcelain`，有未 commit 變更則拒絕
  - 禁止項：不修改任何程式碼
  - _Requirements: 2.3, 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 5.2 建立 security-reviewer.md
  - 建立 `.kiro/agents/security-reviewer.md`
  - 三步驟流程：讀 `git diff` 只看新增部分 → 平行驗證每個發現 → 只回報信心 >= 8/10
  - 五大類別鎖定：注入類、認證授權、加密與金鑰管理、反序列化、資料外洩
  - 輸出格式依 design.md 的 Security Finding schema（file:line、severity、category、description、exploit_scenario、remediation）
  - 審查完用 `gh pr comment <n> --body-file` 留言
  - _Requirements: 2.4_

- [ ] 5.3 建立 pr-writer.md
  - 建立 `.kiro/agents/pr-writer.md`
  - 流程：`git add -A` → `git status` 給人確認 → `git commit` → `gh pr create`
  - 明訂不自動 push、不自動 merge
  - PR 描述固定模板：做了什麼、為什麼、怎麼測、對應哪個 Issue / Task Contract
  - _Requirements: 2.5_

- [ ] 5.4 建立 Producer 交接流程說明
  - 依 Task 1.2 的結論決定寫法
  - 若不支援自動委派：在 contracts.md 補上「Producer 產出 Contract → `gh issue comment` 寫入 → 明確提示『請切換到 XX Agent』」的流程
  - 明訂禁止假裝已呼叫其他 Agent
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 6. Phase 4：GitHub Repo 初始化資產
- [ ] 6.1 建立 branch-protection.json 範本
  - 建立 `.github/branch-protection.json`
  - 內容依 design.md 的 Branch Protection schema
  - required_status_checks.contexts 設為 `["security-review"]`，須與 Task 7.1 的 job 名稱一致
  - required_approving_review_count 設 1
  - _Requirements: 4.4, 4.5_

- [ ] 6.2 撰寫初始化操作手冊
  - 建立 `docs/github-setup.md`
  - 記錄 Stage -1 完整指令：`gh auth login` → `gh repo create` → 分支保護 → 邀請成員
  - 邀請成員三種寫法：單一協作者、整個 Team、批次讀名單迴圈
  - 標註 `gh api` 為最穩定路徑，`gh repo edit --add-collaborator` 依 Task 1.1 結果決定是否列出
  - _Requirements: 4.4, 4.5_

- [ ] 7. Phase 5：CI 整合
- [ ] 7.1 建立 security-review workflow
  - 建立 `.github/workflows/security-review.yml`
  - 觸發條件：`pull_request` 的 opened、synchronize、reopened
  - permissions 設最小權限：`contents: read`、`pull-requests: write`
  - job 名稱設為 `security-review`，須與 branch-protection.json 的 contexts 一致
  - 步驟：`actions/checkout@v4`（fetch-depth: 0）→ `anthropics/claude-code-security-review`
  - secrets 依 Task 1.3 的結果填入
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 7.2 驗證 CI Gate 有效性
  - 開一個含明顯安全問題的測試 PR（例如硬編碼 API key）
  - 確認 Action 觸發、偵測到問題、並在 PR 留言
  - 確認 security-review 未通過時合併按鈕停用（design.md Property 7）
  - 測試完關閉 PR 並刪除測試分支
  - _Requirements: 4.1, 4.3, 4.6_

- [ ] 8. Phase 6：端到端流程演練
- [ ] 8.1 演練 Worktree 生命週期
  - 建一個測試 Issue → `gh issue develop` 建分支 → `git worktree add`
  - 在 worktree 中做一個小改動並 commit
  - 確認 PR 自動連結回 Issue（design.md Property 2）
  - 合併後執行清理，確認 `git worktree list` 不再列出（design.md Property 6）
  - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

- [ ] 8.2 驗證 Worktree 隔離性
  - 同時開兩個 worktree，各自修改同一個檔案
  - 確認互不干擾、main 不受影響（design.md Property 1）
  - _Requirements: 5.4_

- [ ] 8.3 演練 Contract 交接
  - Producer 產出一份 Contract 並用 `gh issue comment --body-file` 寫入 Issue
  - Specialist 完成後同樣用 comment 回報
  - 用 `gh issue view <n> --comments` 確認完整歷程可還原（design.md Property 3）
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 8.4 記錄卡點並回寫文件
  - 跑完 Stage -1 → Stage 6 全程，記錄每個卡住的地方
  - 把卡點與解法回寫到 `docs/github-setup.md`
  - 若發現指令白名單不足或 Agent 邊界有問題，回頭修對應檔案
  - _Requirements: 7.4_

- [ ] 9. Phase 7：漸進式擴充文件
- [ ] 9.1 撰寫三階段採用指南
  - 建立 `docs/adoption-roadmap.md`
  - Solo Dev：列出最小必要檔案清單（哪些可以先不建）
  - Small Team：加上 Review Gate 與 Organization Team 權限設定
  - Enterprise：跨團隊 Orchestrator、CI 自動建立/銷毀 worktree、稽核紀錄
  - 明確標示每階段「只需新增檔案，不需改現有設定」
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

## Notes

### 執行順序建議

Phase 1（紀律層）沒有外部依賴，可以跟 Phase 0 平行做。其餘階段建議照順序，因為 Phase 0 的結論會改變後續檔案內容。

### 需要人工介入的節點

| 任務 | 為什麼需要人工 |
|------|--------------|
| 1.1 | `gh auth login` 需互動輸入 |
| 6.2 | `gh repo create` 與邀請成員涉及真實 GitHub 資源 |
| 7.1 | GitHub Secrets 需在 repo settings 手動設定 |
| 7.2 | 分支保護設定可能需要 org admin 權限 |
| 8.x | 端到端演練需觀察實際行為並判斷是否符合預期 |

### 破壞性操作警告

- Task 7.2 會建立測試 PR，測完記得關閉並刪分支
- Task 8.1、8.2 會建立 worktree 與分支，演練完務必清理
- Task 6.2 的分支保護設定會影響整個 repo 的合併行為，建議先在測試 repo 上跑

### 與 realtime-qa-api spec 的關係

這份 spec 建立的是「怎麼協作開發」的基礎設施；`realtime-qa-api` spec 是「要開發什麼」。本 spec 完成後，realtime-qa-api 的實作任務就可以透過 Issue + Worktree + Contract 的流程分派下去。

### 驗證方式說明

產出物多為設定檔而非可執行程式，因此沒有傳統單元測試。驗證改以三種方式：frontmatter 結構檢查、Agent 行為邊界測試（故意問超出職責的問題看是否拒答）、端到端流程演練。詳見 design.md 的 Testing Strategy 與 Correctness Properties。
