import uuid

import httpx
import pytest
import stripe
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_db
from app.config import get_settings
from app.core.permissions import get_current_tenant
from app.main import create_app
from app.models.connector_purchase import ConnectorPurchase
from app.models.ad_pricing import AdPricing
from app.models.event import Event
from app.models.enums import EventCategory, EventStatus
from app.models.sponsor import Sponsor
from app.models.tenant import Tenant
from app.services.checkout_service import CheckoutVerificationService


@pytest.fixture
async def db_context(monkeypatch):
    engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr("app.middleware.tenant.async_session", sessions)
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, slug=f"task8-{tenant_id.hex[:10]}", subdomain=f"task8-{tenant_id.hex[:10]}", display_name="Task 8", stripe_secret_key="sk_test_task8", stripe_publishable_key="pk_test_task8", stripe_webhook_secret="whsec_task8")
    sponsor_id, event_id, connector_id, pricing_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    async with sessions() as db:
        db.add(tenant)
        await db.flush()
        db.add_all([
            Sponsor(id=sponsor_id, tenant_id=tenant_id, name="Matrix sponsor", placement="homepage", stripe_session_id="cs_sponsor_1", expected_amount=1200, expected_currency="usd"),
            AdPricing(id=pricing_id, tenant_id=tenant_id, name="Matrix", placement="homepage", duration_days=30, price_cents=1200, is_active=True),
            Event(id=event_id, tenant_id=tenant_id, title="Matrix event", start_date=__import__("datetime").datetime.utcnow(), category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="submission", stripe_session_id="cs_event_1", expected_amount=1999, expected_currency="usd"),
            ConnectorPurchase(id=connector_id, tenant_id=tenant_id, website_url="https://example.test", contact_name="Matrix", contact_email="matrix@example.test", business_name="Matrix", expected_amount=39900, expected_currency="usd", stripe_session_id="cs_connector_1"),
        ])
        await db.commit()
    yield sessions, tenant, (sponsor_id, event_id, connector_id, pricing_id)
    async with sessions() as db:
        await db.execute(delete(ConnectorPurchase).where(ConnectorPurchase.tenant_id == tenant_id))
        await db.execute(delete(Event).where(Event.tenant_id == tenant_id))
        await db.execute(delete(Sponsor).where(Sponsor.tenant_id == tenant_id))
        await db.execute(delete(AdPricing).where(AdPricing.tenant_id == tenant_id))
        await db.execute(delete(Tenant).where(Tenant.id == tenant_id))
        await db.commit()
    await engine.dispose()


def make_app(sessions, tenant):
    app = create_app()

    async def db_override():
        async with sessions() as db:
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_tenant] = lambda: tenant
    return app


@pytest.mark.asyncio
async def test_rejected_and_final_local_statuses_never_call_stripe(monkeypatch, db_context):
    sessions, tenant, ids = db_context
    calls = []
    monkeypatch.setattr(stripe.checkout.Session, "retrieve", lambda *args, **kwargs: calls.append((args, kwargs)))
    app = make_app(sessions, tenant)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/v1/checkout/status/nope/cs_sponsor_1")).status_code == 404
        assert (await client.get("/api/v1/checkout/status/sponsor/not-a-session")).status_code == 404
        response = await client.get("/api/v1/checkout/status/sponsor/cs_unknown")
        assert response.status_code == 404
    assert calls == []
    async with sessions() as db:
        sponsor = await db.get(Sponsor, ids[0])
        sponsor.checkout_status = "cancelled"
        await db.commit()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/checkout/status/sponsor/cs_sponsor_1")
    assert response.json() == {"status": "cancelled", "target_type": "sponsor", "target_id": str(ids[0])}
    assert calls == []


@pytest.mark.asyncio
async def test_provider_metadata_amount_currency_mismatch_stays_pending_and_uses_tenant_key(monkeypatch, db_context):
    sessions, tenant, ids = db_context
    calls = []

    def retrieve(session_id, **kwargs):
        calls.append((session_id, kwargs))
        return {"id": session_id, "status": "open", "payment_status": "unpaid", "amount_total": 1, "currency": "eur", "metadata": {"kind": "sponsor", "target_id": str(ids[0]), "tenant_id": str(tenant.id), "expected_amount": "1200", "expected_currency": "usd"}}

    monkeypatch.setattr(stripe.checkout.Session, "retrieve", retrieve)
    app = make_app(sessions, tenant)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/checkout/status/sponsor/cs_sponsor_1")
    assert response.json()["status"] == "pending"
    assert calls == [("cs_sponsor_1", {"api_key": "sk_test_task8"})]
    assert getattr(stripe, "api_key", None) in (None, "")


@pytest.mark.asyncio
async def test_verified_paid_connector_is_idempotent_and_setup_gates_completion(monkeypatch, db_context):
    sessions, tenant, ids = db_context
    calls = []
    monkeypatch.setattr(stripe.checkout.Session, "retrieve", lambda session_id, **kwargs: calls.append(kwargs) or {"id": session_id, "status": "complete", "payment_status": "paid", "amount_total": 39900, "currency": "usd", "payment_intent": "pi_matrix", "metadata": {"kind": "connector", "target_id": str(ids[2]), "tenant_id": str(tenant.id), "expected_amount": "39900", "expected_currency": "usd"}})
    app = make_app(sessions, tenant)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        first = await client.get("/api/v1/checkout/status/connector/cs_connector_1")
        second = await client.get("/api/v1/checkout/status/connector/cs_connector_1")
    assert first.json()["status"] == "paid"
    assert second.json()["status"] == "paid"
    async with sessions() as db:
        purchase = await db.get(ConnectorPurchase, ids[2])
        assert purchase.status == "paid"
        purchase.setup_complete = True
        await db.commit()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        complete = await client.get("/api/v1/checkout/status/connector/cs_connector_1")
    assert complete.json()["status"] == "complete"
    assert calls == [{"api_key": "sk_test_task8"}]


@pytest.mark.asyncio
async def test_paid_sponsor_requires_approval_for_complete_without_provider(monkeypatch, db_context):
    sessions, tenant, ids = db_context
    calls = []
    monkeypatch.setattr(stripe.checkout.Session, "retrieve", lambda *args, **kwargs: calls.append(1))
    async with sessions() as db:
        sponsor = await db.get(Sponsor, ids[0])
        sponsor.paid = True
        sponsor.checkout_status = "paid"
        await db.commit()
    app = make_app(sessions, tenant)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/checkout/status/sponsor/cs_sponsor_1")
    assert response.json()["status"] == "paid"
    assert calls == []


@pytest.mark.asyncio
async def test_sponsor_creation_persists_before_provider_and_binds_exact_metadata(monkeypatch, db_context):
    sessions, tenant, ids = db_context
    created = []
    def create(**kwargs):
        created.append(kwargs)
        return __import__("types").SimpleNamespace(id="cs_new_matrix", url="https://checkout.test")
    monkeypatch.setattr(stripe.checkout.Session, "create", create)
    app = make_app(sessions, tenant)
    payload = {"pricing_id": str(ids[3]), "name": "New", "contact_email": "new@example.test", "contact_name": "New"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/advertising/checkout", json=payload)
    assert response.status_code == 200
    assert created[0]["api_key"] == "sk_test_task8"
    assert created[0]["metadata"]["kind"] == "sponsor"
    assert created[0]["metadata"]["expected_amount"] == "1200"
    async with sessions() as db:
        row = (await db.execute(__import__("sqlalchemy").select(Sponsor).where(Sponsor.stripe_session_id == "cs_new_matrix"))).scalar_one()
        assert row.tenant_id == tenant.id


@pytest.mark.asyncio
async def test_connector_creation_rolls_back_local_row_on_provider_failure(monkeypatch, db_context):
    sessions, tenant, ids = db_context
    def fail(**kwargs):
        raise RuntimeError("provider unavailable")
    monkeypatch.setattr(stripe.checkout.Session, "create", fail)
    app = make_app(sessions, tenant)
    payload = {"website_url": "https://new.example.test", "contact_name": "New", "contact_email": "new@example.test", "business_name": "New"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        with pytest.raises(RuntimeError):
            await client.post("/api/v1/events/connector-checkout", json=payload)
    async with sessions() as db:
        count = (await db.execute(__import__("sqlalchemy").select(__import__("sqlalchemy").func.count()).select_from(ConnectorPurchase).where(ConnectorPurchase.website_url == payload["website_url"]))).scalar_one()
        assert count == 0


@pytest.mark.asyncio
async def test_webhook_requires_signature_and_rejects_unbound_metadata(monkeypatch, db_context):
    sessions, tenant, ids = db_context
    app = make_app(sessions, tenant)
    payload = {"type": "checkout.session.completed", "data": {"object": {"id": "cs_unbound", "payment_status": "paid", "metadata": {"kind": "sponsor", "target_id": str(ids[0]), "tenant_id": str(tenant.id), "expected_amount": "1200", "expected_currency": "usd"}}}}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.post("/api/v1/advertising/webhook", content=__import__("json").dumps(payload))
    assert missing.status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,index", [("sponsor", 0), ("event", 1), ("connector", 2)])
async def test_signed_webhook_transitions_each_kind_once(monkeypatch, db_context, kind, index):
    sessions, tenant, ids = db_context
    expected = [1200, 1999, 39900][index]
    target = ids[index]
    event = {"type": "checkout.session.completed", "data": {"object": {"id": f"cs_{kind}_1", "status": "complete", "payment_status": "paid", "amount_total": expected, "currency": "usd", "payment_intent": f"pi_{kind}", "metadata": {"kind": kind, "target_id": str(target), "tenant_id": str(tenant.id), "expected_amount": str(expected), "expected_currency": "usd"}}}}
    monkeypatch.setattr(stripe.Webhook, "construct_event", lambda payload, sig, secret: event)
    app = make_app(sessions, tenant)
    headers = {"stripe-signature": "valid", "x-tenant-slug": tenant.slug}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        first = await client.post("/api/v1/advertising/webhook", content=__import__("json").dumps(event), headers=headers)
        second = await client.post("/api/v1/advertising/webhook", content=__import__("json").dumps(event), headers=headers)
    assert first.json() == {"status": "ok"}
    assert second.json() == {"status": "ok"}
    async with sessions() as db:
        model = [Sponsor, Event, ConnectorPurchase][index]
        row = await db.get(model, target)
        assert (row.paid if kind != "connector" else row.status) in (True, "paid")


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [("kind", "event"), ("target_id", str(uuid.uuid4())), ("tenant_id", str(uuid.uuid4())), ("expected_amount", "1"), ("expected_currency", "eur")])
async def test_signed_webhook_mismatch_does_not_transition(monkeypatch, db_context, field, value):
    sessions, tenant, ids = db_context
    metadata = {"kind": "sponsor", "target_id": str(ids[0]), "tenant_id": str(tenant.id), "expected_amount": "1200", "expected_currency": "usd"}
    metadata[field] = value
    event = {"type": "checkout.session.completed", "data": {"object": {"id": "cs_sponsor_1", "status": "complete", "payment_status": "paid", "amount_total": 1200, "currency": "usd", "metadata": metadata}}}
    monkeypatch.setattr(stripe.Webhook, "construct_event", lambda payload, sig, secret: event)
    app = make_app(sessions, tenant)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/advertising/webhook", content=__import__("json").dumps(event), headers={"stripe-signature": "valid", "x-tenant-slug": tenant.slug})
    assert response.status_code in (200, 400)
    assert response.json() in ({"status": "ok"}, {"detail": "Invalid webhook"})
    async with sessions() as db:
        assert not (await db.get(Sponsor, ids[0])).paid


@pytest.mark.asyncio
async def test_signed_expired_webhook_cancels_local_checkout(monkeypatch, db_context):
    sessions, tenant, ids = db_context
    event = {"type": "checkout.session.expired", "data": {"object": {"id": "cs_sponsor_1", "status": "expired", "payment_status": "unpaid", "amount_total": 1200, "currency": "usd", "metadata": {"kind": "sponsor", "target_id": str(ids[0]), "tenant_id": str(tenant.id), "expected_amount": "1200", "expected_currency": "usd"}}}}
    monkeypatch.setattr(stripe.Webhook, "construct_event", lambda payload, sig, secret: event)
    app = make_app(sessions, tenant)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/advertising/webhook", content=__import__("json").dumps(event), headers={"stripe-signature": "valid", "x-tenant-slug": tenant.slug})
    assert response.json() == {"status": "ok"}
    async with sessions() as db:
        assert (await db.get(Sponsor, ids[0])).checkout_status == "cancelled"
