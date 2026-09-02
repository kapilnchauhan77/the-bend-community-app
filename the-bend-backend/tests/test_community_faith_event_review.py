import io
from types import SimpleNamespace
from pathlib import Path
from uuid import uuid4

import pytest

from app.api.v1.events import EventSubmitRequest, _serialize_admin_event, _serialize_event
from app.api.v1.events import submit_event
from app.api.v1.admin import admin_list_events, approve_event, reject_event, admin_update_event, admin_delete_event
from app.services.event_service import EventService
from app.services.discount_code_service import DiscountCodeService
from app.api.deps import get_db
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


class _RacingCouponService(_CouponService):
    async def mark_used(self, _id):
        from app.core.exceptions import AppException
        raise AppException(status_code=410, code="GONE", message="Code is no longer available")


def _request(**kwargs):
    values = dict(
        title="Food drive", start_date="2026-09-01T10:00:00",
        submitted_by_name="Asha", submitted_by_email="asha@example.com",
        organization_type="community_faith", coupon_code="FREE100",
    )
    values.update(kwargs)
    return EventSubmitRequest(**values)


def _managed_pdf_reference(tmp_path, monkeypatch):
    from pypdf import PdfWriter
    import app.services.nonprofit_document_service as document_service

    tenant = SimpleNamespace(id=uuid4())
    document_id = uuid4()
    private_root = tmp_path / "private_uploads"
    document = private_root / "nonprofit_documents" / str(tenant.id) / f"{document_id}.pdf"
    document.parent.mkdir(parents=True)
    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(output)
    document.write_bytes(output.getvalue())
    monkeypatch.setattr(document_service, "PRIVATE_DOCUMENT_DIR", private_root / "nonprofit_documents")
    return tenant, f"nonprofit-documents/{tenant.id}/{document_id}.pdf"


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
async def test_discount_service_lookup_rejects_missing_community_code_and_applies_guards():
    from app.services.discount_code_service import DiscountCodeService

    class Result:
        def scalar_one_or_none(self):
            return None

    class DB:
        calls = 0
        async def execute(self, _query):
            self.calls += 1
            self.query = _query
            return Result()

    db = DB()
    assert await DiscountCodeService(db).lookup_event_code("NOPE", uuid4()) is None
    assert db.calls == 1
    sql = str(db.query)
    assert "discount_codes.is_active IS true" in sql
    assert "discount_codes.expiry_date IS NULL OR discount_codes.expiry_date >" in sql
    assert "discount_codes.max_uses IS NULL OR discount_codes.usage_count < discount_codes.max_uses" in sql


@pytest.mark.asyncio
async def test_verified_nonprofit_requires_document_and_is_free(tmp_path, monkeypatch):
    _CouponService.coupon = None
    _CouponService.used = 0
    monkeypatch.setattr("app.services.discount_code_service.DiscountCodeService", _CouponService)
    db = _SubmissionDB()
    tenant = SimpleNamespace(id=uuid4())
    with pytest.raises(Exception) as error:
        await submit_event(_request(organization_type="verified_nonprofit", coupon_code=None), db=db, tenant=tenant)
    assert error.value.status_code == 400
    assert db.events == []
    tenant, reference = _managed_pdf_reference(tmp_path, monkeypatch)
    db = _SubmissionDB()
    await submit_event(_request(organization_type="verified_nonprofit", coupon_code=None, nonprofit_doc_url=reference), db=db, tenant=tenant)
    assert db.events[0].paid is True
    assert db.events[0].is_nonprofit is True


@pytest.mark.asyncio
async def test_legacy_nonprofit_request_derives_verified_nonprofit(tmp_path, monkeypatch):
    _CouponService.coupon = None
    monkeypatch.setattr("app.services.discount_code_service.DiscountCodeService", _CouponService)
    tenant, reference = _managed_pdf_reference(tmp_path, monkeypatch)
    db = _SubmissionDB()
    await submit_event(_request(organization_type=None, is_nonprofit=True, coupon_code=None, nonprofit_doc_url=reference), db=db, tenant=tenant)
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


@pytest.mark.asyncio
async def test_community_coupon_last_use_race_is_stable_400(monkeypatch):
    _RacingCouponService.coupon = SimpleNamespace(id=uuid4(), code="RACE", discount_type="percentage", discount_value=100)
    monkeypatch.setattr("app.services.discount_code_service.DiscountCodeService", _RacingCouponService)
    db = _SubmissionDB()
    with pytest.raises(Exception) as error:
        await submit_event(_request(), db=db, tenant=SimpleNamespace(id=uuid4()))
    assert error.value.status_code == 400


def test_migration_upgrade_and_downgrade_keep_default_around_enum_replacement():
    source = (Path(__file__).parents[1] / "alembic" / "versions" / "20260824_community_faith_event_review.py").read_text()
    assert source.index("DROP DEFAULT") < source.index("ALTER TYPE event_status ADD VALUE")
    assert source.index("ALTER TABLE events ALTER COLUMN status TYPE") < source.rindex("SET DEFAULT 'ACTIVE'::event_status")


class _ScalarResult:
    def __init__(self, row=None, rows=None):
        self.row = row
        self.rows = rows or ([] if row is None else [row])
    def scalar_one_or_none(self):
        return self.row
    def scalars(self):
        return self
    def all(self):
        return self.rows


class _QuerySession:
    def __init__(self, row=None, rows=None):
        self.row = row
        self.rows = rows
        self.queries = []
        self.deleted = []
    async def execute(self, query):
        self.queries.append(query)
        return _ScalarResult(self.row, self.rows)
    async def flush(self):
        return None
    async def refresh(self, _row):
        return None
    async def delete(self, row):
        self.deleted.append(row)


@pytest.mark.asyncio
async def test_event_service_admin_query_has_tenant_status_newest_and_limit():
    tenant_id = uuid4()
    session = _QuerySession(rows=[])
    events = EventService(session, tenant_id=tenant_id)
    await events.list_admin_events(EventStatus.PENDING, 50)
    sql = str(session.queries[0])
    assert "events.tenant_id" in sql
    assert "events.status" in sql
    assert "events.created_at DESC" in sql
    assert "LIMIT :param_1" in sql


@pytest.mark.asyncio
async def test_event_service_scoped_mutations_query_tenant_and_deny_other_tenant():
    foreign = _admin_event(tenant_id=uuid4())
    session = _QuerySession(row=None)
    service = EventService(session, tenant_id=uuid4())
    with pytest.raises(Exception) as error:
        await service.set_status(foreign.id, EventStatus.ACTIVE)
    assert error.value.status_code == 404
    assert "events.tenant_id" in str(session.queries[-1])
    with pytest.raises(Exception):
        await service.update_event(foreign.id, SimpleNamespace(model_dump=lambda **_: {"title": "x"}))
    with pytest.raises(Exception):
        await service.delete_event(foreign.id)
    assert session.deleted == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "row",
    [
        SimpleNamespace(is_active=False, expiry_date=None, max_uses=None, usage_count=0),
        SimpleNamespace(is_active=True, expiry_date=__import__("datetime").datetime.utcnow(), max_uses=None, usage_count=0),
        SimpleNamespace(is_active=True, expiry_date=None, max_uses=1, usage_count=1),
    ],
)
async def test_mark_used_rejects_inactive_expired_and_exhausted_rows_without_increment(row):
    row.id = uuid4()
    initial_usage_count = row.usage_count
    session = _QuerySession(row=row)
    service = DiscountCodeService(session)
    with pytest.raises(Exception) as error:
        await service.mark_used(row.id)
    assert error.value.status_code == 410
    assert row.usage_count == initial_usage_count


@pytest.mark.asyncio
async def test_mark_used_missing_row_is_not_found():
    session = _QuerySession(row=None)
    with pytest.raises(Exception) as error:
        await DiscountCodeService(session).mark_used(uuid4())
    assert error.value.status_code == 404


def test_migration_operations_are_invoked_and_fk_is_set_null(monkeypatch):
    import importlib.util
    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "20260824_community_faith_event_review.py"
    spec = importlib.util.spec_from_file_location("event_review_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    calls = []
    class Op:
        def __getattr__(self, name):
            def record(*args, **kwargs): calls.append((name, args, kwargs))
            return record
    monkeypatch.setattr(migration, "op", Op())
    migration.upgrade()
    assert migration.revision == "20260824_event_review"
    assert any(c[0] == "create_foreign_key" and c[2].get("ondelete") == "SET NULL" for c in calls)
    assert any(c[0] == "add_column" and c[1][1].name == "organization_type" for c in calls)
    assert any(c[0] == "add_column" and c[1][1].name == "coupon_code_id" for c in calls)
    calls.clear()
    migration.downgrade()
    sql = [c[1][0] for c in calls if c[0] == "execute"]
    assert any("DROP DEFAULT" in statement for statement in sql)
    assert any("ALTER COLUMN status TYPE" in statement for statement in sql)


@pytest.mark.asyncio
async def test_get_db_rolls_back_when_submission_raises():
    class Session:
        committed = rolled_back = False
        async def __aenter__(self): return self
        async def __aexit__(self, *_): return False
        async def commit(self): self.committed = True
        async def rollback(self): self.rolled_back = True
    session = Session()
    class Factory:
        def __call__(self): return session
    import app.api.deps as deps
    old = deps.async_session
    deps.async_session = Factory()
    try:
        generator = get_db()
        await generator.__anext__()
        with pytest.raises(RuntimeError):
            await generator.athrow(RuntimeError("submission failed"))
        assert session.rolled_back is True
        assert session.committed is False
    finally:
        deps.async_session = old
