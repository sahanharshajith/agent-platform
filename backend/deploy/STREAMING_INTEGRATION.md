# Connect StreamSphere to Agent Platform

For the configured Vercel, API Gateway, EC2, and RDS deployments, use the
[production environment files and deployment steps](production/README.md).

Agent Platform implements the JSON contract used by the existing
`D:/streaming/streaming-service/server/agent.mjs` adapter. The streaming frontend
continues to call its own backend. Agent Platform owns model calls, conversation
memory, intent planning, consent tokens, and execution auditing. StreamSphere owns
authentication of members, membership state, refund eligibility, local approvals,
and the atomic cancellation/wallet transaction.

## Configure the two backends

In Agent Platform's `backend/.env`, keep the existing LLM credentials and add:

```dotenv
USE_AWS=false
USE_RDS=false
AUTH_MODE=local
STREAMING_TENANT_ID=streamsphere-prod-01
STREAMING_API_KEY=<a new random secret of at least 32 characters>
STREAMING_BASE_URL=http://localhost:3001
STREAMING_TOOL_API_KEY=<StreamSphere's existing TOOL_API_KEY>
STREAMING_TOOL_TIMEOUT=15
```

Generate the new service key with `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
The inbound service key and outbound tool key are separate credentials. For example,
use the existing `LLM_PROVIDER=gemini` and `GEMINI_API_KEY`; Bedrock is also supported
by the platform provider configuration. A valid model configuration is required;
model failures return an explicit service error instead of a simulated chat response.

Set these values in the streaming application's `.env` (or its hosting environment):

```dotenv
CHAT_PROVIDER=agent-platform
AGENT_CHAT_URL=http://localhost:8000/chat
AGENT_CONSENT_URL=http://localhost:8000/consent
AGENT_TENANT_ID=streamsphere-prod-01
AGENT_API_KEY=<the same value as STREAMING_API_KEY>
AGENT_TIMEOUT_MS=60000
```

Keep its existing `TOOL_API_KEY`, Supabase credentials, and account authentication
settings. `CHAT_PROVIDER` must be explicit when `GEMINI_API_KEY` is also set in the
streaming app. No changes to the streaming adapter or UI are needed. These are all
server environment variables; never put keys in frontend `VITE_*` variables.

Run Agent Platform from `backend`:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start/restart StreamSphere's API (`npm run dev:api`) and frontend (`npm run dev`)
from its project directory. Sign in with a registered member and open support chat.

## Hosting and storage

Use reachable HTTPS origins for hosted backends: `STREAMING_BASE_URL` points to the
streaming app's origin; `AGENT_CHAT_URL` and `AGENT_CONSENT_URL` point to this service.
The callback base URL must be an origin without a path, query, or credentials.
HTTP is supported only on localhost/loopback. A hosted service cannot call a laptop's
localhost. Callback redirects are rejected so tool credentials stay on the configured
origin.

Use `AUTH_MODE=cognito` outside local development to disable the header-only demo
authentication. The configured streaming service key works in either auth mode;
streaming requests always require it. Real console users need valid Cognito settings.
Streaming credentials only permit chat/consent, not console or audit endpoints.
The credential identifies the tenant; a conflicting tenant header is rejected.
The reserved streaming tenant uses `STREAMING_API_KEY`, not older seeded RDS keys
or the admin console's general API key. Rotate it in both backend environments.

SQLite stores conversations and consent records in `SQLITE_AUDIT_DB`; retain this
file across process restarts. For shared/multiple-instance hosting, use the existing
RDS configuration (`USE_RDS=true`) and initialize its schema normally. DynamoDB-only
mode (`USE_AWS=true`, `USE_RDS=false`) does not implement these records and returns
503 for this integration. No FAISS index or separate tool registry seeding is needed:
the StreamSphere agent uses the two configured business callbacks directly.

## Request and confirmation behavior

`POST /chat` accepts `{message,user_id,session_id,account}` with bearer service key
and tenant header. `user_id` and `session_id` must be UUIDs; the streaming backend
supplies the signed-in user ID. The received account snapshot and caller-supplied
history cannot override authoritative data. Before planning, the agent fetches
`GET /api/tools/account?user_id=...` with the tool key and loads stored conversation
history by tenant, user, and session.

An ordinary result contains `reply`. A cancellation request contains:

```json
{
  "reply": "I can cancel Premium and credit $15.99 to your demo wallet...",
  "consent": {
    "token": "opaque-platform-token",
    "execution_id": "exec-...",
    "action": "cancel_and_refund",
    "refund_amount_cents": 1599
  }
}
```

For an ineligible charge it returns `cancel_subscription` and zero cents. Amounts
come from the account tool, never the model. This response does not cancel anything.
StreamSphere creates its own local consent UUID and records the member's decision.

`POST /consent` takes `{user_id,session_id,execution_id,consent_token,consent_id,approved}`.
`approved` must be an explicit JSON boolean. `Idempotency-Key`, when provided, must
equal the local `consent_id`. Token, tenant, execution, user and session must match.
The first decision binds the local callback ID and boolean atomically; conflicting
decisions or IDs are rejected. `/approve` is a compatibility alias with the same
checks for this tenant.

Declining executes no business mutation. Approving calls only
`POST /api/tools/cancel-subscription` with `{consent_id}` using StreamSphere's **local**
ID. StreamSphere rechecks approval, expiry, same-day eligibility and subscription
version inside its transaction. The agent reports success only after tool success
and describes demo wallet credit. The final reply is deterministic so another model
call cannot fail after cancellation. Completed results are cached; tool failures
leave the confirmation retryable with the same ID. Concurrent duplicate callbacks
may reach StreamSphere, whose database applies the action once. An already-executed
callback after repurchase reports the previous action without changing the new plan.

## Verify

Offline tests use isolated SQLite, a local HTTP business-tool server, and a controlled
model. They require backend dependencies but no real provider or database credentials:

```powershell
cd D:\agent-platform\backend
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

To include the existing streaming JavaScript adapter in the local HTTP tests:

```powershell
$env:STREAMING_APP_PATH = 'D:\streaming\streaming-service'
.\venv\Scripts\python.exe -m unittest discover -s tests -p test_streaming_integration.py -v
```

For a live check after configuring both services, sign in and ask about your current
membership and wallet, then ask a follow-up to verify memory. In a demo account,
request a cancellation and choose **Keep Subscription** to verify the decline path.
Choose cancellation only when you intend to change that demo account. Account state
and wallet must change only after that confirmation, and repeated callbacks must not
issue another wallet credit.
