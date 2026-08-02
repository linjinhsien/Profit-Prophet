###############################################################################
# 變數定義
###############################################################################

variable "aws_region" {
  description = "AWS 部署區域"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "部署環境 (dev/staging/prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment 必須是 dev、staging 或 prod"
  }
}

variable "project_name" {
  description = "專案名稱"
  type        = string
  default     = "caremate-ai"
}

variable "bedrock_model_id" {
  description = "Bedrock 模型 ID"
  type        = string
  default     = "anthropic.claude-sonnet-4-20250514"
}

variable "bedrock_embedding_model_id" {
  description = "Bedrock Embedding 模型 ID（用於 Knowledge Base）"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
}

variable "lambda_timeout" {
  description = "Lambda 函數超時時間（秒）"
  type        = number
  default     = 120
}

variable "lambda_memory" {
  description = "Lambda 函數記憶體（MB）"
  type        = number
  default     = 512
}

variable "frontend_domain" {
  description = "前端網域名稱（CORS 設定用）"
  type        = string
  default     = "*"
}
