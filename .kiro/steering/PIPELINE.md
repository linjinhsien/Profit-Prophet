---
inclusion: always
description: Delivery pipeline overview — always active to provide stage awareness
---

# Delivery Pipeline — Role-Based Agent Workflow

## Pipeline Overview

整合兩層：**品質管理框架**（6 Stage Gate）+ **GitHub 操作流程**（Stage -1 ~ 6）

```
┌─ 品質框架 ──────────────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│  Stage 1       Stage 2              Stage 3       Stage 4       Stage 5       Stage 6    │
│  PM        ──→ Architect + Dev  ──→ QA        ──→ CloudOps ──→ Review    ──→ Audit       │
│  (plan)        (design+build)       (test)        (deploy)     (gate)        (compliance)│
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌─ GitHub 操作流程 ──────────────────────────────────────────────────────────────────────────┐
│                                                                                            │
│  Stage -1      Stage 0        Stage 0.5      Stage 1       Stage 2/3     Stage 4          │
│  GitHub     ──→ 需求釐清   ──→ 架構設計   ──→ Issue +   ──→ 多 Agent ──→ 安全審查         │
│  初始化        requirement     architect      Worktree      協作開發      security-        │
│                -sync                          worktree-                    reviewer         │
│                                               manager                                     │
│                                                                 ↓                         │
│  Stage 6      Stage 5                                                                     │
│  Review    ←── PR 整理                                                                    │
│  + 合併        pr-writer                                                                  │
│                                                                                           │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

## Quality Gate Stages (品質框架)

| Stage | Role(s) | Gate Criteria | Reject Target |
|---|---|---|---|
| 1. Plan | PM | Requirements + acceptance criteria complete | — |
| 2. Design + Build | Architect + Full-stack-dev | Architecture doc + working code + unit tests | — |
| 3. Test | QA | All tests pass, no critical bugs, security OK | → Stage 2 (Dev) |
| 4. Deploy | CloudOps | Stack deployed, health checks pass, monitoring live | → Stage 2 or 3 |
| 5. Review | Architect + QA + PM | Architecture compliance, test coverage, requirements met | → Stage 2, 3, or 4 |
| 6. Audit | Compliance-auditor | All compliance controls pass | → Responsible role |

## GitHub Workflow Stages (操作流程)

| Stage | Agent | 做什麼 |
|---|---|---|
| -1 | (人工) | `gh repo create`, branch protection, 邀請協作者 |
| 0 | `requirement-sync` | 需求釐清 → 需求藍圖 |
| 0.5 | `architect` | 架構設計 → Architecture Document |
| 1 | `worktree-manager` | `gh issue create` → `gh issue develop` → `git worktree add` |
| 2/3 | (開發者/Agent) | 在 worktree 中開發，Contract 寫入 Issue comment |
| 4 | `security-reviewer` | `git diff` 安全審查 → `gh pr comment` 回報 |
| 5 | `pr-writer` | 整理 commit → `gh pr create` |
| 6 | (人工) | Code Review → `gh pr merge` |

## Available Roles

### Steering Roles (use `#agent.XX` to activate)

| Steering File | Role | Pipeline Stages |
|---|---|---|
| `#agent.PM` | Project Manager | Quality Stage 1, 5 |
| `#agent.Architect` | Architect | Quality Stage 2, 5 |
| `#agent.Full-stack-dev` | Full-Stack Developer | Quality Stage 2 |
| `#agent.QA` | QA Engineer | Quality Stage 3, 5 |
| `#agent.CloudOps` | CloudOps Engineer | Quality Stage 4 |
| `#agent.Compliance-auditor` | Compliance Auditor | Quality Stage 6 |

### Custom Agents (switch via Agent Selector)

| Agent | GitHub Stage | 職責 |
|---|---|---|
| `requirement-sync` | Stage 0 | 需求釐清，一次一問 |
| `architect` | Stage 0.5 | 架構設計，PRD → Arch Doc |
| `worktree-manager` | Stage 1 | Issue/Branch/Worktree 生命週期 |
| `security-reviewer` | Stage 4 | Diff-based 安全審查 |
| `pr-writer` | Stage 5 | PR 描述產生 + gh pr create |

### Power (keyword-triggered)

| Power | Keywords | 載入內容 |
|---|---|---|
| `github-workflow` | github, gh, pr, issue, worktree, 分支, 合併 | gh CLI 指令白名單 |

## Project Context: Profit-Prophet

AI 驅動的照護人員智慧助理系統：
- **Runtime**: Python 3.11 (AWS Lambda)
- **Infrastructure**: AWS CDK (TypeScript)
- **AI Services**: Amazon Bedrock (Claude 3 Sonnet), Comprehend, Transcribe, Polly
- **Data**: DynamoDB, OpenSearch Serverless (向量搜尋)
- **API**: API Gateway (REST + WebSocket)
- **Monitoring**: CloudWatch, SNS

## Handoff Protocol

Each stage handoff requires:
1. Output artifacts committed to workspace branch
2. Handoff checklist completed (defined in each role file)
3. Next-stage role activated and briefed on inputs
4. Task Contract 透過 `gh issue comment` 寫入 Issue（可追溯）

## How to Use

1. This pipeline file is always loaded — you always have stage awareness
2. **品質框架**：用 `#agent.PM` 等切換 Steering role
3. **GitHub 操作**：切換到 Custom Agent（requirement-sync, architect, worktree-manager 等）
4. **Power**：提及 GitHub 相關詞彙時自動載入 gh CLI 知識
5. Follow the handoff criteria before switching to the next stage
6. If a gate rejects, go back to the indicated stage and fix
