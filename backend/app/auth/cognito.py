import os
import requests
from jose import jwt, jwk
from fastapi import Header, HTTPException

COGNITO_REGION = os.getenv("AWS_REGION", "us-east-1")
COGNITO_POOL_ID = os.getenv("COGNITO_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")

_jwks_cache = None


def _get_jwks():
    global _jwks_cache
    if _jwks_cache is None:
        url = (
            f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/"
            f"{COGNITO_POOL_ID}/.well-known/jwks.json"
        )
        _jwks_cache = requests.get(url, timeout=5).json()
    return _jwks_cache


def verify_token(token: str) -> dict:
    jwks = _get_jwks()
    headers = jwt.get_unverified_headers(token)
    kid = headers["kid"]
    key = next((k for k in jwks["keys"] if k["kid"] == kid), None)
    if not key:
        raise HTTPException(status_code=401, detail="Invalid token key")
    public_key = jwk.construct(key)
    return jwt.decode(
        token,
        public_key,
        algorithms=["RS256"],
        audience=COGNITO_CLIENT_ID,
    )


def get_current_tenant(
    authorization: str = Header(default=""),
    x_tenant_id: str = Header(default="", alias="X-Tenant-Id"),
) -> dict:
    auth_mode = os.getenv("AUTH_MODE", "local")

    raw_token = authorization.strip()
    if raw_token.lower().startswith("bearer "):
        token = raw_token[7:].strip()
    else:
        token = raw_token


    # 1. Direct tenant API Key check against tenant_settings in database
    if token:
        try:
            from app.audit.rds_logger import _conn
            from psycopg2.extras import RealDictCursor
            with _conn() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    if x_tenant_id:
                        cur.execute(
                            "SELECT tenant_id FROM tenant_settings WHERE tenant_id = %s AND api_key = %s",
                            (x_tenant_id.strip(), token),
                        )
                    else:
                        cur.execute(
                            "SELECT tenant_id FROM tenant_settings WHERE api_key = %s",
                            (token,),
                        )
                    row = cur.fetchone()
                    if row:
                        return {"tenant_id": row["tenant_id"], "email": f"{row['tenant_id']}@agent.api"}
        except Exception:
            pass

    # 2. Explicit tenant header in local mode
    if x_tenant_id:
        return {"tenant_id": x_tenant_id.strip(), "email": "local@demo"}

    # 3. Cognito / JWT Token handling
    if auth_mode == "local":
        if token:
            try:
                unverified = jwt.get_unverified_claims(token)
                return {
                    "tenant_id": unverified.get("custom:tenant_id", "boc-tenant-01"),
                    "email": unverified.get("email", "local@demo"),
                }
            except Exception:
                pass
        return {"tenant_id": "boc-tenant-01", "email": "local@demo"}

    if not token:
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    claims = verify_token(token)
    tenant_id = claims.get("custom:tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="custom:tenant_id claim missing")
    return {"tenant_id": tenant_id, "email": claims.get("email", "")}