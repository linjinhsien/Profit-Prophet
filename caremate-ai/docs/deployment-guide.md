# CareMate AI AWS 部署手冊

## 目錄

1. [前置需求](#前置需求)
2. [環境準備](#環境準備)
3. [Terraform 部署](#terraform-部署)
4. [Knowledge Base 設定](#knowledge-base-設定)
5. [前端部署](#前端部署)
6. [驗證測試](#驗證測試)
7. [監控與維運](#監控與維運)
8. [故障排除](#故障排除)

---

## 前置需求

### 工具安裝

| 工具 | 版本需求 | 安裝指令 |
|------|---------|---------|
| AWS CLI | >= 2.15 | `brew install awscli` 或 [官方文件](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) |
| Terraform | >= 1.5 | `brew install terraform` |
| Node.js | >= 20 | `brew install node@20` |
| Python | >= 3.12 | `brew install python@3.12` |
| Docker | >= 24 | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |

### AWS 帳號設定

1. 確認 AWS 帳號已啟用以下服務：
   - Amazon Bedrock（需申請 Claude Sonnet 模型存取權限）
   - Amazon Transcribe
   - Amazon Polly
   - Amazon OpenSearch Serverless

2. 設定 AWS CLI：
   ```bash
   aws configure
   # 輸入 Access Key ID, Secret Access Key, Region (us-west-2)
   ```

3. 申請 Bedrock 模型存取：
   ```bash
   # 前往 AWS Console > Amazon Bedrock > Model access
   # 啟用: Anthropic Claude Sonnet, Amazon Titan Embeddings V2
   ```

---

## 環境準備

### 1. 複製專案

```bash
git clone <repository-url>
cd caremate-ai
```

### 2. 設定環境變數

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
```

編輯 `terraform.tfvars`：
```hcl
aws_region     = "us-west-2"
environment    = "dev"          # dev / staging / prod
project_name   = "caremate-ai"
```

### 3. 安裝前端相依套件

```bash
cd frontend
npm ci
cd ..
```

---

## Terraform 部署

### Step 1: 初始化 Terraform

```bash
cd infra/terraform
terraform init
```

### Step 2: 檢視部署計畫

```bash
terraform plan -var-file="terraform.tfvars"
```

確認輸出中包含以下資源：
- 2 個 DynamoDB 表
- 3 個 S3 Bucket
- 5 個 Lambda 函數
- 1 個 API Gateway
- 1 個 CloudFront Distribution
- 1 個 OpenSearch Serverless Collection
- 1 個 Bedrock Knowledge Base

### Step 3: 執行部署

```bash
terraform apply -var-file="terraform.tfvars"
```

部署時間約 10-15 分鐘（OpenSearch Serverless 啟動較久）。

### Step 4: 記錄輸出值

```bash
terraform output
```

記錄以下輸出：
- `api_gateway_url` - API 端點
- `frontend_bucket` - 前端 S3 Bucket
- `s3_knowledge_base_bucket` - 知識庫 Bucket
- `cloudfront_distribution_domain` - CDN 網域

---

## Knowledge Base 設定

### 1. 上傳知識庫文件

將 PDF 文件上傳至知識庫 S3 Bucket：

```bash
KB_BUCKET=$(cd infra/terraform && terraform output -raw s3_knowledge_base_bucket)

# 上傳長照文件
aws s3 cp docs/knowledge-base/長照3.0文件.pdf "s3://${KB_BUCKET}/documents/"
aws s3 cp docs/knowledge-base/失智症照護手冊.pdf "s3://${KB_BUCKET}/documents/"
aws s3 cp docs/knowledge-base/跌倒預防手冊.pdf "s3://${KB_BUCKET}/documents/"
aws s3 cp docs/knowledge-base/高齡營養手冊.pdf "s3://${KB_BUCKET}/documents/"
```

### 2. 同步 Knowledge Base

前往 AWS Console > Amazon Bedrock > Knowledge bases，找到已建立的 Knowledge Base，點擊 "Sync" 按鈕同步文件。

或使用 CLI：
```bash
KB_ID=$(cd infra/terraform && terraform output -raw bedrock_knowledge_base_id)

aws bedrock-agent start-ingestion-job \
  --knowledge-base-id "${KB_ID}" \
  --data-source-id "$(aws bedrock-agent list-data-sources --knowledge-base-id ${KB_ID} --query 'dataSourceSummaries[0].dataSourceId' --output text)"
```

### 3. 更新 Lambda 環境變數

```bash
KB_ID=$(cd infra/terraform && terraform output -raw bedrock_knowledge_base_id)

# 更新 chat Lambda
aws lambda update-function-configuration \
  --function-name caremate-ai-chat-dev \
  --environment "Variables={BEDROCK_KB_ID=${KB_ID},TABLE_ELDER_PROFILE=caremate-ai_elder_profile,TABLE_ELDER_MEMORY=caremate-ai_elder_memory,S3_AUDIO_BUCKET=$(terraform output -raw s3_audio_bucket),BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-20250514}"
```

---

## 前端部署

### 1. 建置前端

```bash
cd frontend

# 設定 API URL
export VITE_API_URL="$(cd ../infra/terraform && terraform output -raw api_gateway_url)"

npm run build
cd ..
```

### 2. 上傳至 S3

```bash
FRONTEND_BUCKET=$(cd infra/terraform && terraform output -raw frontend_bucket)

# 上傳靜態資源（長期快取）
aws s3 sync frontend/dist/ "s3://${FRONTEND_BUCKET}/" \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html" \
  --exclude "*.html"

# 上傳 HTML（不快取）
aws s3 cp frontend/dist/index.html "s3://${FRONTEND_BUCKET}/index.html" \
  --cache-control "no-cache, no-store, must-revalidate"
```

### 3. 清除 CloudFront 快取

```bash
CF_ID=$(cd infra/terraform && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation --distribution-id "${CF_ID}" --paths "/*"
```

---

## 驗證測試

### 1. API 健康檢查

```bash
API_URL=$(cd infra/terraform && terraform output -raw api_gateway_url)

# 測試 Chat API
curl -X POST "${API_URL}/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "elder_id": "elder-test-001",
    "message": "你好，我是測試",
    "language": "zh-TW"
  }'
```

### 2. 建立測試長者資料

```bash
curl -X PUT "${API_URL}/profile/elder-test-001" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "測試阿嬤",
    "age": 75,
    "language": "zh-TW",
    "disease": "高血壓"
  }'
```

### 3. 前端存取

```bash
CF_DOMAIN=$(cd infra/terraform && terraform output -raw cloudfront_distribution_domain)
echo "前端網址: https://${CF_DOMAIN}"
```

開啟瀏覽器訪問 `https://<CF_DOMAIN>`，確認頁面正常顯示。

---

## 監控與維運

### CloudWatch 監控

Lambda 函數的日誌位於：
- `/aws/lambda/caremate-ai-chat-dev`
- `/aws/lambda/caremate-ai-speech-dev`
- `/aws/lambda/caremate-ai-summary-dev`
- `/aws/lambda/caremate-ai-memory-dev`
- `/aws/lambda/caremate-ai-profile-dev`

API Gateway 日誌：
- `/aws/apigateway/caremate-ai-dev`

### 建議告警設定

| 指標 | 閾值 | 說明 |
|------|------|------|
| Lambda Error Rate | > 5% | Lambda 錯誤率 |
| Lambda Duration | > 30s | 回應時間過長 |
| API Gateway 5XX | > 10/min | API 伺服器錯誤 |
| DynamoDB Throttle | > 0 | DynamoDB 限流 |

### 設定 CloudWatch Alarm 範例

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "caremate-chat-errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=caremate-ai-chat-dev \
  --evaluation-periods 1 \
  --alarm-actions "arn:aws:sns:us-west-2:ACCOUNT_ID:caremate-alerts"
```

---

## 故障排除

### 常見問題

#### 1. Bedrock 回傳 AccessDeniedException

**原因**：未申請模型存取權限或 IAM 權限不足。

**解決**：
1. 前往 Bedrock Console > Model access，確認 Claude Sonnet 已啟用
2. 確認 Lambda Role 有 `bedrock:InvokeModel` 和 `bedrock:Converse` 權限

#### 2. Transcribe 轉寫失敗

**原因**：音訊格式不支援或 S3 權限問題。

**解決**：
1. 確認音訊為 WebM/Opus 格式
2. 確認 Lambda Role 有 S3 讀寫權限
3. 確認 Transcribe 服務在該 Region 可用

#### 3. Polly 語音合成失敗

**原因**：語音 ID 或語言代碼不正確。

**解決**：
1. 確認使用 Neural 引擎支援的語音（Zhiyu）
2. 語言代碼使用 `cmn-CN`

#### 4. OpenSearch Serverless 建立失敗

**原因**：需要接受 AWS Service Terms。

**解決**：
1. 前往 AWS Console > OpenSearch Service > Serverless
2. 接受服務條款
3. 重新執行 `terraform apply`

#### 5. CORS 錯誤

**原因**：前端網域不在 API Gateway CORS 允許清單中。

**解決**：
1. 更新 `terraform.tfvars` 中的 `frontend_domain` 變數
2. 重新部署

---

## 環境清理

若要刪除所有資源：

```bash
cd infra/terraform

# 先清空 S3 Bucket
aws s3 rm "s3://$(terraform output -raw frontend_bucket)" --recursive
aws s3 rm "s3://$(terraform output -raw s3_audio_bucket)" --recursive
aws s3 rm "s3://$(terraform output -raw s3_knowledge_base_bucket)" --recursive

# 銷毀所有資源
terraform destroy -var-file="terraform.tfvars"
```

⚠️ **注意**: 此操作不可逆，所有資料將永久刪除。
