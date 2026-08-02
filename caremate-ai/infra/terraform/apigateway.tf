###############################################################################
# API Gateway (HTTP API v2)
###############################################################################

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project_name}-api-${var.environment}"
  protocol_type = "HTTP"
  description   = "CareMate AI REST API"

  cors_configuration {
    allow_origins = [var.frontend_domain]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Amz-Date", "X-Api-Key"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_stage" "main" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}"
  retention_in_days = 30
}

# --- Route: POST /chat ---
resource "aws_apigatewayv2_integration" "chat" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.chat.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "chat" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /chat"
  target    = "integrations/${aws_apigatewayv2_integration.chat.id}"
}

# --- Route: POST /speech ---
resource "aws_apigatewayv2_integration" "speech" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.speech.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "speech" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /speech"
  target    = "integrations/${aws_apigatewayv2_integration.speech.id}"
}

# --- Route: POST /summary ---
resource "aws_apigatewayv2_integration" "summary" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.summary.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "summary" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /summary"
  target    = "integrations/${aws_apigatewayv2_integration.summary.id}"
}

# --- Route: GET /memory/{id} ---
resource "aws_apigatewayv2_integration" "memory" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.memory.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "memory" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /memory/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.memory.id}"
}

# --- Route: GET /profile/{id} ---
resource "aws_apigatewayv2_integration" "profile" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.profile.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "profile_get" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /profile/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.profile.id}"
}

resource "aws_apigatewayv2_route" "profile_put" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "PUT /profile/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.profile.id}"
}
