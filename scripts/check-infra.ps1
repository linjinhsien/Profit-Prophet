<#
.SYNOPSIS
  檢查 TASK-001 的前置基礎設施是否就緒，並驗證 Constitution 合規性。

.DESCRIPTION
  這支腳本只做唯讀查詢，不修改任何 AWS 資源，也不包含任何憑證。
  在你已設定 AWS 憑證的終端機執行，把輸出貼回對話即可。

  輸出的都是非機密識別碼（identity pool ID、KB ID、model ARN、table 名稱），
  這些之後會進 frontend/.env.example，可以安全分享。

.EXAMPLE
  # 先在自己的終端機設好憑證，然後：
  .\scripts\check-infra.ps1
#>

$ErrorActionPreference = 'Continue'

function Section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($m)      { Write-Host "  [OK]    $m" -ForegroundColor Green }
function Warn($m)    { Write-Host "  [WARN]  $m" -ForegroundColor Yellow }
function Bad($m)     { Write-Host "  [FAIL]  $m" -ForegroundColor Red }
function Info($m)    { Write-Host "  $m" -ForegroundColor Gray }

# ---------------------------------------------------------------
Section "身分與區域"

$acct = aws sts get-caller-identity --query 'Account' --output text 2>$null
if ($LASTEXITCODE -ne 0) {
    Bad "無有效憑證。請先設定 AWS 憑證後重跑。"
    exit 1
}
Info "Account: $acct"

$region = $env:AWS_DEFAULT_REGION
if (-not $region) { $region = aws configure get region 2>$null }
Info "Region:  $region"

if ($region -in @('us-east-1', 'us-west-2')) {
    Ok "區域符合 Constitution 規範"
} else {
    Bad "區域 '$region' 違反 Constitution — 只允許 us-east-1 或 us-west-2"
}

# ---------------------------------------------------------------
Section "Cognito Identity Pool（阻塞 T1）"

$pools = aws cognito-identity list-identity-pools --max-results 20 --output json 2>$null | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    Bad "查詢失敗 — 可能缺少 cognito-identity:ListIdentityPools 權限"
} elseif (-not $pools.IdentityPools -or $pools.IdentityPools.Count -eq 0) {
    Bad "沒有任何 Identity Pool — T1 無法開工，需先建立（排程 0-2h）"
} else {
    foreach ($p in $pools.IdentityPools) {
        Ok "$($p.IdentityPoolName)"
        Info "  VITE_COGNITO_IDENTITY_POOL_ID=$($p.IdentityPoolId)"

        $roles = aws cognito-identity get-identity-pool-roles --identity-pool-id $p.IdentityPoolId --output json 2>$null | ConvertFrom-Json
        if ($LASTEXITCODE -eq 0 -and $roles.Roles) {
            $roles.Roles.PSObject.Properties | ForEach-Object {
                Info "  role[$($_.Name)] = $($_.Value)"
            }
        } else {
            Warn "  未綁定 IAM role — 前端拿到憑證也無法呼叫服務"
        }
    }
}

# ---------------------------------------------------------------
Section "Bedrock Knowledge Base（阻塞 T2）"

$kbs = aws bedrock-agent list-knowledge-bases --max-results 20 --output json 2>$null | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    Bad "查詢失敗 — 可能缺少 bedrock:ListKnowledgeBases 權限，或該區域無此服務"
} elseif (-not $kbs.knowledgeBaseSummaries -or $kbs.knowledgeBaseSummaries.Count -eq 0) {
    Bad "沒有任何 Knowledge Base — T2 無法開工，需先建立並同步（排程 2-4h）"
} else {
    foreach ($kb in $kbs.knowledgeBaseSummaries) {
        if ($kb.status -eq 'ACTIVE') {
            Ok "$($kb.name)  [$($kb.status)]"
        } else {
            Warn "$($kb.name)  [$($kb.status)] — 尚未 ACTIVE，檢索會失敗"
        }
        Info "  VITE_BEDROCK_KB_ID=$($kb.knowledgeBaseId)"

        $ds = aws bedrock-agent list-data-sources --knowledge-base-id $kb.knowledgeBaseId --output json 2>$null | ConvertFrom-Json
        if ($LASTEXITCODE -eq 0 -and $ds.dataSourceSummaries) {
            foreach ($d in $ds.dataSourceSummaries) {
                Info "  data source: $($d.name) [$($d.status)]"
                $jobs = aws bedrock-agent list-ingestion-jobs `
                    --knowledge-base-id $kb.knowledgeBaseId `
                    --data-source-id $d.dataSourceId `
                    --max-results 1 --output json 2>$null | ConvertFrom-Json
                if ($LASTEXITCODE -eq 0 -and $jobs.ingestionJobSummaries) {
                    $j = $jobs.ingestionJobSummaries[0]
                    if ($j.status -eq 'COMPLETE') {
                        Ok "  最近一次同步: COMPLETE"
                    } else {
                        Warn "  最近一次同步: $($j.status) — 未完成前檢索不到內容"
                    }
                } else {
                    Bad "  從未執行同步 — KB 是空的，RetrieveAndGenerate 會回傳無結果"
                }
            }
        } else {
            Warn "  無 data source — KB 沒有掛任何文件來源"
        }
    }
}

# ---------------------------------------------------------------
Section "Claude Haiku 4.5 模型存取（T2 需要 model ARN）"

$models = aws bedrock list-foundation-models `
    --by-provider anthropic `
    --query 'modelSummaries[?contains(modelId, `haiku`)].modelId' `
    --output json 2>$null | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Bad "查詢失敗 — 可能缺少 bedrock:ListFoundationModels 權限"
} elseif (-not $models -or $models.Count -eq 0) {
    Warn "找不到 Haiku 系列模型。架構文件指定 Claude Haiku 4.5。"
} else {
    foreach ($m in $models) { Info "  $m" }
    Warn "上面是 foundation model ID。架構文件要的是 inference profile ARN，"
    Warn "格式為 arn:aws:bedrock:<region>:<account>:inference-profile/<id>"
}

$profiles = aws bedrock list-inference-profiles --max-results 30 --output json 2>$null | ConvertFrom-Json
if ($LASTEXITCODE -eq 0 -and $profiles.inferenceProfileSummaries) {
    $haiku = $profiles.inferenceProfileSummaries | Where-Object { $_.inferenceProfileName -match 'haiku' }
    if ($haiku) {
        foreach ($h in $haiku) {
            Ok "$($h.inferenceProfileName)"
            Info "  VITE_BEDROCK_MODEL_ARN=$($h.inferenceProfileArn)"
        }
    } else {
        Warn "inference profile 清單中沒有 Haiku"
    }
}

# ---------------------------------------------------------------
Section "DynamoDB（T6 需要）"

$tables = aws dynamodb list-tables --output json 2>$null | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    Bad "查詢失敗"
} elseif (-not $tables.TableNames -or $tables.TableNames.Count -eq 0) {
    Warn "沒有任何 table — T6 需要，但可以晚點建"
} else {
    foreach ($t in $tables.TableNames) {
        $d = aws dynamodb describe-table --table-name $t --output json 2>$null | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { continue }
        $tb = $d.Table
        Info "VITE_DDB_TABLE_NAME=$t"

        $pk = ($tb.KeySchema | Where-Object { $_.KeyType -eq 'HASH' }).AttributeName
        $sk = ($tb.KeySchema | Where-Object { $_.KeyType -eq 'RANGE' }).AttributeName
        Info "  PK=$pk  SK=$sk"
        Warn "  確認 PK 是 Cognito identity ID — IAM LeadingKeys 限制要求如此"

        if ($tb.BillingModeSummary.BillingMode -eq 'PAY_PER_REQUEST') {
            Ok "  billing: PAY_PER_REQUEST"
        } else {
            Warn "  billing: $($tb.BillingModeSummary.BillingMode) — Constitution 建議 PAY_PER_REQUEST"
        }

        if ($tb.SSEDescription.Status -eq 'ENABLED') {
            Ok "  加密: 已啟用"
        } else {
            Warn "  加密: 未偵測到 SSEDescription（可能是預設 AWS 擁有金鑰）"
        }
    }
}

# ---------------------------------------------------------------
Section "S3 公開存取檢查（Constitution 要求）"

$buckets = aws s3api list-buckets --query 'Buckets[].Name' --output json 2>$null | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    Bad "查詢失敗"
} elseif (-not $buckets -or $buckets.Count -eq 0) {
    Warn "沒有任何 bucket — Bedrock KB 需要 S3 來源文件"
} else {
    foreach ($b in $buckets) {
        $pab = aws s3api get-public-access-block --bucket $b --output json 2>$null | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) {
            Bad "$b — 未設定 Block Public Access，違反 Constitution"
        } else {
            $c = $pab.PublicAccessBlockConfiguration
            if ($c.BlockPublicAcls -and $c.BlockPublicPolicy -and $c.IgnorePublicAcls -and $c.RestrictPublicBuckets) {
                Ok "$b — 全部封鎖"
            } else {
                Bad "$b — Block Public Access 未完全開啟，違反 Constitution"
            }
        }
    }
}

# ---------------------------------------------------------------
Write-Host "`n=== 結論 ===" -ForegroundColor Cyan
Info "把上面標為 VITE_ 的值填進 frontend/.env.example 對應欄位。"
Info "這些是非機密識別碼，可以安全提交與分享。"
Info ""
Info "若 Cognito 或 Knowledge Base 顯示 FAIL，T1/T2 就還不能開工，"
Info "需要先補完 architecture.md 排程中 0-4h 的基礎設施。"
