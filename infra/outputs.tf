output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito App Client ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_test_user" {
  description = "Cognito test user email"
  value       = aws_cognito_user.test_user.username
}

output "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "api_gateway_url" {
  description = "API Gateway invoke URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_gateway_id" {
  description = "API Gateway ID"
  value       = aws_apigatewayv2_api.main.id
}

output "frontend_url" {
  description = "S3 static website URL for the frontend"
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

# ─────────────────────────────────────────────────────────────
# AWS RDS PostgreSQL Outputs
# ─────────────────────────────────────────────────────────────
output "rds_endpoint" {
  description = "Connection endpoint for the RDS PostgreSQL database instance"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_address" {
  description = "Hostname of the RDS PostgreSQL database instance"
  value       = aws_db_instance.postgres.address
}

output "rds_port" {
  description = "Port of the RDS PostgreSQL database instance"
  value       = aws_db_instance.postgres.port
}

output "rds_db_name" {
  description = "Database name of the RDS PostgreSQL instance"
  value       = aws_db_instance.postgres.db_name
}

output "rds_master_username" {
  description = "Master username for the RDS instance"
  value       = aws_db_instance.postgres.username
}

output "rds_security_group_id" {
  description = "Security group ID attached to RDS"
  value       = aws_security_group.rds.id
}

output "rds_secret_arn" {
  description = "ARN of the Secrets Manager secret storing RDS credentials"
  value       = aws_secretsmanager_secret.rds_credentials.arn
}

output "rds_connection_string" {
  description = "Full PostgreSQL connection URI for the backend"
  value       = "postgresql://${aws_db_instance.postgres.username}:${var.rds_master_password}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}"
  sensitive   = true
}