from app.config import settings
from . import logger as local_audit
from . import dynamodb_logger as cloud_audit
from . import rds_logger as rds_audit

if settings.USE_RDS:
    init_db = rds_audit.init_db
    log_event = rds_audit.log_event
    create_execution = rds_audit.create_execution
    update_execution_status = rds_audit.update_execution_status
    get_execution = rds_audit.get_execution
    list_executions = rds_audit.list_executions
    get_audit_trail = rds_audit.get_audit_trail
    get_tenant_settings = rds_audit.get_tenant_settings
    update_tenant_settings = rds_audit.update_tenant_settings
    rotate_tenant_api_key = rds_audit.rotate_tenant_api_key
    get_tenant_tools = rds_audit.get_tenant_tools
    get_tenant_tool = rds_audit.get_tenant_tool
    append_tenant_session = rds_audit.append_tenant_session
    get_tenant_session_history = rds_audit.get_tenant_session_history
    create_tenant_consent = rds_audit.create_tenant_consent
    get_tenant_consent = rds_audit.get_tenant_consent
    bind_tenant_consent = rds_audit.bind_tenant_consent
    complete_tenant_consent = rds_audit.complete_tenant_consent
    record_tenant_consent_outcome = rds_audit.record_tenant_consent_outcome
    get_overview_stats = rds_audit.get_overview_stats
    get_usage_stats = rds_audit.get_usage_stats
elif settings.USE_AWS:
    init_db = cloud_audit.init_db
    log_event = cloud_audit.log_event
    create_execution = cloud_audit.create_execution
    update_execution_status = cloud_audit.update_execution_status
    get_execution = cloud_audit.get_execution
    list_executions = cloud_audit.list_executions
    get_audit_trail = cloud_audit.get_audit_trail
    get_tenant_settings = cloud_audit.get_tenant_settings
    update_tenant_settings = cloud_audit.update_tenant_settings
    rotate_tenant_api_key = cloud_audit.rotate_tenant_api_key
    get_overview_stats = cloud_audit.get_overview_stats
    get_usage_stats = cloud_audit.get_usage_stats
    get_tenant_tools = lambda tenant_id: []
    get_tenant_tool = lambda tenant_id, tool_name: None
    append_tenant_session = lambda *args, **kwargs: None
    get_tenant_session_history = lambda *args, **kwargs: []
    create_tenant_consent = lambda *args, **kwargs: None
    get_tenant_consent = lambda *args, **kwargs: None
    record_tenant_consent_outcome = lambda *args, **kwargs: None

    def bind_tenant_consent(consent_id: str, external_consent_id: str, approved: bool) -> bool:
        raise RuntimeError("Consent callback binding requires SQLite or PostgreSQL storage.")

    def complete_tenant_consent(*args, **kwargs):
        raise RuntimeError("Consent completion requires SQLite or PostgreSQL storage.")
else:
    init_db = local_audit.init_db
    log_event = local_audit.log_event
    create_execution = local_audit.create_execution
    update_execution_status = local_audit.update_execution_status
    get_execution = local_audit.get_execution
    list_executions = local_audit.list_executions
    get_audit_trail = None
    get_tenant_settings = local_audit.get_tenant_settings
    update_tenant_settings = local_audit.update_tenant_settings
    rotate_tenant_api_key = local_audit.rotate_tenant_api_key
    get_overview_stats = local_audit.get_overview_stats
    get_usage_stats = local_audit.get_usage_stats
    get_tenant_tools = lambda tenant_id: []
    get_tenant_tool = lambda tenant_id, tool_name: None
    append_tenant_session = local_audit.append_tenant_session
    get_tenant_session_history = local_audit.get_tenant_session_history
    create_tenant_consent = local_audit.create_tenant_consent
    get_tenant_consent = local_audit.get_tenant_consent
    bind_tenant_consent = local_audit.bind_tenant_consent
    complete_tenant_consent = local_audit.complete_tenant_consent
    record_tenant_consent_outcome = local_audit.record_tenant_consent_outcome

__all__ = [
    "init_db",
    "log_event",
    "create_execution",
    "update_execution_status",
    "get_execution",
    "list_executions",
    "get_audit_trail",
    "get_tenant_settings",
    "update_tenant_settings",
    "rotate_tenant_api_key",
    "get_overview_stats",
    "get_usage_stats",
    "get_tenant_tools",
    "get_tenant_tool",
    "append_tenant_session",
    "get_tenant_session_history",
    "create_tenant_consent",
    "get_tenant_consent",
    "bind_tenant_consent",
    "complete_tenant_consent",
    "record_tenant_consent_outcome",
]
