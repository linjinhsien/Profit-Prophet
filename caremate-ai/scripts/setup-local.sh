#!/bin/bash
# =============================================================================
# CareMate AI - 本地開發環境設定
# =============================================================================

set -euo pipefail

echo "================================================"
echo "  CareMate AI 本地開發環境設定"
echo "================================================"

# Step 1: 前端相依套件
echo ""
echo "[1/4] 安裝前端相依套件..."
cd frontend
npm install
cd ..
echo "✓ 前端套件安裝完成"

# Step 2: Python 虛擬環境
echo ""
echo "[2/4] 設定 Python 虛擬環境..."
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install pytest pytest-cov moto boto3
deactivate
cd ..
echo "✓ Python 環境設定完成"

# Step 3: 建立 .env 檔案
echo ""
echo "[3/4] 建立環境變數檔案..."
if [ ! -f .env ]; then
  cat > .env << 'EOF'
# CareMate AI 環境變數
AWS_REGION=us-west-2
VITE_API_URL=http://localhost:8000/api

# DynamoDB（本地開發可使用 DynamoDB Local）
TABLE_ELDER_PROFILE=caremate-ai_elder_profile
TABLE_ELDER_MEMORY=caremate-ai_elder_memory

# S3
S3_AUDIO_BUCKET=caremate-audio

# Bedrock
BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-20250514
BEDROCK_KB_ID=

# Polly
POLLY_VOICE_ZH=Zhiyu
EOF
  echo "✓ .env 檔案已建立（請填入 AWS 憑證）"
else
  echo "✓ .env 檔案已存在，跳過"
fi

# Step 4: 建立 DynamoDB Local 表
echo ""
echo "[4/4] 建立本地 DynamoDB 表..."
echo "  啟動 DynamoDB Local: docker-compose up -d dynamodb-local"
echo "  建立表: aws dynamodb create-table --endpoint-url http://localhost:8001 ..."
echo ""
echo "================================================"
echo "  設定完成！"
echo ""
echo "  啟動前端: cd frontend && npm run dev"
echo "  啟動後端: cd backend && source .venv/bin/activate"
echo "================================================"
