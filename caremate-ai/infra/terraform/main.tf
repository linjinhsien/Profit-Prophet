###############################################################################
# CareMate AI - Terraform 主設定檔
# 生成式 AI 長照陪伴系統 AWS 基礎設施
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # 建議使用 S3 backend 儲存 state（正式環境請取消註解）
  # backend "s3" {
  #   bucket         = "caremate-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "us-west-2"
  #   dynamodb_table = "caremate-terraform-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "CareMate-AI"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Team        = "LongTermCare"
    }
  }
}

# 取得目前 AWS 帳號資訊
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
