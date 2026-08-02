###############################################################################
# Lambda Functions
###############################################################################

# Lambda Layer - 共用模組
data "archive_file" "shared_layer" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/layer"
  output_path = "${path.module}/builds/shared-layer.zip"
}

resource "aws_lambda_layer_version" "shared" {
  layer_name          = "${var.project_name}-shared"
  filename            = data.archive_file.shared_layer.output_path
  source_code_hash    = data.archive_file.shared_layer.output_base64sha256
  compatible_runtimes = ["python3.12"]
  description         = "CareMate AI 共用模組（config, dynamodb, bedrock, audio）"
}

# --- Chat Lambda ---
data "archive_file" "chat" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/lambdas/chat"
  output_path = "${path.module}/builds/chat.zip"
}

resource "aws_lambda_function" "chat" {
  function_name    = "${var.project_name}-chat-${var.environment}"
  filename         = data.archive_file.chat.output_path
  source_code_hash = data.archive_file.chat.output_base64sha256
  handler          = "handler.handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_execution.arn
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory

  layers = [aws_lambda_layer_version.shared.arn]

  environment {
    variables = {
      TABLE_ELDER_PROFILE = aws_dynamodb_table.elder_profile.name
      TABLE_ELDER_MEMORY  = aws_dynamodb_table.elder_memory.name
      S3_AUDIO_BUCKET     = aws_s3_bucket.audio.id
      BEDROCK_MODEL_ID    = var.bedrock_model_id
      BEDROCK_KB_ID       = ""
      AWS_REGION_NAME     = var.aws_region
    }
  }

  tags = {
    Function = "chat"
  }
}

# --- Speech Lambda ---
data "archive_file" "speech" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/lambdas/speech"
  output_path = "${path.module}/builds/speech.zip"
}

resource "aws_lambda_function" "speech" {
  function_name    = "${var.project_name}-speech-${var.environment}"
  filename         = data.archive_file.speech.output_path
  source_code_hash = data.archive_file.speech.output_base64sha256
  handler          = "handler.handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_execution.arn
  timeout          = 180 # 語音處理需要較長時間
  memory_size      = 1024

  layers = [aws_lambda_layer_version.shared.arn]

  environment {
    variables = {
      TABLE_ELDER_PROFILE = aws_dynamodb_table.elder_profile.name
      TABLE_ELDER_MEMORY  = aws_dynamodb_table.elder_memory.name
      S3_AUDIO_BUCKET     = aws_s3_bucket.audio.id
      BEDROCK_MODEL_ID    = var.bedrock_model_id
      BEDROCK_KB_ID       = ""
      AWS_REGION_NAME     = var.aws_region
    }
  }

  tags = {
    Function = "speech"
  }
}

# --- Summary Lambda ---
data "archive_file" "summary" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/lambdas/summary"
  output_path = "${path.module}/builds/summary.zip"
}

resource "aws_lambda_function" "summary" {
  function_name    = "${var.project_name}-summary-${var.environment}"
  filename         = data.archive_file.summary.output_path
  source_code_hash = data.archive_file.summary.output_base64sha256
  handler          = "handler.handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_execution.arn
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory

  layers = [aws_lambda_layer_version.shared.arn]

  environment {
    variables = {
      TABLE_ELDER_PROFILE = aws_dynamodb_table.elder_profile.name
      TABLE_ELDER_MEMORY  = aws_dynamodb_table.elder_memory.name
      BEDROCK_MODEL_ID    = var.bedrock_model_id
      AWS_REGION_NAME     = var.aws_region
    }
  }

  tags = {
    Function = "summary"
  }
}

# --- Memory Lambda ---
data "archive_file" "memory" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/lambdas/memory"
  output_path = "${path.module}/builds/memory.zip"
}

resource "aws_lambda_function" "memory" {
  function_name    = "${var.project_name}-memory-${var.environment}"
  filename         = data.archive_file.memory.output_path
  source_code_hash = data.archive_file.memory.output_base64sha256
  handler          = "handler.handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_execution.arn
  timeout          = 30
  memory_size      = 256

  layers = [aws_lambda_layer_version.shared.arn]

  environment {
    variables = {
      TABLE_ELDER_PROFILE = aws_dynamodb_table.elder_profile.name
      TABLE_ELDER_MEMORY  = aws_dynamodb_table.elder_memory.name
      AWS_REGION_NAME     = var.aws_region
    }
  }

  tags = {
    Function = "memory"
  }
}

# --- Profile Lambda ---
data "archive_file" "profile" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/lambdas/profile"
  output_path = "${path.module}/builds/profile.zip"
}

resource "aws_lambda_function" "profile" {
  function_name    = "${var.project_name}-profile-${var.environment}"
  filename         = data.archive_file.profile.output_path
  source_code_hash = data.archive_file.profile.output_base64sha256
  handler          = "handler.handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_execution.arn
  timeout          = 30
  memory_size      = 256

  layers = [aws_lambda_layer_version.shared.arn]

  environment {
    variables = {
      TABLE_ELDER_PROFILE = aws_dynamodb_table.elder_profile.name
      TABLE_ELDER_MEMORY  = aws_dynamodb_table.elder_memory.name
      AWS_REGION_NAME     = var.aws_region
    }
  }

  tags = {
    Function = "profile"
  }
}

# Lambda 權限 - 允許 API Gateway 呼叫
resource "aws_lambda_permission" "chat_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.chat.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "speech_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.speech.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "summary_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.summary.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "memory_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.memory.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "profile_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.profile.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
