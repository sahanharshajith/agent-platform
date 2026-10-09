# ─────────────────────────────────────────────────────────────
# API Gateway HTTP API
# ─────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_api" "main" {
  name          = "agent-platform-api"
  description   = "Multi-tenant AI agent platform API"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["Content-Type", "Authorization", "X-Tenant-ID"]
    allow_methods     = ["GET", "POST", "OPTIONS"]
    allow_origins     = ["*"]
    expose_headers    = ["*"]
    max_age           = 3600
  }

  tags = {
    Name = "agent-platform-api"
  }
}

# ─────────────────────────────────────────────────────────────
# Cognito JWT Authorizer (defined but attached inside FastAPI)
# ─────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

# ─────────────────────────────────────────────────────────────
# EC2 backend integration (HTTP_PROXY, no path variable)
# ─────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_integration" "ec2" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = "http://${var.ec2_public_ip}"

  payload_format_version = "1.0"
  timeout_milliseconds   = 30000
}

# ─────────────────────────────────────────────────────────────
# $default route — forwards every path to EC2
# JWT validation happens inside FastAPI (Member A's cognito.py)
# ─────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.ec2.id}"
}

# ─────────────────────────────────────────────────────────────
# Auto-deploy stage
# ─────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  tags = {
    Name = "agent-platform-api-default"
  }
}