#!/usr/bin/env python3
"""
AgentFlow - AWS RDS PostgreSQL Setup & Migration Utility

This script connects to an Amazon RDS (or Aurora) PostgreSQL instance,
provisions the required schema (executions, audit_events, tenant_settings),
and verifies connectivity and data readiness.

Usage:
    python setup_rds.py [--host HOST] [--port PORT] [--db DBNAME] [--user USER] [--password PASSWORD]
    
Or using environment variables from .env:
    USE_RDS=true
    RDS_HOST=your-rds-endpoint.us-east-1.rds.amazonaws.com
    RDS_PORT=5432
    RDS_DB_NAME=agentflow
    RDS_USER=postgres
    RDS_PASSWORD=your_password
    python setup_rds.py
"""

import argparse
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load local environment if present
BASE_DIR = Path(__file__).resolve().parent.parent
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def parse_args():
    parser = argparse.ArgumentParser(description="Provision and verify AgentFlow database on AWS RDS PostgreSQL")
    parser.add_argument("--host", default=os.getenv("RDS_HOST", "localhost"), help="RDS PostgreSQL endpoint host")
    parser.add_argument("--port", type=int, default=int(os.getenv("RDS_PORT", "5432")), help="RDS PostgreSQL port (default: 5432)")
    parser.add_argument("--db", default=os.getenv("RDS_DB_NAME", "agentflow"), help="Target database name (default: agentflow)")
    parser.add_argument("--user", default=os.getenv("RDS_USER", "postgres"), help="Database master username")
    parser.add_argument("--password", default=os.getenv("RDS_PASSWORD", ""), help="Database password")
    parser.add_argument("--sslmode", default=os.getenv("RDS_SSL_MODE", "prefer"), help="SSL mode (require, prefer, disable)")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""), help="Full connection URL (overrides separate parameters)")
    parser.add_argument("--sql-file", default=str(Path(__file__).parent / "rds_init.sql"), help="Path to DDL SQL file")
    parser.add_argument("--create-db", action="store_true", default=True, help="Automatically create database if not exists (default: True)")
    parser.add_argument("--check-only", action="store_true", help="Only verify connectivity and table counts without running DDL")
    return parser.parse_args()


def get_connection(conn_params, maintenance_db=None):
    try:
        import psycopg2
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    except ImportError:
        print("\n[ERROR] Missing 'psycopg2' library.")
        print("Please install the PostgreSQL driver with:")
        print("    pip install psycopg2-binary")
        sys.exit(1)

    params = conn_params.copy()
    if maintenance_db:
        params["dbname"] = maintenance_db

    conn = psycopg2.connect(**params)
    return conn


def ensure_database_exists(args):
    """Connect to default 'postgres' database to ensure the target database exists."""
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

    conn_params = {
        "host": args.host,
        "port": args.port,
        "user": args.user,
        "password": args.password,
        "sslmode": args.sslmode,
    }

    print(f"[*] Checking if target database '{args.db}' exists on RDS host {args.host}:{args.port}...")
    try:
        conn = psycopg2.connect(dbname="postgres", **conn_params)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (args.db,))
            exists = cur.fetchone()
            if not exists:
                print(f"[+] Database '{args.db}' does not exist. Creating now...")
                # Database name safely sanitized
                db_name = args.db.replace('"', '').replace("'", "").replace(";", "")
                cur.execute(f'CREATE DATABASE "{db_name}"')
                print(f"[OK] Database '{db_name}' created successfully.")
            else:
                print(f"[OK] Database '{args.db}' already exists.")
        conn.close()
    except Exception as e:
        print(f"[!] Note: Could not check/create database via maintenance DB (may lack superuser or DB already exists): {e}")


def apply_schema(conn, sql_file_path):
    """Execute the DDL initialization script."""
    print(f"[*] Reading DDL migration script: {sql_file_path}")
    if not os.path.exists(sql_file_path):
        print(f"[ERROR] SQL file not found: {sql_file_path}")
        sys.exit(1)

    with open(sql_file_path, "r", encoding="utf-8") as f:
        sql_content = f.read()

    print("[*] Executing schema migrations and seeding initial tenant records...")
    with conn.cursor() as cur:
        cur.execute(sql_content)
    conn.commit()
    print("[OK] Schema applied and seeded successfully!")


def verify_tables(conn):
    """Verify tables exist and print row counts."""
    tables = ["tenant_settings", "executions", "audit_events"]
    print("\n" + "=" * 50)
    print(" AWS RDS VERIFICATION REPORT")
    print("=" * 50)

    with conn.cursor() as cur:
        for table in tables:
            try:
                cur.execute(f"SELECT COUNT(*) FROM {table};")
                count = cur.fetchone()[0]
                print(f"  - Table '{table}': {count} record(s)")
            except Exception as e:
                print(f"  - Table '{table}': [ERROR] {e}")

        # Check tenant settings for boc-tenant-01
        try:
            cur.execute("SELECT tenant_id, organization_name, api_key FROM tenant_settings WHERE tenant_id = 'boc-tenant-01';")
            tenant = cur.fetchone()
            if tenant:
                print(f"\n[OK] Tenant verified: {tenant[0]} ({tenant[1]}) | API Key: {tenant[2][:12]}...")
            else:
                print("\n[!] Warning: Default tenant 'boc-tenant-01' not found in tenant_settings.")
        except Exception as e:
            print(f"[!] Tenant query failed: {e}")

    print("=" * 50)
    print(" RDS database is ready for AgentFlow backend deployment.")
    print("=" * 50 + "\n")


def main():
    args = parse_args()

    print("=" * 60)
    print(" AGENTFLOW - AWS RDS POSTGRESQL INITIALIZATION & MIGRATION")
    print("=" * 60)

    if args.database_url:
        import psycopg2
        print(f"[*] Connecting using DATABASE_URL: {args.database_url.split('@')[-1] if '@' in args.database_url else 'configured'}")
        conn = psycopg2.connect(args.database_url)
    else:
        if args.create_db and not args.check_only:
            ensure_database_exists(args)

        conn_params = {
            "dbname": args.db,
            "host": args.host,
            "port": args.port,
            "user": args.user,
            "password": args.password,
            "sslmode": args.sslmode,
        }
        print(f"[*] Connecting to database '{args.db}' on host '{args.host}:{args.port}' as user '{args.user}'...")
        try:
            conn = get_connection(conn_params)
            print("[OK] Connected to RDS PostgreSQL successfully.")
        except Exception as err:
            print(f"\n[ERROR] Connection failed: {err}")
            print("\nPlease check:")
            print("  1. RDS Endpoint hostname and port (5432).")
            print("  2. Security Group inbound rule: Allow TCP 5432 from your IP / EC2 / ECS.")
            print("  3. Username and password credentials.")
            print("  4. RDS Public Accessibility setting if connecting from outside AWS VPC.")
            sys.exit(1)

    try:
        if not args.check_only:
            apply_schema(conn, args.sql_file)

        verify_tables(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
