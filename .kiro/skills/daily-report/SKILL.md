---
name: daily-report
description: >
  進度日報總結生成器。用於總結當日工作進度、Git commit 紀錄與檔案變更狀況，
  並產生結構化的 Markdown 報告。當用戶輸入「日報」、「進度總結」或「生成今日日報」時觸發。
metadata:
  author: Profit-Prophet Team
  version: 1.0.0
---

# Daily Report Generator

生成結構化的每日進度報告，包含 Git commit 紀錄、檔案變更與任務狀態。

## 觸發關鍵字

- 日報
- 進度總結
- 生成今日日報
- daily report
- today's progress

## 報告結構

報告產出遵循以下 Markdown 結構：

```markdown
# 📅 今日進度 (Done)
- 列出今日已完成的主要任務與 Git commit hash（例如 `[a1b2c3d] 實作功能`）

# 🚧 進行中 (Doing)
- 列出進行中任務與進度百分比

# 🛑 遇到困難 (Blockers)
- 記錄阻礙或需要協助事項（若無標註「無」）

# ⏭️ 明日計畫 (Next Steps)
- 列出明日優先事項
```

## 使用方式

1. 在對話中輸入觸發關鍵字
2. Skill 自動收集當日 Git log、diff stats、分支狀態
3. 產出結構化 Markdown 報告

## 資料來源

| 來源 | 用途 |
|------|------|
| `git log --since="midnight"` | 取得今日 commit 紀錄 |
| `git diff --stat HEAD~N` | 檔案變更統計 |
| `git branch -a` | 目前分支與工作狀態 |
| `.kiro/specs/` | 進行中的 spec 任務狀態 |
| `docs/contracts/` | Task Contract 狀態 |

## Speckit Workflow 整合

在 `.specify/workflows/speckit/workflow.yml` 中可添加以下步驟：

```yaml
- id: daily-report
  command: speckit.daily-report
  integration: "{{ inputs.integration }}"
  input:
    args: "--date today --output reports/daily-{{ date }}.md"
```

## 輸出位置

報告預設輸出至 `reports/daily-YYYY-MM-DD.md`。
