---
name: "github-workflow"
displayName: "GitHub CLI Workflow"
description: "透過 gh CLI 操作 GitHub，不依賴 GitHub MCP server"
keywords: ["github", "gh", "pull request", "issue", "分支", "worktree", "邀請協作者", "合併", "pr", "branch", "merge"]
author: "profit-prophet-team"
---

# GitHub Workflow Power

## 核心原則

1. **一律用 gh CLI** — 透過 shell 執行，不假設有 GitHub MCP tool
2. **Issue-first** — 建分支前先確認 Issue 存在，沒有就先 `gh issue create`
3. **最小權限** — 只使用白名單內的指令，禁止破壞性操作
4. **可追溯** — 所有任務交接透過 Issue comment，確保歷史紀錄完整

## 使用時機

當對話中出現以下 keywords 時，本 Power 會被動態載入：
- GitHub 操作相關：github, gh, pull request, pr, issue, merge
- 分支管理相關：分支, worktree, branch
- 協作相關：邀請協作者, review

## 載入內容

本 Power 載入時會一併帶入：
- `steering/gh-cli-commands.md` — gh CLI 指令白名單（允許與禁止清單）

## 前置確認

在執行任何 gh 指令前：
1. 確認已登入：`gh auth status`
2. 確認在 git repo 中：`git rev-parse --is-inside-work-tree`
3. 若未登入，停止並提示：「請先執行 `gh auth login`」

## 安全紅線

- ❌ `gh auth token` — 避免憑證洩漏到 context
- ❌ `gh repo delete` — 不可逆操作
- ❌ 任何 `--force` / `-f` 的破壞性操作
- ❌ `git push --force` — 禁止強制推送
- ❌ `git reset --hard` — 禁止硬重置
