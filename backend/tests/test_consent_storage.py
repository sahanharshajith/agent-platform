"""Offline regression tests for durable conversation and consent storage."""

import os
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

with patch.dict(os.environ, {"USE_AWS": "false", "USE_RDS": "false"}):
    from app.audit import logger
    from app.config import settings


class ConsentStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        db_path = str(Path(temporary.name) / "audit.db")
        setting = patch.object(settings, "SQLITE_AUDIT_DB", db_path)
        setting.start()
        self.addCleanup(setting.stop)
        logger.init_db()

    def create_consent(self, **overrides):
        fields = {
            "consent_id": "consent-1",
            "execution_id": "execution-1",
            "tenant_id": "streaming",
            "user_id": "user-1",
            "session_id": "session-1",
            "consent_token": "signed-token",
            "action": "change_plan",
            "tool_name": "change_plan",
            "tool_args": {"plan": "premium"},
            "details": {"summary": "Switch to premium"},
        }
        fields.update(overrides)
        logger.create_tenant_consent(**fields)

    def test_history_isolates_tenant_user_session_and_limits_latest_turns(self):
        # Tied timestamps must still produce stable conversation order.
        with patch.object(logger, "_now", return_value="2026-10-10T00:00:00+00:00"):
            logger.append_tenant_session("a", "u", "s", "user", "first")
            logger.append_tenant_session("a", "u", "s", "assistant", "second")
            logger.append_tenant_session("a", "u", "s", "user", "third", {"screen": "plans"})
            logger.append_tenant_session("b", "u", "s", "user", "other tenant")
            logger.append_tenant_session("a", "v", "s", "user", "other user")
            logger.append_tenant_session("a", "u", "t", "user", "other session")

        self.assertEqual(logger.get_tenant_session_history("a", "u", "s", limit=2), [
            {"role": "assistant", "content": "second"},
            {"role": "user", "content": "third"},
        ])
        self.assertEqual(logger.get_tenant_session_history("b", "u", "s"), [
            {"role": "user", "content": "other tenant"},
        ])
        self.assertEqual(logger.get_tenant_session_history("a", "u", "s", limit=0), [])
        self.assertEqual(logger.get_tenant_session_history("a", "u", "missing"), [])
        logger.init_db()
        self.assertEqual(len(logger.get_tenant_session_history("a", "u", "s")), 3)

    def test_pending_consent_round_trips_json_and_supports_lookup_keys(self):
        self.create_consent()
        consent = logger.get_tenant_consent(consent_id="consent-1")
        self.assertEqual(consent["status"], "pending")
        self.assertIsNone(consent["approved"])
        self.assertIsNone(consent["cached_reply"])
        self.assertEqual(consent["tool_args"], {"plan": "premium"})
        self.assertEqual(consent["details"], {"summary": "Switch to premium"})
        self.assertEqual(logger.get_tenant_consent(consent_id="execution-1"), consent)
        self.assertEqual(logger.get_tenant_consent(consent_token="signed-token"), consent)
        self.assertIsNone(logger.get_tenant_consent(consent_id="missing"))

    def test_binding_replay_conflicts_and_outcome_survive_reopen(self):
        self.create_consent()
        self.assertTrue(logger.bind_tenant_consent("consent-1", "callback-1", True))
        self.assertTrue(logger.bind_tenant_consent("consent-1", "callback-1", True))
        self.assertFalse(logger.bind_tenant_consent("consent-1", "callback-2", True))
        self.assertFalse(logger.bind_tenant_consent("consent-1", "callback-1", False))

        logger.record_tenant_consent_outcome(
            "consent-1", "execution-1", True, "executed", "Your plan is now premium.",
        )
        logger.init_db()
        consent = logger.get_tenant_consent(consent_id="consent-1")
        self.assertIs(consent["approved"], True)
        self.assertEqual(consent["status"], "executed")
        self.assertEqual(consent["cached_reply"], "Your plan is now premium.")
        self.assertIsNotNone(consent["executed_at"])
        self.assertEqual(consent["details"], {
            "summary": "Switch to premium",
            "external_consent_id": "callback-1",
            "decision": True,
        })
        self.assertTrue(logger.bind_tenant_consent("consent-1", "callback-1", True))
        self.assertFalse(logger.bind_tenant_consent("consent-1", "callback-2", True))

    def test_duplicate_creation_cannot_reset_bound_completed_consent(self):
        self.create_consent()
        self.assertTrue(logger.bind_tenant_consent("consent-1", "callback-1", False))
        logger.record_tenant_consent_outcome("consent-1", "execution-1", False, "declined", "No change made.")
        original = logger.get_tenant_consent(consent_id="consent-1")
        self.create_consent(
            tenant_id="another-tenant", user_id="another-user", consent_token="another-token",
            tool_args={"plan": "different"}, details={},
        )
        self.assertEqual(logger.get_tenant_consent(consent_id="consent-1"), original)
        self.assertIs(original["approved"], False)
        self.assertTrue(logger.bind_tenant_consent("consent-1", "callback-1", False))
        self.assertFalse(logger.bind_tenant_consent("consent-1", "callback-1", True))

    def test_completion_rolls_back_all_writes_and_replay_has_one_final_event(self):
        self.create_consent()
        logger.create_execution("execution-1", "streaming", "pending_approval")
        with logger._conn() as conn:
            conn.execute("""CREATE TRIGGER fail_completion BEFORE INSERT ON audit_events
                WHEN NEW.event_type = 'final_response' AND NEW.execution_id = 'execution-1'
                BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END""")
        with self.assertRaises(sqlite3.IntegrityError):
            logger.complete_tenant_consent("consent-1", "execution-1", True, "executed", "Done.")
        self.assertEqual(logger.get_tenant_consent(consent_id="consent-1")["status"], "pending")
        self.assertEqual(logger.get_execution("execution-1")["status"], "pending_approval")
        self.assertEqual(logger.get_tenant_session_history("streaming", "user-1", "session-1"), [])
        with logger._conn() as conn:
            conn.execute("DROP TRIGGER fail_completion")
        for _ in range(2):
            logger.complete_tenant_consent("consent-1", "execution-1", True, "executed", "Done.")
        self.assertEqual(logger.get_tenant_consent(consent_id="consent-1")["status"], "executed")
        record = logger.get_execution("execution-1")
        self.assertEqual(record["status"], "completed")
        self.assertEqual(len(record["events"]), 1)
        self.assertEqual(len(logger.get_tenant_session_history("streaming", "user-1", "session-1")), 1)

    def test_concurrent_conflicting_callbacks_have_one_winner(self):
        self.create_consent()
        barrier = threading.Barrier(2)

        def bind(callback_id):
            barrier.wait(timeout=5)
            return callback_id, logger.bind_tenant_consent("consent-1", callback_id, True)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(bind, ["callback-1", "callback-2"]))
        self.assertEqual(sum(accepted for _, accepted in results), 1)
        winner = next(callback_id for callback_id, accepted in results if accepted)
        self.assertEqual(
            logger.get_tenant_consent(consent_id="consent-1")["details"]["external_consent_id"],
            winner,
        )
        self.assertTrue(logger.bind_tenant_consent("consent-1", winner, True))

    def test_missing_or_partial_binding_cannot_authorize_callback(self):
        self.assertFalse(logger.bind_tenant_consent("missing", "callback-1", True))
        self.create_consent(details={"external_consent_id": "callback-1"})
        self.assertFalse(logger.bind_tenant_consent("consent-1", "callback-1", True))
        self.assertFalse(logger.bind_tenant_consent("consent-1", "callback-1", False))


if __name__ == "__main__":
    unittest.main()
