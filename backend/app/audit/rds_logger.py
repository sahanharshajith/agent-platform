import json
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from pathlib import Path

from app.config import settings

# Attempt psycopg2 import
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _conn():
    """Provides a connection to PostgreSQL on AWS RDS with automatic commit/rollback."""
    if not HAS_PSYCOPG2:
        raise RuntimeError(
            "psycopg2 is required for RDS integration. Run: pip install psycopg2-binary"
        )

    if settings.DATABASE_URL:
        conn = psycopg2.connect(settings.DATABASE_URL)
    else:
        conn = psycopg2.connect(
            host=settings.RDS_HOST,
            port=settings.RDS_PORT,
            dbname=settings.RDS_DB_NAME,
            user=settings.RDS_USER,
            password=settings.RDS_PASSWORD,
            sslmode=settings.RDS_SSL_MODE,
        )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Initialize tables in AWS RDS PostgreSQL using rds_init.sql if available."""
    sql_path = Path(__file__).resolve().parent.parent.parent / "scripts" / "rds_init.sql"
    if sql_path.exists():
        with open(sql_path, "r", encoding="utf-8") as f:
            ddl = f.read()
        with _conn() as conn:
            with conn.cursor() as cur:
                cur.execute(ddl)


def log_event(execution_id: str, tenant_id: str, event_type: str, payload: Dict[str, Any]) -> None:
    """Append-only audit event logging in RDS PostgreSQL."""
    now = datetime.now(timezone.utc)
    payload_json = json.dumps(payload, default=str)
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp)
                VALUES (%s, %s, %s, %s::jsonb, %s)
                """,
                (execution_id, tenant_id, event_type, payload_json, now),
            )


def create_execution(
    execution_id: str,
    tenant_id: str,
    status: str = "completed",
    pending_action: Optional[Dict[str, Any]] = None,
) -> None:
    """Create or upsert execution record in RDS PostgreSQL."""
    now = datetime.now(timezone.utc)
    pending_json = json.dumps(pending_action, default=str) if pending_action else None
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO executions (execution_id, tenant_id, status, pending_action, created_at, updated_at)
                VALUES (%s, %s, %s, %s::jsonb, %s, %s)
                ON CONFLICT (execution_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    pending_action = EXCLUDED.pending_action,
                    updated_at = EXCLUDED.updated_at
                """,
                (execution_id, tenant_id, status, pending_json, now, now),
            )


def update_execution_status(
    execution_id: str,
    status: str,
    pending_action: Optional[Dict[str, Any]] = None,
) -> None:
    """Update execution status in RDS PostgreSQL."""
    now = datetime.now(timezone.utc)
    pending_json = json.dumps(pending_action, default=str) if pending_action is not None else None
    with _conn() as conn:
        with conn.cursor() as cur:
            if pending_action is not None:
                cur.execute(
                    """
                    UPDATE executions 
                    SET status = %s, pending_action = %s::jsonb, updated_at = %s
                    WHERE execution_id = %s
                    """,
                    (status, pending_json, now, execution_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE executions 
                    SET status = %s, updated_at = %s
                    WHERE execution_id = %s
                    """,
                    (status, now, execution_id),
                )


def get_execution(execution_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve execution record and full audit timeline from RDS PostgreSQL."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM executions WHERE execution_id = %s",
                (execution_id,),
            )
            row = cur.fetchone()
            if not row:
                return None

            cur.execute(
                "SELECT * FROM audit_events WHERE execution_id = %s ORDER BY timestamp ASC",
                (execution_id,),
            )
            event_rows = cur.fetchall()

    events = []
    for r in event_rows:
        payload = r["payload"]
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                pass
        events.append({
            "execution_id": r["execution_id"],
            "tenant_id": r["tenant_id"],
            "event_type": r["event_type"],
            "details": payload,
            "timestamp": r["timestamp"].isoformat() if hasattr(r["timestamp"], "isoformat") else str(r["timestamp"]),
        })

    pending_act = row["pending_action"]
    if isinstance(pending_act, str):
        try:
            pending_act = json.loads(pending_act)
        except Exception:
            pass

    return {
        "execution_id": row["execution_id"],
        "tenant_id": row["tenant_id"],
        "status": row["status"],
        "pending_action": pending_act,
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        "updated_at": row["updated_at"].isoformat() if hasattr(row["updated_at"], "isoformat") else str(row["updated_at"]),
        "events": events,
    }


def list_executions(
    tenant_id: str,
    limit: int = 50,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List executions for a tenant from RDS PostgreSQL with summary fields."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = "SELECT * FROM executions WHERE tenant_id = %s"
            params: List[Any] = [tenant_id]

            if status:
                query += " AND status = %s"
                params.append(status)

            if search:
                query += " AND execution_id ILIKE %s"
                params.append(f"%{search}%")

            query += " ORDER BY created_at DESC LIMIT %s"
            params.append(limit)

            cur.execute(query, tuple(params))
            exec_rows = cur.fetchall()

            results = []
            for r in exec_rows:
                cur.execute(
                    """
                    SELECT event_type, payload 
                    FROM audit_events 
                    WHERE execution_id = %s 
                    ORDER BY timestamp ASC
                    """,
                    (r["execution_id"],),
                )
                evs = cur.fetchall()

                intent = None
                user_id = None
                model = None
                tokens = None

                for ev in evs:
                    p = ev["payload"]
                    if isinstance(p, str):
                        try:
                            p = json.loads(p)
                        except Exception:
                            p = {}
                    if not isinstance(p, dict):
                        continue
                    if ev["event_type"] == "user_message":
                        intent = p.get("intent") or intent
                        user_id = p.get("user_id") or user_id
                    elif ev["event_type"] == "final_response":
                        model = p.get("model") or model
                        tokens = p.get("tokens") or tokens

                results.append({
                    "execution_id": r["execution_id"],
                    "tenant_id": r["tenant_id"],
                    "status": r["status"],
                    "timestamp": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
                    "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
                    "intent": intent,
                    "user_id": user_id,
                    "model": model,
                    "tokens": tokens,
                })

    return results


def get_audit_trail(
    tenant_id: str,
    limit: int = 50,
    offset: int = 0,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """Retrieve paginated audit trail for a tenant."""
    execs = list_executions(tenant_id, limit=limit, status=status)
    return {
        "executions": execs,
        "total": len(execs),
        "tenant_id": tenant_id,
    }


def get_tenant_settings(tenant_id: str) -> Dict[str, Any]:
    """Fetch tenant configuration from RDS PostgreSQL."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM tenant_settings WHERE tenant_id = %s", (tenant_id,))
            row = cur.fetchone()
            if row:
                return dict(row)

    # Defaults
    now = _now()
    default_settings = {
        "tenant_id": tenant_id,
        "organization_name": "Bank of Commerce" if tenant_id == "boc-tenant-01" else "Enterprise Tenant",
        "domain": "portal.bankofcommerce.example",
        "classification_model": "claude-3-haiku",
        "reasoning_model": "claude-3-5-sonnet",
        "embedding_model": "titan-embed-v2",
        "refund_threshold": 50.0,
        "wire_threshold": 2500.0,
        "max_steps": 5,
        "api_key": f"af_live_{uuid.uuid4().hex[:20]}",
        "updated_at": now,
    }
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tenant_settings (
                    tenant_id, organization_name, domain, classification_model,
                    reasoning_model, embedding_model, refund_threshold, wire_threshold,
                    max_steps, api_key, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id) DO NOTHING
                """,
                (
                    default_settings["tenant_id"],
                    default_settings["organization_name"],
                    default_settings["domain"],
                    default_settings["classification_model"],
                    default_settings["reasoning_model"],
                    default_settings["embedding_model"],
                    default_settings["refund_threshold"],
                    default_settings["wire_threshold"],
                    default_settings["max_steps"],
                    default_settings["api_key"],
                    now,
                ),
            )
    return default_settings


def update_tenant_settings(tenant_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update settings in RDS PostgreSQL."""
    now = datetime.now(timezone.utc)
    current = get_tenant_settings(tenant_id)

    org_name = updates.get("organization_name", current["organization_name"])
    domain = updates.get("domain", current["domain"])
    clf_model = updates.get("classification_model", current["classification_model"])
    rsn_model = updates.get("reasoning_model", current["reasoning_model"])
    emb_model = updates.get("embedding_model", current["embedding_model"])
    ref_thresh = float(updates.get("refund_threshold", current["refund_threshold"]))
    wire_thresh = float(updates.get("wire_threshold", current["wire_threshold"]))
    max_steps = int(updates.get("max_steps", current["max_steps"]))

    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tenant_settings SET
                    organization_name = %s,
                    domain = %s,
                    classification_model = %s,
                    reasoning_model = %s,
                    embedding_model = %s,
                    refund_threshold = %s,
                    wire_threshold = %s,
                    max_steps = %s,
                    updated_at = %s
                WHERE tenant_id = %s
                """,
                (
                    org_name, domain, clf_model, rsn_model, emb_model,
                    ref_thresh, wire_thresh, max_steps, now, tenant_id
                ),
            )
    return get_tenant_settings(tenant_id)


def rotate_tenant_api_key(tenant_id: str) -> str:
    """Generate and persist a new API key for the tenant in RDS PostgreSQL."""
    new_key = f"af_live_{uuid.uuid4().hex[:24]}"
    now = datetime.now(timezone.utc)
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE tenant_settings SET api_key = %s, updated_at = %s WHERE tenant_id = %s",
                (new_key, now, tenant_id),
            )
    return new_key


def get_overview_stats(tenant_id: str) -> Dict[str, Any]:
    """Compute aggregate analytics and charts 100% dynamically from RDS PostgreSQL."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT status, created_at FROM executions WHERE tenant_id = %s",
                (tenant_id,),
            )
            rows = cur.fetchall()

            cur.execute(
                """
                SELECT event_type, payload, timestamp
                FROM audit_events
                WHERE tenant_id = %s
                ORDER BY timestamp ASC
                """,
                (tenant_id,),
            )
            event_rows = cur.fetchall()

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = now - timedelta(days=7)

    total_today = 0
    pending_count = 0
    completed_week = 0
    completed_total = 0
    rejected_total = 0

    hourly_counts = {f"{h:02d}:00": 0 for h in range(24)}

    for r in rows:
        st = r["status"]
        c_at = r["created_at"]
        dt = c_at if isinstance(c_at, datetime) else now

        norm_status = (
            "pending_approval" if st == "pending_approval"
            else "rejected" if st in ("rejected", "denied")
            else "completed"
        )

        if dt >= today_start:
            total_today += 1
            hour_str = f"{dt.hour:02d}:00"
            hourly_counts[hour_str] = hourly_counts.get(hour_str, 0) + 1

        if norm_status == "pending_approval":
            pending_count += 1
        elif norm_status == "completed":
            completed_total += 1
            if dt >= seven_days_ago:
                completed_week += 1
        elif norm_status == "rejected":
            rejected_total += 1

    hourly_velocity = [{"time": k, "label": k, "executions": v} for k, v in sorted(hourly_counts.items())]

    week_data = []
    for i in range(7):
        day_dt = now - timedelta(days=6 - i)
        day_label = day_dt.strftime("%a")
        day_str = day_dt.strftime("%Y-%m-%d")
        count = sum(
            1 for r in rows 
            if (r["created_at"].strftime("%Y-%m-%d") if hasattr(r["created_at"], "strftime") else str(r["created_at"])).startswith(day_str)
        )
        week_data.append({"label": day_label, "executions": count})

    distribution_data = [
        {"name": "Completed", "value": completed_total, "color": "#10B981"},
        {"name": "Pending", "value": pending_count, "color": "#F59E0B"},
        {"name": "Rejected", "value": rejected_total, "color": "#EF4444"},
    ]

    total_tokens = 0
    model_counts: Dict[str, int] = {}
    users = set()
    daily_token_counts = {(now - timedelta(days=29 - i)).strftime("%b %d"): 0 for i in range(30)}

    for ev in event_rows:
        p = ev["payload"]
        if isinstance(p, str):
            try:
                p = json.loads(p)
            except Exception:
                p = {}
        if not isinstance(p, dict):
            continue

        u = p.get("user_id")
        if u:
            users.add(u)

        t = p.get("tokens")
        if isinstance(t, (int, float)) and t > 0:
            t_int = int(t)
            total_tokens += t_int
            m = p.get("model") or "Claude Haiku"
            model_counts[m] = model_counts.get(m, 0) + t_int

            ts = ev["timestamp"]
            ts_str = ts.strftime("%b %d") if hasattr(ts, "strftime") else str(ts)[:10]
            if ts_str in daily_token_counts:
                daily_token_counts[ts_str] += t_int

    daily_tokens = [{"label": k, "tokens": v} for k, v in daily_token_counts.items()]

    model_colors = {
        "Claude Haiku": "#8B5CF6",
        "Claude 3 Haiku": "#8B5CF6",
        "Claude Sonnet": "#6366F1",
        "Claude 3.5 Sonnet": "#6366F1",
        "Titan Embeddings": "#38BDF8",
        "Titan Embeddings v2": "#38BDF8",
    }
    model_tokens = [
        {"name": k.replace("Claude 3 ", "").replace("Claude ", ""), "model": k, "tokens": v, "color": model_colors.get(k, "#8B5CF6")}
        for k, v in model_counts.items()
    ]
    if not model_tokens:
        model_tokens = [
            {"name": "Haiku", "model": "Claude 3 Haiku", "tokens": 0, "color": "#8B5CF6"},
            {"name": "Sonnet", "model": "Claude 3.5 Sonnet", "tokens": 0, "color": "#6366F1"},
        ]

    active_sessions = len(users) if users else len(rows)
    cost = round(total_tokens * 0.000003, 4)
    monthly_budget = 10_000_000
    remaining_budget = max(0, monthly_budget - total_tokens)

    return {
        "today": total_today if total_today > 0 else len(rows),
        "pending": pending_count,
        "completedWeek": completed_week if completed_week > 0 else completed_total,
        "monthlyTokens": total_tokens,
        "remainingBudget": remaining_budget,
        "cost": cost,
        "activeSessions": active_sessions,
        "hourly": hourly_velocity,
        "week": week_data,
        "distribution": distribution_data,
        "dailyTokens": daily_tokens,
        "modelTokens": model_tokens,
        "total_executions_today": total_today if total_today > 0 else len(rows),
        "pending_user_consents": pending_count,
        "completed_executions_week": completed_week if completed_week > 0 else completed_total,
        "total_tokens_month": f"{total_tokens:,}",
        "hourly_velocity": hourly_velocity,
    }


def get_usage_stats(tenant_id: str) -> Dict[str, Any]:
    """Compute detailed token consumption and budget estimates dynamically from RDS."""
    overview = get_overview_stats(tenant_id)
    return {
        "total_tokens_mtd": overview["monthlyTokens"],
        "remaining_budget": overview["remainingBudget"],
        "cost_estimate": overview["cost"],
        "active_sessions": overview["activeSessions"],
        "monthlyTokens": overview["monthlyTokens"],
        "remainingBudget": overview["remainingBudget"],
        "cost": overview["cost"],
        "activeSessions": overview["activeSessions"],
        "dailyTokens": overview["dailyTokens"],
        "modelTokens": overview["modelTokens"],
        "model_spend": [
            {
                "model": item["model"],
                "tokens": item["tokens"],
                "cost": round(item["tokens"] * 0.000003, 4),
                "color": item.get("color", "#6366F1"),
            }
            for item in overview["modelTokens"]
        ],
    }


# ─────────────────────────────────────────────────────────────
# Universal Multi-Tenant Tool, Session & Consent Store
# ─────────────────────────────────────────────────────────────

def get_tenant_tools(tenant_id: str) -> List[Dict[str, Any]]:
    """Retrieve all business tools configured for any tenant from RDS."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT tool_name, description, parameters, endpoint_url,
                       method, auth_token, requires_consent, consent_action
                FROM tenant_tools
                WHERE tenant_id = %s
                """,
                (tenant_id,),
            )
            return [dict(r) for r in cur.fetchall()]


def get_tenant_tool(tenant_id: str, tool_name: str) -> Optional[Dict[str, Any]]:
    """Retrieve a specific registered tool definition for a tenant."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT tool_name, description, parameters, endpoint_url,
                       method, auth_token, requires_consent, consent_action
                FROM tenant_tools
                WHERE tenant_id = %s AND tool_name = %s
                """,
                (tenant_id, tool_name),
            )
            row = cur.fetchone()
            if row:
                return dict(row)
    return None


def append_tenant_session(
    tenant_id: str,
    user_id: str,
    session_id: str,
    role: str,
    content: str,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    """Append conversation turn to generic tenant session memory."""
    context_json = json.dumps(context or {}, default=str)
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tenant_sessions (tenant_id, user_id, session_id, role, content, context, created_at)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, NOW())
                """,
                (tenant_id, user_id, session_id, role, content, context_json),
            )


def get_tenant_session_history(
    tenant_id: str,
    user_id: str,
    session_id: str,
    limit: int = 10,
) -> List[Dict[str, str]]:
    """Retrieve chronological conversation history for any tenant session."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT role, content FROM tenant_sessions
                WHERE tenant_id = %s AND user_id = %s AND session_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT %s
                """,
                (tenant_id, user_id, session_id, max(0, limit)),
            )
            rows = cur.fetchall()
            return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def create_tenant_consent(
    consent_id: str,
    execution_id: str,
    tenant_id: str,
    user_id: str,
    session_id: str,
    consent_token: str,
    action: str,
    tool_name: str,
    tool_args: Dict[str, Any],
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Store pending consent / human-in-the-loop action in universal table."""
    now = datetime.now(timezone.utc)
    tool_args_json = json.dumps(tool_args or {}, default=str)
    details_json = json.dumps(details or {}, default=str)
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tenant_consents (
                    consent_id, execution_id, tenant_id, user_id, session_id,
                    consent_token, action, tool_name, tool_args, details, status, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, 'pending', %s)
                ON CONFLICT (consent_id) DO NOTHING
                """,
                (
                    consent_id,
                    execution_id,
                    tenant_id,
                    user_id,
                    session_id,
                    consent_token,
                    action,
                    tool_name,
                    tool_args_json,
                    details_json,
                    now,
                ),
            )


def get_tenant_consent(
    consent_id: Optional[str] = None,
    consent_token: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Retrieve consent record by consent_id, execution_id, or consent_token."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if consent_id:
                cur.execute(
                    "SELECT * FROM tenant_consents WHERE consent_id = %s OR execution_id = %s",
                    (consent_id, consent_id),
                )
                row = cur.fetchone()
                if row:
                    return dict(row)
            if consent_token:
                cur.execute(
                    "SELECT * FROM tenant_consents WHERE consent_token = %s",
                    (consent_token,),
                )
                row = cur.fetchone()
                if row:
                    return dict(row)
    return None


def bind_tenant_consent(consent_id: str, external_consent_id: str, approved: bool) -> bool:
    """Bind a callback atomically, permitting only identical callback replays."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT details FROM tenant_consents WHERE consent_id = %s FOR UPDATE",
                (consent_id,),
            )
            row = cur.fetchone()
            if row is None:
                return False
            details = row["details"]
            if isinstance(details, str):
                details = json.loads(details)
            details = dict(details or {})
            if "external_consent_id" in details or "decision" in details:
                return (
                    details.get("external_consent_id") == external_consent_id
                    and details.get("decision") is approved
                )
            details.update(external_consent_id=external_consent_id, decision=approved)
            cur.execute(
                "UPDATE tenant_consents SET details = %s::jsonb WHERE consent_id = %s",
                (json.dumps(details, default=str), consent_id),
            )
    return True


def complete_tenant_consent(consent_id, execution_id, approved, status, cached_reply):
    """Commit completion atomically so retries cannot leave a half-finished audit."""
    with _conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM tenant_consents WHERE consent_id = %s AND execution_id = %s FOR UPDATE",
                (consent_id, execution_id),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError("Consent not found")
            if row["status"] in ("executed", "declined"):
                return
            cur.execute(
                "UPDATE tenant_consents SET approved = %s, status = %s, cached_reply = %s, executed_at = NOW() WHERE consent_id = %s",
                (approved, status, cached_reply, consent_id),
            )
            cur.execute(
                "UPDATE executions SET status = %s, pending_action = NULL, updated_at = NOW() WHERE execution_id = %s AND tenant_id = %s",
                ("completed" if approved else "rejected", execution_id, row["tenant_id"]),
            )
            cur.execute(
                "INSERT INTO tenant_sessions (tenant_id, user_id, session_id, role, content, context, created_at) VALUES (%s, %s, %s, 'assistant', %s, '{}'::jsonb, NOW())",
                (row["tenant_id"], row["user_id"], row["session_id"], cached_reply),
            )
            cur.execute(
                "INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp) VALUES (%s, %s, 'final_response', %s::jsonb, NOW())",
                (execution_id, row["tenant_id"], json.dumps({"text": cached_reply})),
            )


def record_tenant_consent_outcome(
    consent_id: str,
    execution_id: str,
    approved: bool,
    status: str,
    cached_reply: str,
) -> None:
    """Atomically record consent decision and cached reply for idempotent replay."""
    now = datetime.now(timezone.utc)
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tenant_consents
                SET approved = %s, status = %s, cached_reply = %s, executed_at = %s
                WHERE consent_id = %s OR execution_id = %s
                """,
                (approved, status, cached_reply, now, consent_id, execution_id),
            )

