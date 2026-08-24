from types import SimpleNamespace

import pytest

from app.api.v1.events import EventSubmitRequest, _serialize_admin_event, _serialize_event
from app.models.enums import EventStatus


def test_submission_accepts_community_faith_organization_type():
    request = EventSubmitRequest(
        title="Community meal",
        start_date="2026-09-01T10:00:00",
        submitted_by_name="Asha",
        submitted_by_email="asha@example.com",
        organization_type="community_faith",
    )
    assert request.organization_type == "community_faith"


def test_event_status_has_rejected_value():
    assert EventStatus.REJECTED.value == "rejected"


def test_public_serializer_excludes_submission_details():
    event = SimpleNamespace(
        id="1", title="Event", description=None, start_date="2026-09-01",
        end_date=None, location=None, category="community", image_url=None,
        source="submission", source_url=None, is_featured=False,
        status="pending", created_at="2026-08-24", submitted_by_name="Asha",
        submitted_by_email="asha@example.com", is_nonprofit=True,
        organization_type="verified_nonprofit", nonprofit_doc_url="secret",
        paid=True, coupon_code_id="coupon",
    )
    result = _serialize_event(event)
    assert "submitted_by_email" not in result
    assert "nonprofit_doc_url" not in result
    assert "coupon_code_id" not in result


def test_admin_serializer_includes_submission_details():
    event = SimpleNamespace(
        id="1", title="Event", description=None, start_date="2026-09-01",
        end_date=None, location=None, category="community", image_url=None,
        source="submission", source_url=None, is_featured=False,
        status="pending", created_at="2026-08-24", submitted_by_name="Asha",
        submitted_by_email="asha@example.com", is_nonprofit=False,
        organization_type="community_faith", nonprofit_doc_url=None,
        paid=True, coupon_code_id="coupon",
    )
    result = _serialize_admin_event(event)
    assert result["submitted_by_email"] == "asha@example.com"
    assert result["organization_type"] == "community_faith"
    assert result["coupon_code_id"] == "coupon"
