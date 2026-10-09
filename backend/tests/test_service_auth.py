import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

with patch.dict(os.environ, {"USE_AWS": "false", "USE_RDS": "false"}):
    from app.auth import cognito


class ServiceAuthTests(unittest.TestCase):
    def setUp(self):
        self.settings = SimpleNamespace(
            AUTH_MODE="local",
            STREAMING_TENANT_ID="streamsphere",
            STREAMING_API_KEY="test-streaming-service-key",
        )
        self.addCleanup(patch.stopall)
        patch.object(cognito, "settings", self.settings).start()
        self.lookup = patch.object(cognito, "get_tenant_settings", return_value={}).start()
        self.verifier = patch.object(
            cognito, "verify_token", side_effect=HTTPException(401, "Invalid token")
        ).start()

    def assertUnauthorized(self, authorization="", tenant=""):
        with self.assertRaises(HTTPException) as caught:
            cognito.get_current_tenant(authorization, tenant)
        self.assertEqual(caught.exception.status_code, 401)

    def test_streaming_key_identifies_tenant_without_header(self):
        identity = cognito.get_current_tenant("Bearer test-streaming-service-key", "")
        self.assertEqual(identity["tenant_id"], "streamsphere")
        self.assertEqual(identity["service"], "streaming")
        self.lookup.assert_not_called()
        self.verifier.assert_not_called()

    def test_streaming_key_accepts_matching_header_in_all_auth_modes(self):
        for mode in ("local", "cognito"):
            with self.subTest(mode=mode):
                self.settings.AUTH_MODE = mode
                identity = cognito.get_current_tenant(
                    "bEaReR test-streaming-service-key", " streamsphere "
                )
                self.assertEqual(identity["service"], "streaming")

    def test_streaming_key_cannot_authenticate_another_tenant(self):
        self.lookup.return_value = {"api_key": "test-streaming-service-key"}
        self.assertUnauthorized("Bearer test-streaming-service-key", "bank")
        self.lookup.assert_not_called()

    def test_streaming_header_requires_service_key_even_in_local_mode(self):
        for token in ("", "Bearer wrong", "Bearer", "test-streaming-service-key"):
            with self.subTest(token=token):
                self.assertUnauthorized(token, "streamsphere")
        self.lookup.assert_not_called()
        self.verifier.assert_not_called()

    def test_unconfigured_streaming_key_never_accepts_empty_credentials(self):
        self.settings.STREAMING_API_KEY = ""
        self.assertUnauthorized("", "streamsphere")
        self.assertUnauthorized("Bearer wrong", "streamsphere")

    def test_configured_streaming_tenant_is_reserved(self):
        self.settings.STREAMING_TENANT_ID = "custom-streaming"
        self.assertUnauthorized("", "custom-streaming")
        identity = cognito.get_current_tenant("Bearer test-streaming-service-key", "")
        self.assertEqual(identity["tenant_id"], "custom-streaming")

    def test_local_default_cannot_bypass_reserved_tenant(self):
        self.settings.STREAMING_TENANT_ID = "boc-tenant-01"
        self.assertUnauthorized()

    def test_header_only_local_admin_and_demo_remain_supported(self):
        for tenant in ("admin", "bank", ""):
            with self.subTest(tenant=tenant):
                identity = cognito.get_current_tenant("", tenant)
                self.assertEqual(identity["tenant_id"], tenant or "boc-tenant-01")

    def test_nonlocal_header_cannot_impersonate_tenant(self):
        self.settings.AUTH_MODE = "cognito"
        self.assertUnauthorized("", "bank")

    def test_invalid_bearer_never_falls_back_to_local_identity(self):
        for tenant in ("", "bank", "admin"):
            with self.subTest(tenant=tenant):
                self.assertUnauthorized("Bearer invalid", tenant)

    def test_malformed_authorization_is_rejected(self):
        for authorization in ("Bearer", "Basic credentials", "raw-api-key"):
            with self.subTest(authorization=authorization):
                self.assertUnauthorized(authorization, "bank")
        self.verifier.assert_not_called()

    def test_general_tenant_api_key_uses_configured_audit_lookup(self):
        self.settings.AUTH_MODE = "cognito"
        self.lookup.return_value = {"api_key": "test-bank-key"}
        identity = cognito.get_current_tenant("Bearer test-bank-key", "bank")
        self.assertEqual(identity["tenant_id"], "bank")
        self.assertNotIn("service", identity)
        self.lookup.assert_called_once_with("bank")
        self.verifier.assert_not_called()

    def test_general_key_requires_explicit_tenant(self):
        self.lookup.return_value = {"api_key": "test-bank-key"}
        self.assertUnauthorized("Bearer test-bank-key", "")
        self.lookup.assert_not_called()

    def test_database_lookup_failure_does_not_allow_local_fallback(self):
        self.lookup.side_effect = RuntimeError("database unavailable")
        self.assertUnauthorized("Bearer invalid", "bank")

    def test_valid_jwt_can_authenticate_independently_of_database(self):
        self.lookup.side_effect = RuntimeError("database unavailable")
        self.verifier.side_effect = None
        self.verifier.return_value = {"custom:tenant_id": "bank", "email": "test@example.com"}
        identity = cognito.get_current_tenant("Bearer test-jwt", "bank")
        self.assertEqual(identity, {"tenant_id": "bank", "email": "test@example.com"})

    def test_jwt_cannot_override_tenant_header(self):
        self.verifier.side_effect = None
        self.verifier.return_value = {"custom:tenant_id": "other-bank"}
        self.assertUnauthorized("Bearer test-jwt", "bank")

    def test_jwt_cannot_authenticate_streaming_tenant_without_service_key(self):
        self.verifier.side_effect = None
        self.verifier.return_value = {"custom:tenant_id": "streamsphere"}
        self.assertUnauthorized("Bearer test-jwt", "")

    def test_jwt_requires_tenant_claim(self):
        self.verifier.side_effect = None
        for claim in (None, "", " ", 123):
            with self.subTest(claim=claim):
                self.verifier.return_value = {"custom:tenant_id": claim}
                self.assertUnauthorized("Bearer test-jwt", "")

    def test_verifier_errors_are_unauthorized(self):
        self.verifier.side_effect = ValueError("malformed JWT")
        self.assertUnauthorized("Bearer test-jwt", "")

    def test_non_ascii_invalid_key_is_rejected_cleanly(self):
        self.assertUnauthorized("Bearer invalid-\u00e9", "streamsphere")


class CognitoVerificationTests(unittest.TestCase):
    def test_missing_configuration_fails_without_fetching_keys(self):
        with patch.object(cognito, "COGNITO_POOL_ID", ""), patch.object(
            cognito, "_get_jwks"
        ) as get_jwks:
            with self.assertRaises(HTTPException) as caught:
                cognito.verify_token("invalid")
            self.assertEqual(caught.exception.status_code, 401)
            get_jwks.assert_not_called()

    def test_malformed_jwt_is_unauthorized_without_network(self):
        with patch.object(cognito, "COGNITO_POOL_ID", "test-pool"), patch.object(
            cognito, "COGNITO_CLIENT_ID", "test-client"
        ), patch.object(cognito, "_get_jwks") as get_jwks:
            with self.assertRaises(HTTPException) as caught:
                cognito.verify_token("invalid")
            self.assertEqual(caught.exception.status_code, 401)
            get_jwks.assert_not_called()


if __name__ == "__main__":
    unittest.main()
