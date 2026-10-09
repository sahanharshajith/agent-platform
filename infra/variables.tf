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

# ─────────────────────────────────────────────────────────────
# AWS RDS PostgreSQL Variables
# ─────────────────────────────────────────────────────────────
variable "vpc_id" {
  description = "VPC ID where RDS should be provisioned (leave empty for default VPC)"
  type        = string
  default     = ""
}

variable "rds_subnet_ids" {
  description = "Subnet IDs for RDS subnet group (leave empty to auto-detect subnets in VPC)"
  type        = list(string)
  default     = []
}

variable "rds_db_name" {
  description = "Database name inside RDS PostgreSQL"
  type        = string
  default     = "agentflow"
}

variable "rds_master_username" {
  description = "Master username for RDS PostgreSQL"
  type        = string
  default     = "postgres"
}

variable "rds_master_password" {
  description = "Master password for RDS PostgreSQL"
  type        = string
  default     = "AgentFlow2026!SecureRDS"
  sensitive   = true
}

variable "rds_instance_class" {
  description = "DB instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_allocated_storage" {
  description = "Initial allocated storage in GB"
  type        = number
  default     = 20
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.7"
}

variable "rds_publicly_accessible" {
  description = "Whether the RDS instance is publicly accessible"
  type        = bool
  default     = true
}

variable "rds_allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access RDS on port 5432"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "rds_backup_retention_period" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}

variable "rds_skip_final_snapshot" {
  description = "Whether to skip final snapshot when destroying RDS instance"
  type        = bool
  default     = true
}