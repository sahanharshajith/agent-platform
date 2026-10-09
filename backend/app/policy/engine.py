from typing import Dict, Any, Optional


REFUND_APPROVAL_THRESHOLD_USD = 100.0


def evaluate(
    tool_name: str,
    tool_args: Dict[str, Any],
    tenant_id: Optional[str] = None,
    policy_rules: Optional[Dict[str, Any]] = None,
    tool_def: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Universally evaluate guardrail policies for any tool execution:
    1. Checks dynamic tenant tool requirements (requires_consent).
    2. Checks dynamic policy rules configured for the tenant in the database.
    3. Falls back to default guardrails.
    Returns:
      {"decision": "allow" | "require_approval" | "deny", "reason": str}
    """
    rules = policy_rules or {}

    # 1. Dynamic Tool-level explicit consent requirement
    if tool_def and tool_def.get("requires_consent"):
        return {
            "decision": "require_approval",
            "reason": f"Tool '{tool_name}' requires explicit user confirmation prior to execution.",
        }

    # 2. Dynamic threshold rules from database
    if tool_name in ("wire_transfer", "create_wire"):
        threshold = float(rules.get("wire_threshold", 2500.0))
        amount = float(tool_args.get("amount", 0))
        if amount > threshold:
            return {
                "decision": "require_approval",
                "reason": f"Wire transfer of ${amount:.2f} exceeds the ${threshold:.0f} approval threshold.",
            }
        return {"decision": "allow", "reason": "Wire within auto-approval limit."}

    if tool_name in ("create_refund", "refund_order"):
        threshold = float(rules.get("refund_threshold", REFUND_APPROVAL_THRESHOLD_USD))
        amount = float(tool_args.get("amount", 0))
        if amount <= 0:
            return {"decision": "deny", "reason": "Refund amount must be positive."}
        if amount > threshold:
            return {
                "decision": "require_approval",
                "reason": f"Refund of ${amount:.2f} exceeds the ${threshold:.0f} approval threshold.",
            }
        return {"decision": "allow", "reason": "Refund within auto-approval limit."}

    if tool_name in ("check_order_status", "check_balance", "account_lookup"):
        return {"decision": "allow", "reason": "Read-only informational query."}

    # 3. Default fallback
    if tool_def:
        return {"decision": "allow", "reason": "Tenant-configured action."}

    return {"decision": "deny", "reason": f"Unknown tool: {tool_name}"}