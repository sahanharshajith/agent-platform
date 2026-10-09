import json
import re
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime
from zoneinfo import ZoneInfo

from app.llm import get_llm_provider
from app.rag import retrieve
from app.tools.registry import get_effective_tools, execute_tool
from app.policy.engine import evaluate
from app.audit import (
    log_event,
    create_execution,
    update_execution_status,
    get_execution,
    get_tenant_settings,
    append_tenant_session,
    get_tenant_session_history,
    create_tenant_consent,
    get_tenant_consent,
    record_tenant_consent_outcome,
)
from app.notify import send_approval_request
from .prompts import SYSTEM_PROMPT


def _extract_json(text: str) -> Dict[str, Any]:
    """Robustly parse JSON object out of LLM output."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def _build_user_prompt(
    user_message: str,
    rag_chunks: list,
    history: list,
    tools: Dict[str, Dict[str, Any]],
    context: Optional[Dict[str, Any]] = None,
) -> str:
    ctx_lines = []
    for i, c in enumerate(rag_chunks, 1):
        ctx_lines.append(f"[{i}] ({c['source']}, tenant={c['tenant_id']}) {c['text']}")
    rag_block = "\n".join(ctx_lines) if ctx_lines else "(no external knowledge chunks)"

    hist_lines = []
    for m in history[-6:]:
        hist_lines.append(f"{m['role']}: {m['content']}")
    hist_block = "\n".join(hist_lines) if hist_lines else "(none)"

    tool_lines = []
    for name, spec in tools.items():
        desc = spec.get("schema", {}).get("description", "")
        tool_lines.append(f"- {name}: {desc}")
    tool_list = "\n".join(tool_lines) if tool_lines else "(no tools registered)"

    user_context_block = json.dumps(context, indent=2, default=str) if context else "(no user context provided)"

    return f"""Available tools for this tenant:
{tool_list}

User Account / Session Context:
{user_context_block}

Retrieved Knowledge Base Context:
{rag_block}

Recent Conversation History:
{hist_block}

Current User Message:
{user_message}
"""


def run_agent(
    user_message: str,
    tenant_id: str,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    history: Optional[list] = None,
) -> Dict[str, Any]:
    """
    Universal multi-tenant execution loop:
    Dynamically loads tenant settings, tools, and conversation memory from RDS.
    """
    execution_id = f"exec-{uuid.uuid4().hex[:12]}"
    create_execution(execution_id, tenant_id, status="running")
    log_event(execution_id, tenant_id, "user_message", {"content": user_message, "context": context})

    # 1. Fetch dynamic tenant profile & tools from database
    settings = get_tenant_settings(tenant_id)
    tenant_custom_prompt = settings.get("system_prompt") or "You are a helpful AI assistant."
    policy_rules = settings.get("policy_rules") or {}
    available_tools = get_effective_tools(tenant_id)

    tenant_prompt = f"""{tenant_custom_prompt}

CRITICAL FORMATTING INSTRUCTION:
You MUST respond with a valid JSON object matching this schema:
{{
  "intent": "<intent_name>",
  "plan": {{
    "tool_name": "<name of tool from the Available Tools list, or null>",
    "tool_args": {{ <arguments for the tool> }}
  }},
  "response_text": "<your message to the user>"
}}

Guidelines:
1. Whenever the user requests an action (such as cancelling a subscription, refunding, wiring funds, or looking up accounts), ALWAYS select the matching tool from the Available Tools list in "plan.tool_name" and populate "plan.tool_args". Do NOT wait to ask confirmation yourself in plain text; the platform policy engine automatically gates tools that require customer approval and generates the confirmation prompt for the user.
2. If the user is asking an informational question or no tool is needed, set "plan": null, and provide your full answer in "response_text".
3. Return ONLY the JSON object without markdown fences or text outside JSON.

"""

    # 2. Manage session memory if session_id and user_id are supplied
    if session_id and user_id:
        append_tenant_session(tenant_id, user_id, session_id, "user", user_message, context=context)
        if not history:
            history = get_tenant_session_history(tenant_id, user_id, session_id, limit=6)
    history = history or []

    llm = get_llm_provider()

    # 3. RAG retrieval
    rag_chunks = []
    try:
        rag_chunks = retrieve(user_message, tenant_id=tenant_id, top_k=3)
        log_event(execution_id, tenant_id, "rag", {"chunks": rag_chunks})
    except Exception:
        pass

    # 4. LLM plan and intent classification
    user_prompt = _build_user_prompt(user_message, rag_chunks, history, available_tools, context)
    raw = llm.chat(messages=[{"role": "user", "content": user_prompt}], system=tenant_prompt)

    try:
        parsed = _extract_json(raw)
    except Exception as e:
        log_event(execution_id, tenant_id, "plan_plain_text", {"raw": raw})
        parsed = {
            "intent": "general_inquiry",
            "plan": None,
            "response_text": raw.strip(),
        }

    log_event(execution_id, tenant_id, "plan", parsed)


    intent = parsed.get("intent", "other")
    plan = parsed.get("plan") or {}
    tool_name = plan.get("tool_name")
    tool_args = plan.get("tool_args") or {}
    response_text = parsed.get("response_text", "")

    # 5. Direct response without tool
    if not tool_name:
        log_event(execution_id, tenant_id, "final_response", {"text": response_text})
        update_execution_status(execution_id, "completed")
        if session_id and user_id:
            append_tenant_session(tenant_id, user_id, session_id, "assistant", response_text)
        return {
            "execution_id": execution_id,
            "status": "completed",
            "intent": intent,
            "reply": response_text,
            "response": response_text,
        }

    # 6. Policy Check
    tool_def = available_tools.get(tool_name)
    decision = evaluate(
        tool_name=tool_name,
        tool_args=tool_args,
        tenant_id=tenant_id,
        policy_rules=policy_rules,
        tool_def=tool_def,
    )
    log_event(execution_id, tenant_id, "policy", {"tool": tool_name, "args": tool_args, "decision": decision})

    if decision["decision"] == "deny":
        denial_reply = f"I cannot perform that action: {decision['reason']}"
        update_execution_status(execution_id, "completed")
        if session_id and user_id:
            append_tenant_session(tenant_id, user_id, session_id, "assistant", denial_reply)
        return {
            "execution_id": execution_id,
            "status": "denied",
            "intent": intent,
            "reply": denial_reply,
            "response": denial_reply,
        }

    if decision["decision"] == "require_approval":
        consent_token = f"tok-{uuid.uuid4().hex[:20]}"
        consent_id = f"consent-{uuid.uuid4().hex[:16]}"
        consent_action = (tool_def or {}).get("consent_action") or tool_name

        # Calculate any dynamic refund / consent metadata from tenant context
        consent_details: Dict[str, Any] = dict(tool_args)
        if context and "account" in context:
            acct = context["account"]
            price_cents = int(acct.get("price_cents") or 1599)
            # Evaluate same-day rule if tenant policy specifies it
            if policy_rules.get("same_day_refund_required"):
                try:
                    tz = ZoneInfo(acct.get("billing_timezone") or "Asia/Colombo")
                    today = datetime.now(tz).date()
                    charged_iso = acct.get("charged_at") or ""
                    c_dt = datetime.fromisoformat(charged_iso.replace("Z", "+00:00")).astimezone(tz)
                    is_same_day = (c_dt.date() == today)
                except Exception:
                    is_same_day = False

                if is_same_day:
                    consent_action = "cancel_and_refund"
                    consent_details["refund_amount_cents"] = price_cents
                else:
                    consent_action = "cancel_subscription"
                    consent_details["refund_amount_cents"] = 0

        pending_action = {
            "tool_name": tool_name,
            "tool_args": tool_args,
            "reason": decision["reason"],
            "consent_token": consent_token,
            "consent_id": consent_id,
            "action": consent_action,
            "details": consent_details,
        }
        update_execution_status(execution_id, "pending_approval", pending_action)

        create_tenant_consent(
            consent_id=consent_id,
            execution_id=execution_id,
            tenant_id=tenant_id,
            user_id=user_id or "default_user",
            session_id=session_id or "default_session",
            consent_token=consent_token,
            action=consent_action,
            tool_name=tool_name,
            tool_args=tool_args,
            details=consent_details,
        )

        log_event(execution_id, tenant_id, "approval_request", pending_action)

        try:
            send_approval_request(execution_id, tool_name, tool_args, tenant_id)
        except Exception:
            pass

        consent_payload = {
            "token": consent_token,
            "execution_id": execution_id,
            "action": consent_action,
            **consent_details,
        }

        if session_id and user_id:
            append_tenant_session(tenant_id, user_id, session_id, "assistant", response_text)

        return {
            "execution_id": execution_id,
            "status": "pending_approval",
            "intent": intent,
            "pending_action": pending_action,
            "reply": response_text,
            "response": response_text,
            "consent": consent_payload,
        }

    # 7. Auto-approved → execute tool universally
    result = execute_tool(tool_name, tool_args, tenant_id)
    log_event(execution_id, tenant_id, "tool_call", {"tool": tool_name, "args": tool_args, "result": result})

    final_text = _compose_final_response(llm, user_message, tool_name, result, response_text)
    log_event(execution_id, tenant_id, "final_response", {"text": final_text})
    update_execution_status(execution_id, "completed")

    if session_id and user_id:
        append_tenant_session(tenant_id, user_id, session_id, "assistant", final_text)

    return {
        "execution_id": execution_id,
        "status": "completed",
        "intent": intent,
        "tool_result": result,
        "reply": final_text,
        "response": final_text,
    }


def _compose_final_response(llm, user_message, tool_name, tool_result, draft_text) -> str:
    followup = f"""You planned a tool call which has now executed.

User: {user_message}
Tool: {tool_name}
Result: {json.dumps(tool_result, default=str)}

Write a friendly, truthful 1-2 sentence response to the user explaining the result.
Plain text only."""
    try:
        return llm.chat(messages=[{"role": "user", "content": followup}]).strip()
    except Exception:
        return draft_text or f"Action completed. Result: {tool_result}"


def resume_after_approval(
    execution_id: str,
    approved: bool,
    approver: str = "user",
    consent_id: Optional[str] = None,
    consent_token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Universally resumes execution after human approval or customer consent button click.
    Guarantees strict idempotency and atomic mutation recording.
    """
    # 1. Idempotency Check
    existing_consent = get_tenant_consent(consent_id=consent_id or execution_id, consent_token=consent_token)
    if existing_consent and existing_consent.get("status") in ("executed", "declined", "rejected"):
        cached = existing_consent.get("cached_reply") or "This action has already been processed."
        return {
            "ok": True,
            "execution_id": existing_consent["execution_id"],
            "status": existing_consent["status"],
            "reply": cached,
            "response": cached,
        }

    record = get_execution(execution_id)
    if not record and existing_consent:
        record = get_execution(existing_consent["execution_id"])

    if not record:
        return {"ok": False, "error": "Execution record not found."}

    execution_id = record["execution_id"]
    tenant_id = record["tenant_id"]
    pending = record.get("pending_action") or {}
    tool_name = pending.get("tool_name") or (existing_consent or {}).get("tool_name")
    tool_args = pending.get("tool_args") or (existing_consent or {}).get("tool_args") or {}

    log_event(execution_id, tenant_id, "approval_decision", {"approved": approved, "approver": approver})

    # 2. Declined / Rejected
    if not approved:
        update_execution_status(execution_id, "rejected")
        reply = f"Action declined by {approver}."
        if existing_consent:
            record_tenant_consent_outcome(
                consent_id=existing_consent["consent_id"],
                execution_id=execution_id,
                approved=False,
                status="declined",
                cached_reply=reply,
            )
            append_tenant_session(
                tenant_id,
                existing_consent["user_id"],
                existing_consent["session_id"],
                "assistant",
                reply,
            )
        return {
            "ok": True,
            "execution_id": execution_id,
            "status": "rejected",
            "reply": reply,
            "response": reply,
        }

    # 3. Approved → Execute Tool
    effective_tool_args = dict(tool_args)
    if consent_id and "consent_id" not in effective_tool_args:
        effective_tool_args["consent_id"] = consent_id

    result = execute_tool(tool_name, effective_tool_args, tenant_id)
    log_event(
        execution_id,
        tenant_id,
        "tool_call",
        {"tool": tool_name, "args": effective_tool_args, "result": result, "after_approval": True},
    )

    # 4. Format Truthful Outcome
    llm = get_llm_provider()
    final_text = _compose_final_response(
        llm,
        f"(post-approval execution of {tool_name})",
        tool_name,
        result,
        draft_text=f"Action {tool_name} successfully executed.",
    )

    update_execution_status(execution_id, "completed")

    if existing_consent:
        record_tenant_consent_outcome(
            consent_id=existing_consent["consent_id"],
            execution_id=execution_id,
            approved=True,
            status="executed",
            cached_reply=final_text,
        )
        append_tenant_session(
            tenant_id,
            existing_consent["user_id"],
            existing_consent["session_id"],
            "assistant",
            final_text,
        )

    log_event(execution_id, tenant_id, "final_response", {"text": final_text})

    return {
        "ok": True,
        "execution_id": execution_id,
        "status": "completed",
        "tool_result": result,
        "reply": final_text,
        "response": final_text,
    }