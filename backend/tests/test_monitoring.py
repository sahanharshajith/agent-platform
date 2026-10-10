"""Exercise monitoring with real persisted chat/consent events, without live services."""
import json
import unittest
from unittest.mock import patch

import requests

import test_streaming_integration as integration
from app.audit import logger
from app.audit.monitoring import overview
from app.config import settings

TENANT = integration.TENANT


class MonitoringTests(unittest.TestCase):
    def setUp(self):
        self.scenario = integration.StreamingIntegrationTests()
        self.addCleanup(self.scenario.doCleanups)
        self.scenario.setUp()
        grant = patch.object(settings, "MONITORING_TENANT_ACCESS", json.dumps({"boc-tenant-01": [TENANT]}))
        grant.start()
        self.addCleanup(grant.stop)

    def get(self, path, tenant=TENANT, headers=None):
        return requests.get(self.scenario.base_url + "/admin/monitoring" + path,
                            params={"tenant_id": tenant}, headers=headers or {"X-Tenant-Id": "boc-tenant-01"}, timeout=5)

    def test_streaming_cancellation_shows_its_actual_events_and_live_outcome(self):
        scenario = self.scenario
        initial, body = scenario.request_consent()
        ref = initial["execution_id"]
        response = self.get("/executions")
        self.assertEqual(response.status_code, 200, response.text)
        row = response.json()[0]
        self.assertEqual(row["execution_id"], ref)
        self.assertEqual(row["message"], "Cancel and refund my membership.")
        self.assertEqual(row["user_id"], scenario.user_id)
        self.assertEqual(row["intent"], "request_cancellation")
        self.assertEqual(row["status"], "pending_approval")
        self.assertIsNone(row["model"])
        self.assertIsNone(row["tokens"])
        before = self.get("/executions/" + ref).json()
        self.assertEqual(before["events"][1]["details"]["tool"], "streamsphere_account")
        self.assertEqual(before["events"][1]["details"]["result"]["account"]["wallet_cents"], 0)
        scenario.authorize_business(body)
        self.assertEqual(scenario.decide(body).status_code, 200)
        after = self.get("/executions/" + ref).json()
        self.assertEqual(after["status"], "completed")
        self.assertEqual([event["event_type"] for event in after["events"]], [
            "user_message", "tool_call", "plan", "policy", "approval_request",
            "approval_decision", "tool_call", "final_response",
        ])
        self.assertTrue(after["events"][5]["details"]["approved"])
        self.assertEqual(after["events"][6]["details"]["result"]["refund_amount_cents"], 1599)
        self.assertEqual(self.get("/overview").json()["pending"], 0)
        self.assertEqual(len(scenario.cancel_calls()), 1)  # Monitoring never triggers tools.

    def test_cross_tenant_monitoring_needs_server_grant_and_service_key_is_not_admin(self):
        initial, _ = self.scenario.request_consent()
        ref = initial["execution_id"]
        tenants = self.get("/tenants").json()
        self.assertEqual([row["tenant_id"] for row in tenants["tenants"]], ["boc-tenant-01", TENANT])
        for path in ("/executions", "/executions/" + ref, "/overview"):
            self.assertEqual(self.get(path, headers={"X-Tenant-Id": "unrelated"}).status_code, 403)
            self.assertEqual(self.get(path, tenant="unauthorized").status_code, 403)
            self.assertEqual(self.get(path, headers=self.scenario.headers).status_code, 403)
        self.assertEqual(self.get("/executions/" + ref, tenant="boc-tenant-01").status_code, 404)
        with patch.object(settings, "MONITORING_TENANT_ACCESS", "{}"):
            self.assertEqual(self.get("/executions").status_code, 403)
        for prefix in ("", "bearer ", "Bearer "):
            headers = {"X-Tenant-Id": "boc-tenant-01", "Authorization": prefix + integration.SERVICE_KEY}
            self.assertEqual(self.get("/tenants", headers=headers).status_code, 403)
        with patch.object(settings, "MONITORING_TENANT_ACCESS", '{"boc-tenant-01":"*"}'):
            self.assertEqual(self.get("/tenants").status_code, 503)

    def test_empty_workspace_has_zero_counts_and_unknown_usage_not_sample_metrics(self):
        result = self.get("/overview").json()
        for key in ("total", "today", "pending", "completedWeek", "activeSessions"):
            self.assertEqual(result[key], 0)
        for key in ("monthlyTokens", "cost", "remainingBudget"):
            self.assertIsNone(result[key])
        self.assertEqual(result["modelTokens"], [])
        self.assertTrue(all(row["executions"] == 0 for row in result["dailyExecutions"]))
        self.assertEqual(self.get("/executions", tenant="boc-tenant-01").json(), [])
        self.assertIsNotNone(logger.get_execution("exec-9941a87b"))  # Samples retained in storage.

    def test_failed_and_running_states_are_not_completed_and_secrets_are_redacted(self):
        for status in ("failed", "running"):
            logger.create_execution("real-" + status, TENANT, status)
            logger.log_event("real-" + status, TENANT, "error", {"message": "Failure", "consent_token": "private", "nested": {"api_key": "private"}})
        rows = self.get("/executions").json()
        self.assertEqual({row["status"] for row in rows}, {"failed", "running"})
        payload = self.get("/executions/real-failed").json()["events"][0]["details"]
        self.assertEqual(payload["consent_token"], "[redacted]")
        self.assertEqual(payload["nested"]["api_key"], "[redacted]")
        self.assertEqual(self.get("/executions", tenant=TENANT).status_code, 200)
        result = self.get("/overview").json()
        self.assertEqual(result["completedWeek"], 0)
        self.assertIsNone(result["monthlyTokens"])

    def test_explicit_zero_usage_is_preserved_and_summary_does_not_count_old_records_today(self):
        logger.create_execution("metered", TENANT, "completed")
        logger.log_event("metered", TENANT, "final_response", {"model": "reported-model", "tokens": 0})
        result = self.get("/overview").json()
        self.assertEqual(result["monthlyTokens"], 0)
        self.assertEqual(result["tokenExecutionsReported"], 1)
        self.assertEqual(result["modelTokens"][0]["model"], "reported-model")
        with logger._conn() as conn:
            conn.execute("UPDATE executions SET created_at = '2001-01-01T00:00:00+00:00', updated_at = '2001-01-01T00:00:00+00:00' WHERE execution_id = 'metered'")
        result = overview(TENANT)
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["today"], 0)
        self.assertEqual(result["completedWeek"], 0)
        self.assertTrue(all(row["executions"] == 0 for row in result["hourly"]))
