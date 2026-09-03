import types
import importlib.util
from uuid import uuid4
from pathlib import Path

import pytest

from app.api.v1.advertising import stripe_webhook
from app.api.v1.events import EventSubmitRequest, submit_event
from app.models.event import Event
from app.models.enums import NotificationType
from app.schemas.auth import RegisterRequest
from app.services.auth_service import AuthService


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class _DB:
    def __init__(self, admins):
        self.admins = admins
        self.queries = []

    async def execute(self, query):
        self.queries.append(query)
        if query.column_descriptions and query.column_descriptions[0]["entity"] is Event:
            return _Result([])
        return _Result(self.admins)

    async def flush(self):
        pass


class _Notifier:
    instances = []

    def __init__(self, db):
        self.calls = []
        type(self).instances.append(self)

    async def notify(self, **kwargs):
        self.calls.append(kwargs)


def _event(*, paid=True, source="submission", tenant_id=None):
    return types.SimpleNamespace(
        id=uuid4(), title="Fall Festival", paid=paid, source=source,
        tenant_id=tenant_id or uuid4(),
    )


class _CouponService:
    coupon = None

    def __init__(self, _db):
        pass

    async def lookup_event_code(self, _code, _tenant_id):
        return type(self).coupon

    async def mark_used(self, _coupon_id):
        return type(self).coupon


@pytest.fixture(autouse=True)
def patch_notifier(monkeypatch):
    _Notifier.instances = []
    monkeypatch.setattr("app.services.event_submission_service.NotificationService", _Notifier)
    monkeypatch.setattr("app.services.auth_service.NotificationService", _Notifier)


@pytest.mark.asyncio
async def test_free_submit_event_notifies_each_admin_with_event_payload(monkeypatch):
    tenant_id = uuid4()
    admins = [types.SimpleNamespace(id=uuid4()), types.SimpleNamespace(id=uuid4())]
    db = _SubmissionDB(admins)
    _CouponService.coupon = types.SimpleNamespace(
        id=uuid4(), code="FREE100", discount_type="percentage", discount_value=100,
    )
    monkeypatch.setattr("app.services.discount_code_service.DiscountCodeService", _CouponService)

    result = await submit_event(
        EventSubmitRequest(
            title="Fall Festival", start_date="2026-09-01T10:00:00",
            submitted_by_name="Asha", submitted_by_email="asha@example.com",
            organization_type="community_faith", coupon_code="FREE100",
        ), db=db, tenant=types.SimpleNamespace(id=tenant_id, subdomain="test", stripe_secret_key=None, stripe_publishable_key=None, stripe_webhook_secret=None),
    )

    assert result["free"] is True
    event = db.events[0]
    calls = _Notifier.instances[-1].calls
    assert event.paid is True
    assert len(calls) == 2
    assert calls[0]["type"] is NotificationType.EVENT_SUBMITTED
    assert calls[0]["title"] == "New Event Awaiting Approval"
    assert event.title in calls[0]["body"]
    assert "awaiting review" in calls[0]["body"]
    assert calls[0]["data"] == {"event_id": str(event.id)}
    assert calls[0]["tenant_id"] == tenant_id
    admin_query = next(query for query in db.queries if query.column_descriptions[0]["entity"].__name__ == "User")
    assert tenant_id in admin_query.compile().params.values()


@pytest.mark.asyncio
async def test_paid_submit_event_waits_for_webhook(monkeypatch):
    tenant_id = uuid4()
    db = _SubmissionDB([])
    monkeypatch.setattr("app.api.v1.events.stripe", types.SimpleNamespace(
        api_key=None,
        checkout=types.SimpleNamespace(Session=types.SimpleNamespace(create=lambda **kwargs: types.SimpleNamespace(id="cs_1", url="https://stripe.test"))),
    ))
    result = await submit_event(
        EventSubmitRequest(
            title="Paid Concert", start_date="2026-09-01T10:00:00",
            submitted_by_name="Asha", submitted_by_email="asha@example.com",
            organization_type="for_profit",
        ), db=db, tenant=types.SimpleNamespace(id=tenant_id, subdomain="test", stripe_secret_key=None, stripe_publishable_key=None, stripe_webhook_secret=None),
    )
    assert result["checkout_url"] == "https://stripe.test"
    assert db.events[0].paid is False
    assert _Notifier.instances == []


class _SubmissionDB:
    def __init__(self, admins):
        self.events = []
        self.admins = admins
        self.queries = []

    def add(self, event):
        self.events.append(event)

    async def flush(self):
        pass

    async def execute(self, query):
        self.queries.append(query)
        return _Result(self.admins)


@pytest.mark.asyncio
async def test_webhook_marks_paid_notifies_once_and_locks_event(monkeypatch):
    tenant_id = uuid4()
    event = _event(paid=False, tenant_id=tenant_id)
    admins = [types.SimpleNamespace(id=uuid4())]
    db = _WebhookDB(event, admins)
    payload = b"{}"
    fake_stripe_event = {
        "type": "checkout.session.completed",
        "data": {"object": {"metadata": {"type": "event_posting", "event_id": str(event.id)}}},
    }
    monkeypatch.setattr("app.api.v1.advertising.stripe.Event", types.SimpleNamespace(construct_from=lambda *_: fake_stripe_event))
    request = types.SimpleNamespace(body=lambda: _async_value(payload), headers={})

    await stripe_webhook(request, db=db)
    await stripe_webhook(request, db=db)

    assert event.paid is True
    assert len(_Notifier.instances[-1].calls) == 1
    assert any("FOR UPDATE" in str(query).upper() for query in db.queries)


class _WebhookDB(_DB):
    def __init__(self, event, admins):
        super().__init__(admins)
        self.event = event

    async def execute(self, query):
        self.queries.append(query)
        if query.column_descriptions and query.column_descriptions[0]["entity"] is Event:
            return _ScalarResult(self.event)
        return _Result(self.admins)


class _ScalarResult(_Result):
    def scalar_one_or_none(self):
        return self.rows


class _Awaitable:
    def __init__(self, value):
        self.value = value

    def __await__(self):
        async def inner():
            return self.value
        return inner().__await__()


def _async_value(value):
    return _Awaitable(value)


@pytest.mark.asyncio
async def test_registration_notifies_active_tenant_admin_with_shop_tenant(monkeypatch):
    tenant_id = uuid4()
    admin = types.SimpleNamespace(id=uuid4())
    db = _DB([admin])
    service = AuthService(db, tenant_id=tenant_id)
    service.user_repo = _UserRepo()
    service.shop_repo = _ShopRepo(tenant_id)
    result = await service.register(RegisterRequest(
        email="shop@example.com", password="password123", owner_name="Owner",
        shop_name="Shop", business_type="retail", address=None, phone=None,
        whatsapp=None, user_type="business", guidelines_accepted=True,
    ))
    assert result["shop_id"]
    call = _Notifier.instances[-1].calls[0]
    assert call["type"] is NotificationType.REGISTRATION_SUBMITTED
    assert call["tenant_id"] == tenant_id
    admin_query = db.queries[-1]
    assert tenant_id in admin_query.compile().params.values()


def _load_event_notification_migration():
    versions = Path(__file__).parents[1] / "alembic/versions"
    migration = versions / "add_event_submitted_notification.py"
    spec = importlib.util.spec_from_file_location("event_submitted_notification", migration)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_event_notification_migration_is_on_current_head():
    migration = _load_event_notification_migration()
    assert migration.revision == "event_submitted_notification"
    assert migration.down_revision == "bender_reply_notification"
    statements = []
    migration.op.execute = statements.append
    migration.upgrade()
    assert statements == [
        "COMMIT",
        "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'EVENT_SUBMITTED'",
        "BEGIN",
    ]


def test_event_notification_downgrade_preserves_rows():
    migration = _load_event_notification_migration()
    statements = []
    migration.op.execute = statements.append
    migration.downgrade()
    assert statements == [
        "UPDATE notifications SET type = 'REGISTRATION_SUBMITTED' WHERE type = 'EVENT_SUBMITTED'"
    ]


class _UserRepo:
    async def get_by_email(self, _email):
        return None

    async def create(self, values):
        return types.SimpleNamespace(**values)


class _ShopRepo:
    def __init__(self, tenant_id):
        self.tenant_id = tenant_id

    async def create(self, values):
        return types.SimpleNamespace(**values)
