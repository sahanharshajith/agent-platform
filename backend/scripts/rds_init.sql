-- =============================================================================
-- AgentFlow Platform - AWS RDS PostgreSQL DDL & Initialization Script
-- Compatible with Amazon RDS PostgreSQL 13, 14, 15, and 16 / Aurora PostgreSQL
-- =============================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Table: executions
-- Tracks high-level agent sessions, execution states, and human-in-the-loop actions.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS executions (
    execution_id    VARCHAR(64) PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'completed',
    pending_action  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for executions
CREATE INDEX IF NOT EXISTS idx_executions_tenant_created 
    ON executions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_executions_tenant_status 
    ON executions (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_executions_status 
    ON executions (status);

-- -----------------------------------------------------------------------------
-- 2. Table: audit_events
-- Append-only immutable log of every reasoning step, tool call, policy gate,
-- customer consent decision, and LLM output token telemetry.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
    id              BIGSERIAL PRIMARY KEY,
    execution_id    VARCHAR(64) NOT NULL REFERENCES executions(execution_id) ON DELETE CASCADE,
    tenant_id       VARCHAR(64) NOT NULL,
    event_type      VARCHAR(64) NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit events
CREATE INDEX IF NOT EXISTS idx_audit_events_exec_time 
    ON audit_events (execution_id, timestamp ASC);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_time 
    ON audit_events (tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_type 
    ON audit_events (event_type);

-- GIN index for high-performance JSONB querying on audit telemetry
CREATE INDEX IF NOT EXISTS idx_audit_events_payload_gin 
    ON audit_events USING gin (payload);

-- -----------------------------------------------------------------------------
-- 3. Table: tenant_settings
-- Configuration settings per tenant: models, policy guardrails, and API keys.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id             VARCHAR(64) PRIMARY KEY,
    organization_name     VARCHAR(255) NOT NULL,
    domain                VARCHAR(255) NOT NULL,
    classification_model  VARCHAR(64) NOT NULL DEFAULT 'claude-3-haiku',
    reasoning_model       VARCHAR(64) NOT NULL DEFAULT 'claude-3-5-sonnet',
    embedding_model       VARCHAR(64) NOT NULL DEFAULT 'titan-embed-v2',
    system_prompt         TEXT,
    policy_rules          JSONB NOT NULL DEFAULT '{}'::jsonb,
    refund_threshold      NUMERIC(12, 2) NOT NULL DEFAULT 50.00,
    wire_threshold        NUMERIC(12, 2) NOT NULL DEFAULT 2500.00,
    max_steps             INTEGER NOT NULL DEFAULT 5,
    api_key               VARCHAR(128) NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS policy_rules JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tenant_settings_api_key 
    ON tenant_settings (api_key);

-- -----------------------------------------------------------------------------
-- 4. Initial Seed Data: Tenant Settings for Bank of Commerce (boc-tenant-01)
-- -----------------------------------------------------------------------------
INSERT INTO tenant_settings (
    tenant_id,
    organization_name,
    domain,
    classification_model,
    reasoning_model,
    embedding_model,
    refund_threshold,
    wire_threshold,
    max_steps,
    api_key,
    updated_at
) VALUES (
    'boc-tenant-01',
    'Bank of Commerce',
    'portal.bankofcommerce.example',
    'claude-3-haiku',
    'claude-3-5-sonnet',
    'titan-embed-v2',
    50.00,
    2500.00,
    5,
    'af_live_99a8f4c2810941e421b8c6a',
    CURRENT_TIMESTAMP
)
ON CONFLICT (tenant_id) DO UPDATE SET
    organization_name = EXCLUDED.organization_name,
    domain = EXCLUDED.domain,
    updated_at = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 5. Seed Realistic Telemetry Executions for boc-tenant-01
-- -----------------------------------------------------------------------------

-- Execution 1: Pending Approval (High value wire transfer)
INSERT INTO executions (execution_id, tenant_id, status, pending_action, created_at, updated_at)
VALUES (
    'exec-9941a87b',
    'boc-tenant-01',
    'pending_approval',
    '{"tool": "wire_transfer", "action_id": "act-9941a87b", "args": {"recipient": "Elena Rostova", "amount": 4500.0, "currency": "USD", "account": "****9012"}, "summary": "Wire transfer $4,500.00 to Elena Rostova"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '15 minutes',
    CURRENT_TIMESTAMP - INTERVAL '15 minutes'
) ON CONFLICT (execution_id) DO NOTHING;

INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp)
VALUES 
(
    'exec-9941a87b',
    'boc-tenant-01',
    'user_message',
    '{"message": "Please wire $4,500 to Elena Rostova from my corporate checking.", "user_id": "usr_9941", "intent": "wire_transfer"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '15 minutes'
),
(
    'exec-9941a87b',
    'boc-tenant-01',
    'tool_call',
    '{"tool": "check_balance", "account": "****9012", "result": {"balance": 28450.0, "currency": "USD"}}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '14 minutes 50 seconds'
),
(
    'exec-9941a87b',
    'boc-tenant-01',
    'policy',
    '{"decision": "require_approval", "rule": "wire_transfer_limit", "threshold": 2500.0, "amount": 4500.0, "message": "Wire transfers exceeding $2,500.00 require customer explicit consent."}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '14 minutes 40 seconds'
),
(
    'exec-9941a87b',
    'boc-tenant-01',
    'approval_decision',
    '{"status": "pending", "action": "wire_transfer", "message": "Consent request presented to customer in chat widget. Awaiting response."}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '14 minutes 35 seconds'
);

-- Execution 2: Pending Approval (Dispute transaction)
INSERT INTO executions (execution_id, tenant_id, status, pending_action, created_at, updated_at)
VALUES (
    'exec-387b9201',
    'boc-tenant-01',
    'pending_approval',
    '{"tool": "dispute_charge", "action_id": "act-387b9201", "args": {"charge_id": "chg_8820", "amount": 750.0, "reason": "Unrecognized charge"}, "summary": "Initiate card charge dispute $750.00"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '42 minutes',
    CURRENT_TIMESTAMP - INTERVAL '42 minutes'
) ON CONFLICT (execution_id) DO NOTHING;

INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp)
VALUES 
(
    'exec-387b9201',
    'boc-tenant-01',
    'user_message',
    '{"message": "I didn''t authorize the $750 charge at Apex Hardware. Can you dispute it?", "user_id": "usr_387b", "intent": "dispute_charge"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '42 minutes'
),
(
    'exec-387b9201',
    'boc-tenant-01',
    'policy',
    '{"decision": "require_approval", "rule": "dispute_threshold", "amount": 750.0, "message": "Dispute charges over $100 require end-user confirmation."}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '41 minutes 50 seconds'
),
(
    'exec-387b9201',
    'boc-tenant-01',
    'approval_decision',
    '{"status": "pending", "action": "dispute_charge", "message": "Awaiting customer confirmation to file formal card dispute."}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '41 minutes 45 seconds'
);

-- Execution 3: Completed (Account balance check)
INSERT INTO executions (execution_id, tenant_id, status, pending_action, created_at, updated_at)
VALUES (
    'exec-82a104f2',
    'boc-tenant-01',
    'completed',
    NULL,
    CURRENT_TIMESTAMP - INTERVAL '1 hour 15 minutes',
    CURRENT_TIMESTAMP - INTERVAL '1 hour 14 minutes'
) ON CONFLICT (execution_id) DO NOTHING;

INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp)
VALUES 
(
    'exec-82a104f2',
    'boc-tenant-01',
    'user_message',
    '{"message": "What is my current available balance on checking?", "user_id": "usr_82a1", "intent": "check_balance"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '1 hour 15 minutes'
),
(
    'exec-82a104f2',
    'boc-tenant-01',
    'tool_call',
    '{"tool": "check_balance", "account": "****4019", "result": {"balance": 14250.75, "currency": "USD"}}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '1 hour 14 minutes 50 seconds'
),
(
    'exec-82a104f2',
    'boc-tenant-01',
    'final_response',
    '{"response": "Your current available balance on checking account ending in 4019 is $14,250.75.", "model": "Claude 3.5 Sonnet", "tokens": 420}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '1 hour 14 minutes 40 seconds'
);

-- Execution 4: Completed (Direct deposit FAQ with RAG)
INSERT INTO executions (execution_id, tenant_id, status, pending_action, created_at, updated_at)
VALUES (
    'exec-71b9931c',
    'boc-tenant-01',
    'completed',
    NULL,
    CURRENT_TIMESTAMP - INTERVAL '2 hours 30 minutes',
    CURRENT_TIMESTAMP - INTERVAL '2 hours 29 minutes'
) ON CONFLICT (execution_id) DO NOTHING;

INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp)
VALUES 
(
    'exec-71b9931c',
    'boc-tenant-01',
    'user_message',
    '{"message": "How do I find my routing number for direct deposit setup?", "user_id": "usr_71b9", "intent": "faq_routing_number"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '2 hours 30 minutes'
),
(
    'exec-71b9931c',
    'boc-tenant-01',
    'policy',
    '{"decision": "allow", "rule": "read_only_faq", "message": "Standard informational query allowed without restrictions."}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '2 hours 29 minutes 50 seconds'
),
(
    'exec-71b9931c',
    'boc-tenant-01',
    'final_response',
    '{"response": "Bank of Commerce routing number for ACH direct deposits is 021000021. You can also view it in your mobile banking app under Account Details.", "model": "Claude 3 Haiku", "tokens": 310, "rag_chunks": [{"source": "kb_ach_direct_deposit.pdf", "score": 0.94}]}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '2 hours 29 minutes 40 seconds'
);

-- Execution 5: Rejected (Unauthorized account access attempt)
INSERT INTO executions (execution_id, tenant_id, status, pending_action, created_at, updated_at)
VALUES (
    'exec-52c11099',
    'boc-tenant-01',
    'rejected',
    NULL,
    CURRENT_TIMESTAMP - INTERVAL '3 hours 10 minutes',
    CURRENT_TIMESTAMP - INTERVAL '3 hours 9 minutes'
) ON CONFLICT (execution_id) DO NOTHING;

INSERT INTO audit_events (execution_id, tenant_id, event_type, payload, timestamp)
VALUES 
(
    'exec-52c11099',
    'boc-tenant-01',
    'user_message',
    '{"message": "Download monthly tax forms for account 99881122 without 2FA.", "user_id": "usr_52c1", "intent": "tax_document_request"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '3 hours 10 minutes'
),
(
    'exec-52c11099',
    'boc-tenant-01',
    'policy',
    '{"decision": "deny", "rule": "mandatory_mfa_for_tax_documents", "message": "Access denied: Tax documents require multi-factor authentication (MFA)."}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '3 hours 9 minutes 50 seconds'
),
(
    'exec-52c11099',
    'boc-tenant-01',
    'final_response',
    '{"response": "For your security, tax documents require completing two-factor authentication. Please authenticate in your settings to access tax statements.", "model": "Claude 3 Haiku", "tokens": 285}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '3 hours 9 minutes 40 seconds'
);

-- -----------------------------------------------------------------------------
-- 6. Table: tenant_tools
-- Generic registry for business tools available to each tenant.
-- Supports both external HTTP endpoints/webhooks and internal functions.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_tools (
    id                 BIGSERIAL PRIMARY KEY,
    tenant_id          VARCHAR(64) NOT NULL REFERENCES tenant_settings(tenant_id) ON DELETE CASCADE,
    tool_name          VARCHAR(64) NOT NULL,
    description        TEXT NOT NULL,
    parameters         JSONB NOT NULL DEFAULT '{}'::jsonb,
    endpoint_url       VARCHAR(255),
    method             VARCHAR(16) NOT NULL DEFAULT 'POST',
    auth_token         VARCHAR(255),
    requires_consent   BOOLEAN NOT NULL DEFAULT FALSE,
    consent_action     VARCHAR(64),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_tools_lookup 
    ON tenant_tools (tenant_id, tool_name);

-- -----------------------------------------------------------------------------
-- 7. Table: tenant_sessions
-- Multi-turn conversational memory for any tenant application.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_sessions (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   VARCHAR(64) NOT NULL,
    user_id     VARCHAR(64) NOT NULL,
    session_id  VARCHAR(64) NOT NULL,
    role        VARCHAR(16) NOT NULL,  -- 'user' | 'assistant'
    content     TEXT NOT NULL,
    context     JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_sessions_lookup 
    ON tenant_sessions (tenant_id, user_id, session_id, created_at ASC);

-- -----------------------------------------------------------------------------
-- 8. Table: tenant_consents
-- Generic pending and executed user/operator consent decisions with idempotency.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_consents (
    consent_id          VARCHAR(64) PRIMARY KEY, -- Tenant local consent UUID or generated execution key
    execution_id        VARCHAR(64) NOT NULL REFERENCES executions(execution_id) ON DELETE CASCADE,
    tenant_id           VARCHAR(64) NOT NULL,
    user_id             VARCHAR(64) NOT NULL,
    session_id          VARCHAR(64) NOT NULL,
    consent_token       VARCHAR(255) NOT NULL,
    action              VARCHAR(64) NOT NULL,
    tool_name           VARCHAR(64) NOT NULL,
    tool_args           JSONB NOT NULL DEFAULT '{}'::jsonb,
    details             JSONB NOT NULL DEFAULT '{}'::jsonb,
    approved            BOOLEAN,
    status              VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'executed', 'declined', 'rejected'
    cached_reply        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    executed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_consents_lookup 
    ON tenant_consents (tenant_id, user_id, session_id, execution_id);

-- -----------------------------------------------------------------------------
-- 9. Universal Multi-Tenant Seed Data
-- -----------------------------------------------------------------------------

-- Tenant A: Bank of Commerce
UPDATE tenant_settings SET
    system_prompt = 'You are Bank of Commerce AI banking assistant. You help customers check balances, execute approved transfers, and answer banking queries accurately.',
    policy_rules = '{"wire_threshold": 2500.0, "dispute_threshold": 100.0}'::jsonb
WHERE tenant_id = 'boc-tenant-01';

INSERT INTO tenant_tools (tenant_id, tool_name, description, parameters, requires_consent, consent_action)
VALUES 
(
    'boc-tenant-01',
    'check_balance',
    'Check current checking/savings account balance',
    '{"type": "object", "properties": {"account": {"type": "string"}}}'::jsonb,
    false,
    NULL
),
(
    'boc-tenant-01',
    'wire_transfer',
    'Wire funds to recipient. Exceeding $2,500 requires explicit customer consent.',
    '{"type": "object", "properties": {"amount": {"type": "number"}, "recipient": {"type": "string"}}, "required": ["amount", "recipient"]}'::jsonb,
    true,
    'wire_transfer'
)
ON CONFLICT (tenant_id, tool_name) DO NOTHING;

-- Tenant B: StreamSphere Streaming
INSERT INTO tenant_settings (
    tenant_id,
    organization_name,
    domain,
    classification_model,
    reasoning_model,
    embedding_model,
    system_prompt,
    policy_rules,
    refund_threshold,
    wire_threshold,
    max_steps,
    api_key,
    updated_at
) VALUES (
    'streamsphere-prod-01',
    'StreamSphere Streaming',
    'streamsphere.example.com',
    'claude-3-haiku',
    'claude-3-5-haiku',
    'titan-embed-v2',
    'You are StreamSphere customer support assistant. StreamSphere is a demonstration streaming service. Guidelines: Always state truthful facts based on the user account details. Never promise card/bank refunds; credits are applied to the demo wallet. Subscription cancellation requires explicit customer confirmation. Direct users to the "Buy now" button for repurchasing.',
    '{"same_day_refund_required": true, "timezone_billing_check": true}'::jsonb,
    15.99,
    100.00,
    5,
    'af_live_ss_9a7bc41f92e811',
    CURRENT_TIMESTAMP
) ON CONFLICT (tenant_id) DO UPDATE SET
    organization_name = EXCLUDED.organization_name,
    domain = EXCLUDED.domain,
    system_prompt = EXCLUDED.system_prompt,
    policy_rules = EXCLUDED.policy_rules,
    api_key = EXCLUDED.api_key,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO tenant_tools (tenant_id, tool_name, description, parameters, endpoint_url, method, auth_token, requires_consent, consent_action)
VALUES 
(
    'streamsphere-prod-01',
    'account_lookup',
    'Look up user subscription, wallet, and charge date',
    '{"type": "object", "properties": {"user_id": {"type": "string"}}}'::jsonb,
    'https://streamsphere.vercel.app/api/tools/account',
    'GET',
    'ss_tool_secret_live_83b1a20',
    false,
    NULL
),
(
    'streamsphere-prod-01',
    'cancel_subscription',
    'Cancel subscription and optionally credit the demo wallet',
    '{"type": "object", "properties": {"consent_id": {"type": "string"}}, "required": ["consent_id"]}'::jsonb,
    'https://streamsphere.vercel.app/api/tools/cancel-subscription',
    'POST',
    'ss_tool_secret_live_83b1a20',
    true,
    'cancel_and_refund'
)
ON CONFLICT (tenant_id, tool_name) DO UPDATE SET
    endpoint_url = EXCLUDED.endpoint_url,
    auth_token = EXCLUDED.auth_token,
    requires_consent = EXCLUDED.requires_consent;


