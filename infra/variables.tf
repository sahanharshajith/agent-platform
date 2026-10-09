variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile for sahanharshajith SSO"
  type        = string
  default     = "default"
}

variable "account_id" {
  description = "AWS account ID"
  type        = string
  default     = "668532754898"
}

variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "agent-platform"
}

variable "ec2_public_ip" {
  description = "EC2 public IP"
  type        = string
  default     = "3.95.214.11"
}

variable "approval_email" {
  description = "Email address for SNS approval notifications"
  type        = string
}

variable "test_user_email" {
  description = "Cognito test user email"
  type        = string
  default     = "admin@demo.com"
}

variable "test_user_password" {
  description = "Cognito test user initial password"
  type        = string
  default     = "Test123!"
  sensitive   = true
}

variable "test_tenant_id" {
  description = "Tenant ID assigned to the Cognito test user"
  type        = string
  default     = "boc-tenant-01"
}