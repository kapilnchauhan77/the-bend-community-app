"""Real PostgreSQL discovery matrix for Task 5 viewer-specific blocking."""
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
import httpx
from fastapi import FastAPI
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.database import async_session, engine
from app.models.tenant import Tenant
from app.models.user import User
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.event import Event
from app.models.bender import BenderLike, BenderPost
from app.models.volunteer import Volunteer
from app.models.talent import Talent
from app.models.user_block import UserBlock
from app.models.enums import (
    UserRole, ShopStatus, ListingType, ListingCategory, PricingType,
    ListingStatus, UrgencyLevel, EventCategory, EventStatus,
)
from app.services.block_service import BlockService
from app.services.listing_service import ListingService
from app.services.event_service import EventService
from app.services.bender_service import BenderService
from app.services.volunteer_service import VolunteerService
from app.services.talent_service import TalentService
from app.services.shop_service import ShopService
from app.services.reference_service import resolve_reference, search_references
from app.api.v1.shops import list_shops, get_shop, get_shop_listings
from app.core.exceptions import NotFoundError


@pytest_asyncio.fixture
async def discovery_rows():
    await engine.dispose()
    ids = {k: uuid4() for k in ("tenant", "other_tenant", "blocker", "blocked", "other", "cross_blocker", "cross_blocked", "cross_other", "shop", "other_shop", "cross_shop", "listing", "late_listing", "explicit_blocked", "other_listing", "cross_listing", "event", "late_event", "legacy", "cross_event", "cross_legacy", "bender", "late_bender", "cross_bender", "volunteer", "late_volunteer", "cross_volunteer", "talent", "late_talent", "cross_talent")}
    ordered = datetime.utcnow()
    async with async_session() as db:
        db.add_all([
            Tenant(id=ids["tenant"], slug=f"task5-discovery-{ids['tenant'].hex}", subdomain=f"task5-discovery-{ids['tenant'].hex}", display_name="Task 5"),
            Tenant(id=ids["other_tenant"], slug=f"task5-other-{ids['other_tenant'].hex}", subdomain=f"task5-other-{ids['other_tenant'].hex}", display_name="Other"),
        ])
        await db.flush()
        db.add_all([
            User(id=ids["blocker"], tenant_id=ids["tenant"], email=f"task5-{ids['blocker']}@example.test", password_hash="x", name="Blocker", role=UserRole.INDIVIDUAL),
            User(id=ids["blocked"], tenant_id=ids["tenant"], email=f"task5-{ids['blocked']}@example.test", password_hash="x", name="Blocked", role=UserRole.INDIVIDUAL),
            User(id=ids["other"], tenant_id=ids["tenant"], email=f"task5-{ids['other']}@example.test", password_hash="x", name="Other viewer", role=UserRole.INDIVIDUAL),
            User(id=ids["cross_blocker"], tenant_id=ids["other_tenant"], email=f"task5-{ids['cross_blocker']}@example.test", password_hash="x", name="Other blocker", role=UserRole.INDIVIDUAL),
            User(id=ids["cross_blocked"], tenant_id=ids["other_tenant"], email=f"task5-{ids['cross_blocked']}@example.test", password_hash="x", name="Other blocked", role=UserRole.INDIVIDUAL),
            User(id=ids["cross_other"], tenant_id=ids["other_tenant"], email=f"task5-{ids['cross_other']}@example.test", password_hash="x", name="Other unrelated", role=UserRole.INDIVIDUAL),
        ])
        await db.flush()
        db.add_all([
            Shop(id=ids["shop"], tenant_id=ids["tenant"], admin_user_id=ids["blocked"], name="Task5 Blocked Shop", business_type="food", status=ShopStatus.ACTIVE),
            Shop(id=ids["other_shop"], tenant_id=ids["tenant"], admin_user_id=ids["other"], name="Task5 Eligible Shop", business_type="food", status=ShopStatus.ACTIVE),
            Shop(id=ids["cross_shop"], tenant_id=ids["other_tenant"], admin_user_id=ids["cross_blocked"], name="Task5 Other Tenant Shop", business_type="food", status=ShopStatus.ACTIVE),
            Listing(id=ids["listing"], tenant_id=ids["tenant"], shop_id=ids["shop"], posted_by_user_id=None, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Task5 Blocked Listing", description="Task5", pricing_type=PricingType.FREE, is_free=True, status=ListingStatus.ACTIVE, urgency=UrgencyLevel.NORMAL, created_at=ordered),
            Listing(id=ids["late_listing"], tenant_id=ids["tenant"], shop_id=ids["shop"], posted_by_user_id=ids["other"], type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Task5 Eligible Late Listing", description="Task5", pricing_type=PricingType.FREE, is_free=True, status=ListingStatus.ACTIVE, urgency=UrgencyLevel.NORMAL, created_at=ordered - timedelta(days=1)),
            Listing(id=ids["explicit_blocked"], tenant_id=ids["tenant"], shop_id=ids["other_shop"], posted_by_user_id=ids["blocked"], type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Task5 Explicit Blocked Listing", description="Task5", pricing_type=PricingType.FREE, is_free=True, status=ListingStatus.ACTIVE, urgency=UrgencyLevel.NORMAL, created_at=ordered - timedelta(days=2)),
            Listing(id=ids["other_listing"], tenant_id=ids["tenant"], shop_id=ids["other_shop"], posted_by_user_id=ids["other"], type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Task5 Other Listing", description="Task5", pricing_type=PricingType.FREE, is_free=True, status=ListingStatus.ACTIVE, urgency=UrgencyLevel.NORMAL, created_at=ordered - timedelta(days=3)),
            Listing(id=ids["cross_listing"], tenant_id=ids["other_tenant"], shop_id=ids["cross_shop"], posted_by_user_id=None, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Task5 Other Tenant Listing", description="Task5", pricing_type=PricingType.FREE, is_free=True, status=ListingStatus.ACTIVE, urgency=UrgencyLevel.NORMAL),
            Event(id=ids["cross_event"], tenant_id=ids["other_tenant"], submitted_by_user_id=ids["cross_blocked"], title="Task5 Other Tenant Event", description="Task5", start_date=datetime.utcnow() + timedelta(days=2), category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="manual"),
            Event(id=ids["cross_legacy"], tenant_id=ids["other_tenant"], submitted_by_user_id=None, title="Task5 Other Tenant Legacy", description="Task5", start_date=datetime.utcnow() + timedelta(days=3), category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="import"),
            BenderPost(id=ids["cross_bender"], tenant_id=ids["other_tenant"], author_user_id=ids["cross_blocked"], caption="Task5 Other Tenant Bender", like_count=0, comment_count=0),
            Volunteer(id=ids["cross_volunteer"], tenant_id=ids["other_tenant"], user_id=ids["cross_blocked"], name="Task5 Other Tenant Volunteer", skills="Task5", available_time="now"),
            Talent(id=ids["cross_talent"], tenant_id=ids["other_tenant"], user_id=ids["cross_blocked"], name="Task5 Other Tenant Talent", category="Task5", skills="Task5", available_time="now", rate=1),
            Event(id=ids["event"], tenant_id=ids["tenant"], submitted_by_user_id=ids["blocked"], title="Task5 Blocked Event", description="Task5", start_date=datetime.utcnow() + timedelta(days=2), category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="manual"),
            Event(id=ids["late_event"], tenant_id=ids["tenant"], submitted_by_user_id=ids["other"], title="Task5 Eligible Late Event", description="Task5", start_date=datetime.utcnow() + timedelta(days=4), category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="manual"),
            Event(id=ids["legacy"], tenant_id=ids["tenant"], submitted_by_user_id=None, title="Task5 Legacy Event", description="Task5", start_date=datetime.utcnow() + timedelta(days=3), category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="import"),
            BenderPost(id=ids["bender"], tenant_id=ids["tenant"], author_user_id=ids["blocked"], caption="Task5 Blocked Bender", like_count=0, comment_count=0, created_at=ordered),
            BenderPost(id=ids["late_bender"], tenant_id=ids["tenant"], author_user_id=ids["other"], caption="Task5 Eligible Bender", like_count=0, comment_count=0, created_at=ordered - timedelta(days=1)),
            Volunteer(id=ids["volunteer"], tenant_id=ids["tenant"], user_id=ids["blocked"], name="Task5 Volunteer", skills="Task5", available_time="now", created_at=ordered),
            Volunteer(id=ids["late_volunteer"], tenant_id=ids["tenant"], user_id=ids["other"], name="Task5 Eligible Volunteer", skills="Task5", available_time="now", created_at=ordered - timedelta(days=1)),
            Talent(id=ids["talent"], tenant_id=ids["tenant"], user_id=ids["blocked"], name="Task5 Talent", category="Task5", skills="Task5", available_time="now", rate=1, created_at=ordered),
            Talent(id=ids["late_talent"], tenant_id=ids["tenant"], user_id=ids["other"], name="Task5 Eligible Talent", category="Task5", skills="Task5", available_time="now", rate=1, created_at=ordered - timedelta(days=1)),
        ])
        await db.commit()
        await BlockService(db).create(ids["blocker"], ids["blocked"], ids["tenant"])
        await BlockService(db).create(ids["cross_blocker"], ids["cross_blocked"], ids["other_tenant"])
        await db.commit()
    try:
        yield ids
    finally:
        async with async_session() as db:
            await db.execute(delete(BenderPost).where(BenderPost.id.in_([ids["bender"], ids["late_bender"], ids["cross_bender"]])))
            await db.execute(delete(Volunteer).where(Volunteer.id.in_([ids["volunteer"], ids["late_volunteer"], ids["cross_volunteer"]])))
            await db.execute(delete(Talent).where(Talent.id.in_([ids["talent"], ids["late_talent"], ids["cross_talent"]])))
            await db.execute(delete(Event).where(Event.id.in_([ids["event"], ids["late_event"], ids["legacy"], ids["cross_event"], ids["cross_legacy"]])))
            await db.execute(delete(Listing).where(Listing.id.in_([ids["listing"], ids["late_listing"], ids["explicit_blocked"], ids["other_listing"], ids["cross_listing"]])))
            await db.execute(delete(Shop).where(Shop.id.in_([ids["shop"], ids["other_shop"], ids["cross_shop"]])))
            await db.execute(delete(UserBlock).where(UserBlock.tenant_id.in_([ids["tenant"], ids["other_tenant"]])))
            await db.execute(delete(User).where(User.id.in_([ids["blocker"], ids["blocked"], ids["other"], ids["cross_blocker"], ids["cross_blocked"], ids["cross_other"]])))
            await db.execute(delete(Tenant).where(Tenant.id.in_([ids["tenant"], ids["other_tenant"]])))
            await db.commit()
            for model, key_names in (
                (BenderPost, ("bender", "late_bender", "cross_bender")),
                (Volunteer, ("volunteer", "late_volunteer", "cross_volunteer")),
                (Talent, ("talent", "late_talent", "cross_talent")),
                (Event, ("event", "late_event", "legacy", "cross_event", "cross_legacy")),
                (Listing, ("listing", "late_listing", "explicit_blocked", "other_listing", "cross_listing")),
                (Shop, ("shop", "other_shop", "cross_shop")),
                (UserBlock, ()),
                (User, ("blocker", "blocked", "other", "cross_blocker", "cross_blocked", "cross_other")),
                (Tenant, ("tenant", "other_tenant")),
            ):
                values = [ids[name] for name in key_names]
                statement = select(model.id)
                if values:
                    statement = statement.where(model.id.in_(values))
                else:
                    statement = statement.where(model.tenant_id.in_([ids["tenant"], ids["other_tenant"]]))
                assert (await db.execute(statement)).scalars().all() == []
        await engine.dispose()


@pytest_asyncio.fixture
async def reference_limit_rows():
    await engine.dispose()
    ids = {"tenant": uuid4(), "viewer": uuid4()}
    blocked = [uuid4() for _ in range(9)]
    eligible = [uuid4() for _ in range(8)]
    ids.update({"blocked": blocked, "eligible": eligible})
    shops = [uuid4() for _ in range(17)]
    listings = [uuid4() for _ in range(17)]
    benders = [uuid4() for _ in range(17)]
    ids.update({"shops": shops, "listings": listings, "benders": benders})
    marker = f"Task5Limit{uuid4().hex}"
    async with async_session() as db:
        db.add(Tenant(id=ids["tenant"], slug=f"task5-limit-{ids['tenant'].hex}", subdomain=f"task5-limit-{ids['tenant'].hex}", display_name=marker))
        db.add(User(id=ids["viewer"], tenant_id=ids["tenant"], email=f"{marker}-viewer@example.test", password_hash="x", name="Reference viewer", role=UserRole.INDIVIDUAL))
        for index, user_id in enumerate(blocked + eligible):
            db.add(User(id=user_id, tenant_id=ids["tenant"], email=f"{marker}-{index}@example.test", password_hash="x", name=f"{marker} User {index}", role=UserRole.INDIVIDUAL, created_at=datetime.utcnow() - timedelta(minutes=index)))
        await db.flush()
        for index, user_id in enumerate(blocked + eligible):
            db.add(Shop(id=shops[index], tenant_id=ids["tenant"], admin_user_id=user_id, name=f"{marker} Shop {index}", business_type="food", status=ShopStatus.ACTIVE, created_at=datetime.utcnow() - timedelta(minutes=index)))
            db.add(Listing(id=listings[index], tenant_id=ids["tenant"], shop_id=shops[index], posted_by_user_id=None, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title=f"{marker} Listing {index}", description=marker, pricing_type=PricingType.FREE, is_free=True, status=ListingStatus.ACTIVE, urgency=UrgencyLevel.NORMAL, created_at=datetime.utcnow() - timedelta(minutes=index)))
            db.add(BenderPost(id=benders[index], tenant_id=ids["tenant"], author_user_id=user_id, caption=f"{marker} Bender {index}", like_count=0, comment_count=0, created_at=datetime.utcnow() - timedelta(minutes=index)))
        await db.commit()
        for user_id in blocked:
            await BlockService(db).create(ids["viewer"], user_id, ids["tenant"])
        await db.commit()
    try:
        yield ids, marker
    finally:
        async with async_session() as db:
            await db.execute(delete(BenderPost).where(BenderPost.id.in_(benders)))
            await db.execute(delete(Listing).where(Listing.id.in_(listings)))
            await db.execute(delete(Shop).where(Shop.id.in_(shops)))
            await db.execute(delete(UserBlock).where(UserBlock.tenant_id == ids["tenant"]))
            await db.execute(delete(User).where(User.id.in_([ids["viewer"], *blocked, *eligible])))
            await db.execute(delete(Tenant).where(Tenant.id == ids["tenant"]))
            await db.commit()
            for model, values in ((BenderPost, benders), (Listing, listings), (Shop, shops), (UserBlock, []), (User, [ids["viewer"], *blocked, *eligible]), (Tenant, [ids["tenant"]])):
                statement = select(model.id)
                statement = statement.where(model.tenant_id == ids["tenant"]) if not values else statement.where(model.id.in_(values))
                assert (await db.execute(statement)).scalars().all() == []
        await engine.dispose()


@pytest_asyncio.fixture
async def bender_search_rows(discovery_rows):
    ids = discovery_rows
    search_ids = {
        key: uuid4()
        for key in (
            "case_match",
            "eligible_nonmatch",
            "eligible_match_new",
            "eligible_match_old",
            "blocked_match",
            "cross_tenant_match",
            "cross_tenant_author_match",
            "cross_tenant_shop_match",
        )
    }
    marker = f"BenderSearch{uuid4().hex}"
    author_marker = f"CommunityAuthor{uuid4().hex}"
    shop_marker = f"CommunityShop{uuid4().hex}"
    ordered = datetime.utcnow() + timedelta(hours=1)
    async with async_session() as db:
        author = await db.get(User, ids["other"])
        shop = await db.get(Shop, ids["other_shop"])
        author.name = author_marker
        shop.name = shop_marker
        db.add_all([
            BenderPost(
                id=search_ids["eligible_nonmatch"],
                tenant_id=ids["tenant"],
                author_user_id=ids["other"],
                caption="Newest unrelated community update",
                like_count=0,
                comment_count=0,
                created_at=ordered,
            ),
            BenderPost(
                id=search_ids["blocked_match"],
                tenant_id=ids["tenant"],
                author_user_id=ids["blocked"],
                caption=f"{marker} blocked update",
                like_count=0,
                comment_count=0,
                created_at=ordered - timedelta(minutes=1),
            ),
            BenderPost(
                id=search_ids["cross_tenant_match"],
                tenant_id=ids["other_tenant"],
                author_user_id=ids["cross_blocked"],
                caption=f"{marker} other tenant update",
                like_count=0,
                comment_count=0,
                created_at=ordered - timedelta(minutes=2),
            ),
            BenderPost(
                id=search_ids["eligible_match_new"],
                tenant_id=ids["tenant"],
                author_user_id=ids["other"],
                caption=f"Fresh {marker.upper()} bulletin",
                like_count=0,
                comment_count=0,
                created_at=ordered - timedelta(minutes=3),
            ),
            BenderPost(
                id=search_ids["eligible_match_old"],
                tenant_id=ids["tenant"],
                author_user_id=ids["other"],
                caption=f"Older prefix {marker.lower()} suffix",
                like_count=0,
                comment_count=0,
                created_at=ordered - timedelta(minutes=4),
            ),
            BenderPost(
                id=search_ids["case_match"],
                tenant_id=ids["tenant"],
                author_user_id=ids["other"],
                author_shop_id=ids["other_shop"],
                caption="Before MiXeD CaSe Fragment After",
                like_count=0,
                comment_count=0,
                created_at=ordered - timedelta(minutes=5),
            ),
            BenderPost(
                id=search_ids["cross_tenant_author_match"],
                tenant_id=ids["tenant"],
                author_user_id=ids["cross_other"],
                caption=f"{marker} malformed cross-tenant author",
                like_count=0,
                comment_count=0,
                created_at=ordered - timedelta(minutes=6),
            ),
            BenderPost(
                id=search_ids["cross_tenant_shop_match"],
                tenant_id=ids["tenant"],
                author_user_id=ids["other"],
                author_shop_id=ids["cross_shop"],
                caption=f"{marker} malformed cross-tenant shop",
                like_count=0,
                comment_count=0,
                created_at=ordered - timedelta(minutes=7),
            ),
        ])
        await db.commit()
    try:
        yield ids, search_ids, marker, author_marker, shop_marker
    finally:
        async with async_session() as db:
            await db.execute(delete(BenderPost).where(BenderPost.id.in_(search_ids.values())))
            await db.commit()


async def get_public_bender_feed(db, tenant, viewer, **params):
    from app.api.deps import get_db
    from app.api.v1.bender import router as bender_router
    from app.core.permissions import get_current_tenant, get_current_user_optional

    app = FastAPI()
    app.include_router(bender_router, prefix="/api/v1")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_tenant] = lambda: tenant
    app.dependency_overrides[get_current_user_optional] = lambda: viewer
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get("/api/v1/bender/posts", params=params)


async def get_public_bender_post(db, tenant, viewer, post_id):
    from app.api.deps import get_db
    from app.api.v1.bender import router as bender_router
    from app.core.permissions import get_current_tenant, get_current_user_optional

    app = FastAPI()
    app.include_router(bender_router, prefix="/api/v1")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_tenant] = lambda: tenant
    app.dependency_overrides[get_current_user_optional] = lambda: viewer
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(f"/api/v1/bender/posts/{post_id}")


@pytest.mark.asyncio
async def test_bender_feed_rejects_an_unresolved_tenant():
    from app.api.v1.bender import get_service, router as bender_router
    from app.core.permissions import get_current_tenant, get_current_user_optional

    service = SimpleNamespace(feed=AsyncMock(return_value=([], None, False)))
    app = FastAPI()
    app.include_router(bender_router, prefix="/api/v1")
    app.dependency_overrides[get_service] = lambda: service
    app.dependency_overrides[get_current_tenant] = lambda: None
    app.dependency_overrides[get_current_user_optional] = lambda: None

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/bender/posts")

    assert response.status_code == 404
    service.feed.assert_not_awaited()


@pytest.mark.asyncio
async def test_bender_feed_treats_a_cross_tenant_viewer_as_anonymous():
    from app.api.v1.bender import get_service, router as bender_router
    from app.core.permissions import get_current_tenant, get_current_user_optional

    tenant = SimpleNamespace(id=uuid4())
    viewer = SimpleNamespace(id=uuid4(), tenant_id=uuid4())
    service = SimpleNamespace(feed=AsyncMock(return_value=([], None, False)))
    app = FastAPI()
    app.include_router(bender_router, prefix="/api/v1")
    app.dependency_overrides[get_service] = lambda: service
    app.dependency_overrides[get_current_tenant] = lambda: tenant
    app.dependency_overrides[get_current_user_optional] = lambda: viewer

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/bender/posts")

    assert response.status_code == 200
    service.feed.assert_awaited_once_with(
        tenant_id=tenant.id,
        cursor=None,
        limit=15,
        current_user=None,
        search=None,
    )


@pytest.mark.asyncio
async def test_bender_single_post_returns_visible_post_with_viewer_projection(discovery_rows):
    ids = discovery_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        viewer = await db.get(User, ids["blocker"])
        db.add(BenderLike(post_id=ids["late_bender"], user_id=viewer.id))
        await db.commit()
        response = await get_public_bender_post(db, tenant, viewer, ids["late_bender"])

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(ids["late_bender"])
    assert body["author"]["id"] == str(ids["other"])
    assert body["viewer_has_liked"] is True


@pytest.mark.asyncio
async def test_bender_single_post_treats_cross_tenant_viewer_as_anonymous(discovery_rows):
    ids = discovery_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        viewer = await db.get(User, ids["cross_other"])
        response = await get_public_bender_post(db, tenant, viewer, ids["late_bender"])

    assert response.status_code == 200
    assert response.json()["viewer_has_liked"] is False


@pytest.mark.asyncio
async def test_bender_single_post_hides_blocked_cross_tenant_and_malformed_relationship_posts(bender_search_rows):
    ids, search_ids, _, _, _ = bender_search_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        viewer = await db.get(User, ids["blocker"])
        hidden_ids = (
            ids["bender"],
            search_ids["cross_tenant_match"],
            search_ids["cross_tenant_author_match"],
            search_ids["cross_tenant_shop_match"],
        )
        responses = [await get_public_bender_post(db, tenant, viewer, post_id) for post_id in hidden_ids]

    assert [response.status_code for response in responses] == [404] * len(hidden_ids)
    assert all(response.json() == responses[0].json() for response in responses)


@pytest.mark.asyncio
async def test_bender_single_post_uses_one_not_found_contract_for_hidden_deleted_and_missing_posts(discovery_rows):
    ids = discovery_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        viewer = await db.get(User, ids["blocker"])
        await db.delete(await db.get(BenderPost, ids["late_bender"]))
        await db.commit()
        post_ids = (ids["bender"], ids["late_bender"], uuid4())
        responses = [await get_public_bender_post(db, tenant, viewer, post_id) for post_id in post_ids]

    assert [response.status_code for response in responses] == [404, 404, 404]
    assert all(response.json() == responses[0].json() for response in responses)


@pytest.mark.asyncio
async def test_bender_feed_search_is_case_insensitive_and_matches_caption_substrings(bender_search_rows):
    ids, search_ids, _, _, _ = bender_search_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        response = await get_public_bender_feed(db, tenant, None, search="xEd CaSe Fr", limit=20)

    assert response.status_code == 200
    assert [row["id"] for row in response.json()["items"]] == [str(search_ids["case_match"])]


@pytest.mark.asyncio
async def test_bender_feed_search_matches_author_display_name(bender_search_rows):
    ids, search_ids, _, author_marker, _ = bender_search_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        response = await get_public_bender_feed(db, tenant, None, search=author_marker[4:-4].swapcase(), limit=20)

    assert response.status_code == 200
    assert {row["id"] for row in response.json()["items"]} == {
        str(ids["late_bender"]),
        str(search_ids["eligible_nonmatch"]),
        str(search_ids["eligible_match_new"]),
        str(search_ids["eligible_match_old"]),
        str(search_ids["case_match"]),
    }


@pytest.mark.asyncio
async def test_bender_feed_search_matches_affiliated_shop_display_name(bender_search_rows):
    ids, search_ids, _, _, shop_marker = bender_search_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        response = await get_public_bender_feed(db, tenant, None, search=shop_marker[3:-3].swapcase(), limit=20)

    assert response.status_code == 200
    assert [row["id"] for row in response.json()["items"]] == [str(search_ids["case_match"])]


@pytest.mark.asyncio
async def test_bender_feed_search_composes_with_tenant_blocks_and_cursor_ordering(bender_search_rows):
    ids, search_ids, marker, _, _ = bender_search_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        blocker = await db.get(User, ids["blocker"])
        first = await get_public_bender_feed(db, tenant, blocker, search=marker.swapcase(), limit=1)
        first_body = first.json()
        second = await get_public_bender_feed(
            db,
            tenant,
            blocker,
            search=marker.swapcase(),
            cursor=first_body["next_cursor"],
            limit=1,
        )

    assert first.status_code == second.status_code == 200
    assert [row["id"] for row in first_body["items"]] == [str(search_ids["eligible_match_new"])]
    assert first_body["has_more"] is True
    assert first_body["next_cursor"] is not None
    assert [row["id"] for row in second.json()["items"]] == [str(search_ids["eligible_match_old"])]
    assert second.json()["has_more"] is False
    assert second.json()["next_cursor"] is None


@pytest.mark.asyncio
async def test_bender_feed_excludes_posts_with_cross_tenant_author_or_shop_links(bender_search_rows):
    ids, search_ids, marker, _, _ = bender_search_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        response = await get_public_bender_feed(db, tenant, None, search=marker, limit=20)

    assert response.status_code == 200
    returned = {row["id"] for row in response.json()["items"]}
    assert str(search_ids["cross_tenant_author_match"]) not in returned
    assert str(search_ids["cross_tenant_shop_match"]) not in returned


@pytest.mark.asyncio
async def test_blank_bender_feed_search_matches_the_current_unfiltered_feed(bender_search_rows):
    ids, _, _, _, _ = bender_search_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        blocker = await db.get(User, ids["blocker"])
        current_items, current_cursor, current_has_more = await BenderService(db).feed(ids["tenant"], None, 3, blocker)
        blank = await get_public_bender_feed(db, tenant, blocker, search=" \t ", limit=3)

    assert blank.status_code == 200
    assert [row["id"] for row in blank.json()["items"]] == [row.id for row in current_items]
    assert blank.json()["next_cursor"] == current_cursor
    assert blank.json()["has_more"] is current_has_more


@pytest.mark.asyncio
async def test_reference_search_filters_nine_blocked_authors_before_limit_eight(reference_limit_rows):
    ids, marker = reference_limit_rows
    async with async_session() as db:
        for ref_type in ("listing", "shop", "user", "bender"):
            result = await search_references(db, ids["tenant"], marker, ref_type, ids["viewer"])
            assert len(result) == 8
            expected = {str(value) for value in ids["eligible"]}
            assert {card["id"] for card in result} == ({str(ids[ref_type + "s"][i]) for i in range(9, 17)} if ref_type != "user" else expected), ref_type
            assert not ({str(value) for value in ids["blocked"]} & {card["id"] for card in result})
            anonymous = await search_references(db, ids["tenant"], marker, ref_type, None)
            assert len(anonymous) == 8
            assert {card["id"] for card in anonymous} == ({str(ids[ref_type + "s"][i]) for i in range(8)} if ref_type != "user" else {str(value) for value in ids["blocked"][:8]})


@pytest.mark.asyncio
async def test_all_named_discovery_surfaces_are_directional_and_tenant_scoped(discovery_rows):
    ids = discovery_rows
    async with async_session() as db:
        blocker = await db.get(User, ids["blocker"])
        blocked = await db.get(User, ids["blocked"])
        other = await db.get(User, ids["other"])
        tenant = await db.get(Tenant, ids["tenant"])
        listing_page = await ListingService(db).browse_listings(tenant_id=ids["tenant"], viewer_id=ids["blocker"], limit=20)
        assert ids["listing"] not in {row.id for row in listing_page.items}
        assert ids["late_listing"] in {row.id for row in (await ListingService(db).browse_listings(tenant_id=ids["tenant"], viewer_id=ids["blocker"], limit=20)).items}
        listing_limit_one = await ListingService(db).browse_listings(tenant_id=ids["tenant"], viewer_id=ids["blocker"], limit=1)
        assert [row.id for row in listing_limit_one.items] == [ids["late_listing"]]
        assert listing_limit_one.has_more is True
        assert (await ListingService(db).get_listing(ids["late_listing"], blocker))[0].id == ids["late_listing"]
        assert (await ListingService(db).get_listing(ids["listing"], blocked))[0].id == ids["listing"]
        assert (await ListingService(db).get_listing(ids["listing"], None))[0].id == ids["listing"]
        with pytest.raises(NotFoundError):
            await ListingService(db).get_listing(ids["explicit_blocked"], blocker)
        assert (await ListingService(db).browse_listings(tenant_id=ids["tenant"], viewer_id=ids["other"], limit=20)).items
        with pytest.raises(NotFoundError):
            await ListingService(db).get_listing(ids["listing"], blocker)
        assert (await ListingService(db).get_listing(ids["listing"], other))[0].id == ids["listing"]
        assert (await ListingService(db).browse_listings(tenant_id=ids["tenant"], viewer_id=None, limit=20)).items

        shops_for_blocker = await list_shops(search=None, business_type=None, cursor=None, limit=20, db=db, tenant=tenant, current_user=blocker)
        assert str(ids["shop"]) not in {x["id"] for x in shops_for_blocker["items"]}
        assert str(ids["other_shop"]) in {x["id"] for x in shops_for_blocker["items"]}
        shops_limit_one = await list_shops(search=None, business_type=None, cursor=None, limit=1, db=db, tenant=tenant, current_user=blocker)
        assert shops_limit_one["items"] and shops_limit_one["items"][0]["id"] == str(ids["other_shop"])
        assert shops_limit_one["has_more"] is False
        assert str(ids["shop"]) in {x["id"] for x in (await list_shops(search=None, business_type=None, cursor=None, limit=20, db=db, tenant=tenant, current_user=blocked))["items"]}
        assert str(ids["shop"]) in {x["id"] for x in (await list_shops(search=None, business_type=None, cursor=None, limit=20, db=db, tenant=tenant, current_user=other))["items"]}
        assert str(ids["shop"]) in {x["id"] for x in (await list_shops(search=None, business_type=None, cursor=None, limit=20, db=db, tenant=tenant, current_user=None))["items"]}
        assert str(ids["shop"]) in {x["id"] for x in (await list_shops(search=None, business_type=None, cursor=None, limit=20, db=db, tenant=tenant, current_user=None))["items"]}
        with pytest.raises(NotFoundError):
            await get_shop(ids["shop"], service=ShopService(db), current_user=blocker, db=db)
        assert (await get_shop(ids["shop"], service=ShopService(db), current_user=other, db=db))["id"] == str(ids["shop"])
        hidden_shop_listings = await get_shop_listings(ids["shop"], status=None, cursor=None, limit=20, service=ListingService(db), current_user=blocker)
        assert str(ids["listing"]) not in {x["id"] for x in hidden_shop_listings["items"]}
        visible_shop_listings = await get_shop_listings(ids["shop"], status=None, cursor=None, limit=20, service=ListingService(db), current_user=other)
        assert str(ids["listing"]) in {x["id"] for x in visible_shop_listings["items"]}
        assert str(ids["listing"]) in {x["id"] for x in (await get_shop_listings(ids["shop"], status=None, cursor=None, limit=20, service=ListingService(db), current_user=blocked))["items"]}
        assert str(ids["listing"]) in {x["id"] for x in (await get_shop_listings(ids["shop"], status=None, cursor=None, limit=20, service=ListingService(db), current_user=None))["items"]}

        events = EventService(db, tenant_id=ids["tenant"])
        assert ids["event"] not in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["blocker"])).items}
        assert ids["legacy"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["blocker"])).items}
        assert ids["event"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["other"])).items}
        assert ids["event"] not in {e.id for e in await events.get_upcoming(limit=20, viewer_id=ids["blocker"])}
        assert ids["legacy"] in {e.id for e in await events.get_upcoming(limit=20, viewer_id=ids["blocker"])}
        assert ids["late_event"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["blocker"])).items}
        events_limit_one = await events.browse_events(limit=1, viewer_id=ids["blocker"])
        assert [event.id for event in events_limit_one.items] == [ids["legacy"]]
        assert events_limit_one.has_more is True and events_limit_one.next_cursor is not None
        assert ids["event"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=None)).items}
        assert ids["event"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["blocked"])).items}
        assert ids["event"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["other"])).items}
        assert ids["event"] in {e.id for e in await events.get_upcoming(limit=20, viewer_id=ids["blocked"])}
        assert ids["event"] in {e.id for e in await events.get_upcoming(limit=20, viewer_id=None)}
        items, _, _ = await BenderService(db).feed(ids["tenant"], None, 20, blocker)
        assert str(ids["bender"]) not in {x.id for x in items}
        assert str(ids["late_bender"]) in {x.id for x in items}
        bender_limit_one, bender_cursor, bender_more = await BenderService(db).feed(ids["tenant"], None, 1, blocker)
        assert [x.id for x in bender_limit_one] == [str(ids["late_bender"])]
        assert bender_cursor is None and bender_more is False
        reverse_items, _, _ = await BenderService(db).feed(ids["tenant"], None, 20, blocked)
        assert str(ids["bender"]) in {x.id for x in reverse_items}
        anonymous_items, _, _ = await BenderService(db).feed(ids["tenant"], None, 20, None)
        assert str(ids["bender"]) in {x.id for x in anonymous_items}
        assert str(ids["bender"]) in {x.id for x in (await BenderService(db).feed(ids["tenant"], None, 20, other))[0]}
        volunteer = await VolunteerService(db, ids["tenant"]).list_volunteers(limit=20, viewer_id=ids["blocker"])
        talent = await TalentService(db, ids["tenant"]).list_talent(limit=20, viewer_id=ids["blocker"])
        assert ids["volunteer"] not in {x.id for x in volunteer.items}
        assert ids["talent"] not in {x.id for x in talent.items}
        assert ids["late_volunteer"] in {x.id for x in volunteer.items}
        assert ids["late_talent"] in {x.id for x in talent.items}
        volunteer_limit_one = await VolunteerService(db, ids["tenant"]).list_volunteers(limit=1, viewer_id=ids["blocker"])
        talent_limit_one = await TalentService(db, ids["tenant"]).list_talent(limit=1, viewer_id=ids["blocker"])
        assert [x.id for x in volunteer_limit_one.items] == [ids["late_volunteer"]]
        assert [x.id for x in talent_limit_one.items] == [ids["late_talent"]]
        assert volunteer_limit_one.has_more is False and talent_limit_one.has_more is False
        assert ids["volunteer"] in {x.id for x in (await VolunteerService(db, ids["tenant"]).list_volunteers(limit=20, viewer_id=ids["blocked"])).items}
        assert ids["talent"] in {x.id for x in (await TalentService(db, ids["tenant"]).list_talent(limit=20, viewer_id=None)).items}
        assert ids["volunteer"] in {x.id for x in (await VolunteerService(db, ids["tenant"]).list_volunteers(limit=20, viewer_id=ids["other"])).items}
        assert ids["volunteer"] in {x.id for x in (await VolunteerService(db, ids["tenant"]).list_volunteers(limit=20, viewer_id=None)).items}
        assert ids["talent"] in {x.id for x in (await TalentService(db, ids["tenant"]).list_talent(limit=20, viewer_id=ids["other"])).items}
        assert await resolve_reference(db, ids["tenant"], "listing", ids["listing"], viewer_id=ids["blocker"]) is None
        assert await resolve_reference(db, ids["tenant"], "listing", ids["listing"], viewer_id=ids["other"])
        assert not any(x["id"] == str(ids["listing"]) for x in await search_references(db, ids["tenant"], "Task5", "listing", ids["blocker"]))
        assert any(x["id"] == str(ids["listing"]) for x in await search_references(db, ids["tenant"], "Task5", "listing", ids["other"]))
        assert await resolve_reference(db, ids["tenant"], "listing", ids["listing"], viewer_id=None)
        assert any(x["id"] == str(ids["listing"]) for x in await search_references(db, ids["tenant"], "Task5", "listing", None))
        assert ids["cross_listing"] not in {row.id for row in (await ListingService(db).browse_listings(tenant_id=ids["tenant"], viewer_id=ids["blocker"], limit=20)).items}
        cross_page = await ListingService(db).browse_listings(tenant_id=ids["other_tenant"], viewer_id=ids["cross_blocker"], limit=20)
        assert ids["cross_listing"] not in {row.id for row in cross_page.items}
        assert ids["cross_listing"] in {row.id for row in (await ListingService(db).browse_listings(tenant_id=ids["other_tenant"], viewer_id=ids["cross_blocked"], limit=20)).items}
        for tenant_viewer in (ids["cross_other"], None):
            assert ids["cross_listing"] in {row.id for row in (await ListingService(db).browse_listings(tenant_id=ids["other_tenant"], viewer_id=tenant_viewer, limit=20)).items}
        with pytest.raises(NotFoundError):
            await ListingService(db).get_listing(ids["cross_listing"], await db.get(User, ids["cross_blocker"]))
        assert (await ListingService(db).get_listing(ids["cross_listing"], await db.get(User, ids["cross_blocked"])))[0].id == ids["cross_listing"]
        assert (await ListingService(db).get_listing(ids["cross_listing"], await db.get(User, ids["cross_other"])))[0].id == ids["cross_listing"]
        assert (await ListingService(db).get_listing(ids["cross_listing"], None))[0].id == ids["cross_listing"]
        cross_tenant = await db.get(Tenant, ids["other_tenant"])
        cross_blocker = await db.get(User, ids["cross_blocker"])
        cross_blocked = await db.get(User, ids["cross_blocked"])
        cross_other = await db.get(User, ids["cross_other"])
        for viewer in (cross_blocker, cross_blocked, cross_other, None):
            shop_items = await list_shops(search=None, business_type=None, cursor=None, limit=20, db=db, tenant=cross_tenant, current_user=viewer)
            if viewer is cross_blocker:
                assert str(ids["cross_shop"]) not in {x["id"] for x in shop_items["items"]}
            else:
                assert str(ids["cross_shop"]) in {x["id"] for x in shop_items["items"]}
        with pytest.raises(NotFoundError):
            await get_shop(ids["cross_shop"], service=ShopService(db), current_user=cross_blocker, db=db)
        for viewer in (cross_blocked, cross_other, None):
            assert (await get_shop(ids["cross_shop"], service=ShopService(db), current_user=viewer, db=db))["id"] == str(ids["cross_shop"])
            rows = await get_shop_listings(ids["cross_shop"], status=None, cursor=None, limit=20, service=ListingService(db), current_user=viewer)
            assert str(ids["cross_listing"]) in {x["id"] for x in rows["items"]}
        hidden_rows = await get_shop_listings(ids["cross_shop"], status=None, cursor=None, limit=20, service=ListingService(db), current_user=cross_blocker)
        assert str(ids["cross_listing"]) not in {x["id"] for x in hidden_rows["items"]}

        refs = {"listing": ids["listing"], "shop": ids["shop"], "user": ids["blocked"], "bender": ids["bender"]}
        for ref_type, ref_id in refs.items():
            assert await resolve_reference(db, ids["tenant"], ref_type, ref_id, ids["blocker"]) is None
            assert await resolve_reference(db, ids["tenant"], ref_type, ref_id, ids["blocked"])
            assert await resolve_reference(db, ids["tenant"], ref_type, ref_id, ids["other"])
            assert await resolve_reference(db, ids["tenant"], ref_type, ref_id, None)
            search_term = "Blocked" if ref_type == "user" else "Task5"
            found_blocker = await search_references(db, ids["tenant"], search_term, ref_type, ids["blocker"])
            found_reverse = await search_references(db, ids["tenant"], search_term, ref_type, ids["blocked"])
            found_other = await search_references(db, ids["tenant"], search_term, ref_type, ids["other"])
            found_anon = await search_references(db, ids["tenant"], search_term, ref_type, None)
            assert str(ref_id) not in {x["id"] for x in found_blocker}
            assert str(ref_id) in {x["id"] for x in found_reverse}, ref_type
            assert str(ref_id) in {x["id"] for x in found_other}
            assert str(ref_id) in {x["id"] for x in found_anon}
            assert len(found_blocker) <= 8 and len(found_reverse) <= 8
        assert await resolve_reference(db, ids["tenant"], "listing", ids["cross_listing"], ids["other"]) is None
        assert await search_references(db, ids["tenant"], "Task5 Other Tenant", "listing", ids["other"]) == []
        b_events = EventService(db, tenant_id=ids["other_tenant"])
        assert ids["cross_event"] not in {e.id for e in (await b_events.browse_events(limit=20, viewer_id=ids["cross_blocker"])).items}
        assert ids["cross_legacy"] in {e.id for e in (await b_events.browse_events(limit=20, viewer_id=ids["cross_blocker"])).items}
        assert ids["cross_event"] in {e.id for e in (await b_events.browse_events(limit=20, viewer_id=ids["cross_blocked"])).items}
        assert ids["cross_event"] in {e.id for e in (await b_events.browse_events(limit=20, viewer_id=ids["cross_other"])).items}
        assert ids["cross_event"] in {e.id for e in (await b_events.browse_events(limit=20, viewer_id=None)).items}
        assert str(ids["cross_bender"]) not in {x.id for x in (await BenderService(db).feed(ids["other_tenant"], None, 20, await db.get(User, ids["cross_blocker"])))[0]}
        assert str(ids["cross_bender"]) in {x.id for x in (await BenderService(db).feed(ids["other_tenant"], None, 20, await db.get(User, ids["cross_blocked"])))[0]}
        assert ids["cross_volunteer"] not in {x.id for x in (await VolunteerService(db, ids["other_tenant"]).list_volunteers(limit=20, viewer_id=ids["cross_blocker"])).items}
        assert ids["cross_volunteer"] in {x.id for x in (await VolunteerService(db, ids["other_tenant"]).list_volunteers(limit=20, viewer_id=ids["cross_blocked"])).items}
        assert ids["cross_talent"] not in {x.id for x in (await TalentService(db, ids["other_tenant"]).list_talent(limit=20, viewer_id=ids["cross_blocker"])).items}
        assert ids["cross_talent"] in {x.id for x in (await TalentService(db, ids["other_tenant"]).list_talent(limit=20, viewer_id=ids["cross_blocked"])).items}
        assert str(ids["cross_bender"]) in {x.id for x in (await BenderService(db).feed(ids["other_tenant"], None, 20, cross_other))[0]}
        assert str(ids["cross_bender"]) in {x.id for x in (await BenderService(db).feed(ids["other_tenant"], None, 20, None))[0]}
        assert ids["cross_volunteer"] in {x.id for x in (await VolunteerService(db, ids["other_tenant"]).list_volunteers(limit=20, viewer_id=ids["cross_other"])).items}
        assert ids["cross_volunteer"] in {x.id for x in (await VolunteerService(db, ids["other_tenant"]).list_volunteers(limit=20, viewer_id=None)).items}
        assert ids["cross_talent"] in {x.id for x in (await TalentService(db, ids["other_tenant"]).list_talent(limit=20, viewer_id=ids["cross_other"])).items}
        assert ids["cross_talent"] in {x.id for x in (await TalentService(db, ids["other_tenant"]).list_talent(limit=20, viewer_id=None)).items}
        cross_refs = {"listing": ids["cross_listing"], "shop": ids["cross_shop"], "user": ids["cross_blocked"], "bender": ids["cross_bender"]}
        for ref_type, ref_id in cross_refs.items():
            assert await resolve_reference(db, ids["other_tenant"], ref_type, ref_id, ids["cross_blocker"]) is None
            for viewer in (ids["cross_blocked"], ids["cross_other"], None):
                assert await resolve_reference(db, ids["other_tenant"], ref_type, ref_id, viewer)
            assert await resolve_reference(db, ids["tenant"], ref_type, ref_id, ids["other"]) is None
            assert await search_references(db, ids["tenant"], "Task5 Other Tenant", ref_type, ids["other"]) == []
            ref_query = "Other blocked" if ref_type == "user" else "Task5 Other Tenant"
            blocked_search = await search_references(db, ids["other_tenant"], ref_query, ref_type, ids["cross_blocker"])
            assert str(ref_id) not in {x["id"] for x in blocked_search}
            for viewer in (ids["cross_blocked"], ids["cross_other"], None):
                visible_search = await search_references(db, ids["other_tenant"], ref_query, ref_type, viewer)
                assert str(ref_id) in {x["id"] for x in visible_search}


@pytest.mark.asyncio
async def test_user_block_database_constraints_reject_cross_tenant_self_and_duplicates(discovery_rows):
    ids = discovery_rows
    async with async_session() as db:
        for bad in (
            UserBlock(id=uuid4(), tenant_id=ids["tenant"], blocker_id=ids["blocker"], blocked_id=ids["cross_blocked"]),
            UserBlock(id=uuid4(), tenant_id=ids["tenant"], blocker_id=ids["blocker"], blocked_id=ids["blocker"]),
            UserBlock(id=uuid4(), tenant_id=ids["tenant"], blocker_id=ids["blocker"], blocked_id=ids["blocked"]),
        ):
            db.add(bad)
            with pytest.raises(IntegrityError):
                await db.flush()
            await db.rollback()
        assert (await db.execute(select(UserBlock).where(UserBlock.tenant_id == ids["tenant"], UserBlock.blocker_id == ids["blocker"], UserBlock.blocked_id == ids["blocked"]))).scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_safety_api_real_asgi_ownership_and_safe_invalid_targets():
    await engine.dispose()
    ids = {name: uuid4() for name in ("tenant", "other_tenant", "caller_a", "caller_b", "active", "inactive", "other")}
    missing = uuid4()
    async with async_session() as db:
        db.add_all([
            Tenant(id=ids["tenant"], slug=f"task5-safety-{ids['tenant'].hex}", subdomain=f"task5-safety-{ids['tenant'].hex}", display_name="Task5 Safety"),
            Tenant(id=ids["other_tenant"], slug=f"task5-safety-other-{ids['other_tenant'].hex}", subdomain=f"task5-safety-other-{ids['other_tenant'].hex}", display_name="Task5 Other"),
        ])
        await db.flush()
        db.add_all([
            User(id=ids["caller_a"], tenant_id=ids["tenant"], email=f"task5-{ids['caller_a']}@example.test", password_hash="x", name="Caller A", role=UserRole.INDIVIDUAL),
            User(id=ids["caller_b"], tenant_id=ids["tenant"], email=f"task5-{ids['caller_b']}@example.test", password_hash="x", name="Caller B", role=UserRole.INDIVIDUAL),
            User(id=ids["active"], tenant_id=ids["tenant"], email=f"task5-{ids['active']}@example.test", password_hash="x", name="Active Target", role=UserRole.INDIVIDUAL),
            User(id=ids["inactive"], tenant_id=ids["tenant"], email=f"task5-{ids['inactive']}@example.test", password_hash="x", name="Inactive Target", role=UserRole.INDIVIDUAL, is_active=False),
            User(id=ids["other"], tenant_id=ids["other_tenant"], email=f"task5-{ids['other']}@example.test", password_hash="x", name="Other Target", role=UserRole.INDIVIDUAL),
        ])
        await db.commit()
        current = {"user": await db.get(User, ids["caller_a"])}
        from app.api.deps import get_db
        from app.api.v1.safety import router as safety_router
        from app.core.permissions import get_current_user
        app = FastAPI()
        app.include_router(safety_router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: current["user"]
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                created = await client.post(f"/api/v1/safety/blocks/{ids['active']}")
                current["user"] = await db.get(User, ids["caller_b"])
                caller_b_list = await client.get("/api/v1/safety/blocks")
                caller_b_delete = await client.delete(f"/api/v1/safety/blocks/{ids['active']}")
                preserved = (await db.execute(select(UserBlock).where(
                    UserBlock.tenant_id == ids["tenant"],
                    UserBlock.blocker_id == ids["caller_a"],
                    UserBlock.blocked_id == ids["active"],
                ))).scalar_one()
                current["user"] = await db.get(User, ids["caller_a"])
                caller_a_delete_1 = await client.delete(f"/api/v1/safety/blocks/{ids['active']}")
                caller_a_delete_2 = await client.delete(f"/api/v1/safety/blocks/{ids['active']}")
                invalid = []
                for target in (ids["caller_a"], ids["inactive"], ids["other"], missing):
                    invalid.append(await client.post(f"/api/v1/safety/blocks/{target}"))
            assert created.status_code == 201
            assert caller_b_list.json()["items"] == []
            assert caller_b_delete.status_code == 204
            assert preserved.blocker_id == ids["caller_a"] and preserved.blocked_id == ids["active"]
            assert caller_a_delete_1.status_code == caller_a_delete_2.status_code == 204
            assert (await db.execute(select(UserBlock).where(UserBlock.tenant_id == ids["tenant"]))).scalars().all() == []
            assert len({(response.status_code, response.text) for response in invalid}) == 1
            assert invalid[0].status_code == 404
        finally:
            await db.execute(delete(UserBlock).where(UserBlock.tenant_id.in_([ids["tenant"], ids["other_tenant"]])))
            await db.execute(delete(User).where(User.id.in_(list(ids.values())[2:])))
            await db.execute(delete(Tenant).where(Tenant.id.in_([ids["tenant"], ids["other_tenant"]])))
            await db.commit()
            assert (await db.execute(select(Tenant).where(Tenant.id.in_([ids["tenant"], ids["other_tenant"]])))).scalars().all() == []
        await engine.dispose()


@pytest.mark.asyncio
async def test_public_shop_listing_route_propagates_authenticated_and_anonymous_viewers(discovery_rows):
    ids = discovery_rows
    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        blocker = await db.get(User, ids["blocker"])
        from app.api.deps import get_db
        from app.api.v1.shops import router
        from app.api.v1.listings import router as listing_router
        from app.api.v1.events import router as event_router
        from app.api.v1.bender import router as bender_router
        from app.api.v1.volunteers import router as volunteer_router
        from app.api.v1.talent import router as talent_router
        from app.core.permissions import get_current_tenant, get_current_user_optional

        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.include_router(listing_router, prefix="/api/v1")
        app.include_router(event_router, prefix="/api/v1")
        app.include_router(bender_router, prefix="/api/v1")
        app.include_router(volunteer_router, prefix="/api/v1")
        app.include_router(talent_router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_tenant] = lambda: tenant
        app.dependency_overrides[get_current_user_optional] = lambda: blocker
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            authenticated = await client.get(f"/api/v1/shops/{ids['shop']}/listings")
        assert authenticated.status_code == 200
        assert str(ids["listing"]) not in {row["id"] for row in authenticated.json()["items"]}

        app.dependency_overrides[get_current_user_optional] = lambda: None
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            anonymous = await client.get(f"/api/v1/shops/{ids['shop']}/listings")
        assert anonymous.status_code == 200
        assert str(ids["listing"]) in {row["id"] for row in anonymous.json()["items"]}
        app.dependency_overrides[get_current_user_optional] = lambda: blocker
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            listing_auth = await client.get("/api/v1/listings", params={"limit": 20})
            event_auth = await client.get("/api/v1/events", params={"limit": 20})
            bender_auth = await client.get("/api/v1/bender/posts", params={"limit": 20})
            volunteer_auth = await client.get("/api/v1/volunteers", params={"limit": 20})
            talent_auth = await client.get("/api/v1/talent", params={"limit": 20})
        assert str(ids["listing"]) not in {row["id"] for row in listing_auth.json()["items"]}
        assert str(ids["event"]) not in {row["id"] for row in event_auth.json()["items"]}
        assert str(ids["bender"]) not in {row["id"] for row in bender_auth.json()["items"]}
        assert str(ids["volunteer"]) not in {row["id"] for row in volunteer_auth.json()["items"]}
        assert str(ids["talent"]) not in {row["id"] for row in talent_auth.json()["items"]}
        app.dependency_overrides[get_current_user_optional] = lambda: None
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            listing_anon = await client.get("/api/v1/listings", params={"limit": 20})
            event_anon = await client.get("/api/v1/events", params={"limit": 20})
            bender_anon = await client.get("/api/v1/bender/posts", params={"limit": 20})
            volunteer_anon = await client.get("/api/v1/volunteers", params={"limit": 20})
            talent_anon = await client.get("/api/v1/talent", params={"limit": 20})
        assert str(ids["listing"]) in {row["id"] for row in listing_anon.json()["items"]}
        assert str(ids["event"]) in {row["id"] for row in event_anon.json()["items"]}
        assert str(ids["bender"]) in {row["id"] for row in bender_anon.json()["items"]}
        assert str(ids["volunteer"]) in {row["id"] for row in volunteer_anon.json()["items"]}
        assert str(ids["talent"]) in {row["id"] for row in talent_anon.json()["items"]}
