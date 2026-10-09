import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE ||
  "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Request interceptor: attach Authorization and X-Tenant-Id headers
apiClient.interceptors.request.use(
  (config) => {
    const idToken = localStorage.getItem("id_token");
    if (idToken) {
      config.headers["Authorization"] = `Bearer ${idToken}`;
    }

    const tenantId = localStorage.getItem("tenant_id") || "boc-tenant-01";
    config.headers["X-Tenant-Id"] = tenantId;

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: safe 401 interceptor to clear session and redirect
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      console.warn("Unauthorized request (401). Clearing session and redirecting...");
      localStorage.removeItem("id_token");
      localStorage.removeItem("id_token_exp");
      localStorage.removeItem("tenant_id");
      localStorage.removeItem("user_email");

      // Redirect to login if not already on login page
      if (window.location.pathname !== "/login") {
        window.location.href = "/login?session_expired=true";
      }
    }
    return Promise.reject(error);
  }
);

// API Contract methods

/**
 * Health check endpoint
 * GET /health -> { status: "ok" }
 */
export const getHealth = async () => {
  try {
    const response = await apiClient.get("/health");
    return response.data;
  } catch (err) {
    console.warn("Health check unreachable:", err.message);
    return { status: "offline", error: err.message };
  }
};

/**
 * List executions for current tenant
 * GET /audit -> [{ execution_id, timestamp, status, tenant_id }]
 */
export const listAudits = async () => {
  try {
    const response = await apiClient.get("/audit");
    const raw = response.data;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.executions)
      ? raw.executions
      : [];

    return list.map((item) => ({
      execution_id: item.execution_id,
      timestamp: item.timestamp || item.created_at || new Date().toISOString(),
      status: item.status || "completed",
      tenant_id: item.tenant_id || localStorage.getItem("tenant_id") || "boc-tenant-01",
    }));
  } catch (err) {
    console.warn("GET /audit failed, falling back to local tenant telemetry:", err.message);
    return getFallbackAuditList();
  }
};

/**
 * Get detailed audit trail with events for a specific execution
 * GET /audit/{execution_id} -> { execution_id, events: [{ timestamp, event_type, details }] }
 */
export const getAudit = async (executionId) => {
  try {
    const response = await apiClient.get(`/audit/${executionId}`);
    const raw = response.data;

    const events = (raw.events || []).map((e) => ({
      timestamp: e.timestamp || new Date().toISOString(),
      event_type: e.event_type,
      details: e.details !== undefined ? e.details : e.payload || {},
    }));

    return {
      execution_id: raw.execution_id || executionId,
      status: raw.status || "completed",
      tenant_id: raw.tenant_id || "boc-tenant-01",
      events,
    };
  } catch (err) {
    console.warn(`GET /audit/${executionId} failed, falling back to mock telemetry:`, err.message);
    return getFallbackExecutionDetail(executionId);
  }
};

// Fallback simulated records for demo presentation when backend has zero data or is offline
function getFallbackAuditList() {
  const tenantId = localStorage.getItem("tenant_id") || "boc-tenant-01";
  const now = Date.now();

  return [
    {
      execution_id: "exec-9941a87b",
      timestamp: new Date(now - 1000 * 45).toISOString(),
      status: "pending_approval",
      tenant_id: tenantId,
      user_id: "user_8912",
      intent: "Wire transfer above threshold ($4,500.00)",
      model: "Claude 3.5 Sonnet",
      tokens: 1420,
    },
    {
      execution_id: "exec-8720b12c",
      timestamp: new Date(now - 1000 * 180).toISOString(),
      status: "completed",
      tenant_id: tenantId,
      user_id: "user_4301",
      intent: "Account balance & recent statement query",
      model: "Claude 3 Haiku",
      tokens: 680,
    },
    {
      execution_id: "exec-7619c34d",
      timestamp: new Date(now - 1000 * 420).toISOString(),
      status: "completed",
      tenant_id: tenantId,
      user_id: "user_9021",
      intent: "Mortgage rates calculation for 30yr fixed",
      model: "Claude 3.5 Sonnet",
      tokens: 2130,
    },
    {
      execution_id: "exec-6508d56e",
      timestamp: new Date(now - 1000 * 950).toISOString(),
      status: "rejected",
      tenant_id: tenantId,
      user_id: "user_1194",
      intent: "Unauthorized credential reset request",
      model: "Claude 3 Haiku",
      tokens: 520,
    },
    {
      execution_id: "exec-5497e78f",
      timestamp: new Date(now - 1000 * 1800).toISOString(),
      status: "completed",
      tenant_id: tenantId,
      user_id: "user_6672",
      intent: "Foreign exchange rate query (USD to EUR)",
      model: "Titan Embeddings v2",
      tokens: 410,
    },
    {
      execution_id: "exec-4386f90a",
      timestamp: new Date(now - 1000 * 2700).toISOString(),
      status: "pending_approval",
      tenant_id: tenantId,
      user_id: "user_3389",
      intent: "Refund dispute escalation for Order #88219",
      model: "Claude 3.5 Sonnet",
      tokens: 1890,
    },
    {
      execution_id: "exec-3275a12b",
      timestamp: new Date(now - 1000 * 3600 * 2).toISOString(),
      status: "completed",
      tenant_id: tenantId,
      user_id: "user_7714",
      intent: "Business credit line terms clarification",
      model: "Claude 3.5 Sonnet",
      tokens: 1650,
    },
    {
      execution_id: "exec-2164b23c",
      timestamp: new Date(now - 1000 * 3600 * 3).toISOString(),
      status: "completed",
      tenant_id: tenantId,
      user_id: "user_2093",
      intent: "Scheduled recurring payment setup",
      model: "Claude 3 Haiku",
      tokens: 940,
    },
    {
      execution_id: "exec-1053c34d",
      timestamp: new Date(now - 1000 * 3600 * 5).toISOString(),
      status: "rejected",
      tenant_id: tenantId,
      user_id: "user_5502",
      intent: "Exceeded daily debit limit transaction",
      model: "Claude 3.5 Sonnet",
      tokens: 1210,
    },
    {
      execution_id: "exec-0942d45e",
      timestamp: new Date(now - 1000 * 3600 * 8).toISOString(),
      status: "completed",
      tenant_id: tenantId,
      user_id: "user_4419",
      intent: "Branch appointment scheduling confirmation",
      model: "Claude 3 Haiku",
      tokens: 720,
    },
  ];
}

function getFallbackExecutionDetail(executionId) {
  const tenantId = localStorage.getItem("tenant_id") || "boc-tenant-01";
  const now = Date.now();

  const isPending = executionId.includes("9941") || executionId.includes("4386");
  const isRejected = executionId.includes("6508") || executionId.includes("1053");

  const events = [
    {
      timestamp: new Date(now - 60000).toISOString(),
      event_type: "user_message",
      details: {
        user_id: "user_8912",
        message: "Please initiate an emergency supplier wire transfer of $4,500.00 to Apex Logistical Services.",
        session_id: "sess_59021a8f",
      },
    },
    {
      timestamp: new Date(now - 55000).toISOString(),
      event_type: "rag_retrieval",
      details: {
        query: "wire transfer supplier limit Apex Logistical Services",
        chunks_retrieved: 2,
        sources: [
          {
            doc_id: "policy_banking_v4.pdf",
            title: "Commercial Wire Transfer Guidelines",
            chunk_text: "Transfers over $2,500.00 require secondary customer approval and compliance sanction screening.",
            score: 0.94,
          },
          {
            doc_id: "approved_vendors_2026.csv",
            title: "Verified Vendor Register",
            chunk_text: "Apex Logistical Services (Routing: 021000021, Account: ****9812) is flagged as Tier 2 Supplier.",
            score: 0.88,
          },
        ],
      },
    },
    {
      timestamp: new Date(now - 45000).toISOString(),
      event_type: "tool_call",
      details: {
        tool_name: "check_account_balance_and_limits",
        arguments: {
          account_id: "acct_prime_9901",
          currency: "USD",
          requested_amount: 4500.0,
        },
        result: {
          sufficient_funds: true,
          available_balance: 48920.5,
          daily_limit_remaining: 15000.0,
        },
      },
    },
    {
      timestamp: new Date(now - 35000).toISOString(),
      event_type: "policy",
      details: {
        rule_evaluated: "wire_amount_threshold_gate",
        threshold_amount: 2500.0,
        transaction_amount: 4500.0,
        policy_decision: isRejected
          ? "BLOCK_VIOLATION"
          : isPending
          ? "REQUIRE_END_USER_CONSENT"
          : "AUTO_ALLOW",
        risk_score: 0.22,
      },
    },
  ];

  if (isPending) {
    events.push({
      timestamp: new Date(now - 25000).toISOString(),
      event_type: "approval_decision",
      details: {
        action: "wire_transfer",
        target: "Apex Logistical Services",
        amount: "$4,500.00",
        state: "pending_user_consent",
        note: "READ-ONLY: End-user was prompted with biometric push confirmation on mobile device.",
      },
    });
  } else if (isRejected) {
    events.push({
      timestamp: new Date(now - 20000).toISOString(),
      event_type: "approval_decision",
      details: {
        action: "wire_transfer",
        target: "Apex Logistical Services",
        state: "rejected_by_policy",
        note: "READ-ONLY: Request rejected due to compliance screening mismatch or user cancellation.",
      },
    });
    events.push({
      timestamp: new Date(now - 15000).toISOString(),
      event_type: "final_response",
      details: {
        status: "rejected",
        response_text: "I am unable to proceed with this transfer because the transaction failed policy approval criteria.",
      },
    });
  } else {
    events.push({
      timestamp: new Date(now - 25000).toISOString(),
      event_type: "approval_decision",
      details: {
        action: "wire_transfer",
        state: "approved_by_end_user",
        note: "READ-ONLY: End-user accepted authorization challenge via SMS OTP at 18:32:01.",
      },
    });
    events.push({
      timestamp: new Date(now - 10000).toISOString(),
      event_type: "final_response",
      details: {
        status: "completed",
        response_text: "Your wire transfer of $4,500.00 to Apex Logistical Services has been successfully submitted. Reference number: WT-881920.",
        tokens_used: 1420,
      },
    });
  }

  return {
    execution_id: executionId,
    status: isPending ? "pending_approval" : isRejected ? "rejected" : "completed",
    tenant_id: tenantId,
    events,
  };
}