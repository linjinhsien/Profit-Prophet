# Risk Register

累積已知風險與處置決議。每筆風險需有明確狀態與負責角色；「已接受」必須附理由與適用範圍。

| 欄位 | 說明 |
| --- | --- |
| 狀態 | `OPEN`（待修）／`ACCEPTED`（已接受，附理由）／`MITIGATED`（已緩解但未根除）／`CLOSED`（已修復） |
| 適用範圍 | 該風險在哪種環境下可接受 |

最後更新：2026-08-01（audit `32d76ca`）

---

## R-001 — 無後端層，Bedrock 成本可被濫用

| | |
| --- | --- |
| 來源 | `audit-report-2026-08-01.md` C-6；`README.md:44`；`docs/architecture.md:161` |
| 嚴重度 | S2 |
| 狀態 | **ACCEPTED**（僅限 PoC／Demo／內部驗證） |
| 負責角色 | Architect |

**風險**：前端直連 AWS 服務，無伺服器端層可做 rate limiting 或輸入驗證。IAM policy 的資源範圍是唯一防線。取得憑證者可耗用 Bedrock 額度。

**接受理由**：架構決策已在 `docs/architecture.md` 明文記載並限定適用範圍為 PoC／Demo／內部驗證。專案自身已載明「上生產前需補回一層後端（Lambda 或 Bedrock AgentCore）處理配額、驗證與稽核」。

**緩解措施**：IAM policy 嚴格鎖定資源，不得使用 wildcard。僅發給已驗證的 Cognito 身分（`credentials.ts` 已強制）。

**失效條件**：任何對外公開部署、或開始處理非合成資料時，此接受立即失效，必須先補後端層。

---

## R-002 — Transcribe Streaming 無台北區域，與 Constitution 區域限制衝突

| | |
| --- | --- |
| 來源 | `audit-report-2026-08-01.md` F-01 |
| 嚴重度 | S1 |
| 狀態 | **OPEN** — 待 Architect 裁決 |
| 負責角色 | Architect |

**風險**：Constitution 限定 `us-east-1`／`us-west-2`，但 Amazon Transcribe Streaming 在台北區（`ap-east-2`）不提供服務。後端目前預設東京（`ap-northeast-1`），直接違反 Constitution。

**技術背景**（`LiveCaption/backend/README.md` 實測數據）：`transcribestreaming` 端點 connect 延遲東京 0.12s vs 奧勒岡 0.21s。另記載某 workshop 角色的 `ws-default-policy` 明確拒絕東京，僅 `us-west-2` 可用。

**待決選項**：

1. 改用 `us-west-2`，接受約 +0.09s connect 延遲 — 合規，成本為延遲
2. 走 Constitution 例外程序，正式核可 `ap-northeast-1` 作為 STT 專用區域 — 需修改 Constitution 與 SECURITY-RULES 7
3. 維持現狀不處理 — **不可接受**，屬未經核可的合規違反

**注意**：無論選哪個，F-02 的 `region` query param 白名單都必須先修，否則區域決策無法強制。

---

## R-003 — WebSocket 端點無認證

| | |
| --- | --- |
| 來源 | `audit-report-2026-08-01.md` F-02 |
| 嚴重度 | S1 |
| 狀態 | **MITIGATED**（僅限本機開發）／生產 **OPEN** |
| 負責角色 | Full-stack-dev |

**風險**：`LiveCaption/backend/app/main.py` 的 `/ws/captions` 無身分驗證、無連線數限制。違反 SECURITY-RULES 2「API 端點需認證」。

**現行緩解**：`main.py` docstring 指示只綁 `127.0.0.1`，僅供本機開發與 Demo。此為程序性緩解，非技術強制。

**未緩解部分**：`region` query param 未做白名單，呼叫端可指定任意 AWS 區域（`main.py:105` → `main.py:86-87`）。此項與繫結位址無關，必須修。

**生產前必須**：加上 Cognito 或 API Key 認證、連線數上限、region 白名單。

---

## R-004 — 照護語音送往 AWS 邊界外第三方（ElevenLabs）

| | |
| --- | --- |
| 來源 | `audit-report-2026-08-01.md` F-05 |
| 嚴重度 | S3（合成資料）／S1（真實資料） |
| 狀態 | **OPEN** — 待 Architect 補 ADR 或移除 |
| 負責角色 | Architect |

**風險**：`app/services/elevenlabs_stt.py` 將音訊串流至 ElevenLabs Scribe Realtime。該服務不在 `docs/architecture.md` 技術棧內（該文件列 Amazon Transcribe）。SECURITY-RULES 8 要求「照護／患者互動資料視為敏感」。金鑰亦以環境變數提供，未走 Secrets Manager。

**現行緩解**：目前僅使用合成音訊（`samples/*.wav` 為 macOS `say` 產生）。

**待決**：補 ADR 正式納入架構並評估資料處理協議，或移除該引擎僅保留 Transcribe。

**失效條件**：處理任何真實照護語音前必須先解決。

---

## R-005 — 無資料存取稽核日誌與刪除能力

| | |
| --- | --- |
| 來源 | `audit-report-2026-08-01.md` B-6、B-7、B-8 |
| 嚴重度 | S2 |
| 狀態 | **OPEN** |
| 負責角色 | CloudOps（稽核日誌、保留策略）／Full-stack-dev（刪除路徑） |

**風險**：SECURITY-RULES 8 要求「所有資料存取實作稽核日誌」、「刪除請求須於 30 天內完成」。目前前端直連 DynamoDB，無應用層稽核；`frontend/src/api/conversations.ts` 僅有寫入與讀取，無刪除路徑。

**部分緩解**：資料以使用者自訂通關碼 AES-GCM 加密後才寫入（`conversationCrypto.ts`），通關碼不落地。使用者不提供通關碼即無人能解密該筆記錄，構成事實上的存取控制，但不等同稽核軌跡，也不滿足可驗證的刪除能力。

**待確認**：CloudTrail DynamoDB data event 是否已開啟（靜態掃描無法確認）。

---

## R-006 — 品質門檻無強制執行機制

| | |
| --- | --- |
| 來源 | `audit-report-2026-08-01.md` D-1、F-06、F-07 |
| 嚴重度 | S2 |
| 狀態 | **OPEN** |
| 負責角色 | QA（測試工具鏈）／CloudOps（CI） |

**風險**：無 `.github/workflows/`，SECURITY-RULES 6 的四道門零強制。Python 端無 pytest／ruff／mypy 設定，覆蓋率與 lint 無法量測。前端測試檔存在但無法執行（無 test script、依賴未宣告）。

**影響**：本報告的 PASS 判定多數來自一次性人工掃描，無法保證後續 commit 維持同樣水準。合規狀態會隨時間漂移。

**注意**：主幹為 `master` 但規範文件寫 `main`（F-08），branch protection 若照文件設定會指向不存在的分支，形成保護空洞。設 CI 時需一併處理。

---

## 待補驗項目

以下項目靜態掃描無法判定，需 IaC 進版控（F-09）或 Stage 4 環境就緒後補驗：

| 項目 | 依據 | 阻塞原因 |
| --- | --- | --- |
| IAM policy 最小權限、無 wildcard | SECURITY-RULES 2 | policy 不在版控內 |
| DynamoDB／S3 Vectors 靜態加密 | SECURITY-RULES 3 | 無 IaC |
| CloudWatch Logs 保留策略 | SECURITY-RULES 7 | 無 IaC |
| Bedrock guardrails 內容過濾 | Compliance C-5 | 設定不在版控內；`api/bedrock.ts` 未帶 guardrail 參數 |
| Branch protection 實際狀態 | SECURITY-RULES 6 | 需 `gh api` 查詢 |
