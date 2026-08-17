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
from app.workers import scheduled_tasks
from datetime import datetime, timedelta
import asyncio
from app.services.admin_service import AdminService
from app.services.notification_service import NotificationService
from app.services.push_dispatcher import build_native_payload
from app.core.exceptions import NotFoundError


@pytest_asyncio.fixture
async def domain_rows():
    ids = {"tenant": uuid4(), "owner": uuid4(), "actor": uuid4(), "shop": uuid4(), "listing": uuid4()}
    await engine.dispose()
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


@pytest.mark.asyncio
async def test_westmoreland_fanout_filters_and_is_concurrently_idempotent():
    await engine.dispose()
    async with async_session() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "westmoreland"))).scalar_one_or_none()
        owns_tenant = tenant is None
        if tenant is None:
            tenant = Tenant(id=uuid4(), slug="westmoreland", subdomain=f"task4-west-{uuid4().hex[:10]}", display_name="Westmoreland")
            db.add(tenant)
            await db.flush()
        other = Tenant(id=uuid4(), slug=f"task4-other-{uuid4().hex[:10]}", subdomain=f"task4-other-{uuid4().hex[:10]}", display_name="Other")
        author_id, shop_admin_id, eligible_id, inactive_id, other_id = [uuid4() for _ in range(5)]
        shop_id, listing_id, shop_listing_id = uuid4(), uuid4(), uuid4()
        db.add(other)
        db.add_all([
            User(id=author_id, tenant_id=tenant.id, email=f"task4-a-{author_id}@example.test", password_hash="x", name="Author", role=UserRole.INDIVIDUAL),
            User(id=shop_admin_id, tenant_id=tenant.id, email=f"task4-s-{shop_admin_id}@example.test", password_hash="x", name="Shop admin", role=UserRole.SHOP_ADMIN),
            User(id=eligible_id, tenant_id=tenant.id, email=f"task4-e-{eligible_id}@example.test", password_hash="x", name="Eligible", role=UserRole.INDIVIDUAL),
            User(id=inactive_id, tenant_id=tenant.id, email=f"task4-i-{inactive_id}@example.test", password_hash="x", name="Inactive", role=UserRole.INDIVIDUAL, is_active=False),
            User(id=other_id, tenant_id=other.id, email=f"task4-o-{other_id}@example.test", password_hash="x", name="Other", role=UserRole.INDIVIDUAL),
        ])
        await db.flush()
        db.add(Shop(id=shop_id, tenant_id=tenant.id, admin_user_id=shop_admin_id, name="Task Shop", business_type="food", status=ShopStatus.ACTIVE))
        await db.flush()
        (await db.execute(select(User).where(User.id == shop_admin_id))).scalar_one().shop_id = shop_id
        db.add(Listing(id=listing_id, tenant_id=tenant.id, posted_by_user_id=author_id, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Urgent", description="x", urgency=UrgencyLevel.URGENT, status=ListingStatus.ACTIVE, pricing_type=PricingType.FREE, is_free=True))
        db.add(Listing(id=shop_listing_id, tenant_id=tenant.id, shop_id=shop_id, posted_by_user_id=None, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Shop urgent", description="x", urgency=UrgencyLevel.URGENT, status=ListingStatus.ACTIVE, pricing_type=PricingType.FREE, is_free=True))
        await db.commit()
    try:
        async with async_session() as db:
            listing = (await db.execute(select(Listing).where(Listing.id == listing_id))).scalar_one()
            await queue_urgent_listing_notifications(db, listing)
            await db.commit()
        async with async_session() as db:
            listing = (await db.execute(select(Listing).where(Listing.id == listing_id))).scalar_one()
            await queue_urgent_listing_notifications(db, listing)
            await db.commit()
        async def concurrent_worker():
            async with async_session() as session:
                listing = (await session.execute(select(Listing).where(Listing.id == listing_id))).scalar_one()
                await queue_urgent_listing_notifications(session, listing)
                await session.commit()
        await asyncio.gather(concurrent_worker(), concurrent_worker())
        async with async_session() as db:
            rows = (await db.execute(select(Notification).where(Notification.tenant_id == tenant.id, Notification.type == NotificationType.NEW_URGENT_LISTING, Notification.data["target_id"].astext == str(listing_id)))).scalars().all()
            by_user = {row.user_id: row for row in rows}
            assert eligible_id in by_user
            assert author_id not in by_user and inactive_id not in by_user and other_id not in by_user
            assert len([row for row in rows if row.user_id == eligible_id]) == 1
            assert (await db.execute(select(NotificationOutbox).where(NotificationOutbox.notification_id.in_([row.id for row in rows])))).scalars().all()
            payload = build_native_payload(by_user[eligible_id])
            assert "_idempotency_key" not in payload
            assert payload["target_type"] == "listing" and payload["target_id"] == str(listing_id)
        async with async_session() as db:
            shop_listing = (await db.execute(select(Listing).where(Listing.id == shop_listing_id))).scalar_one()
            await queue_urgent_listing_notifications(db, shop_listing)
            await db.commit()
        async with async_session() as db:
            shop_rows = (await db.execute(select(Notification).where(Notification.tenant_id == tenant.id, Notification.type == NotificationType.NEW_URGENT_LISTING, Notification.data["target_id"].astext == str(shop_listing_id)))).scalars().all()
            shop_users = {row.user_id for row in shop_rows}
            assert shop_admin_id not in shop_users and eligible_id in shop_users
            assert len([row for row in shop_rows if row.user_id == eligible_id]) == 1
            assert len((await db.execute(select(NotificationOutbox).where(NotificationOutbox.notification_id.in_([row.id for row in shop_rows])))).scalars().all()) == len(shop_rows)
    finally:
        async with async_session() as db:
            await db.execute(delete(NotificationOutbox).where(NotificationOutbox.notification_id.in_(select(Notification.id).where(Notification.data["target_id"].astext == str(listing_id)))))
            await db.execute(delete(Notification).where(Notification.data["target_id"].astext == str(listing_id)))
            await db.execute(delete(NotificationOutbox).where(NotificationOutbox.notification_id.in_(select(Notification.id).where(Notification.data["target_id"].astext == str(shop_listing_id)))))
            await db.execute(delete(Notification).where(Notification.data["target_id"].astext == str(shop_listing_id)))
            await db.execute(delete(Listing).where(Listing.id == listing_id))
            await db.execute(delete(Listing).where(Listing.id == shop_listing_id))
            await db.execute(delete(Shop).where(Shop.id == shop_id))
            await db.execute(delete(User).where(User.id.in_([author_id, shop_admin_id, eligible_id, inactive_id, other_id])))
            await db.execute(delete(Tenant).where(Tenant.id == other.id))
            if owns_tenant:
                await db.execute(delete(Tenant).where(Tenant.id == tenant.id, Tenant.slug == "westmoreland"))
            await db.commit()
            assert (await db.execute(select(Listing.id).where(Listing.id.in_([listing_id, shop_listing_id])))).scalars().all() == []
            assert (await db.execute(select(Shop.id).where(Shop.id == shop_id))).scalar_one_or_none() is None
            assert (await db.execute(select(User.id).where(User.id.in_([author_id, shop_admin_id, eligible_id, inactive_id, other_id])))).scalars().all() == []
            assert (await db.execute(select(Notification.id).where(Notification.data["target_id"].astext.in_([str(listing_id), str(shop_listing_id)])))).scalars().all() == []
            assert (await db.execute(select(NotificationOutbox.id).where(NotificationOutbox.tenant_id == tenant.id, NotificationOutbox.notification_id.in_(select(Notification.id).where(Notification.data["target_id"].astext.in_([str(listing_id), str(shop_listing_id)])))))).scalars().all() == []
        await engine.dispose()


@pytest.mark.asyncio
async def test_scheduled_expiration_rolls_back_on_fanout_failure(monkeypatch, domain_rows):
    ids = domain_rows
    async with async_session() as db:
        listing = (await db.execute(select(Listing).where(Listing.id == ids["listing"]))).scalar_one()
        listing.expiry_date = datetime.utcnow() + timedelta(hours=1)
        listing.urgency = UrgencyLevel.NORMAL
        await db.commit()
    async def fail(*args, **kwargs):
        raise RuntimeError("fanout failed")
    monkeypatch.setattr("app.services.listing_service.queue_urgent_listing_notifications", fail)
    with pytest.raises(RuntimeError):
        await scheduled_tasks._check_expiring()
    async with async_session() as db:
        listing = (await db.execute(select(Listing).where(Listing.id == ids["listing"]))).scalar_one()
        assert listing.urgency == UrgencyLevel.NORMAL


@pytest.mark.asyncio
async def test_scheduled_expiration_success_commits_urgent_fanout():
    await engine.dispose()
    async with async_session() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "westmoreland"))).scalar_one_or_none()
        owns_tenant = tenant is None
        if tenant is None:
            tenant = Tenant(id=uuid4(), slug="westmoreland", subdomain=f"task4-success-{uuid4().hex[:10]}", display_name="Westmoreland")
            db.add(tenant)
            await db.flush()
        author_id, eligible_id, listing_id = uuid4(), uuid4(), uuid4()
        db.add_all([
            User(id=author_id, tenant_id=tenant.id, email=f"task4-exp-a-{author_id}@example.test", password_hash="x", name="Author", role=UserRole.INDIVIDUAL),
            User(id=eligible_id, tenant_id=tenant.id, email=f"task4-exp-e-{eligible_id}@example.test", password_hash="x", name="Eligible", role=UserRole.INDIVIDUAL),
        ])
        await db.flush()
        db.add(Listing(id=listing_id, tenant_id=tenant.id, posted_by_user_id=author_id, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Expiring", description="x", urgency=UrgencyLevel.NORMAL, status=ListingStatus.ACTIVE, expiry_date=datetime.utcnow() + timedelta(hours=1), pricing_type=PricingType.FREE, is_free=True))
        await db.commit()
    try:
        await scheduled_tasks._check_expiring()
        async with async_session() as db:
            listing = (await db.execute(select(Listing).where(Listing.id == listing_id))).scalar_one()
            assert listing.urgency == UrgencyLevel.URGENT
            rows = (await db.execute(select(Notification).where(Notification.tenant_id == tenant.id, Notification.type == NotificationType.NEW_URGENT_LISTING, Notification.data["target_id"].astext == str(listing_id)))).scalars().all()
            assert author_id not in {row.user_id for row in rows}
            assert eligible_id in {row.user_id for row in rows}
            assert len((await db.execute(select(NotificationOutbox).where(NotificationOutbox.notification_id.in_([row.id for row in rows])))).scalars().all()) == len(rows)
    finally:
        async with async_session() as db:
            await db.execute(delete(NotificationOutbox).where(NotificationOutbox.notification_id.in_(select(Notification.id).where(Notification.data["target_id"].astext == str(listing_id)))))
            await db.execute(delete(Notification).where(Notification.data["target_id"].astext == str(listing_id)))
            await db.execute(delete(Listing).where(Listing.id == listing_id))
            await db.execute(delete(User).where(User.id.in_([author_id, eligible_id]), User.tenant_id == tenant.id))
            if owns_tenant:
                await db.execute(delete(Tenant).where(Tenant.id == tenant.id, Tenant.slug == "westmoreland"))
            await db.commit()
        await engine.dispose()
