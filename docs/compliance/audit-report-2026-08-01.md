# Compliance Audit Report — 2026-08-01

| 項目 | 內容 |
| --- | --- |
| Pipeline Stage | Stage 6 — Audit |
| Scope | 全 repo 靜態掃描（`.git`、`node_modules`、`dist` 除外） |
| Commit | `32d76ca` |
| Branch | `master` |
| 依據 | `.kiro/steering/SECURITY-RULES.md`、`coding-standards.md`、`.specify/memory/constitution.md` |
| 裁決 | **NO-GO**（生產部署）／ PoC-Demo 條件式可接受，見 risk-register.md |

## 執行的驗證

| 檢查 | 指令／方法 | 結果 |
| --- | --- | --- |
| Secrets 掃描 | regex：`accessKeyId`/`secretAccessKey`/`AKIA[0-9A-Z]{16}`/`password=`/`Bearer` | 無真實憑證 |
| Region 合規 | regex：非 `us-east-1`/`us-west-2` 的區域字串 | **失敗**，見 A-2 |
| PII log 洩漏 | regex：`console.*`/`print(`/`logger.*` 全數人工判讀 | 通過 |
| 依賴鎖版 | `frontend/package.json`、`LiveCaption/backend/requirements.txt` | 通過 |
| 依賴漏洞 | `npm audit --audit-level=high` | 0 vulnerabilities |
| Lint | `npm run lint`（eslint） | 零錯誤 |
| 型別 | `npx tsc -b --noEmit` | 零錯誤 |
| 版控衛生 | `git ls-files` 比對 `.gitignore` 覆蓋範圍 | **失敗**，見 A-3、A-4 |
| Python 品質門檻 | 尋找 `pyproject.toml`/ruff/mypy/pytest 設定 | **無法量測**，見 B-1 |

未驗證項目（靜態掃描做不到，需 Stage 4 環境）：IAM policy 實際內容、DynamoDB／S3 加密設定、CloudWatch 保留策略、Bedrock guardrails、branch protection 實際狀態、部署後健康檢查。

---

## A. Security Compliance — FAIL

| # | 檢查項 | 判定 | 說明 |
| --- | --- | --- | --- |
| A-1 | No hardcoded secrets | PASS | `examples/verify_elevenlabs.py` 的 `api_key="k"` 為測試替身；正式路徑走 `os.environ["ELEVENLABS_API_KEY"]`（`app/services/elevenlabs_stt.py:137`） |
| A-2 | Region 限制 | **FAIL (S1)** | 見下方 F-01 |
| A-3 | API 端點認證 | **FAIL (S1)** | 見下方 F-02 |
| A-4 | Secrets 不進版控 | **FAIL (S2)** | 見下方 F-03 |
| A-5 | 版控衛生 | **FAIL (S3)** | 見下方 F-04 |
| A-6 | 傳輸加密 | PASS | AWS SDK 全走 HTTPS／WSS；前端無自訂 endpoint override |
| A-7 | 依賴無已知 CVE | PASS | `npm audit` 0 筆；Python 端未跑 `pip-audit`（工具未設定，見 B-1） |
| A-8 | 依賴鎖版 | PASS | 前端 22 個依賴全為精確版本，無 `^`／`~`；Python 全 `==` |
| A-9 | 敏感值走 Secrets Manager | **FAIL (S3)** | 見下方 F-05 |
| A-10 | IAM 最小權限 | **NOT VERIFIABLE** | repo 無 IaC，policy 不在版控內 |

### F-01 — Region 違反 Constitution（S1）

Constitution 與 SECURITY-RULES 7 限定 `us-east-1` / `us-west-2`。後端預設東京：

- `LiveCaption/backend/app/config.py:202` — `_env("AWS_REGION", "ap-northeast-1")`
- `LiveCaption/backend/app/services/transcribe.py:173` — `region: str = "ap-northeast-1"`
- `LiveCaption/backend/examples/verify_interface.py:38` — endpoint 硬寫東京
- `LiveCaption/backend/README.md` — 明文建議「正式部署用 `ap-northeast-1`」，與 Constitution 直接衝突

技術成因：Transcribe Streaming 在台北區（`ap-east-2`）不提供服務，開發者選了延遲最低的東京。這是真實的架構取捨，需由 Architect 裁決（改用 us-west-2 吃延遲，或走 Constitution 例外程序）。

責任角色：Architect (Stage 2) 裁決 → Full-stack-dev (Stage 2) 實作

### F-02 — WebSocket 端點無認證，且區域可由呼叫端覆寫（S1）

`LiveCaption/backend/app/main.py` 的 `/ws/captions`：

1. 無任何身分驗證。`main.py` docstring 已自行載明「任何能連到這個埠的人都能用你的 AWS 額度」。
2. `region` 是 client 可控 query param（`main.py:105`），經 `_build_config()` 直接 `replace(config, region=region)`（`main.py:86-87`），未做白名單過濾。呼叫端可指定任意區域，F-01 的區域限制形同無效。
3. 無連線數限制、無 rate limiting。SECURITY-RULES 「Bedrock < 1 RPS（開發）」與 AI 端點 rate limiting 均無強制機制。

前端相對合規：`frontend/src/lib/config.ts` 對 region 做了型別（`AwsRegion` union）＋執行期（`isAwsRegion()`）雙重白名單。同一套約束沒有套用到後端。

責任角色：Full-stack-dev (Stage 2)

### F-03 — 缺 root `.gitignore`（S2）

僅有 `frontend/.gitignore`，作用範圍不含 `LiveCaption/`、`scripts/`、repo 根目錄。SECURITY-RULES 1 要求 `.env`、`*.pem`、`*.key` 納入忽略。

`app/main.py:41` 啟動時 `load_dotenv()` 會讀 `LiveCaption/backend/.env`（存放 `AWS_PROFILE`、`AWS_REGION`、`ELEVENLABS_API_KEY`）。該檔一旦建立即為可 commit 狀態。

現況為潛在風險而非已發生洩漏：`git ls-files` 確認僅追蹤 `frontend/.env.example`；工作目錄掃描亦無 `.env`／`*.pem`／`*.key` 實體檔案。

責任角色：Full-stack-dev (Stage 2)

### F-04 — `__pycache__` 進版控（S3）

10 個 `.pyc` 被 git 追蹤（`app/`、`app/audio/`、`app/services/`、`examples/` 各層）。F-03 的直接後果。

責任角色：Full-stack-dev (Stage 2)

### F-05 — 第三方金鑰未走 Secrets Manager（S3）

`ELEVENLABS_API_KEY` 以環境變數提供（`app/services/elevenlabs_stt.py:137`）。SECURITY-RULES 1 要求敏感值走 Secrets Manager／SSM。本機開發可接受，上生產前須遷移。

附帶架構議題：ElevenLabs Scribe 不在 `docs/architecture.md` 的技術棧內（該文件列 Amazon Transcribe）。照護語音送往 AWS 邊界外的第三方，屬 Section 8「照護／患者互動資料視為敏感」的範疇，需 Architect 補 ADR 或移除。

責任角色：Architect (Stage 2)

---

## B. Data Protection — CONDITIONAL PASS

| # | 檢查項 | 判定 | 說明 |
| --- | --- | --- | --- |
| B-1 | PII/PHI 處理 | PASS | 前端對話記錄額外加密層：AES-GCM 256 + PBKDF2-SHA256 310,000 迭代，每筆隨機 salt(16B)/IV(12B)（`frontend/src/lib/conversationCrypto.ts`）。通關碼僅存記憶體，最短 12 字元，不落地不上傳 |
| B-2 | Log redaction | PASS | 全部 `logger.*` 與 `console.*` 人工判讀：只輸出 region／language／request_id／session_id／統計數字，無逐字稿或個資 |
| B-3 | 測試不用真實個資 | PASS | `samples/*.wav` 為 macOS `say` 合成音；`ElderManagementPage.tsx:150` 提示「建議使用合成代號」；`ChatPage.tsx` 有合成資料確認 gate 才寫入 |
| B-4 | 未登入不得取得憑證 | PASS | `credentials.ts` 的 `AuthenticationRequiredError` 阻擋未驗證身分；`fromCognitoIdentityPool` 必帶 `logins` |
| B-5 | 資料分區隔離 | PASS | 以 `getCognitoIdentityId()` 作 partition key，對齊 IAM `LeadingKeys` 條件 |
| B-6 | Audit logging | **FAIL (S2)** | 無資料存取稽核日誌。無後端層，DynamoDB 直連，僅能靠 CloudTrail data event（未確認是否開啟） |
| B-7 | 保留策略 | **FAIL (S3)** | 未實作 |
| B-8 | 刪除能力（30 天內） | **FAIL (S3)** | 無刪除路徑。`frontend/src/api/conversations.ts` 只有寫入與讀取 |
| B-9 | 靜態加密 | **NOT VERIFIABLE** | DynamoDB／S3 Vectors 設定不在版控內 |

---

## C. AI/ML Compliance — CONDITIONAL PASS

| # | 檢查項 | 判定 | 說明 |
| --- | --- | --- | --- |
| C-1 | 免責聲明標記 | **PARTIAL (S3)** | `ChatPage.tsx:218`「請依專業照護流程確認，不可作為單一決策依據。」、`PersonaSelectionPage.tsx:17` 全域警示。但 `CaregiverDashboardPage.tsx:141` 直接渲染 `record.answer` 無任何標記 → spec SC-006「100% 的 AI 回覆帶有免責聲明標記」未達成 |
| C-2 | 信心分數 | PASS | `CareEventBadge` 顯示 `confidence`；未分類時提供 `CategoryCandidates` 供人工覆核 |
| C-3 | 模型失敗降級 | PASS | 結構化輸出失敗有 `usedStructuredOutputFallback` 標示（`ChatPage.tsx:222`）；語音合成失敗降級純文字（`ChatPage.tsx:122`）；後端 AWS 不可用時退回 `MockStreamingRecognizer` |
| C-4 | 不以生產個資訓練 | PASS | 無訓練流程，僅 Bedrock KB 檢索 |
| C-5 | Bedrock guardrails | **NOT VERIFIABLE** | 設定不在版控內；`api/bedrock.ts` 未帶 guardrail 參數 |
| C-6 | AI 端點 rate limiting | **FAIL (S2)** | 無後端層即無法限流。`README.md:44` 已自行載明「無法做 rate limiting 或伺服器端輸入驗證」，Bedrock 成本濫用風險已知 |

---

## D. Operational Compliance — FAIL

| # | 檢查項 | 判定 | 說明 |
| --- | --- | --- | --- |
| D-1 | CI 品質門檻 | **FAIL (S2)** | 無 `.github/workflows/`。SECURITY-RULES 6 的四道門（單元測試 ≥80%、lint、安全掃描、1 approval）零強制執行 |
| D-2 | Python 測試與工具鏈 | **FAIL (S2)** | 見下方 F-06 |
| D-3 | 前端測試 | **FAIL (S2)** | 見下方 F-07 |
| D-4 | 前端 lint／型別 | PASS | `eslint .` 與 `tsc -b` 皆零錯誤 |
| D-5 | 監控告警 | **NOT VERIFIABLE** | 無 IaC |
| D-6 | Rollback 程序 | **FAIL (S3)** | 無 `docs/runbooks/` |
| D-7 | 事件應變計畫 | **FAIL (S3)** | 未撰寫 |
| D-8 | 部署稽核軌跡 | **PARTIAL (S3)** | Git 歷史存在但無 CloudFormation／CDK 記錄 |
| D-9 | 分支與 commit 規範 | **FAIL (S3)** | 見下方 F-08 |
| D-10 | 目錄結構 | **FAIL (S3)** | 見下方 F-09 |

### F-06 — Python 品質門檻全部無法量測（S2）

repo 內無 `pyproject.toml`、`setup.cfg`、ruff／mypy／pytest 設定，亦無任何 `tests/` 目錄。

`LiveCaption/backend/examples/verify_*.py`（5 個檔）是手寫斷言腳本，非 pytest。無法產生覆蓋率數字，coding-standards 要求的 ≥80% 覆蓋率、ruff 零錯誤、mypy strict 零錯誤、pip-audit／bandit 無 critical/high，一項都無法驗證。

責任角色：QA (Stage 3)

### F-07 — 前端測試無法執行（S2）

`frontend/src/App.test.tsx` 與 `frontend/src/test/setupTests.ts` 存在，但：

- `package.json` 無 `test` script
- `package.json` 未宣告 `vitest`、`@testing-library/*`、`jsdom`（`node_modules/` 內存在 `@vitest/*` 與 `@testing-library/`，屬未宣告的幽靈依賴；頂層 `vitest` 套件實際不存在）
- `vite.config.ts` 無 `test` 設定區塊

責任角色：QA (Stage 3)

### F-08 — 分支、主幹、commit 命名不符規範（S3）

| 項目 | 現況 | 規範 |
| --- | --- | --- |
| 分支 | `001-create-role-setup`、`002-github-workflow-infrastructure`、`003-multi-role-pipeline`、`004-voice-chat-care-record`、`LiveCaption`、`cynthia` | `<type>-<desc>`，type ∈ feature/fix/refactor/docs/test |
| 主幹 | `master` | PIPELINE 與 SECURITY-RULES 6 均寫 `main` |
| Commit | `ok`(e4cba04)、`LiveCaption`(c01c6c6)、`Integrate original git workflow...`(4a73c7c) | `[<scope>] <描述>` |

`master`／`main` 命名不一致會使 SECURITY-RULES 6「禁止 force push 到 main」的 branch protection 規則指向不存在的分支，屬實質風險而非純風格問題。

責任角色：Full-stack-dev (Stage 2)

### F-09 — 目錄結構偏離 coding-standards（S3）

| 規範要求 | 現況 |
| --- | --- |
| `src/handlers`、`src/services`、`src/models`、`src/utils`、`src/config` | 不存在；後端在 `LiveCaption/backend/app/` |
| `cdk/lib`、`cdk/bin` | 不存在（無 IaC，為多數 NOT VERIFIABLE 項目的根因） |
| `tests/unit`、`tests/integration`、`tests/fixtures` | 不存在 |
| `docs/adr/`、`docs/runbooks/`、`docs/compliance/` | 僅本次建立 `docs/compliance/` |
| 目錄 kebab-case | `LiveCaption` 為 PascalCase |
| 單一 spec 位置 | root `specs/004-voice-chat-care-record/` 與 `.kiro/specs/` 並存，來源不唯一 |

責任角色：Architect (Stage 2)

---

## 發現彙總

| ID | 嚴重度 | 標題 | 責任角色 |
| --- | --- | --- | --- |
| F-01 | S1 | Region 預設 `ap-northeast-1` 違反 Constitution | Architect → Dev |
| F-02 | S1 | WebSocket 無認證，region 可由呼叫端覆寫 | Dev |
| F-03 | S2 | 缺 root `.gitignore` | Dev |
| F-06 | S2 | Python 品質門檻無法量測 | QA |
| F-07 | S2 | 前端測試無法執行 | QA |
| B-6 | S2 | 無資料存取稽核日誌 | CloudOps |
| C-6 | S2 | AI 端點無 rate limiting | Architect |
| D-1 | S2 | 無 CI 品質門檻 | CloudOps |
| F-04 | S3 | `__pycache__` 進版控 | Dev |
| F-05 | S3 | 第三方金鑰未走 Secrets Manager ＋ 未列入架構 | Architect |
| C-1 | S3 | Dashboard 缺免責聲明 | Dev |
| B-7 | S3 | 無保留策略 | CloudOps |
| B-8 | S3 | 無資料刪除能力 | Dev |
| D-6 | S3 | 無 rollback runbook | CloudOps |
| D-7 | S3 | 無事件應變計畫 | CloudOps |
| F-08 | S3 | 分支／主幹／commit 命名不符 | Dev |
| F-09 | S3 | 目錄結構偏離規範 | Architect |

S1: 2 ／ S2: 6 ／ S3: 9 ／ NOT VERIFIABLE: 5

## 裁決

**生產部署：NO-GO。** Audit Criteria 要求「無未解決的 S1/S2 發現」，現有 2 個 S1 與 6 個 S2。

**PoC／Demo：條件式可接受**，前提為 F-03 修復、服務僅綁 `127.0.0.1`、且僅使用合成資料。詳見 `risk-register.md`。

## 建議修復順序

1. **F-03** — 建立 root `.gitignore`（一行成本，同時解決 F-04，並消除金鑰洩漏路徑）
2. **F-02** — `region` query param 加白名單（或直接移除該參數）；此項不修，F-01 修了也無效
3. **F-01** — Architect 裁決區域取捨並更新 README
4. **D-1 + F-06 + F-07** — 建立測試工具鏈與 CI，才能持續量測其餘門檻
5. 其餘 S3 依 Stage 分派

## 後續動作

Stage 6 判定 reject，依 PIPELINE 退回對應階段：S1 全數退 Stage 2（Architect / Dev），測試類 S2 退 Stage 3（QA），基礎設施類 S2 退 Stage 4（CloudOps）。修復後需重新稽核。

本報告為靜態掃描結果。5 項 NOT VERIFIABLE 需待 IaC 進版控（F-09）或 Stage 4 環境就緒後補驗。
