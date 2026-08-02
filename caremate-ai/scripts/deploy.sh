#!/bin/bash
# =============================================================================
# CareMate AI - 部署腳本
# 用法: ./scripts/deploy.sh [dev|staging|prod]
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:-dev}"
PROJECT_NAME="caremate-ai"
AWS_REGION="${AWS_REGION:-us-west-2}"

echo "================================================"
echo "  CareMate AI 部署腳本"
echo "  環境: ${ENVIRONMENT}"
echo "  區域: ${AWS_REGION}"
echo "================================================"

# 檢查必要工具
command -v terraform >/dev/null 2>&1 || { echo "錯誤: 請先安裝 terraform"; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "錯誤: 請先安裝 AWS CLI"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "錯誤: 請先安裝 Node.js"; exit 1; }

# Step 1: 建置前端
echo ""
echo "[1/5] 建置前端..."
cd frontend
npm ci --no-audit
npm run build
cd ..
echo "✓ 前端建置完成"

# Step 2: 打包 Lambda
echo ""
echo "[2/5] 打包 Lambda 函數..."
cd backend

# 建立 Lambda Layer（共用模組）
echo "  打包共用 Layer..."
mkdir -p ../infra/terraform/builds
cd shared
zip -r ../../infra/terraform/builds/shared-layer.zip . -x "__pycache__/*"
cd ..

# 打包各 Lambda 函數
for func in chat speech summary memory profile; do
  echo "  打包 ${func}..."
  cd lambdas/${func}
  zip -r ../../../infra/terraform/builds/${func}.zip . -x "__pycache__/*"
  cd ../..
done

cd ..
echo "✓ Lambda 打包完成"

# Step 3: Terraform 部署
echo ""
echo "[3/5] 執行 Terraform..."
cd infra/terraform

terraform init -upgrade
terraform plan -var="environment=${ENVIRONMENT}" -out=tfplan
terraform apply tfplan

# 取得輸出值
API_URL=$(terraform output -raw api_gateway_url)
FRONTEND_BUCKET=$(terraform output -raw frontend_bucket)
CF_DOMAIN=$(terraform output -raw cloudfront_distribution_domain)

cd ../..
echo "✓ Terraform 部署完成"

# Step 4: 上傳前端至 S3
echo ""
echo "[4/5] 上傳前端至 S3..."
aws s3 sync frontend/dist/ "s3://${FRONTEND_BUCKET}/" \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html"

# index.html 不快取
aws s3 cp frontend/dist/index.html "s3://${FRONTEND_BUCKET}/index.html" \
  --cache-control "no-cache, no-store, must-revalidate"

echo "✓ 前端上傳完成"

# Step 5: 輸出結果
echo ""
echo "[5/5] 部署完成！"
echo "================================================"
echo "  API URL:      ${API_URL}"
echo "  Frontend URL: https://${CF_DOMAIN}"
echo "================================================"
echo ""
echo "下一步："
echo "  1. 上傳知識庫文件至 S3 Knowledge Base Bucket"
echo "  2. 在 Bedrock Console 同步 Knowledge Base"
echo "  3. 建立初始長者資料（使用 POST /profile API）"
