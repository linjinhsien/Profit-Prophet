---
description: "gh CLI 指令白名單 — 隨 github-workflow Power 載入"
---

# gh CLI 指令白名單

## Repo 層級

```bash
# 建立私有 repo 並 clone
gh repo create <owner>/<name> --private --clone

# Clone 現有 repo
gh repo clone <owner>/<name>

# 版本能力探測（確認支援哪些子命令）
gh repo edit --help
```

## Issue 層級

```bash
# 建立 Issue（帶標籤與指派）
gh issue create --title "<title>" --body "<body>" --label "<label>" --assignee "<user>"

# 從 Issue 建立 linked branch 並 checkout
gh issue develop <issue-number> --name <branch-name> --checkout

# 在 Issue 留言（用檔案避免 shell 跳脫問題）
gh issue comment <issue-number> --body-file <file>

# 檢視 Issue 與所有 comments
gh issue view <issue-number> --comments
```

## PR 層級

```bash
# 建立 PR（body 用檔案）
gh pr create --title "<title>" --body-file <file> --base main

# 在 PR 留言
gh pr comment <pr-number> --body-file <file>

# Squash 合併並刪除分支
gh pr merge <pr-number> --squash --delete-branch

# 檢視 PR 狀態（CI check 結果）
gh pr view <pr-number> --json statusCheckRollup
```

## API 層級（底層保證可用）

```bash
# 邀請協作者
gh api --method PUT repos/{owner}/{repo}/collaborators/{username}

# 設定 Team 權限
gh api --method PUT orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}

# 設定分支保護
gh api --method PUT repos/{owner}/{repo}/branches/main/protection \
  --input branch-protection.json
```

## 輔助指令

```bash
# 確認登入狀態
gh auth status

# 查看 gh 版本
gh --version
```

---

## ❌ 禁止指令

| 指令 | 原因 |
|------|------|
| `gh auth token` | 避免憑證洩漏到 AI context |
| `gh repo delete` | 不可逆，禁止 |
| `gh pr merge --admin` | 繞過保護規則 |
| 任何含 `--force` / `-f` 的操作 | 破壞性，資料遺失風險 |
| `git push --force` | 可能覆蓋他人工作 |
| `git reset --hard` | 本地資料遺失 |
| `git clean -f` | 刪除未追蹤檔案 |

---

## 使用注意事項

1. **分支命名**：避免使用 `/` 字元（部分 gh 版本有 bug），一律用 `-` 分隔
2. **body-file**：較長內容（PR 描述、Contract）一律寫入暫存檔再用 `--body-file`，避免 shell 跳脫問題
3. **錯誤處理**：每個 gh 指令執行後檢查 exit code，非 0 則停止並回報
4. **冪等性**：建立前先檢查是否已存在（`gh issue view`、`git branch --list`）
