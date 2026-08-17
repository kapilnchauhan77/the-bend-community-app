import pytest
import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse
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
from app.services.bender_service import BenderService
from app.services.volunteer_service import VolunteerService
from app.services.talent_service import TalentService
from app.services.message_service import MessageService
from app.schemas.auth import RegisterRequest
from app.core.exceptions import ValidationError
from app.core.exceptions import AppException
from app.api.deps import get_db
from app.core.permissions import get_current_tenant, get_current_user, get_current_user_optional
from app.api.v1.auth import router as auth_router, get_auth_service
from app.api.v1.listings import router as listings_router, get_listing_service
from app.api.v1.events import router as events_router
from app.api.v1.admin import router as admin_router, get_event_service
from app.api.v1.bender import router as bender_router, get_service as get_bender_service
from app.api.v1.volunteers import router as volunteers_router, get_service as get_volunteer_service
from app.api.v1.talent import router as talent_router, get_service as get_talent_service
from app.api.v1.messages import router as messages_router, get_message_service
from app.models.refresh_session import RefreshSession
from app.models.notification import Notification
from app.models.notification_outbox import NotificationOutbox
from app.models.event import EventConnector
from app.models.bender import BenderPost, BenderComment, BenderLike
from app.models.volunteer import Volunteer
from app.models.talent import Talent, TalentInquiry
from app.models.message import MessageThread, Message
from app.config import get_settings
from app.services.content_moderation_service import ContentModerationService
from app.core.exceptions import ValidationError


def _route_app(db, tenant, user):
    app = FastAPI()
    app.exception_handler(AppException)(lambda _, exc: JSONResponse(status_code=exc.status_code, content=exc.detail))
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(listings_router, prefix="/api/v1")
    app.include_router(events_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(bender_router, prefix="/api/v1")
    app.include_router(volunteers_router, prefix="/api/v1")
    app.include_router(talent_router, prefix="/api/v1")
    app.include_router(messages_router, prefix="/api/v1")

    async def db_override():
        yield db
        await db.commit()

    async def tenant_override(): return tenant
    async def user_override(): return user
    async def optional_user_override(): return user
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_tenant] = tenant_override
    app.dependency_overrides[get_current_user] = user_override
    app.dependency_overrides[get_current_user_optional] = optional_user_override
    app.dependency_overrides[get_auth_service] = lambda: AuthService(db, tenant_id=tenant.id)
    app.dependency_overrides[get_listing_service] = lambda: ListingService(db)
    app.dependency_overrides[get_event_service] = lambda: EventService(db, tenant_id=tenant.id)
    app.dependency_overrides[get_bender_service] = lambda: BenderService(db)
    app.dependency_overrides[get_volunteer_service] = lambda: VolunteerService(db)
    app.dependency_overrides[get_talent_service] = lambda: TalentService(db, tenant_id=tenant.id)
    app.dependency_overrides[get_message_service] = lambda: MessageService(db)
    return app


async def _request(app, method, path, **kwargs):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.request(method, path, **kwargs)

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


def test_public_profile_path_is_registration_name_and_avatar_only():
    """Call-graph audit: there is no separate public text profile editor."""
    root = Path(__file__).parents[1] / "app" / "api" / "v1"
    route_sources = "\n".join((root / name).read_text() for name in ("auth.py", "upload.py"))
    assert "@router.post(\"/register\"" in route_sources
    assert "@router.post(\"/avatar\"" in route_sources
    assert not any(token in route_sources for token in ("/profile", "/users/me", "update_profile"))

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


@pytest.mark.asyncio
async def test_real_asgi_public_and_admin_moderation_paths(monkeypatch):
    monkeypatch.setenv("PUBLIC_CONTENT_PROHIBITED_TERMS", '["blocked phrase"]'); get_settings.cache_clear(); await engine.dispose()
    monkeypatch.setattr("app.services.auth_service.hash_password", lambda value: "test-hash")
    marker=f"task6-asgi-{uuid4().hex}"; tid=uuid4(); admin_id=uuid4()
    async with async_session() as db:
        tenant=Tenant(id=tid,slug=marker,subdomain=marker,display_name=marker)
        admin=User(id=admin_id,tenant_id=tid,email=f"{marker}@example.com",password_hash="x",name="Admin",role=UserRole.COMMUNITY_ADMIN)
        db.add_all([tenant,admin]); await db.commit()
    try:
        async with async_session() as db:
            tenant=await db.get(Tenant,tid); admin=await db.get(User,admin_id); app=_route_app(db,tenant,admin)
            # Actual registration route: public text is rejected before any row or side effect.
            base={"user_type":"business","owner_name":"Allowed Owner","shop_name":"Allowed Shop","business_type":"food","address":"10 Main St","email":f"{marker}-bad@example.com","password":"Password1","guidelines_accepted":True}
            for field in ("owner_name","shop_name","business_type","address"):
                payload={**base,field:"blocked phrase"}
                response=await _request(app,"POST","/api/v1/auth/register",json=payload)
                assert response.status_code == 400, (field,response.text)
            assert (await db.execute(select(func.count()).select_from(User).where(User.email.like(f"{marker}-%")))).scalar_one()==0
            allowed={**base,"email":f"{marker}-allowed@example.com"}
            response=await _request(app,"POST","/api/v1/auth/register",json=allowed); assert response.status_code==201, response.text
            assert (await db.execute(select(func.count()).select_from(User).where(User.email==allowed["email"]))).scalar_one()==1
            assert (await db.execute(select(func.count()).select_from(Shop).where(Shop.tenant_id==tid))).scalar_one()==1
            # Actual listing route: aggregate URL spam and prohibited update are rejected; allowed update persists.
            listing_payload={"type":"offer","category":"volunteer","title":"Allowed listing","description":"A safe listing description","pricing_type":"custom","price_text":"Negotiable","image_ids":[]}
            response=await _request(app,"POST","/api/v1/listings",json=listing_payload); assert response.status_code==201, response.text
            lid=response.json()["id"]
            before=await db.get(Listing,lid); before_title=before.title
            bad_listing={**listing_payload,"title":"https://one.example https://two.example","description":"https://three.example"}
            response=await _request(app,"POST","/api/v1/listings",json=bad_listing); assert response.status_code==400
            response=await _request(app,"PUT",f"/api/v1/listings/{lid}",json={"title":"blocked phrase"}); assert response.status_code==400
            await db.refresh(before); assert before.title==before_title
            response=await _request(app,"PUT",f"/api/v1/listings/{lid}",json={"title":"Allowed updated"}); assert response.status_code==200
            await db.refresh(before); assert before.title=="Allowed updated"
            # Actual member submission route: free/nonprofit path avoids Stripe and persists tenant/user linkage.
            event_payload={"title":"Allowed member event","description":"A safe event description","start_date":"2030-01-01T10:00:00","location":"Town","category":"community","is_nonprofit":True,"nonprofit_doc_url":"https://doc.example","submitted_by_name":"Allowed Organizer","submitted_by_email":allowed["email"]}
            response=await _request(app,"POST","/api/v1/events/submit",json={**event_payload,"title":"blocked phrase"}); assert response.status_code==400
            assert (await db.execute(select(func.count()).select_from(Event).where(Event.tenant_id==tid))).scalar_one()==0
            response=await _request(app,"POST","/api/v1/events/submit",json={**event_payload,"description":"https://one.example https://two.example","location":"https://three.example"}); assert response.status_code==400
            response=await _request(app,"POST","/api/v1/events/submit",json=event_payload); assert response.status_code==200, response.text
            submitted=(await db.execute(select(Event).where(Event.tenant_id==tid))).scalars().one(); assert submitted.submitted_by_user_id==admin.id
            # Actual admin event create/update route, with rejection preserving the committed event.
            event_payload2={"title":"Admin event","description":"A safe admin event","start_date":"2030-02-01T10:00:00","location":"Hall","category":"community"}
            response=await _request(app,"POST","/api/v1/admin/events",json=event_payload2); assert response.status_code==200, response.text
            admin_event_id=response.json()["id"]
            response=await _request(app,"PUT",f"/api/v1/admin/events/{admin_event_id}",json={"description":"blocked phrase"}); assert response.status_code==400
            admin_event=await db.get(Event,admin_event_id); assert admin_event.description=="A safe admin event"
            response=await _request(app,"PUT",f"/api/v1/admin/events/{admin_event_id}",json={"description":"Allowed admin update"}); assert response.status_code==200
            await db.refresh(admin_event); assert admin_event.description=="Allowed admin update"
            assert (await db.execute(select(func.count()).select_from(RefreshSession).where(RefreshSession.user_id==admin.id))).scalar_one()==0
            # The allowed business registration intentionally notifies the seeded
            # community admin; rejected attempts above created no notifications.
            assert (await db.execute(select(func.count()).select_from(Notification).where(Notification.tenant_id==tid))).scalar_one()==1
            assert (await db.execute(select(func.count()).select_from(NotificationOutbox).where(NotificationOutbox.tenant_id==tid))).scalar_one()==0
            assert (await db.execute(select(func.count()).select_from(EventConnector).where(EventConnector.tenant_id==tid))).scalar_one()==0
    finally:
        async with async_session() as db:
            await db.execute(Event.__table__.delete().where(Event.tenant_id==tid)); await db.execute(Shop.__table__.delete().where(Shop.tenant_id==tid)); await db.execute(User.__table__.delete().where(User.tenant_id==tid)); await db.execute(Tenant.__table__.delete().where(Tenant.id==tid)); await db.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_real_asgi_bender_volunteer_talent_and_private_message_paths(monkeypatch):
    monkeypatch.setenv("PUBLIC_CONTENT_PROHIBITED_TERMS", '["blocked phrase"]'); get_settings.cache_clear(); await engine.dispose()
    marker=f"task6-private-{uuid4().hex}"; tid=uuid4(); sender_id=uuid4(); recipient_id=uuid4()
    async with async_session() as db:
        tenant=Tenant(id=tid,slug=marker,subdomain=marker,display_name=marker)
        sender=User(id=sender_id,tenant_id=tid,email=f"{marker}-sender@example.com",password_hash="x",name="Sender",role=UserRole.COMMUNITY_ADMIN)
        recipient=User(id=recipient_id,tenant_id=tid,email=f"{marker}-recipient@example.com",password_hash="x",name="Recipient",role=UserRole.INDIVIDUAL)
        db.add_all([tenant,sender,recipient]); await db.commit()
    try:
        async with async_session() as db:
            tenant=await db.get(Tenant,tid); sender=await db.get(User,sender_id); app=_route_app(db,tenant,sender); anonymous=_route_app(db,tenant,None)
            # Bender public post/comment routes: validation precedes rows and counters.
            response=await _request(app,"POST","/api/v1/bender/posts",json={"caption":"Allowed community post"}); assert response.status_code==201, response.text
            post_id=response.json()["id"]; post=await db.get(BenderPost,post_id); before_count=post.comment_count
            response=await _request(app,"POST","/api/v1/bender/posts",json={"caption":"blocked phrase"}); assert response.status_code==400
            assert (await db.execute(select(func.count()).select_from(BenderPost).where(BenderPost.tenant_id==tid))).scalar_one()==1
            response=await _request(app,"POST",f"/api/v1/bender/posts/{post_id}/comments",json={"content":"blocked phrase"}); assert response.status_code==400
            await db.refresh(post); assert post.comment_count==before_count
            response=await _request(app,"POST",f"/api/v1/bender/posts/{post_id}/comments",json={"content":"Allowed comment"}); assert response.status_code==201
            await db.refresh(post); assert post.comment_count==1
            # No Bender update route exists; the router exposes create/delete/like/comment only.
            assert not any(getattr(r,"path","").endswith("/posts/{post_id}") and "PUT" in getattr(r,"methods",set()) for r in bender_router.routes)
            # Anonymous volunteer and talent routes reject prohibited public fields before rows.
            volunteer_base={"name":"Allowed Volunteer","skills":"First aid","available_time":"Weekends","email":f"{marker}-vol@example.com"}
            for field in ("name","skills","available_time"):
                response=await _request(anonymous,"POST","/api/v1/volunteers",json={**volunteer_base,field:"blocked phrase"}); assert response.status_code==400
            assert (await db.execute(select(func.count()).select_from(Volunteer).where(Volunteer.tenant_id==tid))).scalar_one()==0
            response=await _request(anonymous,"POST","/api/v1/volunteers",json=volunteer_base); assert response.status_code==200
            volunteer_id=response.json()["id"]
            response=await _request(app,"PUT",f"/api/v1/volunteers/{volunteer_id}",json={"skills":"blocked phrase"}); assert response.status_code==400
            volunteer=await db.get(Volunteer,volunteer_id); assert volunteer.skills=="First aid"
            talent_base={"name":"Allowed Talent","category":"artist","skills":"Painting","available_time":"Evenings","rate":50,"rate_unit":"hr","email":f"{marker}-talent@example.com"}
            for field in ("name","skills","available_time"):
                response=await _request(anonymous,"POST","/api/v1/talent",json={**talent_base,field:"blocked phrase"}); assert response.status_code==400
            assert (await db.execute(select(func.count()).select_from(Talent).where(Talent.tenant_id==tid))).scalar_one()==0
            response=await _request(anonymous,"POST","/api/v1/talent",json=talent_base); assert response.status_code==200
            talent_id=response.json()["id"]
            response=await _request(app,"PUT",f"/api/v1/talent/{talent_id}",json={"available_time":"blocked phrase"}); assert response.status_code==400
            talent=await db.get(Talent,talent_id); assert talent.available_time=="Evenings"
            # Private talent inquiry is deliberately unmoderated and persists.
            response=await _request(app,"POST",f"/api/v1/talent/{talent_id}/inquiries",json={"name":"Private Contact","message":"blocked phrase","preferred_date":"tomorrow"}); assert response.status_code==200, response.text
            assert (await db.execute(select(func.count()).select_from(TalentInquiry).where(TalentInquiry.talent_id==talent_id))).scalar_one()==1
            # Private messages are deliberately unmoderated and still notify/outbox.
            response=await _request(app,"POST","/api/v1/messages/threads",json={"recipient_user_id":str(recipient_id)}); assert response.status_code==200, response.text
            thread_id=response.json()["thread_id"] if "thread_id" in response.json() else response.json()["id"]
            response=await _request(app,"POST",f"/api/v1/messages/threads/{thread_id}",json={"content":"blocked phrase private message"}); assert response.status_code==200, response.text
            assert (await db.execute(select(func.count()).select_from(Message).where(Message.thread_id==thread_id))).scalar_one()==1
            assert (await db.execute(select(func.count()).select_from(Notification).where(Notification.tenant_id==tid))).scalar_one()>=1
            assert (await db.execute(select(func.count()).select_from(NotificationOutbox).where(NotificationOutbox.tenant_id==tid))).scalar_one()>=1
    finally:
        async with async_session() as db:
            await db.execute(Message.__table__.delete().where(Message.sender_id.in_([sender_id,recipient_id]))); await db.execute(MessageThread.__table__.delete().where(MessageThread.participant_a.in_([sender_id,recipient_id]) | MessageThread.participant_b.in_([sender_id,recipient_id]))); await db.execute(BenderComment.__table__.delete().where(BenderComment.user_id.in_([sender_id,recipient_id]))); await db.execute(BenderLike.__table__.delete().where(BenderLike.user_id.in_([sender_id,recipient_id]))); await db.execute(BenderPost.__table__.delete().where(BenderPost.tenant_id==tid)); await db.execute(TalentInquiry.__table__.delete().where(TalentInquiry.talent_id.in_(select(Talent.id).where(Talent.tenant_id==tid)))); await db.execute(Talent.__table__.delete().where(Talent.tenant_id==tid)); await db.execute(Volunteer.__table__.delete().where(Volunteer.tenant_id==tid)); await db.execute(NotificationOutbox.__table__.delete().where(NotificationOutbox.tenant_id==tid)); await db.execute(Notification.__table__.delete().where(Notification.tenant_id==tid)); await db.execute(User.__table__.delete().where(User.tenant_id==tid)); await db.execute(Tenant.__table__.delete().where(Tenant.id==tid)); await db.commit()
        await engine.dispose()
