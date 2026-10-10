"""Explicitly authorized, read-only monitoring across application tenants."""

import json
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.config import settings
from app.audit.monitoring import load_records, overview, summarize
from .routes import get_console_tenant

router = APIRouter(prefix="/admin/monitoring", tags=["monitoring"])


def allowed_tenants(user):
    try:
        grants = json.loads(settings.MONITORING_TENANT_ACCESS)
        if not isinstance(grants, dict):
            raise ValueError()
        extra = grants.get(user["tenant_id"], [])
        if not isinstance(extra, list) or not all(isinstance(item, str) and item.strip() for item in extra):
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(503, "Invalid MONITORING_TENANT_ACCESS configuration.") from None
    return list(dict.fromkeys([user["tenant_id"], *extra]))


def monitoring_user(authorization: str = Header(default=""), user=Depends(get_console_tenant)):
    # The shared chat credential never grants dashboard access, including local mode.
    token = authorization.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if settings.STREAMING_API_KEY and hmac.compare_digest(token.encode(), settings.STREAMING_API_KEY.encode()):
        raise HTTPException(403, "Streaming service credentials cannot access monitoring.")
    return user


def monitoring_tenant(tenant_id: str | None = None, user=Depends(monitoring_user)):
    target = tenant_id or user["tenant_id"]
    if target not in allowed_tenants(user):
        raise HTTPException(403, "Your admin account cannot monitor this workspace.")
    return target


@router.get("/tenants")
def tenants(user=Depends(monitoring_user)):
    allowed = allowed_tenants(user)
    return {"tenants": [{"tenant_id": tenant, "name": "StreamSphere" if tenant == settings.STREAMING_TENANT_ID else tenant}
                        for tenant in allowed],
            "default_tenant_id": settings.STREAMING_TENANT_ID if settings.STREAMING_TENANT_ID in allowed else user["tenant_id"]}


@router.get("/executions")
def executions(tenant_id=Depends(monitoring_tenant), limit: int = Query(default=200, ge=1, le=1000)):
    return [summarize(record) for record in load_records(tenant_id, limit=limit)]


@router.get("/executions/{execution_id}")
def execution(execution_id: str, tenant_id=Depends(monitoring_tenant)):
    records = load_records(tenant_id, execution_id=execution_id)
    if not records:
        raise HTTPException(404, "Execution not found in this workspace.")
    return records[0]


@router.get("/overview")
def stats(tenant_id=Depends(monitoring_tenant)):
    return overview(tenant_id)
