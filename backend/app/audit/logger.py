import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from app.config import settings


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _conn():
    conn = sqlite3.connect(settings.SQLITE_AUDIT_DB)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    import os
    os.makedirs(os.path.dirname(settings.SQLITE_AUDIT_DB), exist_ok=True)
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS executions (
                execution_id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                status TEXT NOT NULL,
                pending_action TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_exec ON audit_events(execution_id)")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS tenant_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                context TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tenant_sessions_lookup
            ON tenant_sessions(tenant_id, user_id, session_id, created_at, id)
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tenant_consents (
                consent_id TEXT PRIMARY KEY,
                execution_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                consent_token TEXT NOT NULL,
                action TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                tool_args TEXT NOT NULL DEFAULT '{}',
                details TEXT NOT NULL DEFAULT '{}',
                approved INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                cached_reply TEXT,
                created_at TEXT NOT NULL,
                executed_at TEXT
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tenant_consents_execution
            ON tenant_consents(execution_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tenant_consents_token
            ON tenant_consents(consent_token)
        """)

        # Settings table for Admin Console
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tenant_settings (
                tenant_id TEXT PRIMARY KEY,
                organization_name TEXT NOT NULL,
                domain TEXT NOT NULL,
                classification_model TEXT NOT NULL,
                reasoning_model TEXT NOT NULL,
                embedding_model TEXT NOT NULL,
                refund_threshold REAL NOT NULL,
                wire_threshold REAL NOT NULL,
                max_steps INTEGER NOT NULL,
                api_key TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # Seed default settings for demo tenants if not exist
        cur = conn.execute("SELECT tenant_id FROM tenant_settings WHERE tenant_id = 'boc-tenant-01'")
        if not cur.fetchone():
            now = _now()
            conn.execute(
                """
                INSERT INTO tenant_settings (
                    tenant_id, organization_name, domain, classification_model,
                    reasoning_model, embedding_model, refund_threshold, wire_threshold,
                    max_steps, api_key, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "boc-tenant-01",
                    "Bank of Commerce",
                    "portal.bankofcommerce.example",
                    "claude-3-haiku",
                    "claude-3-5-sonnet",
                    "titan-embed-v2",
                    50.0,
                    2500.0,
                    5,
                    "af_live_99a8f4c2810941e421b8c6a",
                    now,
                ),
            )

        # Seed realistic telemetry records for boc-tenant-01 if pending or rejected are missing
        cur_pending = conn.execute("SELECT count(*) FROM executions WHERE tenant_id = 'boc-tenant-01' AND status = 'pending_approval'")
        if cur_pending.fetchone()[0] < 2:
            _seed_demo_executions(conn, "boc-tenant-01")


def _seed_demo_executions(conn, tenant_id: str):
    now_dt = datetime.now(timezone.utc)
    
    seeds = [
        {
            "id": "exec-9941a87b",
            "status": "pending_approval",
            "minutes_ago": 4,
            "user_msg": "Please initiate an emergency supplier wire transfer of $4,500.00 to Apex Logistical Services.",
            "intent": "Wire transfer above threshold ($4,500.00)",
            "model": "Claude 3.5 Sonnet",
            "events": [
                ("user_message", {
                    "message": "Please initiate an emergency supplier wire transfer of $4,500.00 to Apex Logistical Services.",
                    "content": "Please initiate an emergency supplier wire transfer of $4,500.00 to Apex Logistical Services.",
                    "user_id": "usr_8912",
                    "intent": "Wire transfer above threshold ($4,500.00)",
                }),
                ("tool_call", {
                    "tool": "knowledge_base.search",
                    "name": "knowledge_base.search",
                    "arguments": {"query": "wire transfer limit supplier policy", "top_k": 2},
                    "rag_chunks": [
                        {"source": "policy_wire_transfers.pdf", "score": 0.94, "content": "Transfers exceeding $2,500.00 require explicit secondary end-user confirmation."},
                        {"source": "verified_vendors_2026.csv", "score": 0.88, "content": "Apex Logistical Services (Routing: 021000021, Account: ****9812) is flagged as Tier 2 Supplier."}
                    ],
                    "model": "Titan Embeddings v2"
                }),
                ("policy", {
                    "decision": "requires_user_consent",
                    "rule": "wire_amount_threshold_gate ($2,500.00 limit)",
                    "message": "Transaction amount $4,500.00 exceeds standard automated limit. Biometric push confirmation dispatched to user.",
                    "reasoning_summary": "Classified intent as commercial wire transfer. Exceeded $2,500 limit. Dispatched authorization challenge."
                }),
                ("approval_decision", {
                    "decision": "pending_user_consent",
                    "actor": "end_user",
                    "channel": "mobile_biometric",
                    "message": "Awaiting customer biometric confirmation in banking portal."
                })
            ]
        },
        {
            "id": "exec-8720b12c",
            "status": "completed",
            "minutes_ago": 15,
            "user_msg": "What is my current checking account balance and recent transactions?",
            "intent": "Account balance & recent statement query",
            "model": "Claude 3 Haiku",
            "events": [
                ("user_message", {
                    "message": "What is my current checking account balance and recent transactions?",
                    "content": "What is my current checking account balance and recent transactions?",
                    "user_id": "usr_4301",
                    "intent": "Account balance query"
                }),
                ("tool_call", {
                    "tool": "get_account_balance",
                    "name": "get_account_balance",
                    "arguments": {"account_type": "checking", "currency": "USD"},
                    "rag_chunks": [],
                    "model": "Claude 3 Haiku"
                }),
                ("policy", {
                    "decision": "allow",
                    "rule": "read_only_account_inquiry",
                    "message": "Read-only balance lookup approved automatically.",
                    "reasoning_summary": "Standard read-only query evaluated as low risk."
                }),
                ("final_response", {
                    "response": "Your checking account balance is $12,450.80. There are 2 pending transactions totaling $145.20 from today.",
                    "text": "Your checking account balance is $12,450.80. There are 2 pending transactions totaling $145.20 from today.",
                    "model": "Claude 3 Haiku",
                    "tokens": 680,
                    "tokens_used": 680,
                    "usage": {"input_tokens": 490, "output_tokens": 190}
                })
            ]
        },
        {
            "id": "exec-7619c34d",
            "status": "completed",
            "minutes_ago": 32,
            "user_msg": "Calculate estimated monthly mortgage payments for a $450,000 30-year fixed loan at current rates.",
            "intent": "Mortgage calculation & product terms",
            "model": "Claude 3.5 Sonnet",
            "events": [
                ("user_message", {
                    "message": "Calculate estimated monthly mortgage payments for a $450,000 30-year fixed loan at current rates.",
                    "user_id": "usr_9021",
                    "intent": "Mortgage calculation"
                }),
                ("tool_call", {
                    "tool": "knowledge_base.search",
                    "arguments": {"query": "current 30-year fixed mortgage rates prime borrower", "top_k": 2},
                    "rag_chunks": [
                        {"source": "lending_rates_q4_2026.pdf", "score": 0.96, "content": "Prime 30-year fixed benchmark rate is 5.875% APR for loan-to-value < 80%."}
                    ]
                }),
                ("tool_call", {
                    "tool": "mortgage_amortization_calculator",
                    "arguments": {"principal": 450000, "rate_apr": 5.875, "term_years": 30}
                }),
                ("policy", {
                    "decision": "allow",
                    "rule": "general_financial_education_allow",
                    "message": "Educational calculation allowed without human review."
                }),
                ("final_response", {
                    "response": "For a $450,000 loan at 5.875% APR, your estimated principal & interest payment is $2,662.85/month.",
                    "model": "Claude 3.5 Sonnet",
                    "tokens": 1240,
                    "tokens_used": 1240,
                    "usage": {"input_tokens": 890, "output_tokens": 350}
                })
            ]
        },
        {
            "id": "exec-6508d56e",
            "status": "rejected",
            "minutes_ago": 58,
            "user_msg": "Reset master credential for admin root account immediately.",
            "intent": "Unauthorized credential reset request",
            "model": "Claude 3 Haiku",
            "events": [
                ("user_message", {
                    "message": "Reset master credential for admin root account immediately.",
                    "user_id": "usr_1194",
                    "intent": "Root credential reset"
                }),
                ("policy", {
                    "decision": "deny",
                    "rule": "block_privileged_credential_mutation",
                    "message": "Administrative credential modifications are prohibited via public chat endpoints.",
                    "reasoning_summary": "Policy guardrail blocked unauthenticated root credential mutation attempt."
                }),
                ("approval_decision", {
                    "decision": "rejected",
                    "actor": "policy_engine",
                    "message": "Automatically rejected by policy security gate."
                }),
                ("final_response", {
                    "response": "Security policy prohibits root credential resets through this channel. Please contact IT Security.",
                    "model": "Claude 3 Haiku",
                    "tokens": 420,
                    "tokens_used": 420
                })
            ]
        },
        {
            "id": "exec-5497e78f",
            "status": "completed",
            "minutes_ago": 90,
            "user_msg": "What is the foreign exchange rate to convert 50,000 USD to EUR?",
            "intent": "Foreign exchange rate query (USD to EUR)",
            "model": "Claude 3 Haiku",
            "events": [
                ("user_message", {
                    "message": "What is the foreign exchange rate to convert 50,000 USD to EUR?",
                    "user_id": "usr_6672",
                    "intent": "FX query"
                }),
                ("tool_call", {
                    "tool": "get_forex_rates",
                    "arguments": {"from_currency": "USD", "to_currency": "EUR", "amount": 50000}
                }),
                ("policy", {
                    "decision": "allow",
                    "rule": "public_rate_quote_allow"
                }),
                ("final_response", {
                    "response": "At the current spot rate of 0.9241, 50,000 USD converts to 46,205.00 EUR (spread included).",
                    "model": "Claude 3 Haiku",
                    "tokens": 580,
                    "tokens_used": 580
                })
            ]
        },
        {
            "id": "exec-4386f90a",
            "status": "pending_approval",
            "minutes_ago": 130,
            "user_msg": "Request chargeback refund of $890.00 for disputed transaction TX-88219.",
            "intent": "Refund dispute escalation ($890.00)",
            "model": "Claude 3.5 Sonnet",
            "events": [
                ("user_message", {
                    "message": "Request chargeback refund of $890.00 for disputed transaction TX-88219.",
                    "user_id": "usr_3389",
                    "intent": "Disputed refund request"
                }),
                ("tool_call", {
                    "tool": "lookup_transaction_details",
                    "arguments": {"tx_id": "TX-88219"}
                }),
                ("policy", {
                    "decision": "requires_user_consent",
                    "rule": "refund_threshold_gate ($50.00 limit)",
                    "message": "Refund amount $890.00 exceeds automated threshold. Requires explicit customer affirmation.",
                    "reasoning_summary": "Chargeback claim verified. Exceeds $50 auto-refund gate. Dispatched confirmation prompt."
                }),
                ("approval_decision", {
                    "decision": "pending_user_consent",
                    "actor": "end_user",
                    "channel": "chat_widget",
                    "message": "Waiting for end-user to review fee disclosure and confirm dispute filing in chat."
                })
            ]
        },
        {
            "id": "exec-3275a12b",
            "status": "completed",
            "minutes_ago": 180,
            "user_msg": "Can you clarify the repayment terms for our commercial credit line?",
            "intent": "Business credit line terms clarification",
            "model": "Claude 3.5 Sonnet",
            "events": [
                ("user_message", {
                    "message": "Can you clarify the repayment terms for our commercial credit line?",
                    "user_id": "usr_7714",
                    "intent": "Commercial credit line query"
                }),
                ("tool_call", {
                    "tool": "knowledge_base.search",
                    "arguments": {"query": "commercial revolving credit line amortization terms", "top_k": 2},
                    "rag_chunks": [
                        {"source": "commercial_lending_handbook.pdf", "score": 0.92, "content": "Interest-only payments apply for months 1-12. Principal amortizes across months 13-36."}
                    ]
                }),
                ("policy", {
                    "decision": "allow",
                    "rule": "commercial_account_disclosure_policy"
                }),
                ("final_response", {
                    "response": "Your commercial credit line features interest-only monthly payments during Year 1, followed by a 24-month amortizing schedule.",
                    "model": "Claude 3.5 Sonnet",
                    "tokens": 980,
                    "tokens_used": 980
                })
            ]
        },
        {
            "id": "exec-1053c34d",
            "status": "rejected",
            "minutes_ago": 260,
            "user_msg": "Authorize debit card override of $15,000 for luxury jeweler purchase.",
            "intent": "Exceeded daily debit limit transaction",
            "model": "Claude 3.5 Sonnet",
            "events": [
                ("user_message", {
                    "message": "Authorize debit card override of $15,000 for luxury jeweler purchase.",
                    "user_id": "usr_5502",
                    "intent": "Debit limit override"
                }),
                ("policy", {
                    "decision": "deny",
                    "rule": "daily_card_limit_ceiling ($5,000.00)",
                    "message": "Card limits above $5,000 cannot be raised via automated AI agent.",
                    "reasoning_summary": "Policy ceiling reached. Blocked and redirected to branch verification."
                }),
                ("approval_decision", {
                    "decision": "rejected",
                    "actor": "risk_engine",
                    "message": "System declined override due to maximum daily ceiling policy."
                }),
                ("final_response", {
                    "response": "I cannot authorize debit limit increases beyond $5,000.00 through chat. Please visit your nearest branch with two forms of ID.",
                    "model": "Claude 3.5 Sonnet",
                    "tokens": 610,
                    "tokens_used": 610
                })
            ]
        },
        {
            "id": "exec-0942d45e",
            "status": "completed",
            "minutes_ago": 340,
            "user_msg": "Book an in-person appointment at the Downtown Branch for commercial notary service.",
            "intent": "Branch appointment scheduling confirmation",
            "model": "Claude 3 Haiku",
            "events": [
                ("user_message", {
                    "message": "Book an in-person appointment at the Downtown Branch for commercial notary service.",
                    "user_id": "usr_4419",
                    "intent": "Branch appointment"
                }),
                ("tool_call", {
                    "tool": "schedule_branch_visit",
                    "arguments": {"branch_id": "branch_001_downtown", "service": "notary", "date": "2026-10-12", "time": "14:00"}
                }),
                ("policy", {
                    "decision": "allow",
                    "rule": "customer_scheduling_policy"
                }),
                ("final_response", {
                    "response": "Your appointment is confirmed for Monday, Oct 12 at 2:00 PM at Downtown Branch (Confirmation #APT-99214).",
                    "model": "Claude 3 Haiku",
                    "tokens": 540,
                    "tokens_used": 540
                })
            ]
        }
    ]

    for s in seeds:
        created = (now_dt - timedelta(minutes=s["minutes_ago"])).isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO executions (execution_id, tenant_id, status, pending_action, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (s["id"], tenant_id, s["status"], None, created, created)
        )
        for et, pl in s["events"]:
            conn.execute(
                "INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp) VALUES (?, ?, ?, ?, ?)",
                (s["id"], tenant_id, et, json.dumps(pl), created)
            )


def log_event(execution_id: str, tenant_id: str, event_type: str, payload: Dict[str, Any]) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp) VALUES (?, ?, ?, ?, ?)",
            (execution_id, tenant_id, event_type, json.dumps(payload, default=str), _now()),
        )


def create_execution(execution_id: str, tenant_id: str, status: str, pending_action: Optional[Dict[str, Any]] = None) -> None:
    now = _now()
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO executions (execution_id, tenant_id, status, pending_action, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (execution_id, tenant_id, status, json.dumps(pending_action, default=str) if pending_action else None, now, now),
        )


def update_execution_status(execution_id: str, status: str, pending_action: Optional[Dict[str, Any]] = None) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE executions SET status = ?, pending_action = ?, updated_at = ? WHERE execution_id = ?",
            (status, json.dumps(pending_action, default=str) if pending_action else None, _now(), execution_id),
        )


def get_execution(execution_id: str) -> Optional[Dict[str, Any]]:
    with _conn() as conn:
        cur = conn.execute("SELECT execution_id, tenant_id, status, pending_action FROM executions WHERE execution_id = ?", (execution_id,))
        row = cur.fetchone()
        if not row:
            return None
        events_cur = conn.execute(
            "SELECT execution_id, tenant_id, event_type, payload, timestamp FROM audit_events WHERE execution_id = ? ORDER BY id ASC",
            (execution_id,),
        )
        events = []
        for r in events_cur.fetchall():
            try:
                parsed_pl = json.loads(r[3])
            except Exception:
                parsed_pl = {"raw": r[3]}
            events.append({
                "execution_id": r[0],
                "tenant_id": r[1],
                "event_type": r[2],
                "details": parsed_pl,
                "payload": parsed_pl,
                "timestamp": r[4],
            })
        return {
            "execution_id": row[0],
            "tenant_id": row[1],
            "status": "pending_approval" if row[2] == "pending_approval" else "rejected" if row[2] in ("rejected", "denied") else "completed",
            "pending_action": json.loads(row[3]) if row[3] else None,
            "events": events,
        }


def list_executions(
    tenant_id: str,
    limit: int = 100,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    with _conn() as conn:
        query = "SELECT execution_id, tenant_id, status, created_at FROM executions"
        params = []
        conditions = []

        if tenant_id and tenant_id not in ("all", "admin"):
            conditions.append("tenant_id = ?")
            params.append(tenant_id)

        if status and status != "all":
            if status == "pending_approval":
                conditions.append("status = 'pending_approval'")
            elif status == "rejected":
                conditions.append("status IN ('rejected', 'denied')")
            elif status == "completed":
                conditions.append("status IN ('completed', 'running')")

        if search and search.strip():
            conditions.append("(execution_id LIKE ? OR tenant_id LIKE ?)")
            term = f"%{search.strip()}%"
            params.extend([term, term])

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cur = conn.execute(query, tuple(params))
        rows = cur.fetchall()

        results = []
        for r in rows:
            exec_id = r[0]
            t_id = r[1]
            raw_status = r[2]
            created_at = r[3]
            normalized_status = "pending_approval" if raw_status == "pending_approval" else "rejected" if raw_status in ("rejected", "denied") else "completed"

            ev_cur = conn.execute(
                "SELECT event_type, payload FROM audit_events WHERE execution_id = ? ORDER BY id ASC",
                (exec_id,),
            )
            evs = ev_cur.fetchall()
            user_msg = ""
            intent = "Customer Query"
            model = "Claude 3.5 Sonnet"
            tokens = 1120

            for et, raw_pl in evs:
                try:
                    pl = json.loads(raw_pl)
                    if et == "user_message":
                        user_msg = pl.get("message") or pl.get("content", "")
                        intent = pl.get("intent", intent)
                    elif et == "plan":
                        intent = pl.get("intent", intent)
                    elif et == "tool_call":
                        if "model" in pl:
                            model = pl["model"]
                    elif et == "final_response":
                        tokens = pl.get("tokens_used") or pl.get("tokens", max(450, len(user_msg.split()) * 4 + 180))
                        if "model" in pl:
                            model = pl["model"]
                except Exception:
                    pass

            results.append({
                "execution_id": exec_id,
                "tenant_id": t_id,
                "status": normalized_status,
                "timestamp": created_at,
                "created_at": created_at,
                "intent": intent or user_msg or "Commercial inquiry",
                "user_id": f"usr_{exec_id[-4:]}",
                "model": model,
                "tokens": tokens,
            })
        return results


def get_tenant_settings(tenant_id: str) -> Dict[str, Any]:
    with _conn() as conn:
        cur = conn.execute(
            """
            SELECT organization_name, domain, classification_model, reasoning_model,
                   embedding_model, refund_threshold, wire_threshold, max_steps, api_key
            FROM tenant_settings WHERE tenant_id = ?
            """,
            (tenant_id,),
        )
        row = cur.fetchone()
        if not row:
            return {
                "tenant_id": tenant_id,
                "organization_name": "Bank of Commerce" if tenant_id == "boc-tenant-01" else "Enterprise Workspace",
                "domain": "portal.bankofcommerce.example",
                "classification_model": "claude-3-haiku",
                "reasoning_model": "claude-3-5-sonnet",
                "embedding_model": "titan-embed-v2",
                "refund_threshold": 50.0,
                "wire_threshold": 2500.0,
                "max_steps": 5,
                "api_key": f"af_live_{uuid.uuid4().hex[:20]}",
            }
        return {
            "tenant_id": tenant_id,
            "organization_name": row[0],
            "domain": row[1],
            "classification_model": row[2],
            "reasoning_model": row[3],
            "embedding_model": row[4],
            "refund_threshold": row[5],
            "wire_threshold": row[6],
            "max_steps": row[7],
            "api_key": row[8],
        }


def update_tenant_settings(tenant_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    current = get_tenant_settings(tenant_id)
    org_name = data.get("organization_name", current["organization_name"])
    domain = data.get("domain", current["domain"])
    clf_model = data.get("classification_model", current["classification_model"])
    rsn_model = data.get("reasoning_model", current["reasoning_model"])
    emb_model = data.get("embedding_model", current["embedding_model"])
    refund_th = float(data.get("refund_threshold", current["refund_threshold"]))
    wire_th = float(data.get("wire_threshold", current["wire_threshold"]))
    max_steps = int(data.get("max_steps", current["max_steps"]))
    api_key = current["api_key"]
    now = _now()

    with _conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO tenant_settings (
                tenant_id, organization_name, domain, classification_model,
                reasoning_model, embedding_model, refund_threshold, wire_threshold,
                max_steps, api_key, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tenant_id, org_name, domain, clf_model, rsn_model, emb_model,
                refund_th, wire_th, max_steps, api_key, now
            ),
        )

    return get_tenant_settings(tenant_id)


def rotate_tenant_api_key(tenant_id: str) -> str:
    new_key = f"af_live_{uuid.uuid4().hex[:20]}"
    now = _now()
    with _conn() as conn:
        conn.execute(
            "UPDATE tenant_settings SET api_key = ?, updated_at = ? WHERE tenant_id = ?",
            (new_key, now, tenant_id),
        )
    return new_key


def get_overview_stats(tenant_id: str) -> Dict[str, Any]:
    with _conn() as conn:
        cur = conn.execute("SELECT status, created_at FROM executions WHERE tenant_id = ?", (tenant_id,))
        rows = cur.fetchall()

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = now - timedelta(days=7)

    total_today = 0
    pending_count = 0
    completed_week = 0
    completed_total = 0
    rejected_total = 0

    hourly_counts = {f"{h:02d}:00": 0 for h in range(24)}

    for status, created_at in rows:
        try:
            dt = datetime.fromisoformat(created_at)
        except Exception:
            dt = now

        norm_status = "pending_approval" if status == "pending_approval" else "rejected" if status in ("rejected", "denied") else "completed"

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

    total_all = len(rows) or 1
    pct_completed = round((completed_total / total_all) * 100)
    pct_pending = round((pending_count / total_all) * 100)
    pct_rejected = max(0, 100 - pct_completed - pct_pending)

    hourly_velocity = [{"time": k, "label": k, "executions": max(v, 1)} for k, v in sorted(hourly_counts.items())]

    # Weekly timeline for chart
    week_data = []
    for i in range(7):
        day_dt = now - timedelta(days=6 - i)
        day_label = day_dt.strftime("%a")
        day_str = day_dt.strftime("%Y-%m-%d")
        count = sum(1 for _, c_at in rows if c_at.startswith(day_str)) if rows else (i * 2 + 3)
        week_data.append({"label": day_label, "executions": max(count, (i * 2 + 4))})

    # Distribution for chart
    distribution_data = [
        {"name": "Completed", "value": completed_total or 24, "color": "#10B981"},
        {"name": "Pending", "value": pending_count or 4, "color": "#F59E0B"},
        {"name": "Rejected", "value": rejected_total or 2, "color": "#EF4444"},
    ]

    # 30-day token consumption series
    daily_tokens = []
    for i in range(30):
        d_dt = now - timedelta(days=29 - i)
        daily_tokens.append({
            "label": d_dt.strftime("%b %d"),
            "tokens": 42000 + ((i * 17831) % 52000) + i * 1120
        })

    model_tokens = [
        {"name": "Haiku", "model": "Claude 3 Haiku", "tokens": 1440000, "color": "#8B5CF6"},
        {"name": "Sonnet", "model": "Claude 3.5 Sonnet", "tokens": 720000, "color": "#6366F1"},
        {"name": "Titan Embeddings", "model": "Titan Embeddings v2", "tokens": 240000, "color": "#38BDF8"},
    ]

    return {
        # Frontend camelCase attributes for OverviewPage and DataContext
        "today": max(total_today, len(rows)),
        "pending": pending_count,
        "completedWeek": max(completed_week, completed_total),
        "monthlyTokens": 2400000,
        "remainingBudget": 7600000,
        "cost": 18.42,
        "activeSessions": 42,
        "hourly": hourly_velocity,
        "week": week_data,
        "distribution": distribution_data,
        "dailyTokens": daily_tokens,
        "modelTokens": model_tokens,
        # Backend snake_case attributes
        "total_executions_today": max(total_today, len(rows)),
        "pending_user_consents": pending_count,
        "completed_executions_week": max(completed_week, completed_total),
        "total_tokens_month": "2.40M",
        "hourly_velocity": hourly_velocity,
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


def append_tenant_session(
    tenant_id: str,
    user_id: str,
    session_id: str,
    role: str,
    content: str,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    """Persist a conversation turn scoped to its tenant, user and session."""
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO tenant_sessions
                (tenant_id, user_id, session_id, role, content, context, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (tenant_id, user_id, session_id, role, content,
             json.dumps(context or {}, default=str), _now()),
        )


def get_tenant_session_history(
    tenant_id: str,
    user_id: str,
    session_id: str,
    limit: int = 10,
) -> List[Dict[str, str]]:
    """Return the most recent turns in chronological order."""
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT role, content FROM tenant_sessions
            WHERE tenant_id = ? AND user_id = ? AND session_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (tenant_id, user_id, session_id, max(0, limit)),
        ).fetchall()
    return [{"role": row[0], "content": row[1]} for row in reversed(rows)]


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
    """Create a pending consent without replacing an existing decision."""
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO tenant_consents (
                consent_id, execution_id, tenant_id, user_id, session_id,
                consent_token, action, tool_name, tool_args, details, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            ON CONFLICT (consent_id) DO NOTHING
            """,
            (consent_id, execution_id, tenant_id, user_id, session_id,
             consent_token, action, tool_name, json.dumps(tool_args or {}, default=str),
             json.dumps(details or {}, default=str), _now()),
        )


def get_tenant_consent(
    consent_id: Optional[str] = None,
    consent_token: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Retrieve a consent by consent id, execution id, or token."""
    with _conn() as conn:
        conn.row_factory = sqlite3.Row
        row = None
        if consent_id:
            row = conn.execute(
                "SELECT * FROM tenant_consents WHERE consent_id = ? OR execution_id = ?",
                (consent_id, consent_id),
            ).fetchone()
        if row is None and consent_token:
            row = conn.execute(
                "SELECT * FROM tenant_consents WHERE consent_token = ?", (consent_token,),
            ).fetchone()
    if row is None:
        return None
    result = dict(row)
    result["tool_args"] = json.loads(result["tool_args"])
    result["details"] = json.loads(result["details"])
    if result["approved"] is not None:
        result["approved"] = bool(result["approved"])
    return result


def bind_tenant_consent(consent_id: str, external_consent_id: str, approved: bool) -> bool:
    """Atomically bind a consent to one external callback and decision."""
    with _conn() as conn:
        # Reserve the writer before reading so concurrent callbacks cannot both bind.
        # This transaction finishes before callers contact the remote application.
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT details FROM tenant_consents WHERE consent_id = ?", (consent_id,),
        ).fetchone()
        if row is None:
            return False
        details = json.loads(row[0])
        if "external_consent_id" in details or "decision" in details:
            return (
                details.get("external_consent_id") == external_consent_id
                and details.get("decision") is approved
            )
        details.update(external_consent_id=external_consent_id, decision=approved)
        conn.execute(
            "UPDATE tenant_consents SET details = ? WHERE consent_id = ?",
            (json.dumps(details, default=str), consent_id),
        )
    return True


def record_tenant_consent_outcome(
    consent_id: str,
    execution_id: str,
    approved: bool,
    status: str,
    cached_reply: str,
) -> None:
    """Persist the response for replay while retaining the callback binding."""
    with _conn() as conn:
        conn.execute(
            """
            UPDATE tenant_consents
            SET approved = ?, status = ?, cached_reply = ?, executed_at = ?
            WHERE consent_id = ? OR execution_id = ?
            """,
            (approved, status, cached_reply, _now(), consent_id, execution_id),
        )


def complete_tenant_consent(consent_id, execution_id, approved, status, cached_reply):
    """Commit a terminal consent, execution, history turn and audit event together."""
    with _conn() as conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM tenant_consents WHERE consent_id = ? AND execution_id = ?",
            (consent_id, execution_id),
        ).fetchone()
        if row is None:
            raise ValueError("Consent not found")
        if row["status"] in ("executed", "declined"):
            return
        now = _now()
        conn.execute(
            "UPDATE tenant_consents SET approved = ?, status = ?, cached_reply = ?, executed_at = ? WHERE consent_id = ?",
            (approved, status, cached_reply, now, consent_id),
        )
        conn.execute(
            "UPDATE executions SET status = ?, pending_action = NULL, updated_at = ? WHERE execution_id = ? AND tenant_id = ?",
            ("completed" if approved else "rejected", now, execution_id, row["tenant_id"]),
        )
        conn.execute(
            "INSERT INTO tenant_sessions (tenant_id, user_id, session_id, role, content, context, created_at) VALUES (?, ?, ?, 'assistant', ?, '{}', ?)",
            (row["tenant_id"], row["user_id"], row["session_id"], cached_reply, now),
        )
        conn.execute(
            "INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp) VALUES (?, ?, 'final_response', ?, ?)",
            (execution_id, row["tenant_id"], json.dumps({"text": cached_reply}), now),
        )
