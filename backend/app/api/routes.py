from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field, StrictBool
from typing import Optional, List, Dict, Any

from app.auth import get_current_tenant
from app.agents import run_agent, resume_after_approval
from app.agents import streaming
from app.audit import (
    get_execution,
    list_executions,
    get_tenant_settings,
    update_tenant_settings,
    rotate_tenant_api_key,
    get_overview_stats,
    get_usage_stats,
    get_tenant_consent,
)

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = Field(default_factory=list)
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"


class ApproveRequest(BaseModel):
    execution_id: Optional[str] = None
    token: Optional[str] = None
    consent_token: Optional[str] = None
    consent_id: Optional[str] = None
    approved: StrictBool = True
    approver: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None

    class Config:
        extra = "allow"


class SettingsUpdateRequest(BaseModel):
    organization_name: Optional[str] = None
    domain: Optional[str] = None
    classification_model: Optional[str] = None
    reasoning_model: Optional[str] = None
    embedding_model: Optional[str] = None
    refund_threshold: Optional[float] = None
    wire_threshold: Optional[float] = None
    max_steps: Optional[int] = None


# ─────────────────────────────────────────────────────────────
# Universal AI Chatbot & Customer Consent Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/chat")
def chat(req: ChatRequest, user=Depends(get_current_tenant)):
    msg = req.message.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="message is required")

    tenant_id = user["tenant_id"]
    if streaming.is_streaming_tenant(tenant_id):
        return streaming.chat(msg, tenant_id, req.user_id, req.session_id)
    req_dict = req.model_dump()

    # Aggregate any dynamic context passed by the tenant (e.g., account snapshot, cart, profile, etc.)
    context = dict(req.context or {})
    for k, v in req_dict.items():
        if k not in ("message", "history", "session_id", "user_id", "context") and v is not None:
            context[k] = v

    session_id = req.session_id or req_dict.get("session_id")
    user_id = req.user_id or req_dict.get("user_id")
    if not user_id and "account" in context and isinstance(context["account"], dict):
        user_id = context["account"].get("id") or context["account"].get("email")
    if not user_id:
        user_id = user.get("email") or "default_user"

    result = run_agent(
        user_message=msg,
        tenant_id=tenant_id,
        session_id=session_id,
        user_id=user_id,
        context=context,
        history=req.history,
    )
    return result


def _handle_approval_or_consent(
    req: ApproveRequest,
    user: dict,
    idempotency_key: Optional[str] = None,
):
    if streaming.is_streaming_tenant(user["tenant_id"]):
        if "approved" not in req.model_fields_set:
            raise HTTPException(400, "An explicit approval decision is required.")
        return streaming.consent(
            tenant_id=user["tenant_id"], user_id=req.user_id, session_id=req.session_id,
            execution_id=req.execution_id, consent_token=req.consent_token or req.token,
            consent_id=req.consent_id, approved=req.approved, idempotency_key=idempotency_key,
        )
    req_dict = req.model_dump()
    consent_id = idempotency_key or req.consent_id or req_dict.get("consent_id")
    token = req.token or req.consent_token or req_dict.get("consent_token") or req_dict.get("token")
    execution_id = req.execution_id or req_dict.get("execution_id") or token or consent_id

    # Resolve the same reference used by resume_after_approval before authorizing it.
    stored = get_tenant_consent(consent_id=consent_id or execution_id, consent_token=token)
    if stored and (
        stored["tenant_id"] != user["tenant_id"]
        or (req.execution_id and req.execution_id != stored["execution_id"])
        or (token and token != stored["consent_token"])
    ):
        raise HTTPException(404, "Confirmation not found for this tenant and execution.")
    record = get_execution(stored["execution_id"] if stored else execution_id)
    if not record or record["tenant_id"] != user["tenant_id"]:
        raise HTTPException(404, "Execution not found for this tenant.")
    execution_id = record["execution_id"]

    approver = req.approver or user.get("email") or "user"

    result = resume_after_approval(
        execution_id=execution_id,
        approved=req.approved,
        approver=approver,
        consent_id=consent_id,
        consent_token=token,
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "approval failed"))
    return result


@router.post("/approve")
def approve(
    req: ApproveRequest,
    user=Depends(get_current_tenant),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    return _handle_approval_or_consent(req, user, idempotency_key)


@router.post("/consent")
def consent(
    req: ApproveRequest,
    user=Depends(get_current_tenant),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    return _handle_approval_or_consent(req, user, idempotency_key)



# ─────────────────────────────────────────────────────────────
# Audit Trail API Endpoints (Preserved API Contract & Filters)
# ─────────────────────────────────────────────────────────────

def get_console_tenant(user=Depends(get_current_tenant)):
    if user.get("service") == "streaming":
        raise HTTPException(403, "The streaming service credential only permits chat and consent.")
    return user


@router.get("/audit/{execution_id}")
def audit(execution_id: str, user=Depends(get_console_tenant)):
    record = get_execution(execution_id)
    if not record:
        raise HTTPException(status_code=404, detail="execution not found")
    if record["tenant_id"] != user["tenant_id"]:
        raise HTTPException(status_code=403, detail="not authorized for this execution")
    return record


@router.get("/audit")
def audit_list(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    user=Depends(get_console_tenant),
):
    # Returns list of execution records for the authenticated tenant with optional filtering
    executions = list_executions(user["tenant_id"], limit=limit, status=status, search=search)
    return executions


# ─────────────────────────────────────────────────────────────
# Dedicated Agent Admin Console Endpoints (Accommodating Frontend)
# ─────────────────────────────────────────────────────────────

@router.get("/admin/overview")
def admin_overview(user=Depends(get_console_tenant)):
    return get_overview_stats(user["tenant_id"])


@router.get("/admin/analytics")
def admin_analytics(user=Depends(get_console_tenant)):
    return get_overview_stats(user["tenant_id"])


@router.get("/admin/live-activity")
def admin_live_activity(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    user=Depends(get_console_tenant),
):
    return list_executions(user["tenant_id"], limit=limit, status=status, search=search)


@router.get("/admin/usage")
def admin_usage(user=Depends(get_console_tenant)):
    return get_usage_stats(user["tenant_id"])


@router.get("/admin/settings")
def admin_get_settings(user=Depends(get_console_tenant)):
    settings_data = get_tenant_settings(user["tenant_id"])
    return {
        "tenant_profile": {
            "name": settings_data["organization_name"],
            "domain": settings_data["domain"],
            "tenant_id": settings_data["tenant_id"],
        },
        "model_config": {
            "classification_model": settings_data["classification_model"],
            "reasoning_model": settings_data["reasoning_model"],
            "embedding_model": settings_data["embedding_model"],
        },
        "policy_thresholds": {
            "refund_threshold": settings_data["refund_threshold"],
            "wire_threshold": settings_data["wire_threshold"],
            "max_steps": settings_data["max_steps"],
        },
        "api_key": settings_data["api_key"],
        "embed_snippet": f'<script src="https://cdn.agentflow.ai/v1/widget.js" data-tenant-id="{settings_data["tenant_id"]}" data-theme="auto" async></script>',
    }


@router.put("/admin/settings")
def admin_update_settings(req: SettingsUpdateRequest, user=Depends(get_console_tenant)):
    updated = update_tenant_settings(user["tenant_id"], req.model_dump(exclude_unset=True))
    return {"status": "ok", "settings": updated}


@router.post("/admin/rotate-key")
def admin_rotate_key(user=Depends(get_console_tenant)):
    new_key = rotate_tenant_api_key(user["tenant_id"])
    return {"status": "ok", "api_key": new_key}
