"""Real PostgreSQL discovery matrix for Task 5 viewer-specific blocking."""
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.database import async_session, engine
from app.models.tenant import Tenant
from app.models.user import User
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.event import Event
from app.models.bender import BenderPost
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
    ids = {k: uuid4() for k in ("tenant", "other_tenant", "blocker", "blocked", "other", "shop", "other_shop", "listing", "late_listing", "other_listing", "event", "late_event", "legacy", "bender", "late_bender", "volunteer", "late_volunteer", "talent", "late_talent")}
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
        ])
        await db.flush()
        db.add_all([
            Shop(id=ids["shop"], tenant_id=ids["tenant"], admin_user_id=ids["blocked"], name="Task5 Blocked Shop", business_type="food", status=ShopStatus.ACTIVE),
            Shop(id=ids["other_shop"], tenant_id=ids["tenant"], admin_user_id=ids["other"], name="Task5 Eligible Shop", business_type="food", status=ShopStatus.ACTIVE),
            Listing(id=ids["listing"], tenant_id=ids["tenant"], shop_id=ids["shop"], posted_by_user_id=None, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Task5 Blocked Listing", description="Task5", pricing_type=PricingType.FREE, is_free=True, status=ListingStatus.ACTIVE, urgency=UrgencyLevel.NORMAL),
            Listing(id=ids["late_listing"], tenant_id=ids["tenant"], shop_id=ids["shop"], posted_by_user_id=ids["other"], type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Task5 Eligible Late Listing", description="Task5", pricing_type=PricingType.FREE, is_free=True, status=ListingStatus.ACTIVE, urgency=UrgencyLevel.NORMAL),
            Listing(id=ids["other_listing"], tenant_id=ids["tenant"], shop_id=ids["other_shop"], posted_by_user_id=ids["other"], type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Task5 Other Listing", description="Task5", pricing_type=PricingType.FREE, is_free=True, status=ListingStatus.ACTIVE, urgency=UrgencyLevel.NORMAL),
            Event(id=ids["event"], tenant_id=ids["tenant"], submitted_by_user_id=ids["blocked"], title="Task5 Blocked Event", description="Task5", start_date=datetime.utcnow() + timedelta(days=2), category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="manual"),
            Event(id=ids["late_event"], tenant_id=ids["tenant"], submitted_by_user_id=ids["other"], title="Task5 Eligible Late Event", description="Task5", start_date=datetime.utcnow() + timedelta(days=4), category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="manual"),
            Event(id=ids["legacy"], tenant_id=ids["tenant"], submitted_by_user_id=None, title="Task5 Legacy Event", description="Task5", start_date=datetime.utcnow() + timedelta(days=3), category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="import"),
            BenderPost(id=ids["bender"], tenant_id=ids["tenant"], author_user_id=ids["blocked"], caption="Task5 Blocked Bender", like_count=0, comment_count=0),
            BenderPost(id=ids["late_bender"], tenant_id=ids["tenant"], author_user_id=ids["other"], caption="Task5 Eligible Bender", like_count=0, comment_count=0),
            Volunteer(id=ids["volunteer"], tenant_id=ids["tenant"], user_id=ids["blocked"], name="Task5 Volunteer", skills="Task5", available_time="now"),
            Volunteer(id=ids["late_volunteer"], tenant_id=ids["tenant"], user_id=ids["other"], name="Task5 Eligible Volunteer", skills="Task5", available_time="now"),
            Talent(id=ids["talent"], tenant_id=ids["tenant"], user_id=ids["blocked"], name="Task5 Talent", category="Task5", skills="Task5", available_time="now", rate=1),
            Talent(id=ids["late_talent"], tenant_id=ids["tenant"], user_id=ids["other"], name="Task5 Eligible Talent", category="Task5", skills="Task5", available_time="now", rate=1),
        ])
        await db.commit()
        await BlockService(db).create(ids["blocker"], ids["blocked"], ids["tenant"])
        await db.commit()
    try:
        yield ids
    finally:
        async with async_session() as db:
            await db.execute(delete(BenderPost).where(BenderPost.id.in_([ids["bender"], ids["late_bender"]])))
            await db.execute(delete(Volunteer).where(Volunteer.id.in_([ids["volunteer"], ids["late_volunteer"]])))
            await db.execute(delete(Talent).where(Talent.id.in_([ids["talent"], ids["late_talent"]])))
            await db.execute(delete(Event).where(Event.id.in_([ids["event"], ids["late_event"], ids["legacy"]])))
            await db.execute(delete(Listing).where(Listing.id.in_([ids["listing"], ids["late_listing"], ids["other_listing"]])))
            await db.execute(delete(Shop).where(Shop.id.in_([ids["shop"], ids["other_shop"]])))
            await db.execute(delete(UserBlock).where(UserBlock.tenant_id == ids["tenant"], UserBlock.blocker_id == ids["blocker"], UserBlock.blocked_id == ids["blocked"]))
            await db.execute(delete(User).where(User.id.in_([ids["blocker"], ids["blocked"], ids["other"]])))
            await db.execute(delete(Tenant).where(Tenant.id.in_([ids["tenant"], ids["other_tenant"]])))
            await db.commit()
            for model, key_names in (
                (BenderPost, ("bender", "late_bender")),
                (Volunteer, ("volunteer", "late_volunteer")),
                (Talent, ("talent", "late_talent")),
                (Event, ("event", "late_event", "legacy")),
                (Listing, ("listing", "late_listing", "other_listing")),
                (Shop, ("shop", "other_shop")),
                (UserBlock, ()),
                (User, ("blocker", "blocked", "other")),
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
        assert (await ListingService(db).browse_listings(tenant_id=ids["tenant"], viewer_id=ids["other"], limit=20)).items
        with pytest.raises(NotFoundError):
            await ListingService(db).get_listing(ids["listing"], blocker)
        assert (await ListingService(db).get_listing(ids["listing"], other))[0].id == ids["listing"]
        assert (await ListingService(db).browse_listings(tenant_id=ids["tenant"], viewer_id=None, limit=20)).items

        shops_for_blocker = await list_shops(search=None, business_type=None, cursor=None, limit=20, db=db, tenant=tenant, current_user=blocker)
        assert str(ids["shop"]) not in {x["id"] for x in shops_for_blocker["items"]}
        assert str(ids["other_shop"]) in {x["id"] for x in shops_for_blocker["items"]}
        assert str(ids["shop"]) in {x["id"] for x in (await list_shops(search=None, business_type=None, cursor=None, limit=20, db=db, tenant=tenant, current_user=blocked))["items"]}
        assert str(ids["shop"]) in {x["id"] for x in (await list_shops(search=None, business_type=None, cursor=None, limit=20, db=db, tenant=tenant, current_user=None))["items"]}
        with pytest.raises(NotFoundError):
            await get_shop(ids["shop"], service=ShopService(db), current_user=blocker, db=db)
        assert (await get_shop(ids["shop"], service=ShopService(db), current_user=other, db=db))["id"] == str(ids["shop"])
        hidden_shop_listings = await get_shop_listings(ids["shop"], status=None, cursor=None, limit=20, service=ListingService(db), current_user=blocker)
        assert str(ids["listing"]) not in {x["id"] for x in hidden_shop_listings["items"]}
        visible_shop_listings = await get_shop_listings(ids["shop"], status=None, cursor=None, limit=20, service=ListingService(db), current_user=other)
        assert str(ids["listing"]) in {x["id"] for x in visible_shop_listings["items"]}

        events = EventService(db, tenant_id=ids["tenant"])
        assert ids["event"] not in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["blocker"])).items}
        assert ids["legacy"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["blocker"])).items}
        assert ids["event"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["other"])).items}
        assert ids["event"] not in {e.id for e in await events.get_upcoming(limit=20, viewer_id=ids["blocker"])}
        assert ids["legacy"] in {e.id for e in await events.get_upcoming(limit=20, viewer_id=ids["blocker"])}
        assert ids["late_event"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=ids["blocker"])).items}
        assert ids["event"] in {e.id for e in (await events.browse_events(limit=20, viewer_id=None)).items}
        items, _, _ = await BenderService(db).feed(ids["tenant"], None, 20, blocker)
        assert str(ids["bender"]) not in {x.id for x in items}
        assert str(ids["late_bender"]) in {x.id for x in items}
        reverse_items, _, _ = await BenderService(db).feed(ids["tenant"], None, 20, blocked)
        assert str(ids["bender"]) in {x.id for x in reverse_items}
        anonymous_items, _, _ = await BenderService(db).feed(ids["tenant"], None, 20, None)
        assert str(ids["bender"]) in {x.id for x in anonymous_items}
        volunteer = await VolunteerService(db, ids["tenant"]).list_volunteers(limit=20, viewer_id=ids["blocker"])
        talent = await TalentService(db, ids["tenant"]).list_talent(limit=20, viewer_id=ids["blocker"])
        assert ids["volunteer"] not in {x.id for x in volunteer.items}
        assert ids["talent"] not in {x.id for x in talent.items}
        assert ids["late_volunteer"] in {x.id for x in volunteer.items}
        assert ids["late_talent"] in {x.id for x in talent.items}
        assert ids["volunteer"] in {x.id for x in (await VolunteerService(db, ids["tenant"]).list_volunteers(limit=20, viewer_id=ids["blocked"])).items}
        assert ids["talent"] in {x.id for x in (await TalentService(db, ids["tenant"]).list_talent(limit=20, viewer_id=None)).items}
        assert await resolve_reference(db, ids["tenant"], "listing", ids["listing"], viewer_id=ids["blocker"]) is None
        assert await resolve_reference(db, ids["tenant"], "listing", ids["listing"], viewer_id=ids["other"])
        assert not any(x["id"] == str(ids["listing"]) for x in await search_references(db, ids["tenant"], "Task5", "listing", ids["blocker"]))
        assert any(x["id"] == str(ids["listing"]) for x in await search_references(db, ids["tenant"], "Task5", "listing", ids["other"]))
        assert await resolve_reference(db, ids["tenant"], "listing", ids["listing"], viewer_id=None)
        assert any(x["id"] == str(ids["listing"]) for x in await search_references(db, ids["tenant"], "Task5", "listing", None))
