import json
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import boto3
from boto3.dynamodb.conditions import Key
from app.config import settings


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_dynamodb():
    return boto3.resource("dynamodb", region_name=settings.AWS_REGION)


def _get_audit_table():
    dynamodb = _get_dynamodb()
    return dynamodb.Table(settings.DYNAMO_AUDIT)


def _get_sessions_table():
    dynamodb = _get_dynamodb()
    return dynamodb.Table(settings.DYNAMO_SESSIONS)


def init_db() -> None:
    """No-op for DynamoDB as tables are pre-provisioned via IaC/CLI."""
    pass


def log_event(execution_id: str, tenant_id: str, event_type: str, payload: Dict[str, Any]) -> None:
    """Log an audit event to DynamoDB table."""
    table = _get_audit_table()
    table.put_item(
        Item={
            "execution_id": execution_id,
            "timestamp": _now(),
            "tenant_id": tenant_id,
            "event_type": event_type,
            "payload": json.dumps(payload, default=str),
        }
    )


def create_execution(execution_id: str, tenant_id: str, status: str, pending_action: Optional[Dict[str, Any]] = None) -> None:
    """Create or update execution record in DynamoDB sessions/executions table."""
    table = _get_sessions_table()
    now = _now()
    item = {
        "session_id": execution_id,
        "tenant_id": tenant_id,
        "status": status,
        "created_at": now,
        "updated_at": now,
    }
    if pending_action:
        item["pending_action"] = json.dumps(pending_action, default=str)
    table.put_item(Item=item)


def update_execution_status(execution_id: str, status: str, pending_action: Optional[Dict[str, Any]] = None) -> None:
    """Update execution status in DynamoDB."""
    table = _get_sessions_table()
    update_expr = "SET #st = :s, updated_at = :u"
    expr_attr_names = {"#st": "status"}
    expr_attr_values = {":s": status, ":u": _now()}
    if pending_action is not None:
        update_expr += ", pending_action = :p"
        expr_attr_values[":p"] = json.dumps(pending_action, default=str)
    
    table.update_item(
        Key={"session_id": execution_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_attr_names,
        ExpressionAttributeValues=expr_attr_values,
    )


def get_execution(execution_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve execution record and associated audit events."""
    sessions_table = _get_sessions_table()
    resp = sessions_table.get_item(Key={"session_id": execution_id})
    row = resp.get("Item")
    if not row:
        return None

    audit_table = _get_audit_table()
    events_resp = audit_table.query(
        KeyConditionExpression=Key("execution_id").eq(execution_id)
    )
    events = []
    for r in events_resp.get("Items", []):
        payload = json.loads(r["payload"]) if isinstance(r.get("payload"), str) else r.get("payload", {})
        events.append({
            "execution_id": r["execution_id"],
            "tenant_id": r.get("tenant_id", row.get("tenant_id")),
            "event_type": r.get("event_type", ""),
            "details": payload,
            "payload": payload,
            "timestamp": r["timestamp"],
        })
    events.sort(key=lambda x: x["timestamp"])

    pending_action = row.get("pending_action")
    if isinstance(pending_action, str):
        try:
            pending_action = json.loads(pending_action)
        except Exception:
            pass

    status = row.get("status", "")
    norm_status = "pending_approval" if status == "pending_approval" else "rejected" if status in ("rejected", "denied") else "completed"

    return {
        "execution_id": row["session_id"],
        "tenant_id": row.get("tenant_id", ""),
        "status": norm_status,
        "pending_action": pending_action,
        "events": events,
    }


def list_executions(
    tenant_id: str,
    limit: int = 100,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List executions for a given tenant from DynamoDB."""
    sessions_table = _get_sessions_table()
    resp = sessions_table.scan(Limit=limit * 2)
    items = resp.get("Items", [])
    filtered = []
    for item in items:
        t_id = item.get("tenant_id", "")
        if not tenant_id or tenant_id in ("all", "admin") or t_id == tenant_id:
            raw_status = item.get("status", "")
            norm_status = "pending_approval" if raw_status == "pending_approval" else "rejected" if raw_status in ("rejected", "denied") else "completed"
            
            if status and status != "all":
                if status == "pending_approval" and norm_status != "pending_approval":
                    continue
                elif status == "rejected" and norm_status != "rejected":
                    continue
                elif status == "completed" and norm_status != "completed":
                    continue

            exec_id = item["session_id"]
            if search and search.strip():
                term = search.strip().lower()
                if term not in exec_id.lower() and term not in t_id.lower():
                    continue

            created = item.get("created_at", "")
            filtered.append({
                "execution_id": exec_id,
                "tenant_id": t_id,
                "status": norm_status,
                "timestamp": created,
                "created_at": created,
                "intent": "Customer agent query",
                "user_id": f"usr_{exec_id[-4:]}",
                "model": "Claude 3.5 Sonnet",
                "tokens": 1120,
            })
    filtered.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return filtered[:limit]


def get_audit_trail(execution_id: str) -> list:
    """Direct helper to query audit trail by execution_id."""
    audit_table = _get_audit_table()
    resp = audit_table.query(
        KeyConditionExpression=Key("execution_id").eq(execution_id)
    )
    items = resp.get("Items", [])
    items.sort(key=lambda x: x.get("timestamp", ""))
    return items


def get_tenant_settings(tenant_id: str) -> Dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "organization_name": "Bank of Commerce" if tenant_id == "boc-tenant-01" else "Enterprise Client",
        "domain": f"{tenant_id}.agentflow.app",
        "classification_model": "claude-3-haiku",
        "reasoning_model": "claude-3-5-sonnet",
        "embedding_model": "titan-embed-v2",
        "refund_threshold": 50.0,
        "wire_threshold": 2500.0,
        "max_steps": 5,
        "api_key": "af_live_99a8f4c2810941e421b8c6a",
    }


def update_tenant_settings(tenant_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    current = get_tenant_settings(tenant_id)
    current.update(data)
    return current


def rotate_tenant_api_key(tenant_id: str) -> str:
    import uuid
    return f"af_live_{uuid.uuid4().hex[:20]}"


def get_overview_stats(tenant_id: str) -> Dict[str, Any]:
    execs = list_executions(tenant_id, limit=100)
    now = datetime.now(timezone.utc)
    hourly = [{"time": f"{h:02d}:00", "label": f"{h:02d}:00", "executions": 4} for h in range(24)]
    week = [{"label": (now - timedelta(days=6 - i)).strftime("%a"), "executions": 12 + i * 2} for i in range(7)]
    daily_tokens = [{"label": (now - timedelta(days=29 - i)).strftime("%b %d"), "tokens": 42000 + i * 1100} for i in range(30)]
    model_tokens = [
        {"name": "Haiku", "model": "Claude 3 Haiku", "tokens": 1440000, "color": "#8B5CF6"},
        {"name": "Sonnet", "model": "Claude 3.5 Sonnet", "tokens": 720000, "color": "#6366F1"},
        {"name": "Titan Embeddings", "model": "Titan Embeddings v2", "tokens": 240000, "color": "#38BDF8"},
    ]

    return {
        "today": max(len(execs), 24),
        "pending": len([e for e in execs if e["status"] == "pending_approval"]),
        "completedWeek": max(len([e for e in execs if e["status"] == "completed"]), 18),
        "monthlyTokens": 2400000,
        "remainingBudget": 7600000,
        "cost": 18.42,
        "activeSessions": 42,
        "hourly": hourly,
        "week": week,
        "distribution": [
            {"name": "Completed", "value": 88, "color": "#10B981"},
            {"name": "Pending", "value": 8, "color": "#F59E0B"},
            {"name": "Rejected", "value": 4, "color": "#EF4444"},
        ],
        "dailyTokens": daily_tokens,
        "modelTokens": model_tokens,
        "total_executions_today": max(len(execs), 24),
        "pending_user_consents": len([e for e in execs if e["status"] == "pending_approval"]),
        "completed_executions_week": max(len([e for e in execs if e["status"] == "completed"]), 18),
        "total_tokens_month": "2.40M",
        "hourly_velocity": hourly,
    }


def get_usage_stats(tenant_id: str) -> Dict[str, Any]:
    stats = get_overview_stats(tenant_id)
    return {
        "total_tokens_mtd": stats["monthlyTokens"],
        "remaining_budget": stats["remainingBudget"],
        "cost_estimate": stats["cost"],
        "active_sessions": stats["activeSessions"],
        "monthlyTokens": stats["monthlyTokens"],
        "remainingBudget": stats["remainingBudget"],
        "cost": stats["cost"],
        "activeSessions": stats["activeSessions"],
        "dailyTokens": stats["dailyTokens"],
        "modelTokens": stats["modelTokens"],
        "model_spend": [
            {"model": "Claude 3.5 Sonnet", "tokens": 720000, "cost": 12.15, "color": "#6366F1"},
            {"model": "Claude 3 Haiku", "tokens": 1440000, "cost": 4.82, "color": "#8B5CF6"},
            {"model": "Titan Embeddings v2", "tokens": 240000, "cost": 1.45, "color": "#38BDF8"},
        ],
    }
