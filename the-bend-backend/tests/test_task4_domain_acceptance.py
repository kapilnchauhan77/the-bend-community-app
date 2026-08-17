"""Real PostgreSQL domain-event acceptance tests."""
from uuid import uuid4
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.database import async_session, engine
from app.models.tenant import Tenant
from app.models.user import User
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.interest import Interest
from app.models.notification import Notification
from app.models.notification_outbox import NotificationOutbox
from app.models.enums import UserRole, ShopStatus, ListingType, ListingCategory, PricingType, ListingStatus, UrgencyLevel, NotificationType
from app.services.interest_service import InterestService
from app.services.listing_service import queue_urgent_listing_notifications
from app.services.admin_service import AdminService
from app.services.notification_service import NotificationService
from app.services.push_dispatcher import build_native_payload
from app.core.exceptions import NotFoundError


@pytest_asyncio.fixture
async def domain_rows():
    ids = {"tenant": uuid4(), "owner": uuid4(), "actor": uuid4(), "shop": uuid4(), "listing": uuid4()}
    async with async_session() as db:
        db.add(Tenant(id=ids["tenant"], slug=f"task4-domain-{ids['tenant'].hex[:10]}", subdomain=f"task4-domain-{ids['tenant'].hex[:10]}", display_name="Task4"))
        db.add_all([
            User(id=ids["owner"], tenant_id=ids["tenant"], email=f"owner-{ids['owner']}@example.test", password_hash="x", name="Owner", role=UserRole.SHOP_ADMIN),
            User(id=ids["actor"], tenant_id=ids["tenant"], email=f"actor-{ids['actor']}@example.test", password_hash="x", name="Actor", role=UserRole.INDIVIDUAL),
        ])
        await db.flush()
        db.add(Shop(id=ids["shop"], tenant_id=ids["tenant"], admin_user_id=ids["owner"], name="Shop", business_type="food", status=ShopStatus.PENDING))
        db.add(Listing(id=ids["listing"], tenant_id=ids["tenant"], shop_id=ids["shop"], type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Listing", description="Description", pricing_type=PricingType.FREE, is_free=True, urgency=UrgencyLevel.NORMAL, status=ListingStatus.ACTIVE))
        await db.commit()
    try:
        yield ids
    finally:
        async with async_session() as db:
            await db.execute(delete(NotificationOutbox).where(NotificationOutbox.tenant_id == ids["tenant"]))
            await db.execute(delete(Notification).where(Notification.tenant_id == ids["tenant"]))
            await db.execute(delete(Interest).where(Interest.listing_id == ids["listing"]))
            await db.execute(delete(Listing).where(Listing.id == ids["listing"]))
            await db.execute(delete(Shop).where(Shop.id == ids["shop"], Shop.tenant_id == ids["tenant"]))
            await db.execute(delete(User).where(User.id.in_([ids["owner"], ids["actor"]]), User.tenant_id == ids["tenant"]))
            await db.execute(delete(Tenant).where(Tenant.id == ids["tenant"]))
            await db.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_interest_writes_exact_listing_notification(domain_rows):
    ids = domain_rows
    async with async_session() as db:
        await InterestService(db).express_interest(ids["listing"], ids["actor"], "hello")
        await db.commit()
    async with async_session() as db:
        notification = (await db.execute(select(Notification).where(Notification.tenant_id == ids["tenant"], Notification.type == NotificationType.LISTING_INTEREST))).scalar_one()
        assert notification.data == {"target_type": "listing", "target_id": str(ids["listing"])}
        assert (await db.execute(select(NotificationOutbox).where(NotificationOutbox.notification_id == notification.id))).scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_interest_notification_failure_rolls_back_domain_write(domain_rows, monkeypatch):
    ids = domain_rows
    async def fail(*args, **kwargs):
        raise RuntimeError("required notification failure")
    monkeypatch.setattr(NotificationService, "notify", fail)
    async with async_session() as db:
        with pytest.raises(RuntimeError):
            await InterestService(db).express_interest(ids["listing"], ids["actor"], "hello")
        await db.rollback()
    async with async_session() as db:
        assert (await db.execute(select(Interest).where(Interest.listing_id == ids["listing"], Interest.user_id == ids["actor"]))).scalar_one_or_none() is None
        listing = (await db.execute(select(Listing).where(Listing.id == ids["listing"]))).scalar_one()
        assert listing.interest_count == 0


@pytest.mark.asyncio
async def test_admin_approval_and_rejection_are_tenant_scoped_and_safe(domain_rows):
    ids = domain_rows
    async with async_session() as db:
        shop = await AdminService(db, tenant_id=ids["tenant"]).approve_registration(ids["shop"])
        await db.commit()
        assert shop.status == ShopStatus.ACTIVE
    async with async_session() as db:
        notification = (await db.execute(select(Notification).where(Notification.tenant_id == ids["tenant"], Notification.type == NotificationType.REGISTRATION_APPROVED))).scalar_one()
        assert notification.data == {"target_type": "shop", "target_id": str(ids["shop"])}
        assert build_native_payload(notification)["body"] == "Your registration decision is available"
    async with async_session() as db:
        shop = await AdminService(db, tenant_id=ids["tenant"]).reject_registration(ids["shop"], "private reason")
        await db.commit()
        assert shop.rejection_reason == "private reason"
        rejected = (await db.execute(select(Notification).where(Notification.tenant_id == ids["tenant"], Notification.type == NotificationType.REGISTRATION_REJECTED))).scalar_one()
        assert "private reason" in rejected.body
        assert "private reason" not in str(build_native_payload(rejected))
        with pytest.raises(NotFoundError):
            await AdminService(db, tenant_id=uuid4()).approve_registration(ids["shop"])


@pytest.mark.asyncio
async def test_admin_notification_failure_rolls_back_status(domain_rows, monkeypatch):
    ids = domain_rows
    async def fail(*args, **kwargs):
        raise RuntimeError("required notification failure")
    monkeypatch.setattr(NotificationService, "notify", fail)
    async with async_session() as db:
        with pytest.raises(RuntimeError):
            await AdminService(db, tenant_id=ids["tenant"]).approve_registration(ids["shop"])
        await db.rollback()
    async with async_session() as db:
        assert (await db.execute(select(Shop.status).where(Shop.id == ids["shop"]))).scalar_one() == ShopStatus.PENDING


@pytest.mark.asyncio
async def test_non_westmoreland_urgent_fanout_is_noop(domain_rows):
    ids = domain_rows
    async with async_session() as db:
        listing = (await db.execute(select(Listing).where(Listing.id == ids["listing"]))).scalar_one()
        await queue_urgent_listing_notifications(db, listing)
        await db.commit()
        assert (await db.execute(select(Notification).where(Notification.tenant_id == ids["tenant"], Notification.type == NotificationType.NEW_URGENT_LISTING))).scalars().all() == []
