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
    x_tenant_id: str = Header(default=""),
) -> dict:
    auth_mode = os.getenv("AUTH_MODE", "local")

    if auth_mode == "local":
        if not x_tenant_id:
            raise HTTPException(status_code=401, detail="X-Tenant-Id header required in local mode")
        return {"tenant_id": x_tenant_id, "email": "local@demo"}

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.replace("Bearer ", "")
    claims = verify_token(token)
    tenant_id = claims.get("custom:tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="custom:tenant_id claim missing")
    return {"tenant_id": tenant_id, "email": claims.get("email", "")}