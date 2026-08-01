# TASK-001 派工操作步驟

環境：gh 2.93.0，已登入 `linjinhsien`，repo `linjinhsien/Profit-Prophet`

## Step 1：確認協作者已加入

前端負責人需要有 push 權限才能推分支。

```powershell
# 檢查現有協作者
gh api repos/linjinhsien/Profit-Prophet/collaborators --jq '.[].login'

# 若不在名單中，邀請（把 FRONTEND_DEV 換成實際 GitHub username）
gh api --method PUT repos/linjinhsien/Profit-Prophet/collaborators/FRONTEND_DEV -f permission=push
```

## Step 2：建立 Issue

```powershell
gh issue create `
  --title "[前端] Care Companion UI 整合 Profit-Prophet API" `
  --body-file docs/task-specs/TASK-001-frontend.md `
  --label "unit-of-work,frontend" `
  --assignee FRONTEND_DEV
```

若 label 還不存在，先建：

```powershell
gh label create "unit-of-work" --description "可獨立分派的工作單元" --color "0E8A16"
gh label create "frontend" --description "前端相關" --color "1D76DB"
```

指令會回傳 Issue URL，記下 Issue 編號。

## Step 3：Contract 寫入 Issue comment

先把 `docs/contracts/TASK-001-frontend.yaml` 裡的 `issue: null` 改成實際編號，然後：

```powershell
# 把 <N> 換成 Step 2 拿到的 Issue 編號
gh issue comment <N> --body-file docs/contracts/TASK-001-frontend.yaml
```

這步是刻意的：Contract 進 Issue comment 而不是留在對話裡，之後 `gh issue view <N> --comments` 就能還原完整交接歷程。

## Step 4：建立 linked branch 與 worktree

這步由前端負責人在自己機器上執行：

```powershell
# 建立與 Issue 綁定的分支
gh issue develop <N> --name feature-frontend --checkout

# 切出獨立 worktree（回到主專案外層）
cd ..
git worktree add Profit-Prophet.worktrees/feature-frontend feature-frontend
cd Profit-Prophet.worktrees/feature-frontend
```

分支名用 `feature-frontend` 不用 `feature/frontend`——部分 gh 版本對含斜線的分支名有已知處理問題。

`gh issue develop` 建的分支會自動與 Issue 綁定，之後在此分支開的 PR 會自動連結回 Issue。

## Step 5：回報進度

前端負責人每完成一個子任務，在同一個 Issue 留言：

```powershell
gh issue comment <N> --body "T1 完成：frontend/ 骨架建立，npm run dev/build/lint 三個指令都通過。commit: abc1234"
```

Producer 端查看進度：

```powershell
gh issue view <N> --comments
```

## Step 6：完成後開 PR

```powershell
git add -A
git status          # 先確認要 commit 什麼
git commit -m "feat(frontend): Care Companion UI 整合 Profit-Prophet API"
git push -u origin feature-frontend

gh pr create `
  --title "feat(frontend): Care Companion UI 整合" `
  --body-file docs/pr-descriptions/TASK-001.md `
  --base master
```

## Step 7：清理

PR 合併後：

```powershell
gh pr merge <PR-N> --squash --delete-branch

cd ..
git worktree remove Profit-Prophet.worktrees/feature-frontend
git branch -d feature-frontend
```

`git worktree remove` 前確認沒有未 commit 的變更，否則會丟工作成果。可先跑 `git status --porcelain` 確認輸出為空。

---

## 派工前需先決定的事

Contract 裡標了三個 blocking decisions，其中第一個會直接影響 T2 的實作方式：

### API key 要怎麼處理

`realtime-qa-api` 的設計是 API Gateway API key 認證。但 Vite 的 `VITE_*` 變數會被打包進瀏覽器 bundle，等於把金鑰公開。

兩條路：

| 做法 | 適用情境 | 代價 |
|------|---------|------|
| key 放 `.env.local`，只跑本機 | Hackathon demo | 不能部署到公開網址 |
| 前面加一層 BFF 代持 key | 需要部署 | 多一個後端元件要建與部署 |

建議 Hackathon 階段走第一條，但要在 README 明確標註「此設定不可部署」，避免之後有人直接推上去。

### 後端什麼時候會好

若後端還沒部署，T2 需要先做 mock 模式讓前端能獨立開發。這會多花時間，但比等後端划算——而且 mock 模式對之後的離線 demo 也有用。

### care-companion-demo 的程式碼能不能直接用

repo 沒有 LICENSE 檔案。沒有明示授權的情況下，預設是保留所有權利，直接複製程式碼有風險。

保守做法：只參考結構與設計決策，程式碼自己寫。或者直接問 repo 作者（同隊的話這步很快）。
