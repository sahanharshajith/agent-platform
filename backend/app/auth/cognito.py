import hmac
import os

import requests
from fastapi import Header, HTTPException
from jose import jwt, jwk

from app.audit import get_tenant_settings
from app.config import settings

COGNITO_REGION = os.getenv("AWS_REGION", "us-east-1")
COGNITO_POOL_ID = os.getenv("COGNITO_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")

_jwks_cache = None


def _unauthorized(detail: str = "Invalid Bearer token") -> HTTPException:
    return HTTPException(
        status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"}
    )


def _get_jwks():
    global _jwks_cache
    if _jwks_cache is None:
        url = (
            f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/"
            f"{COGNITO_POOL_ID}/.well-known/jwks.json"
        )
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        _jwks_cache = response.json()
    return _jwks_cache


def verify_token(token: str) -> dict:
    if not COGNITO_POOL_ID or not COGNITO_CLIENT_ID:
        raise _unauthorized()
    try:
        headers = jwt.get_unverified_headers(token)
        jwks = _get_jwks()
        key = next((k for k in jwks["keys"] if k["kid"] == headers["kid"]), None)
        if not key:
            raise _unauthorized()
        public_key = jwk.construct(key)
        return jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=COGNITO_CLIENT_ID,
            issuer=f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_POOL_ID}",
        )
    except HTTPException:
        raise
    except Exception as exc:
        # Malformed tokens, invalid signatures and unavailable JWKS must fail closed.
        raise _unauthorized() from exc


def _key_matches(token: str, expected: str) -> bool:
    return bool(expected) and hmac.compare_digest(
        token.encode("utf-8"), expected.encode("utf-8")
    )


def get_current_tenant(
    authorization: str = Header(default=""),
    x_tenant_id: str = Header(default="", alias="X-Tenant-Id"),
) -> dict:
    tenant_header = x_tenant_id.strip()
    raw_authorization = authorization.strip()
    token = ""
    if raw_authorization:
        parts = raw_authorization.split(None, 1)
        if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
            raise _unauthorized("Expected a Bearer token")
        token = parts[1].strip()

    streaming_tenant = settings.STREAMING_TENANT_ID.strip()
    streaming_key = settings.STREAMING_API_KEY
    if token and _key_matches(token, streaming_key):
        if not streaming_tenant or (tenant_header and tenant_header != streaming_tenant):
            raise _unauthorized("Tenant does not match service credentials")
        return {
            "tenant_id": streaming_tenant,
            "email": f"{streaming_tenant}@agent.api",
            "service": "streaming",
        }

    # Reserve the integration tenant even in local mode. Neither a spoofed header,
    # a general tenant key nor a Cognito token can replace its service credential.
    if tenant_header and tenant_header == streaming_tenant:
        raise _unauthorized("Valid streaming service credentials required")

    if not token:
        if settings.AUTH_MODE.strip().lower() == "local":
            local_tenant = tenant_header or "boc-tenant-01"
            if local_tenant == streaming_tenant:
                raise _unauthorized("Valid streaming service credentials required")
            return {"tenant_id": local_tenant, "email": "local@demo"}
        raise _unauthorized("Missing Bearer token")

    # General tenant keys need an explicit tenant. Use the configured audit backend
    # so local installations never attempt an unconditional RDS connection.
    if tenant_header:
        try:
            tenant_settings = get_tenant_settings(tenant_header)
            stored_key = tenant_settings.get("api_key", "")
            if isinstance(stored_key, str) and _key_matches(token, stored_key):
                return {
                    "tenant_id": tenant_header,
                    "email": f"{tenant_header}@agent.api",
                }
        except Exception:
            # A failed key lookup cannot authorize a request; a valid JWT may
            # still authenticate independently of the settings database.
            pass

    try:
        claims = verify_token(token)
    except HTTPException:
        raise
    except Exception as exc:
        raise _unauthorized() from exc
    tenant_id = claims.get("custom:tenant_id")
    if not isinstance(tenant_id, str) or not tenant_id.strip():
        raise _unauthorized("custom:tenant_id claim missing")
    if tenant_id == streaming_tenant:
        raise _unauthorized("Valid streaming service credentials required")
    if tenant_header and tenant_header != tenant_id:
        raise _unauthorized("Tenant does not match token")
    return {"tenant_id": tenant_id, "email": claims.get("email", "")}
