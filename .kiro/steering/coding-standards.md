---
inclusion: always
description: "命名規範、目錄結構、測試門檻 — 每次對話都載入"
---

# Coding Standards

## 命名規範

### 檔案與目錄

| 類型 | 規範 | 範例 |
|------|------|------|
| Python 模組 | snake_case | `transcribe_service.py` |
| TypeScript (CDK) | kebab-case | `api-gateway-stack.ts` |
| 測試檔案 | `test_` 前綴 | `test_transcribe_handler.py` |
| 設定檔 | kebab-case | `branch-protection.json` |
| 文件 | kebab-case | `architecture-decision.md` |

### 程式碼

| 類型 | Python | TypeScript |
|------|--------|------------|
| 變數/函式 | `snake_case` | `camelCase` |
| 類別 | `PascalCase` | `PascalCase` |
| 常數 | `UPPER_SNAKE` | `UPPER_SNAKE` |
| 私有成員 | `_leading_underscore` | `#private` or `_prefix` |

### 分支命名

- 格式：`<type>-<short-description>`
- type: `feature`, `fix`, `refactor`, `docs`, `test`
- 用 `-` 分隔，**禁止用 `/`**
- 範例：`feature-transcribe-handler`, `fix-timeout-bug`

## 目錄結構

```
profit-prophet/
├── src/
│   ├── handlers/         # Lambda handler 入口
│   ├── services/         # 業務邏輯
│   ├── models/           # 資料模型 (Pydantic)
│   ├── utils/            # 共用工具
│   └── config/           # 設定與常數
├── cdk/
│   ├── lib/              # CDK Stack 定義
│   └── bin/              # CDK App 入口
├── tests/
│   ├── unit/             # 單元測試
│   ├── integration/      # 整合測試
│   └── fixtures/         # 測試資料
├── docs/
│   ├── architecture.md
│   ├── adr/              # Architecture Decision Records
│   ├── api/              # API 規格
│   ├── requirements/     # 需求文件
│   ├── runbooks/         # 部署/操作手冊
│   └── compliance/       # 合規文件
├── .kiro/
│   ├── agents/           # Custom Agents
│   ├── powers/           # Powers (keyword-triggered)
│   ├── steering/         # Steering Files
│   └── specs/            # Feature Specs
└── .github/
    └── workflows/        # CI/CD
```

## 測試門檻

| 指標 | 門檻 | 工具 |
|------|------|------|
| 單元測試覆蓋率 | ≥ 80% | pytest-cov |
| Lint | 零錯誤 | ruff |
| 型別檢查 | 零錯誤 | mypy (strict) |
| 安全掃描 | 無 critical/high | pip-audit, bandit |
| CDK lint | 零錯誤 | eslint |

## Python 規範

- Python 3.11
- Type hints on all function signatures
- Docstring on all public functions (Google style)
- 格式化：ruff format
- Import 排序：ruff (isort compatible)
- 最大行長：120 字元

## TypeScript 規範 (CDK)

- 嚴格模式 (`strict: true`)
- 用 interface 不用 type alias（除非需要 union）
- CDK construct 命名：`PascalCase` + `Stack` / `Construct` 後綴

## Commit Message 格式

```
[<scope>] <描述>

<可選的詳細說明>
```

scope 選項：
- `feat` — 新功能
- `fix` — bug 修復
- `refactor` — 重構
- `docs` — 文件
- `test` — 測試
- `ci` — CI/CD
- `chore` — 雜務

範例：`[feat] Add transcribe Lambda handler`

## Constitution 約束

以下限制來自專案 Constitution，不可違反：
- AWS region 限 `us-east-1` 或 `us-west-2`
- 僅限合成資料（不使用個人/敏感資料）
- Bedrock 請求 < 1 RPS（開發環境）
- 遵循最小權限原則
- 所有 API 端點需認證
