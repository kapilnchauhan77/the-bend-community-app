import pytest
from pathlib import Path
from uuid import uuid4
from datetime import datetime
from sqlalchemy import select, func
from app.database import async_session, engine
from app.models.tenant import Tenant
from app.models.user import User
from app.models.shop import Shop
from app.models.listing import Listing, ListingImage
from app.models.event import Event
from app.models.enums import UserRole, ShopStatus, ListingType, ListingCategory, UrgencyLevel, ListingStatus, PricingType, EventCategory, EventStatus
from app.schemas.listing import ListingCreate, ListingUpdate
from app.schemas.event import EventCreate, EventUpdate
from app.services.listing_service import ListingService
from app.services.shop_service import ShopService
from app.services.event_service import EventService
from app.services.auth_service import AuthService
from app.schemas.auth import RegisterRequest
from app.core.exceptions import ValidationError
from app.config import get_settings
from app.services.content_moderation_service import ContentModerationService
from app.core.exceptions import ValidationError

def test_rejects_normalized_prohibited_phrase_and_evasion():
    service = ContentModerationService(["bad phrase"])
    with pytest.raises(ValidationError): service.validate_public_text({"title": "BAD\u200b-phrase"})

def test_allows_harmless_substring_and_one_or_two_links():
    service = ContentModerationService(["spam"])
    service.validate_public_text({"title": "spammer", "description": "https://one.test https://two.test"})

def test_rejects_repeated_link_spam():
    service = ContentModerationService([])
    with pytest.raises(ValidationError): service.validate_public_text({"caption": "https://a.test https://b.test https://c.test"})

@pytest.mark.parametrize("value", ["ＢＡＤ　ＰＨＲＡＳＥ", "bad\u200b phrase", "bad---phrase", "bad\n phrase", "bad\tphrase"])
def test_normalizer_handles_nfkc_zero_width_punctuation_and_whitespace(value):
    with pytest.raises(ValidationError): ContentModerationService(["bad phrase"]).validate_public_text({"title": value})

@pytest.mark.parametrize("value", ["badminton", "bad phrases", "notbad phrasebook"])
def test_whole_phrase_matching_avoids_harmless_substrings(value):
    ContentModerationService(["bad phrase"]).validate_public_text({"title": value})

def test_multiword_term_split_by_punctuation_and_fields():
    service = ContentModerationService(["forbidden words"])
    with pytest.raises(ValidationError): service.validate_public_text({"title": "forbidden", "description": "words"})

@pytest.mark.parametrize("fields", [{}, {"title": "https://a.test"}, {"title": "https://a.test", "description": "https://b.test"}])
def test_zero_one_two_http_links_are_allowed(fields):
    ContentModerationService([]).validate_public_text(fields)

@pytest.mark.parametrize("fields", [{"title": "https://a.test", "description": "https://b.test", "location": "https://c.test"}, {"title": "https://a.test https://a.test https://a.test"}])
def test_three_http_links_across_public_fields_are_rejected(fields):
    with pytest.raises(ValidationError): ContentModerationService([]).validate_public_text(fields)

def test_malformed_and_non_http_links_do_not_count_as_spam():
    ContentModerationService([]).validate_public_text({"title": "ftp://a.test www.example.test https//missing-scheme"})

def test_public_write_call_graph_contains_moderation_before_persistence_services():
    root = Path(__file__).resolve().parents[1] / "app"
    paths = [root/"services/listing_service.py", root/"services/shop_service.py", root/"services/event_service.py", root/"services/bender_service.py", root/"services/auth_service.py", root/"api/v1/volunteers.py", root/"api/v1/talent.py", root/"api/v1/events.py"]
    for path in paths:
        source = path.read_text()
        assert "ContentModerationService" in source, path

def test_private_message_and_inquiry_services_are_excluded_from_public_filter():
    root = Path(__file__).resolve().parents[1] / "app"
    for rel in ("services/message_service.py", "services/talent_service.py", "services/volunteer_service.py"):
        source = (root / rel).read_text()
        assert "ContentModerationService" not in source

@pytest.mark.asyncio
async def test_real_listing_create_update_moderation_rolls_back_side_effects(monkeypatch):
    monkeypatch.setenv("PUBLIC_CONTENT_PROHIBITED_TERMS", '["blocked phrase"]'); get_settings.cache_clear(); await engine.dispose(); marker=f"task6-list-{uuid4().hex}"; tid, uid=uuid4(),uuid4()
    async with async_session() as db:
        db.add(Tenant(id=tid,slug=marker,subdomain=marker,display_name=marker)); await db.flush(); db.add(User(id=uid,tenant_id=tid,email=marker+"@test",password_hash="x",name="Member",role=UserRole.INDIVIDUAL)); await db.commit()
    try:
        async with async_session() as db:
            user=await db.get(User,uid); svc=ListingService(db)
            allowed=ListingCreate(type="offer",category="materials",title="Allowed title",description="A useful description",pricing_type="custom",price_text="Negotiable",image_ids=["media-a"])
            row=await svc.create_listing(allowed,user); await db.commit(); lid=row.id
            before=(row.title,row.description,row.price_text,(await db.execute(select(ListingImage).where(ListingImage.listing_id==lid))).scalars().all())
            with pytest.raises(ValidationError): await svc.update_listing(lid,ListingUpdate(title="blocked phrase"),user)
            await db.rollback(); check=await db.get(Listing,lid); assert (check.title,check.description,check.price_text)==before[:3]
            with pytest.raises(ValidationError): await svc.create_listing(ListingCreate(type="offer",category="materials",title="blocked phrase",description="A useful description",image_ids=["media-b"]),user)
            await db.rollback(); assert (await db.execute(select(func.count()).select_from(Listing).where(Listing.tenant_id==tid))).scalar_one()==1; assert (await db.execute(select(ListingImage).where(ListingImage.listing_id==lid))).scalars().all()==before[3]
    finally:
        async with async_session() as db: await db.execute(ListingImage.__table__.delete().where(ListingImage.listing_id.in_(select(Listing.id).where(Listing.tenant_id==tid)))); await db.execute(Listing.__table__.delete().where(Listing.tenant_id==tid)); await db.execute(User.__table__.delete().where(User.tenant_id==tid)); await db.execute(Tenant.__table__.delete().where(Tenant.id==tid)); await db.commit()
        await engine.dispose()

@pytest.mark.asyncio
async def test_real_registration_shop_update_and_event_moderation(monkeypatch):
    monkeypatch.setenv("PUBLIC_CONTENT_PROHIBITED_TERMS", '["blocked phrase"]'); get_settings.cache_clear(); await engine.dispose(); marker=f"task6-reg-{uuid4().hex}"; tid=uuid4()
    monkeypatch.setattr("app.services.auth_service.hash_password", lambda value: "test-hash")
    async with async_session() as db: db.add(Tenant(id=tid,slug=marker,subdomain=marker,display_name=marker)); await db.commit()
    try:
        async with async_session() as db:
            auth=AuthService(db,tenant_id=tid); bad=RegisterRequest(user_type="individual",owner_name="blocked phrase",email=marker+"bad@example.com",password="Password1",guidelines_accepted=True)
            with pytest.raises(ValidationError): await auth.register(bad)
            assert (await db.execute(select(func.count()).select_from(User).where(User.email==bad.email))).scalar_one()==0
            good=RegisterRequest(user_type="individual",owner_name="Allowed",email=marker+"good@example.com",password="Password1",guidelines_accepted=True); result=await auth.register(good); await db.commit(); uid=good.email
            assert result["user_id"]
        async with async_session() as db:
            admin=(await db.execute(select(User).where(User.email==uid))).scalar_one(); admin_id=admin.id; shop=Shop(id=uuid4(),tenant_id=tid,name="Allowed Shop",business_type="food",status=ShopStatus.ACTIVE,admin_user_id=admin_id); shop_id=shop.id; db.add(shop); await db.flush(); await db.commit(); shop=await db.get(Shop,shop_id); shopsvc=ShopService(db); original=shop.address
            with pytest.raises(ValidationError): await shopsvc.update_shop(shop_id,{"name":"blocked phrase"},admin)
            await db.rollback(); check=await db.get(Shop,shop_id); assert check.name=="Allowed Shop" and check.address==original; admin=await db.get(User,admin_id)
            eventsvc=EventService(db,tenant_id=tid); event=await eventsvc.create_event(EventCreate(title="Allowed Event",description="A safe event",start_date=datetime.utcnow(),location="Town")); event_id=event.id; await db.commit()
            with pytest.raises(ValidationError): await eventsvc.update_event(event_id,EventUpdate(description="blocked phrase"))
            await db.rollback(); assert (await db.get(Event,event_id)).description=="A safe event"
    finally:
        async with async_session() as db: await db.execute(Event.__table__.delete().where(Event.tenant_id==tid)); await db.execute(Shop.__table__.delete().where(Shop.tenant_id==tid)); await db.execute(User.__table__.delete().where(User.tenant_id==tid)); await db.execute(Tenant.__table__.delete().where(Tenant.id==tid)); await db.commit()
        await engine.dispose()
