# Requirements: GitHub Workflow Infrastructure

## Overview
建立 Kiro IDE × GitHub 共同開發工作流的基礎設施，全程使用 gh CLI 操作 GitHub（不接 GitHub MCP server），支援 Git Worktree 多 Agent 協同開發。

## Constraints (from Constitution)
- 所有 AWS 資源限 us-east-1 或 us-west-2
- 不得使用個人/敏感資料，僅限合成資料
- Bedrock 請求 < 1 RPS
- 遵循最小權限原則

## Functional Requirements

### FR-1: GitHub CLI Power（取代 GitHub MCP）
建立 `.kiro/powers/github-workflow/` 資料夾，包含：
- `POWER.md`：定義 power 的 frontmatter（name、keywords、description）與使用說明
- `steering/gh-cli-commands.md`：列出允許的 gh CLI 指令清單（issue create/develop/comment、pr create/comment/merge、api）

### FR-2: Custom Agents
建立 `.kiro/agents/` 下的 5 個 Agent 檔案：
- `requirement-sync.md`：需求釐清 Agent，一次只問一個問題，輸出需求藍圖
- `architect.md`：架構設計 Agent，前置條件 PRD 完成，輸出 Architecture Document
- `worktree-manager.md`：管理 git worktree + gh issue develop 的分支建立與清理
- `security-reviewer.md`：安全審查 Agent，三步驟邏輯（diff → 平行驗證 → 高信心報告）
- `pr-writer.md`：整理 commit、產生 PR 描述、呼叫 gh pr create

### FR-3: Steering Files
建立 `.kiro/steering/` 下的全域紀律檔案：
- `coding-standards.md`（inclusion: always）：命名規範、目錄結構、測試門檻
- `contracts.md`（inclusion: always）：Task Contract YAML 格式定義

### FR-4: GitHub Actions CI 整合
- 提供 `.github/workflows/security-review.yml`：PR 開啟時自動觸發安全審查
- 提供 `branch-protection.json`：required_status_checks 設定範本

### FR-5: Worktree 工作流腳本
- 提供 worktree 建立/清理的參考腳本或 Agent 指令範本
- 支援 `gh issue develop` → `git worktree add` → 開發 → `gh pr create` → merge → cleanup 完整生命週期

## Non-Functional Requirements

### NFR-1: 不引入常駐 MCP server process
所有 GitHub 操作一律走 gh CLI shell 指令，不在 `.kiro/settings/mcp.json` 加入 GitHub MCP。

### NFR-2: 跨專案可攜性
Power 和 Steering 檔案應以資料夾形式存在，可複製到其他專案使用。

### NFR-3: 漸進式採用
Solo Dev 可以只用 2-3 個 Agent + 手動 worktree；Small Team 加上 Review Gate；Enterprise 加上完整治理機制。整體設計不應強制全部啟用。

### NFR-4: 安全性
- PR 合併前必須通過 security-review status check
- Branch protection 設定範本預設要求至少 1 個 approving review

## Acceptance Criteria
- [ ] `.kiro/powers/github-workflow/POWER.md` 存在且 frontmatter 格式正確
- [ ] `.kiro/powers/github-workflow/steering/gh-cli-commands.md` 列出完整指令清單
- [ ] 5 個 Agent 檔案皆建立且各自有明確的角色定義與限制
- [ ] Steering files 有正確的 inclusion frontmatter
- [ ] `.github/workflows/security-review.yml` 可正確觸發
- [ ] 整體流程可從 Stage -1 跑到 Stage 6 不中斷
