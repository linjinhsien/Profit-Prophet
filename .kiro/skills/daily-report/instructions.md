---
description: "Generate a structured daily progress report from Git history and project state"
---

# Daily Report — Execution Instructions

When triggered, follow these steps to generate the daily report:

## Step 1: Collect Git Data

Run the following commands to gather today's activity:

```bash
# Today's commits (all branches)
git log --all --since="midnight" --format="%h %s (%an)" --no-merges

# File change statistics
git log --all --since="midnight" --stat --no-merges

# Current branch
git branch --show-current

# All active branches
git branch -a
```

## Step 2: Check Project State

- Read `.kiro/specs/` directories to identify active specs and their task status
- Read `docs/contracts/` for Task Contract statuses (pending, in_progress, review, done)
- Check for any open GitHub Issues if `gh` CLI is available:
  ```bash
  gh issue list --state open --limit 10
  ```

## Step 3: Generate Report

Produce the report in the following format:

```markdown
---
date: YYYY-MM-DD
branch: <current-branch>
author: <git user.name>
---

# 📅 今日進度 (Done)

- [`<hash>`] <commit message>
- [`<hash>`] <commit message>

**變更統計**: N files changed, +X insertions, -Y deletions

# 🚧 進行中 (Doing)

- <task description> — <進度 or 分支狀態>

# 🛑 遇到困難 (Blockers)

- <blocker description>（若無則寫「無」）

# ⏭️ 明日計畫 (Next Steps)

- <next priority item>
```

## Step 4: Output

- Display the report in the chat response
- If the user specifies `--output` or requests file output, write to `reports/daily-YYYY-MM-DD.md`

## Rules

1. Only include commits from today (since midnight local time)
2. Group commits by branch if multiple branches have activity
3. Use the commit hash short form (7 chars)
4. If no commits today, state 「今日無 commit 紀錄」
5. Blockers section: if none identified, write 「無」
6. Keep the report concise — summarize related commits into logical groups when > 10 commits
