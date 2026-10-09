import requests
from typing import Dict, Any, Optional
from .check_order_status import check_order_status
from .create_refund import create_refund
from app.audit import get_tenant_tools, get_tenant_tool


# Built-in internal platform tools
BUILTIN_TOOLS: Dict[str, Dict[str, Any]] = {
    "check_order_status": {
        "fn": check_order_status,
        "schema": {
            "name": "check_order_status",
            "description": "Check the current status of a customer order.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "Order ID, e.g. ORD-1001"},
                },
                "required": ["order_id"],
            },
        },
    },
    "create_refund": {
        "fn": create_refund,
        "schema": {
            "name": "create_refund",
            "description": "Create a refund for an order. Refunds over $100 require human approval.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string"},
                    "amount": {"type": "number", "description": "Refund amount in USD"},
                    "reason": {"type": "string"},
                },
                "required": ["order_id", "amount", "reason"],
            },
        },
    },
}

TOOLS = BUILTIN_TOOLS


def get_effective_tools(tenant_id: str) -> Dict[str, Dict[str, Any]]:
    """
    Returns full set of available tools for a tenant:
    Dynamically loads tenant tools from RDS, plus any built-in tools.
    """
    combined = dict(BUILTIN_TOOLS)

    try:
        db_tools = get_tenant_tools(tenant_id)
        for t in db_tools:
            name = t["tool_name"]
            combined[name] = {
                "schema": {
                    "name": name,
                    "description": t.get("description", ""),
                    "parameters": t.get("parameters") or {"type": "object", "properties": {}},
                },
                "endpoint_url": t.get("endpoint_url"),
                "method": t.get("method", "POST"),
                "auth_token": t.get("auth_token"),
                "requires_consent": bool(t.get("requires_consent")),
                "consent_action": t.get("consent_action") or name,
            }
    except Exception:
        pass

    return combined


def execute_tool(tool_name: str, tool_args: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
    """
    Universally execute a tool:
    1. If the tool is configured with an external endpoint in tenant_tools, call it over HTTP.
    2. Otherwise, dispatch to internal registered Python functions.
    """
    # 1. Check for dynamic tenant tool in database
    try:
        t_record = get_tenant_tool(tenant_id, tool_name)
        if t_record and t_record.get("endpoint_url"):
            url = t_record["endpoint_url"]
            method = (t_record.get("method") or "POST").upper()
            token = t_record.get("auth_token")

            headers = {
                "Accept": "application/json",
            }
            if token:
                headers["Authorization"] = f"Bearer {token}"

            if method == "GET":
                resp = requests.get(url, params=tool_args, headers=headers, timeout=20)
            else:
                headers["Content-Type"] = "application/json"
                resp = requests.post(url, json=tool_args, headers=headers, timeout=20)

            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        return {"ok": False, "error": f"External tool execution failed ({tool_name}): {e}"}

    # 2. Check built-in platform tools
    if tool_name not in BUILTIN_TOOLS:
        return {"ok": False, "error": f"Unknown tool: {tool_name}"}

    args = dict(tool_args)
    args["tenant_id"] = tenant_id
    try:
        return BUILTIN_TOOLS[tool_name]["fn"](**args)
    except TypeError as e:
        return {"ok": False, "error": f"Invalid arguments for {tool_name}: {e}"}
    except Exception as e:
        return {"ok": False, "error": f"Tool execution failed: {e}"}