---
inclusion: always
description: "Task Contract schema — Producer/Specialist 任務交接格式"
---

# Task Contract

## 用途

Producer 與 Specialist 之間的任務交接格式。Contract 一律透過 `gh issue comment` 寫入 Issue，確保有完整歷史紀錄。

## Schema

```yaml
task:
  id: string              # TASK-NNN (流水號)
  title: string           # 任務標題
  issue: number           # GitHub Issue number
  worktree: string        # worktree 目錄名（= 分支名）
  assigned_to: string     # agent 名稱 或 team 成員
  input:
    spec: string          # 規格檔路徑
    depends_on: [string]  # 前置 TASK-NNN 清單
  output:
    code: [string]        # 預期產出的程式碼路徑
    tests: [string]       # 預期產出的測試路徑
  acceptance_criteria:
    - string              # 可驗證的驗收條件
  review_gate: enum       # none | security_review | full_review
  status: enum            # pending | in_progress | review | done
```

## 完整範例

```yaml
task:
  id: TASK-001
  title: "實作語音轉文字 Lambda handler"
  issue: 12
  worktree: "feature-transcribe-handler"
  assigned_to: "backend-specialist"
  input:
    spec: "docs/api/transcribe-endpoint.md"
    depends_on: []
  output:
    code:
      - "src/handlers/transcribe.py"
      - "src/services/transcribe_service.py"
    tests:
      - "tests/unit/test_transcribe_handler.py"
  acceptance_criteria:
    - "接受 audio/wav 和 audio/mp3 格式"
    - "回傳 JSON 含 transcript 和 confidence 欄位"
    - "超時 30 秒自動取消並回傳 408"
    - "單元測試覆蓋率 >= 80%"
  review_gate: security_review
  status: pending
```

## 使用流程

```
Producer 建立 Contract
    ↓
gh issue comment <issue> --body-file contract.yaml
    ↓
Specialist 領取任務（status: in_progress）
    ↓
Specialist 完成開發
    ↓
gh issue comment <issue> --body-file completion-report.yaml
    ↓
Producer 確認（status: done）
```

## Completion Report（完成回報）

Specialist 完成後用以下格式回報：

```yaml
completion:
  task_id: TASK-001
  status: done
  output_actual:
    code:
      - "src/handlers/transcribe.py"
      - "src/services/transcribe_service.py"
    tests:
      - "tests/unit/test_transcribe_handler.py"
  acceptance_results:
    - criterion: "接受 audio/wav 和 audio/mp3 格式"
      result: PASS
    - criterion: "回傳 JSON 含 transcript 和 confidence 欄位"
      result: PASS
    - criterion: "超時 30 秒自動取消並回傳 408"
      result: PASS
    - criterion: "單元測試覆蓋率 >= 80%"
      result: "PASS (87%)"
  notes: "額外加了 retry logic for transient Transcribe errors"
  commit: "abc1234"
```

## 規則

1. Contract 一律寫入 Issue comment，不留在對話 context 中
2. 一個 Issue 對應一個 Task Contract
3. Specialist 不得修改 Contract 的 acceptance_criteria（有疑義回報給 Producer）
4. status 變更必須透過 Issue comment 更新，確保可追溯
5. 禁止假裝已呼叫其他 Agent — 不確定能自動委派就明確說「請切換到 XX Agent」
