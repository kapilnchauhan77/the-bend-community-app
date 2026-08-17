from app.models.report import Report
from app.models.report_audit import ReportAudit

def test_generic_report_contract_has_polymorphic_target_and_audit():
    names = set(Report.__table__.columns.keys())
    assert {"target_type", "target_id", "status", "resolved_at", "resolved_by_id"}.issubset(names)
    assert {"report_id", "tenant_id", "actor_id", "action"}.issubset(set(ReportAudit.__table__.columns.keys()))
