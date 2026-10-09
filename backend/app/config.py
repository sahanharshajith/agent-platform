import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)


class Settings:
    # AWS Cloud Integration
    USE_AWS: bool = os.getenv("USE_AWS", "false").lower() in ("true", "1", "yes")
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    DYNAMO_SESSIONS: str = os.getenv("DYNAMO_SESSIONS", "agent_sessions")
    DYNAMO_AUDIT: str = os.getenv("DYNAMO_AUDIT", "agent_audit")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "")
    SQS_URL: str = os.getenv("SQS_URL", "")
    SNS_ARN: str = os.getenv("SNS_ARN", "")

    # AWS RDS Relational Database (PostgreSQL)
    USE_RDS: bool = os.getenv("USE_RDS", "false").lower() in ("true", "1", "yes")
    RDS_HOST: str = os.getenv("RDS_HOST", "")
    RDS_PORT: int = int(os.getenv("RDS_PORT", "5432"))
    RDS_DB_NAME: str = os.getenv("RDS_DB_NAME", "agentflow")
    RDS_USER: str = os.getenv("RDS_USER", "postgres")
    RDS_PASSWORD: str = os.getenv("RDS_PASSWORD", "")
    RDS_SSL_MODE: str = os.getenv("RDS_SSL_MODE", "prefer")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # LLM Settings
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "bedrock")
    EMBEDDING_PROVIDER: str = os.getenv("EMBEDDING_PROVIDER", "gemini")

    BEDROCK_REGION: str = os.getenv("BEDROCK_REGION", os.getenv("AWS_REGION", "us-east-1"))
    BEDROCK_CHAT_MODEL: str = os.getenv(
        "BEDROCK_CHAT_MODEL", "us.anthropic.claude-3-5-haiku-20241022-v1:0"
    )
    BEDROCK_EMBEDDING_MODEL: str = os.getenv(
        "BEDROCK_EMBEDDING_MODEL", "amazon.titan-embed-text-v2:0"
    )

    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_CHAT_MODEL: str = os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash")
    GEMINI_EMBEDDING_MODEL: str = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "768"))

    # Local Fallback Paths
    FAISS_INDEX_PATH: str = str(BASE_DIR / os.getenv("FAISS_INDEX_PATH", "data/faiss_index"))
    FAISS_METADATA_PATH: str = str(BASE_DIR / os.getenv("FAISS_METADATA_PATH", "data/faiss_metadata.json"))
    SQLITE_AUDIT_DB: str = str(BASE_DIR / os.getenv("SQLITE_AUDIT_DB", "data/audit.db"))

    # Auth & Security
    AUTH_MODE: str = os.getenv("AUTH_MODE", "local")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-me")

    # StreamSphere server-to-server integration. These secrets stay on backends.
    STREAMING_TENANT_ID: str = os.getenv("STREAMING_TENANT_ID", "streamsphere-prod-01").strip()
    STREAMING_API_KEY: str = os.getenv("STREAMING_API_KEY", "")
    STREAMING_BASE_URL: str = os.getenv("STREAMING_BASE_URL", "")
    STREAMING_TOOL_API_KEY: str = os.getenv("STREAMING_TOOL_API_KEY", "")
    STREAMING_TOOL_TIMEOUT: float = float(os.getenv("STREAMING_TOOL_TIMEOUT", "15"))


settings = Settings()
