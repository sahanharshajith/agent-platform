# Networking & Data Sources for RDS

# Look up default VPC if not explicitly provided
data "aws_vpc" "default" {
  default = var.vpc_id == "" ? true : false
  id      = var.vpc_id != "" ? var.vpc_id : null
}

# Look up subnets in the selected VPC
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Security group for AgentFlow PostgreSQL RDS database"
  vpc_id      = data.aws_vpc.default.id

  # Allow inbound PostgreSQL connections
  ingress {
    description = "PostgreSQL access from allowed CIDRs and EC2 backend"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = distinct(concat(
      var.rds_allowed_cidr_blocks,
      ["${var.ec2_public_ip}/32"]
    ))
  }

  # Allow all outbound traffic
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

# RDS DB Subnet Group
resource "aws_db_subnet_group" "rds" {
  name        = "${var.project_name}-db-subnet-group"
  description = "Database subnet group for ${var.project_name} PostgreSQL RDS"
  subnet_ids  = length(var.rds_subnet_ids) > 0 ? var.rds_subnet_ids : data.aws_subnets.default.ids

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}


# RDS PostgreSQL Parameter Group
resource "aws_db_parameter_group" "rds" {
  name        = "${var.project_name}-postgres15-params"
  family      = "postgres15"
  description = "Custom parameter group for AgentFlow PostgreSQL 15"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = {
    Name = "${var.project_name}-postgres15-params"
  }
}

# Amazon RDS PostgreSQL Database Instance
resource "aws_db_instance" "postgres" {
  identifier            = "${var.project_name}-postgres"
  engine                = "postgres"
  engine_version        = var.rds_engine_version
  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = 100
  storage_type          = "gp3"

  db_name  = var.rds_db_name
  username = var.rds_master_username
  password = var.rds_master_password

  db_subnet_group_name   = aws_db_subnet_group.rds.name
  parameter_group_name   = aws_db_parameter_group.rds.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  publicly_accessible = var.rds_publicly_accessible
  skip_final_snapshot = var.rds_skip_final_snapshot
  deletion_protection = false

  auto_minor_version_upgrade = true
  backup_retention_period    = var.rds_backup_retention_period
  backup_window              = "03:00-04:00"
  maintenance_window         = "Mon:04:00-Mon:05:00"

  copy_tags_to_snapshot = true

  tags = {
    Name = "${var.project_name}-postgres"
  }
}

# AWS Secrets Manager Secret for RDS Credentials
resource "aws_secretsmanager_secret" "rds_credentials" {
  name                    = "${var.project_name}/rds/credentials"
  description             = "Master credentials and connection URL for AgentFlow RDS PostgreSQL"
  recovery_window_in_days = 0

  tags = {
    Name = "${var.project_name}-rds-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id
  secret_string = jsonencode({
    engine            = "postgres"
    host              = aws_db_instance.postgres.address
    port              = aws_db_instance.postgres.port
    database          = aws_db_instance.postgres.db_name
    username          = aws_db_instance.postgres.username
    password          = var.rds_master_password
    connection_string = "postgresql://${aws_db_instance.postgres.username}:${var.rds_master_password}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}"
  })
}
