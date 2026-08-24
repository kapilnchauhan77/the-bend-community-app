from types import SimpleNamespace
from pathlib import Path
from uuid import uuid4

import pytest

from app.api.v1.events import EventSubmitRequest, _serialize_admin_event, _serialize_event
from app.api.v1.events import submit_event
from app.api.v1.admin import admin_list_events, approve_event, reject_event, admin_update_event, admin_delete_event
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


def test_event_review_migration_revision_fits_alembic_version_column():
    migration = Path(__file__).parents[1] / "alembic" / "versions" / "20260824_community_faith_event_review.py"
    source = migration.read_text()
    revision = next(line.split("=", 1)[1].strip().strip('"') for line in source.splitlines() if line.startswith("revision"))
    assert len(revision) <= 32
    assert revision == "20260824_event_review"


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
@pytest.mark.parametrize("label", ["missing", "invalid", "expired", "exhausted"])
async def test_discount_service_lookup_rejects_unredeemable_community_codes(label):
    from app.services.discount_code_service import DiscountCodeService

    class Result:
        def scalar_one_or_none(self):
            return None

    class DB:
        calls = 0
        async def execute(self, _query):
            self.calls += 1
            return Result()

    db = DB()
    assert await DiscountCodeService(db).lookup_event_code("NOPE", uuid4()) is None
    assert db.calls == 1


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


def _admin_event(status="pending", created_at="2026-08-24T12:00:00", tenant_id=None):
    return SimpleNamespace(
        id=uuid4(), title="Review event", description=None, start_date="2026-09-01",
        end_date=None, location=None, category="community", image_url=None,
        source="submission", source_url=None, is_featured=False, status=status,
        created_at=created_at, submitted_by_name="Asha", submitted_by_email="asha@example.com",
        is_nonprofit=False, organization_type="community_faith", nonprofit_doc_url=None,
        paid=True, coupon_code_id=None, tenant_id=tenant_id,
    )


@pytest.mark.asyncio
async def test_admin_pending_list_passes_filter_and_newest_first_limit():
    newest = _admin_event(created_at="2026-08-24T13:00:00")
    oldest = _admin_event(created_at="2026-08-24T12:00:00")
    class Service:
        tenant_id = None
        async def list_admin_events(self, status, limit):
            assert status is EventStatus.PENDING
            assert limit == 50
            return [newest, oldest]
    result = await admin_list_events(status="pending", limit=50, event_service=Service(), _=SimpleNamespace(tenant_id=uuid4()))
    assert [row["id"] for row in result["items"]] == [str(newest.id), str(oldest.id)]


@pytest.mark.asyncio
@pytest.mark.parametrize(("handler", "expected"), [(approve_event, "active"), (reject_event, "rejected")])
async def test_admin_approve_and_reject_transition(handler, expected):
    event = _admin_event()
    class Service:
        tenant_id = None
        async def set_status(self, event_id, status):
            assert event_id == event.id
            event.status = status
            return event
    result = await handler(event.id, event_service=Service(), _=SimpleNamespace(tenant_id=uuid4()))
    assert result == {"id": str(event.id), "status": expected}


@pytest.mark.asyncio
async def test_cross_tenant_admin_mutations_are_denied_by_scoped_service():
    from app.core.exceptions import NotFoundError
    class Service:
        tenant_id = None
        async def set_status(self, *_): raise NotFoundError("Event")
        async def update_event(self, *_): raise NotFoundError("Event")
        async def delete_event(self, *_): raise NotFoundError("Event")
    event_id = uuid4()
    user = SimpleNamespace(tenant_id=uuid4())
    for handler, kwargs in ((approve_event, {}), (reject_event, {}), (admin_update_event, {"data": SimpleNamespace()}), (admin_delete_event, {})):
        with pytest.raises(Exception) as error:
            await handler(event_id, event_service=Service(), _=user, **kwargs)
        assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_invalid_organization_type_is_stable_400_without_row_or_usage(monkeypatch):
    _CouponService.coupon = SimpleNamespace(id=uuid4(), code="BAD", discount_type="percentage", discount_value=100)
    _CouponService.used = 0
    monkeypatch.setattr("app.services.discount_code_service.DiscountCodeService", _CouponService)
    db = _SubmissionDB()
    with pytest.raises(Exception) as error:
        await submit_event(_request(organization_type="invalid"), db=db, tenant=SimpleNamespace(id=uuid4()))
    assert error.value.status_code == 400
    assert db.events == []
    assert _CouponService.used == 0


def test_migration_upgrade_and_downgrade_keep_default_around_enum_replacement():
    source = (Path(__file__).parents[1] / "alembic" / "versions" / "20260824_community_faith_event_review.py").read_text()
    assert source.index("DROP DEFAULT") < source.index("ALTER TYPE event_status ADD VALUE")
    assert source.index("ALTER TABLE events ALTER COLUMN status TYPE") < source.rindex("SET DEFAULT 'ACTIVE'::event_status")
