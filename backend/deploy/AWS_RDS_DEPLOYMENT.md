# AWS RDS PostgreSQL Deployment Guide for AgentFlow

This guide provides instructions to provision, initialize, and run the AgentFlow database on Amazon RDS PostgreSQL so the application is fully functional and production-ready in AWS.

---

## 1. Prerequisites & Architecture

AgentFlow requires a relational database for:
1. **`executions`**: Tracking agent execution sessions, statuses (`completed`, `pending_approval`, `rejected`), timestamps, and pending approval payloads.
2. **`audit_events`**: Immutable timeline of every user message, RAG retrieval chunk, tool call, policy gate, and customer consent decision.
3. **`tenant_settings`**: Multi-tenant configuration, LLM model mappings, financial policy thresholds (`refund_threshold`, `wire_threshold`), and tenant API keys.

**Recommended Engine:** Amazon RDS for PostgreSQL (Version 14, 15, or 16).

---

## 2. Provisioning Amazon RDS PostgreSQL Instance

### Option A: Via AWS Management Console
1. Navigate to **AWS RDS Console** > **Databases** > **Create database**.
2. **Database creation method**: *Standard create*.
3. **Engine options**: *PostgreSQL* (Version 15 or 16).
4. **Templates**: 
   - *Production* or *Free tier* (`db.t4g.micro` or `db.t3.micro`).
5. **Settings**:
   - DB instance identifier: `agentflow-db`
   - Master username: `postgres`
   - Master password: `<Choose a strong password>`
6. **Connectivity**:
   - VPC: Select your Application VPC.
   - Public access: Select *No* (if backend runs on EC2/ECS inside the VPC) or *Yes* (if connecting from outside VPC during setup).
   - VPC security group: Create/select a security group allowing inbound port `5432`.
7. **Initial Database Name**:
   - Under *Additional configuration* > *Initial database name*: enter `agentflow`.
8. Click **Create database**.

### Option B: Via AWS CLI
```bash
aws rds create-db-instance \
    --db-instance-identifier agentflow-db \
    --db-instance-class db.t4g.micro \
    --engine postgres \
    --engine-version 15.4 \
    --allocated-storage 20 \
    --master-username postgres \
    --master-user-password "YourStrongPassword123!" \
    --db-name agentflow \
    --vpc-security-group-ids sg-xxxxxxxx \
    --backup-retention-period 7 \
    --region us-east-1
```

---

## 3. Configuring Security Groups

Ensure your RDS Security Group allows inbound TCP traffic on port `5432`:
- **Type**: PostgreSQL
- **Protocol**: TCP
- **Port range**: 5432
- **Source**: 
  - For EC2/ECS/EKS backend: The Security Group ID of the backend application instances.
  - For local admin workstation (if testing directly): Your public IP `/32`.

---

## 4. Running the Database Initialization Script

Once the RDS instance status shows **Available**, run the initialization utility:

### Step 1: Install PostgreSQL Driver
```bash
pip install psycopg2-binary
```

### Step 2: Run Setup Script
```bash
python scripts/setup_rds.py \
    --host agentflow-db.xxxxxxxxx.us-east-1.rds.amazonaws.com \
    --port 5432 \
    --db agentflow \
    --user postgres \
    --password "YourStrongPassword123!" \
    --sslmode require
```

Or using a full connection string:
```bash
python scripts/setup_rds.py --database-url "postgresql://postgres:YourStrongPassword123!@agentflow-db.xxxxxxxxx.us-east-1.rds.amazonaws.com:5432/agentflow?sslmode=require"
```

### Direct SQL Execution Alternative (psql)
You can also execute the DDL script directly with the standard PostgreSQL CLI:
```bash
psql "host=agentflow-db.xxxxxxxxx.us-east-1.rds.amazonaws.com port=5432 dbname=agentflow user=postgres sslmode=require" -f scripts/rds_init.sql
```

---

## 5. Configuring Backend Environment Variables

In your backend `.env` file (or AWS Systems Manager Parameter Store / AWS Secrets Manager):

```env
# Enable RDS PostgreSQL mode
USE_RDS=true

# RDS Connection parameters
RDS_HOST=agentflow-db.xxxxxxxxx.us-east-1.rds.amazonaws.com
RDS_PORT=5432
RDS_DB_NAME=agentflow
RDS_USER=postgres
RDS_PASSWORD=YourStrongPassword123!
RDS_SSL_MODE=require

# Or use DATABASE_URL:
# DATABASE_URL=postgresql://postgres:YourStrongPassword123!@agentflow-db.xxxxxxxxx.us-east-1.rds.amazonaws.com:5432/agentflow?sslmode=require
```

---

## 6. Verification and Health Check

### 1. Verify Database Tables
Run the verification check:
```bash
python scripts/setup_rds.py --check-only
```
Expected output:
```text
==================================================
 AWS RDS VERIFICATION REPORT
==================================================
  • Table 'tenant_settings': 1 record(s)
  • Table 'executions': 5 record(s)
  • Table 'audit_events': 15 record(s)

[✓] Tenant verified: boc-tenant-01 (Bank of Commerce) | API Key: af_live_99a8f4c...
==================================================
 RDS database is ready for AgentFlow backend deployment.
==================================================
```

### 2. Verify Backend API Endpoints
Start the FastAPI server:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Test endpoints:
- `GET http://localhost:8000/health` -> `{"status": "ok"}`
- `GET http://localhost:8000/audit` -> Returns seeded RDS executions.
- `GET http://localhost:8000/admin/overview` -> Returns live statistics calculated from RDS.
- `GET http://localhost:8000/admin/settings` -> Returns tenant settings stored in RDS.
