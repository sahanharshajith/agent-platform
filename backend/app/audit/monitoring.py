"""Read-only dashboard projection of persisted audit rows. No agent execution here."""

import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.config import settings
from . import logger, rds_logger


# Historical installation fixtures from logger.py / scripts/rds_init.sql. Keep the
# stored data intact, but never present these sample executions as live telemetry.
SAMPLE_IDS = (
    "exec-0942d45e", "exec-1053c34d", "exec-3275a12b", "exec-4386f90a",
    "exec-5497e78f", "exec-6508d56e", "exec-7619c34d", "exec-8720b12c",
    "exec-9941a87b", "exec-387b9201", "exec-52c11099", "exec-71b9931c", "exec-82a104f2",
)
SECRET_FIELDS = {"consent_token", "token", "api_key", "auth_token", "authorization",
                 "password", "secret", "upstream_token", "access_token", "refresh_token"}


def object_value(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return {"text": value}
    return value or {}


def redact(value):
    if isinstance(value, dict):
        return {key: "[redacted]" if key.lower() in SECRET_FIELDS else redact(item)
                for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def iso(value):
    return value.isoformat() if isinstance(value, datetime) else value


def instant(value):
    dt = datetime.fromisoformat(iso(value).replace("Z", "+00:00"))
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def reported_tokens(data):
    usage = data.get("usage") or data.get("token_usage") or {}
    if not isinstance(usage, dict):
        usage = {}
    values = [data.get("tokens"), data.get("tokens_used"), usage.get("total_tokens")]
    if all(type(usage.get(key)) in (int, float) for key in ("input_tokens", "output_tokens")):
        values.append(usage["input_tokens"] + usage["output_tokens"])
    return next((n for n in values if type(n) in (int, float) and n >= 0), None)


def load_records(tenant_id, *, limit=None, execution_id=None):
    """Query real rows with tenant constraints, including events in persisted order."""
    if settings.USE_AWS and not settings.USE_RDS:
        raise HTTPException(503, "Live dashboard monitoring requires SQLite or RDS storage.")
    is_rds = settings.USE_RDS
    placeholder = "%s" if is_rds else "?"
    clauses, values = [f"tenant_id = {placeholder}"], [tenant_id]
    if tenant_id == "boc-tenant-01":
        clauses.append("execution_id NOT IN (" + ",".join([placeholder] * len(SAMPLE_IDS)) + ")")
        values.extend(SAMPLE_IDS)
    if execution_id:
        clauses.append(f"execution_id = {placeholder}")
        values.append(execution_id)
    sql = ("SELECT execution_id, tenant_id, status, pending_action, created_at, updated_at FROM executions WHERE "
           + " AND ".join(clauses) + " ORDER BY created_at DESC, execution_id DESC")
    if limit is not None:
        sql += f" LIMIT {placeholder}"
        values.append(limit)
    store = rds_logger if is_rds else logger
    with store._conn() as conn:
        cur = conn.cursor()
        try:
            cur.execute(sql, tuple(values))
            columns = [col[0] for col in cur.description]
            records = [dict(zip(columns, row)) for row in cur.fetchall()]
            by_id = {row["execution_id"]: row for row in records}
            for row in records:
                row["events"] = []
                row["status"] = "rejected" if row["status"] == "denied" else row["status"]
                row["created_at"], row["updated_at"] = iso(row["created_at"]), iso(row["updated_at"])
                row["timestamp"] = row["created_at"]
                row["pending_action"] = redact(object_value(row["pending_action"])) or None
            # Batches avoid SQLite's bind-variable limit for larger dashboards.
            ids = list(by_id)
            for offset in range(0, len(ids), 500):
                batch = ids[offset:offset + 500]
                cur.execute(
                    "SELECT id, execution_id, event_type, payload, timestamp FROM audit_events WHERE tenant_id = "
                    + placeholder + " AND execution_id IN (" + ",".join([placeholder] * len(batch))
                    + ") ORDER BY timestamp ASC, id ASC", (tenant_id, *batch),
                )
                for event_id, ref, kind, payload, timestamp in cur.fetchall():
                    by_id[ref]["events"].append({"id": event_id, "event_type": kind,
                        "details": redact(object_value(payload)), "timestamp": iso(timestamp)})
        finally:
            cur.close()
    return records


def summarize(record):
    summary = {key: value for key, value in record.items() if key not in ("events", "pending_action")}
    summary.update(message=None, user_id=None, session_id=None, intent=None, model=None, tokens=None,
                   event_count=len(record["events"]))
    for event in record["events"]:
        data = event["details"]
        if not isinstance(data, dict):
            continue
        for key in ("user_id", "session_id", "model", "intent"):
            if data.get(key):
                summary[key] = data[key]
        if event["event_type"] == "user_message":
            summary["message"] = data.get("content") or data.get("message")
        if event["event_type"] == "plan" and not summary["intent"]:
            summary["intent"] = data.get("action")
        tokens = reported_tokens(data)
        if tokens is not None:
            summary["tokens"] = tokens
    return summary


def overview(tenant_id):
    records = load_records(tenant_id)
    rows = [summarize(record) for record in records]
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week = today - timedelta(days=today.weekday())
    month = today.replace(day=1)
    recent = now - timedelta(minutes=30)
    days = [(today - timedelta(days=i)).date().isoformat() for i in reversed(range(30))]
    daily = {day: {"date": day, "label": day[5:], "executions": 0} for day in days}
    hourly_start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=23)
    hourly = [{"label": (hourly_start + timedelta(hours=i)).strftime("%H:%M"), "executions": 0} for i in range(24)]
    token_days = {day: {"label": day[5:], "tokens": 0} for day in days}
    outcomes = {day: {} for day in days}
    monthly = [row for row in rows if month <= instant(row["created_at"]) <= now]
    reported = [row for row in monthly if row["tokens"] is not None]
    models, sessions = {}, set()
    for row in rows:
        created = instant(row["created_at"])
        day = created.date().isoformat()
        if day in daily and created <= now:
            daily[day]["executions"] += 1
            outcomes[day][row["status"]] = outcomes[day].get(row["status"], 0) + 1
            if row["tokens"] is not None:
                token_days[day]["tokens"] += row["tokens"]
        hour = int((created - hourly_start).total_seconds() // 3600)
        if 0 <= hour < 24 and created <= now:
            hourly[hour]["executions"] += 1
        if row["session_id"] and recent <= instant(row["updated_at"]) <= now:
            sessions.add((row["user_id"], row["session_id"]))
    for row in reported:
        model = row["model"] or "Model not reported"
        models[model] = models.get(model, 0) + row["tokens"]
    return {
        "tenant_id": tenant_id, "timezone": "UTC", "total": len(rows),
        "today": sum(today <= instant(row["created_at"]) <= now for row in rows),
        "pending": sum(row["status"] == "pending_approval" for row in rows),
        "completedWeek": sum(row["status"] == "completed" and week <= instant(row["updated_at"]) <= now for row in rows),
        "monthlyTokens": sum(row["tokens"] for row in reported) if reported else None,
        "tokenExecutionsReported": len(reported), "tokenExecutionsTotal": len(monthly),
        "remainingBudget": None, "cost": None, "activeSessions": len(sessions),
        "dailyTokens": list(token_days.values()) if any(row["tokens"] is not None for row in rows) else [],
        "modelTokens": [{"name": model, "model": model, "tokens": tokens, "color": "#8B5CF6"} for model, tokens in models.items()],
        "dailyExecutions": list(daily.values()), "hourly": hourly, "dailyOutcomes": outcomes,
        "hourlyOutcomes": {status: sum(row["status"] == status and hourly_start <= instant(row["created_at"]) <= now for row in rows)
                           for status in {row["status"] for row in rows}},
    }
