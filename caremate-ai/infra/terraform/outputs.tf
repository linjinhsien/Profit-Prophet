###############################################################################
# 輸出值
###############################################################################

output "api_gateway_url" {
  description = "API Gateway 端點 URL"
  value       = aws_apigatewayv2_stage.main.invoke_url
}

output "s3_audio_bucket" {
  description = "音訊 S3 Bucket 名稱"
  value       = aws_s3_bucket.audio.id
}

output "s3_knowledge_base_bucket" {
  description = "知識庫 S3 Bucket 名稱"
  value       = aws_s3_bucket.knowledge_base.id
}

output "dynamodb_profile_table" {
  description = "長者資料 DynamoDB 表名"
  value       = aws_dynamodb_table.elder_profile.name
}

output "dynamodb_memory_table" {
  description = "長者記憶 DynamoDB 表名"
  value       = aws_dynamodb_table.elder_memory.name
}

output "frontend_bucket" {
  description = "前端靜態網站 S3 Bucket"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_domain" {
  description = "CloudFront 分發域名"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "lambda_chat_arn" {
  description = "Chat Lambda ARN"
  value       = aws_lambda_function.chat.arn
}

output "lambda_speech_arn" {
  description = "Speech Lambda ARN"
  value       = aws_lambda_function.speech.arn
}
