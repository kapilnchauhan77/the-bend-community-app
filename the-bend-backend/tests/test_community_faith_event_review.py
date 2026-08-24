from types import SimpleNamespace
from pathlib import Path
from uuid import uuid4

import pytest

from app.api.v1.events import EventSubmitRequest, _serialize_admin_event, _serialize_event
from app.api.v1.events import submit_event
from app.api.v1.admin import admin_list_events
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


def test_event_status_migration_handles_existing_server_default():
    migration = Path(__file__).parents[1] / "alembic" / "versions" / "20260824_community_faith_event_review.py"
    source = migration.read_text()
    assert "ALTER TABLE events ALTER COLUMN status DROP DEFAULT" in source
    assert "ALTER TABLE events ALTER COLUMN status SET DEFAULT" in source


def test_event_submission_always_uses_pending_status():
    source = Path(__file__).parents[1] / "app" / "api" / "v1" / "events.py"
    assert "status=EventStatus.PENDING," in source.read_text()
    assert "hasattr(EventStatus, 'PENDING')" not in source.read_text()


class _SubmissionDB:
    def __init__(self):
        self.events = []

    def add(self, event):
        self.events.append(event)

    async def flush(self):
        return None


class _CouponService:
    coupon = None
    used = 0

    def __init__(self, _db):
        pass

    async def lookup_event_code(self, _code, _tenant_id):
        return self.coupon

    async def mark_used(self, _id):
        type(self).used += 1
        return self.coupon


def _request(**kwargs):
    values = dict(
        title="Food drive", start_date="2026-09-01T10:00:00",
        submitted_by_name="Asha", submitted_by_email="asha@example.com",
        organization_type="community_faith", coupon_code="FREE100",
    )
    values.update(kwargs)
    return EventSubmitRequest(**values)


@pytest.mark.asyncio
async def test_valid_community_coupon_creates_pending_paid_event_once(monkeypatch):
    coupon = SimpleNamespace(id=uuid4(), code="FREE100", discount_type="percentage", discount_value=100)
    _CouponService.coupon = coupon
    _CouponService.used = 0
    monkeypatch.setattr("app.services.discount_code_service.DiscountCodeService", _CouponService)
    db = _SubmissionDB()
    result = await submit_event(_request(), db=db, tenant=SimpleNamespace(id=uuid4()))
    assert result["free"] is True
    assert len(db.events) == 1
    event = db.events[0]
    assert event.status is EventStatus.PENDING
    assert event.paid is True
    assert event.organization_type == "community_faith"
    assert event.coupon_code_id == coupon.id
    assert event.nonprofit_doc_url is None
    assert _CouponService.used == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("coupon", [None, SimpleNamespace(id=uuid4(), code="HALF", discount_type="percentage", discount_value=50)])
async def test_invalid_or_partial_community_coupon_creates_nothing(monkeypatch, coupon):
    _CouponService.coupon = coupon
    _CouponService.used = 0
    monkeypatch.setattr("app.services.discount_code_service.DiscountCodeService", _CouponService)
    db = _SubmissionDB()
    with pytest.raises(Exception) as error:
        await submit_event(_request(), db=db, tenant=SimpleNamespace(id=uuid4()))
    assert error.value.status_code == 400
    assert db.events == []
    assert _CouponService.used == 0


@pytest.mark.asyncio
async def test_verified_nonprofit_requires_document_and_is_free(monkeypatch):
    _CouponService.coupon = None
    _CouponService.used = 0
    monkeypatch.setattr("app.services.discount_code_service.DiscountCodeService", _CouponService)
    db = _SubmissionDB()
    with pytest.raises(Exception) as error:
        await submit_event(_request(organization_type="verified_nonprofit", coupon_code=None), db=db, tenant=None)
    assert error.value.status_code == 400
    assert db.events == []
    db = _SubmissionDB()
    await submit_event(_request(organization_type="verified_nonprofit", coupon_code=None, nonprofit_doc_url="https://docs.example/nonprofit.pdf"), db=db, tenant=None)
    assert db.events[0].paid is True
    assert db.events[0].is_nonprofit is True


@pytest.mark.asyncio
async def test_legacy_nonprofit_request_derives_verified_nonprofit(monkeypatch):
    _CouponService.coupon = None
    monkeypatch.setattr("app.services.discount_code_service.DiscountCodeService", _CouponService)
    db = _SubmissionDB()
    await submit_event(_request(organization_type=None, is_nonprofit=True, coupon_code=None, nonprofit_doc_url="doc"), db=db, tenant=None)
    assert db.events[0].organization_type == "verified_nonprofit"


@pytest.mark.asyncio
async def test_admin_omitted_status_keeps_paginated_all_event_contract():
    class Service:
        tenant_id = None
        async def list_all_events(self, cursor, limit):
            assert cursor == "cursor"
            assert limit == 20
            return SimpleNamespace(items=[], next_cursor="next", has_more=True)
    result = await admin_list_events(status=None, cursor="cursor", limit=20, event_service=Service(), _=SimpleNamespace(tenant_id=uuid4()))
    assert result == {"items": [], "next_cursor": "next", "has_more": True}
