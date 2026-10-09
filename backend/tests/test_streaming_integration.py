"""StreamSphere contract tests over real HTTP, with SQLite and an offline model.

Run from backend: python -m unittest discover -s tests -p test_streaming_integration.py
Optionally set STREAMING_APP_PATH to a StreamSphere checkout to exercise its Node adapter.
No live model, application database, or external network is used.
"""

import copy
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import uuid
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

# The audit facade selects its storage backend at import time.
with patch.dict(os.environ, {"USE_AWS": "false", "USE_RDS": "false"}):
    import requests
    import uvicorn
    from app.agents import streaming
    from app.audit import logger
    from app.config import settings
    from app.main import app


SERVICE_KEY = "test-streaming-service-key-" + "a" * 32
TOOL_KEY = "test-streaming-business-key-" + "b" * 32
TENANT = "test-streamsphere"


class OfflineModel:
    def __init__(self):
        self.outputs = deque()
        self.prompts = []

    def queue(self, action="reply", reply="Your membership is active.", **extra):
        self.outputs.append(json.dumps({"action": action, "reply": reply, **extra}))

    def chat(self, *, messages, system):
        self.prompts.append({"system": system, **json.loads(messages[0]["content"])})
        result = self.outputs.popleft()
        if isinstance(result, Exception):
            raise result
        return result


class BusinessService:
    """Minimal HTTP double for the independently hosted business application."""

    def __init__(self):
        self.accounts = {}
        self.consents = {}
        self.completed = {}
        self.calls = []
        self.cancel_failures = deque()
        self.account_override = None
        self.cancel_override = None

    def member(self, user_id, *, eligible=True, amount=1599, status="active"):
        snapshot = {
            "account": {"id": str(uuid.uuid4()), "subscription_status": status,
                        "wallet_cents": 0, "price_cents": amount, "billing_timezone": "Asia/Colombo"},
            "policy": {"same_day_refund_eligible": eligible, "refund_amount_cents": amount,
                       "currency": "USD", "timezone": "Asia/Colombo", "user_consent_required": True,
                       "access_ends": "immediately", "refund_destination": "demo_wallet"},
        }
        self.accounts[user_id] = snapshot
        return snapshot

    def handler(self):
        service = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def reply(self, status, body):
                raw = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self):
                service.calls.append(("GET", self.path, dict(self.headers), None))
                if self.headers.get("Authorization") != f"Bearer {TOOL_KEY}":
                    return self.reply(401, {"error": "Invalid tool credentials"})
                url = urlsplit(self.path)
                query = parse_qs(url.query)
                if url.path != "/api/tools/account" or set(query) != {"user_id"}:
                    return self.reply(400, {"error": "Expected verified user_id"})
                snapshot = service.accounts.get(query["user_id"][0])
                if snapshot is None:
                    return self.reply(404, {"error": "Unknown user"})
                return self.reply(200, service.account_override if service.account_override is not None else snapshot)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
                service.calls.append(("POST", self.path, dict(self.headers), body))
                if self.headers.get("Authorization") != f"Bearer {TOOL_KEY}":
                    return self.reply(401, {"error": "Invalid tool credentials"})
                if self.path != "/api/tools/cancel-subscription" or set(body) != {"consent_id"}:
                    return self.reply(400, {"error": "Expected local consent_id only"})
                if service.cancel_failures:
                    return self.reply(service.cancel_failures.popleft(), {"error": "Temporary failure"})
                consent_id = body["consent_id"]
                if consent_id not in service.consents:
                    return self.reply(409, {"error": "Approval required"})
                if service.cancel_override is not None:
                    return self.reply(200, service.cancel_override)
                if consent_id in service.completed:
                    user_id, _ = service.consents[consent_id]
                    return self.reply(200, {**service.completed[consent_id], "already_executed": True,
                                            "account": service.accounts[user_id]["account"]})
                user_id, amount = service.consents[consent_id]
                account = service.accounts[user_id]["account"]
                account["subscription_status"] = "cancelled"
                account["wallet_cents"] += amount
                result = {"account": copy.deepcopy(account), "refund_amount_cents": amount,
                          "already_executed": False}
                service.completed[consent_id] = result
                return self.reply(200, result)

        return Handler


class StreamingIntegrationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.business = BusinessService()
        self.user_id, self.session_id = str(uuid.uuid4()), str(uuid.uuid4())
        self.business.member(self.user_id)
        tool_server = ThreadingHTTPServer(("127.0.0.1", 0), self.business.handler())
        tool_thread = threading.Thread(target=lambda: tool_server.serve_forever(poll_interval=0.01), daemon=True)
        tool_thread.start()

        def stop_tools():
            tool_server.shutdown()
            tool_server.server_close()
            tool_thread.join(timeout=5)

        self.addCleanup(stop_tools)
        configured = patch.multiple(
            settings, USE_AWS=False, USE_RDS=False, AUTH_MODE="local",
            SQLITE_AUDIT_DB=str(Path(temporary.name) / "audit.db"),
            STREAMING_TENANT_ID=TENANT, STREAMING_API_KEY=SERVICE_KEY,
            STREAMING_TOOL_API_KEY=TOOL_KEY,
            STREAMING_BASE_URL=f"http://127.0.0.1:{tool_server.server_port}",
            STREAMING_TOOL_TIMEOUT=2,
        )
        configured.start()
        self.addCleanup(configured.stop)
        self.model = OfflineModel()
        model_patch = patch.object(streaming, "get_llm_provider", return_value=self.model)
        model_patch.start()
        self.addCleanup(model_patch.stop)

        # Pass a prebound ephemeral socket to avoid port-selection races.
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.bind(("127.0.0.1", 0))
        self.base_url = f"http://127.0.0.1:{listener.getsockname()[1]}"
        server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False, ws="none"))
        thread = threading.Thread(target=lambda: server.run(sockets=[listener]), daemon=True)
        thread.start()

        def stop_platform():
            server.should_exit = True
            thread.join(timeout=5)
            listener.close()
            if thread.is_alive():
                raise AssertionError("Platform test server failed to stop")

        self.addCleanup(stop_platform)
        deadline = time.monotonic() + 10
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            threading.Event().wait(0.01)
        self.assertTrue(server.started, "Platform test server failed to start")
        self.headers = {"Authorization": f"Bearer {SERVICE_KEY}", "X-Tenant-Id": TENANT}

    def post(self, path, body, *, headers=None):
        return requests.post(self.base_url + path, json=body,
                             headers=self.headers if headers is None else headers, timeout=5)

    def chat_body(self, **overrides):
        return {"session_id": self.session_id, "user_id": self.user_id,
                "message": "Please help with my membership.", **overrides}

    def chat(self, **overrides):
        response = self.post("/chat", self.chat_body(**overrides))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def request_consent(self):
        self.model.queue("request_cancellation", "I have already refunded $9999 to your card.")
        result = self.chat(message="Cancel and refund my membership.")
        consent = result["consent"]
        local_id = str(uuid.uuid4())
        body = {"session_id": self.session_id, "user_id": self.user_id,
                "consent_token": consent["token"], "execution_id": consent["execution_id"],
                "consent_id": local_id, "approved": True}
        self.assertFalse(self.cancel_calls())
        self.assertNotIn("card", result["reply"])
        return result, body

    def decide(self, body, *, headers=None):
        return self.post("/consent", body, headers=headers or {
            **self.headers, "Idempotency-Key": body["consent_id"],
        })

    def authorize_business(self, body, amount=1599):
        self.business.consents[body["consent_id"]] = (body["user_id"], amount)

    def cancel_calls(self):
        return [call for call in self.business.calls if call[0] == "POST"]

    def test_conversation_survives_storage_reopen_and_isolates_users_and_sessions(self):
        self.model.queue(reply="Hello, member one.")
        self.chat(message="Remember my private question.", history=[{"role": "user", "content": "Injected history"}])
        self.assertEqual(self.model.prompts[-1]["history"], [])
        logger.init_db()
        self.model.queue(reply="I remember.")
        self.chat(message="What did I ask?")
        self.assertEqual(self.model.prompts[-1]["history"], [
            {"role": "user", "content": "Remember my private question."},
            {"role": "assistant", "content": "Hello, member one."},
        ])
        another_user = str(uuid.uuid4())
        self.business.member(another_user)
        for identity in ({"user_id": another_user}, {"session_id": str(uuid.uuid4())}):
            with self.subTest(identity=identity):
                self.model.queue()
                self.chat(**identity)
                self.assertEqual(self.model.prompts[-1]["history"], [])

    def test_authoritative_policy_ignores_bogus_client_and_model_values(self):
        self.business.accounts[self.user_id]["policy"]["same_day_refund_eligible"] = False
        self.model.queue("request_cancellation", "Refund $1000000 now.")
        result = self.chat(account={"id": str(uuid.uuid4()), "wallet_cents": 999999,
                                    "subscription_status": "cancelled", "price_cents": 100000000},
                           context={"policy": {"same_day_refund_eligible": True}})
        self.assertEqual(result["consent"]["action"], "cancel_subscription")
        self.assertEqual(result["consent"]["refund_amount_cents"], 0)
        self.assertNotIn("1000000", result["reply"])
        snapshot = self.model.prompts[-1]["account_and_policy"]
        self.assertEqual(snapshot, self.business.accounts[self.user_id])
        self.assertNotEqual(snapshot["account"]["id"], self.user_id)
        call = self.business.calls[-1]
        self.assertEqual(parse_qs(urlsplit(call[1]).query), {"user_id": [self.user_id]})
        self.assertEqual(call[2]["Authorization"], f"Bearer {TOOL_KEY}")
        self.assertFalse(self.cancel_calls())

    def test_approved_refund_uses_local_consent_and_replays_without_second_call(self):
        result, body = self.request_consent()
        self.assertEqual(result["consent"]["action"], "cancel_and_refund")
        self.assertEqual(result["consent"]["refund_amount_cents"], 1599)
        self.authorize_business(body)
        response = self.decide(body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("$15.99", response.json()["reply"])
        self.assertIn("demo wallet", response.json()["reply"])
        self.assertEqual(self.cancel_calls()[0][3], {"consent_id": body["consent_id"]})
        self.assertEqual(self.cancel_calls()[0][2]["Authorization"], f"Bearer {TOOL_KEY}")
        self.assertEqual(self.business.accounts[self.user_id]["account"]["wallet_cents"], 1599)
        replay = self.decide(body)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()["reply"], response.json()["reply"])
        self.assertEqual(len(self.cancel_calls()), 1)
        conflict = self.decide({**body, "approved": False})
        self.assertEqual(conflict.status_code, 409, conflict.text)
        conflict = self.decide({**body, "consent_id": str(uuid.uuid4())})
        self.assertEqual(conflict.status_code, 409, conflict.text)

    def test_decline_and_replay_never_call_mutating_tool(self):
        _, body = self.request_consent()
        body["approved"] = False
        for _ in range(2):
            response = self.decide(body)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn("unchanged", response.json()["reply"])
        self.assertEqual(self.decide({**body, "approved": True}).status_code, 409)
        self.assertFalse(self.cancel_calls())
        self.assertEqual(self.business.accounts[self.user_id]["account"]["subscription_status"], "active")

    def test_older_charge_cancels_without_credit(self):
        self.business.accounts[self.user_id]["policy"]["same_day_refund_eligible"] = False
        result, body = self.request_consent()
        self.assertEqual(result["consent"]["refund_amount_cents"], 0)
        self.authorize_business(body, amount=0)
        response = self.decide(body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("No refund", response.json()["reply"])
        self.assertEqual(self.business.accounts[self.user_id]["account"]["wallet_cents"], 0)

    def test_failed_callback_can_retry_same_decision_but_not_change_it(self):
        _, body = self.request_consent()
        self.authorize_business(body)
        self.business.cancel_failures.append(500)
        response = self.decide(body)
        self.assertEqual(response.status_code, 502, response.text)
        self.assertEqual(self.business.accounts[self.user_id]["account"]["subscription_status"], "active")
        self.assertEqual(self.decide({**body, "approved": False}).status_code, 409)
        self.assertEqual(self.decide({**body, "consent_id": str(uuid.uuid4())}).status_code, 409)
        retry = self.decide(body)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(len(self.cancel_calls()), 2)
        self.assertEqual(self.business.accounts[self.user_id]["account"]["wallet_cents"], 1599)

    def test_unverified_success_does_not_complete_consent_and_can_retry(self):
        _, body = self.request_consent()
        self.authorize_business(body)
        self.business.cancel_override = {"account": {"subscription_status": "active"}, "refund_amount_cents": 1599}
        response = self.decide(body)
        self.assertEqual(response.status_code, 502, response.text)
        self.business.cancel_override = None
        self.assertEqual(self.decide(body).status_code, 200)

    def test_consent_is_bound_to_token_user_session_execution_and_idempotency_key(self):
        _, body = self.request_consent()
        for field, value in (("consent_token", "wrong-token"), ("user_id", str(uuid.uuid4())),
                             ("session_id", str(uuid.uuid4())), ("execution_id", "wrong-execution")):
            with self.subTest(field=field):
                response = self.decide({**body, field: value})
                self.assertEqual(response.status_code, 404, response.text)
        response = self.decide(body, headers={**self.headers, "Idempotency-Key": str(uuid.uuid4())})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertFalse(self.cancel_calls())

    def test_consent_requires_explicit_boolean_and_valid_uuid_identities(self):
        _, body = self.request_consent()
        variants = [{key: value for key, value in body.items() if key != "approved"}]
        variants += [{**body, "approved": value} for value in ("true", "false", 1, 0, None)]
        variants += [{**body, field: "bad-id"} for field in ("user_id", "session_id", "consent_id")]
        for variant in variants:
            with self.subTest(variant=variant):
                response = self.decide(variant)
                self.assertIn(response.status_code, (400, 422), response.text)
        self.assertFalse(self.cancel_calls())

    def test_chat_rejects_missing_invalid_identity_empty_or_oversized_message(self):
        for field in ("user_id", "session_id"):
            for value in (None, "bad-id"):
                with self.subTest(field=field, value=value):
                    body = self.chat_body(**{field: value})
                    if value is None:
                        body.pop(field)
                    response = self.post("/chat", body)
                    self.assertIn(response.status_code, (400, 422), response.text)
        for message in (" ", "x" * 4001):
            response = self.post("/chat", self.chat_body(message=message))
            self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.business.calls, [])

    def test_malformed_or_unavailable_model_never_creates_consent_or_action(self):
        invalid = ["not json", "[]", '{"action":"wire_transfer","reply":"done"}',
                   '{"action":"reply","reply":"   "}',
                   json.dumps({"action": "request_cancellation", "reply": "yes", "refund_amount_cents": 999999})]
        for output in invalid:
            with self.subTest(output=output):
                self.model.outputs.append(output)
                response = self.post("/chat", self.chat_body())
                self.assertEqual(response.status_code, 502, response.text)
                self.assertNotIn("consent", response.json())
        self.model.outputs.append(RuntimeError("secret provider details"))
        response = self.post("/chat", self.chat_body())
        self.assertEqual(response.status_code, 503, response.text)
        self.assertNotIn("secret provider details", response.text)
        self.assertFalse(self.cancel_calls())

    def test_already_cancelled_account_does_not_offer_new_confirmation(self):
        self.business.accounts[self.user_id]["account"]["subscription_status"] = "cancelled"
        self.model.queue("request_cancellation", "Cancel again.")
        result = self.chat()
        self.assertNotIn("consent", result)
        self.assertIn("already cancelled", result["reply"])
        self.assertFalse(self.cancel_calls())

    def test_invalid_authoritative_policy_fails_before_model(self):
        invalid_fields = [("same_day_refund_eligible", "true"), ("refund_amount_cents", True),
                          ("refund_amount_cents", -1), ("currency", "EUR"),
                          ("refund_destination", "card"), ("user_consent_required", False)]
        for field, value in invalid_fields:
            with self.subTest(field=field, value=value):
                snapshot = copy.deepcopy(self.business.accounts[self.user_id])
                snapshot["policy"][field] = value
                self.business.account_override = snapshot
                response = self.post("/chat", self.chat_body())
                self.assertEqual(response.status_code, 502, response.text)
        self.assertEqual(self.model.prompts, [])

    def test_service_credentials_are_required_and_bound_to_configured_tenant(self):
        bad_headers = [{"X-Tenant-Id": TENANT},
                       {"X-Tenant-Id": TENANT, "Authorization": "Bearer wrong-key"},
                       {"X-Tenant-Id": TENANT, "Authorization": SERVICE_KEY},
                       {"X-Tenant-Id": "other-tenant", "Authorization": f"Bearer {SERVICE_KEY}"}]
        for headers in bad_headers:
            for endpoint in ("/chat", "/consent"):
                with self.subTest(headers=headers, endpoint=endpoint):
                    response = self.post(endpoint, self.chat_body(), headers=headers)
                    self.assertIn(response.status_code, (401, 403), response.text)
        self.assertEqual(self.business.calls, [])
        # Credential identifies its tenant without trusting a client-selected header.
        self.model.queue()
        response = self.post("/chat", self.chat_body(), headers={"Authorization": f"Bearer {SERVICE_KEY}"})
        self.assertEqual(response.status_code, 200, response.text)

    def test_generic_approval_cannot_mix_own_execution_with_streaming_confirmation(self):
        _, body = self.request_consent()
        stored = logger.get_tenant_consent(consent_token=body["consent_token"])
        logger.create_execution("other-execution", "other-tenant", "pending_approval")
        for reference in (stored["consent_id"], body["execution_id"]):
            response = self.post("/approve", {
                "execution_id": "other-execution", "consent_id": reference, "approved": False,
            }, headers={"X-Tenant-Id": "other-tenant"})
            self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(logger.get_tenant_consent(consent_token=body["consent_token"])["status"], "pending")
        self.assertFalse(self.cancel_calls())
        for path in ("/admin/settings", "/audit", "/audit/" + body["execution_id"]):
            response = requests.get(self.base_url + path, headers=self.headers, timeout=5)
            self.assertEqual(response.status_code, 403, response.text)

    def test_storage_failure_after_tool_success_recovers_after_repurchase(self):
        _, body = self.request_consent()
        self.authorize_business(body)
        # Simulate a failed platform commit after the independent business transaction.
        with patch.object(streaming, "complete_tenant_consent", side_effect=RuntimeError("database unavailable")):
            response = self.decide(body)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(logger.get_tenant_consent(consent_token=body["consent_token"])["status"], "pending")
        self.business.accounts[self.user_id]["account"]["subscription_status"] = "active"
        response = self.decide(body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("current subscription is active", response.json()["reply"])
        self.assertEqual(self.business.accounts[self.user_id]["account"]["wallet_cents"], 1599)
        self.assertEqual(logger.get_execution(body["execution_id"])["status"], "completed")
        replay = self.decide(body)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(len(self.cancel_calls()), 2)

    @unittest.skipUnless(os.environ.get("STREAMING_APP_PATH") and shutil.which("node"),
                         "Set STREAMING_APP_PATH and install Node to exercise the real streaming adapter")
    def test_real_node_streaming_adapter_chat_and_approved_consent(self):
        adapter = Path(os.environ["STREAMING_APP_PATH"]) / "server" / "agent.mjs"
        self.assertTrue(adapter.is_file(), f"Missing adapter: {adapter}")
        local_id = str(uuid.uuid4())
        self.business.consents[local_id] = (self.user_id, 1599)
        self.model.queue("request_cancellation", "Request confirmation.")
        script = """
import { pathToFileURL } from 'node:url';
const config = JSON.parse(process.env.STREAMING_ADAPTER_TEST);
const { createAgent } = await import(pathToFileURL(config.adapter));
const agent = createAgent(config);
const result = await agent.chat({ sessionId: config.sessionId, message: 'Please cancel.', account: { id: 'ignored-client-snapshot' } });
if (result.consent.action !== 'cancel_and_refund' || result.consent.refund_amount_cents !== 1599) throw new Error('Bad consent');
const decision = await agent.consent({ sessionId: config.sessionId, approved: true, consent: {
  id: config.localId, upstream_token: result.consent.token, execution_id: result.consent.execution_id
} });
if (!decision.reply.includes('demo wallet')) throw new Error('Bad completion');
process.stdout.write('adapter-contract-ok');
"""
        config = {"adapter": str(adapter), "chatUrl": self.base_url + "/chat",
                  "consentUrl": self.base_url + "/consent", "agentKey": SERVICE_KEY,
                  "tenantId": TENANT, "agentTimeout": 5000, "userId": self.user_id,
                  "sessionId": self.session_id, "localId": local_id}
        result = subprocess.run([shutil.which("node"), "--input-type=module", "-e", script],
                                env={**os.environ, "STREAMING_ADAPTER_TEST": json.dumps(config)},
                                capture_output=True, text=True, timeout=15, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "adapter-contract-ok")
        self.assertEqual(self.cancel_calls()[0][3], {"consent_id": local_id})


if __name__ == "__main__":
    unittest.main()
