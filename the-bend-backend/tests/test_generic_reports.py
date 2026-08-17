from app.models.report import Report
from app.models.report_audit import ReportAudit
import asyncio
from uuid import uuid4
from datetime import datetime
import pytest
from sqlalchemy import select, func
from app.database import async_session, engine
from app.core.exceptions import NotFoundError, ValidationError
from app.models.tenant import Tenant
from app.models.user import User
from app.models.enums import UserRole, ShopStatus, ListingType, ListingCategory, UrgencyLevel, ListingStatus, PricingType, EventCategory, EventStatus
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.event import Event
from app.models.bender import BenderPost
from app.models.message import MessageThread, Message
from app.services.report_service import ReportService

def test_generic_report_contract_has_polymorphic_target_and_audit():
    names = set(Report.__table__.columns.keys())
    assert {"target_type", "target_id", "status", "resolved_at", "resolved_by_id"}.issubset(names)
    assert {"report_id", "tenant_id", "actor_id", "action"}.issubset(set(ReportAudit.__table__.columns.keys()))

@pytest.mark.asyncio
async def test_real_report_service_all_targets_replay_and_safe_matrix():
    await engine.dispose()
    marker = f"task6-{uuid4().hex}"
    tenant_id, other_tenant_id = uuid4(), uuid4()
    caller_id, participant_id, outsider_id, admin_id = uuid4(), uuid4(), uuid4(), uuid4()
    ids = {k: uuid4() for k in ("shop", "listing", "event", "concurrent_event", "bender", "thread", "message", "other_listing")}
    async with async_session() as db:
        db.add_all([Tenant(id=tenant_id, slug=marker, subdomain=marker, display_name=marker), Tenant(id=other_tenant_id, slug=marker+"-o", subdomain=marker+"-o", display_name=marker+"-o")])
        await db.flush()
        db.add_all([User(id=caller_id, tenant_id=tenant_id, email=marker+"-c@test", password_hash="x", name="Caller", role=UserRole.INDIVIDUAL), User(id=participant_id, tenant_id=tenant_id, email=marker+"-p@test", password_hash="x", name="Participant", role=UserRole.INDIVIDUAL), User(id=outsider_id, tenant_id=tenant_id, email=marker+"-o@test", password_hash="x", name="Outsider", role=UserRole.INDIVIDUAL), User(id=admin_id, tenant_id=tenant_id, email=marker+"-a@test", password_hash="x", name="Admin", role=UserRole.COMMUNITY_ADMIN), User(id=uuid4(), tenant_id=other_tenant_id, email=marker+"-x@test", password_hash="x", name="Other", role=UserRole.INDIVIDUAL)])
        await db.flush()
        db.add_all([Shop(id=ids["shop"], tenant_id=tenant_id, name=marker, business_type="community", status=ShopStatus.ACTIVE, admin_user_id=participant_id), Listing(id=ids["listing"], tenant_id=tenant_id, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title=marker, description="A safe listing", pricing_type=PricingType.FREE, is_free=True, urgency=UrgencyLevel.NORMAL, status=ListingStatus.ACTIVE, posted_by_user_id=caller_id), Listing(id=ids["other_listing"], tenant_id=other_tenant_id, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title=marker, description="Other", pricing_type=PricingType.FREE, is_free=True, urgency=UrgencyLevel.NORMAL, status=ListingStatus.ACTIVE), Event(id=ids["event"], tenant_id=tenant_id, title=marker, start_date=datetime.utcnow(), category=EventCategory.COMMUNITY, source="manual", status=EventStatus.ACTIVE), Event(id=ids["concurrent_event"], tenant_id=tenant_id, title=marker+"-concurrent", start_date=datetime.utcnow(), category=EventCategory.COMMUNITY, source="manual", status=EventStatus.ACTIVE), BenderPost(id=ids["bender"], tenant_id=tenant_id, author_user_id=caller_id, caption=marker), MessageThread(id=ids["thread"], tenant_id=None, participant_a=min(caller_id, participant_id, key=str), participant_b=max(caller_id, participant_id, key=str)),])
        await db.flush()
        db.add(Message(id=ids["message"], thread_id=ids["thread"], sender_id=participant_id, content="private "+marker))
        await db.commit()
    targets = [("listing", ids["listing"]), ("shop", ids["shop"]), ("event", ids["event"]), ("bender", ids["bender"]), ("user", participant_id), ("message", ids["message"])]
    try:
        async with async_session() as db:
            service = ReportService(db)
            for target_type, target_id in targets:
                row, duplicate = await service.create(target_type, target_id, "spam", "  "+marker+"  ", caller_id, tenant_id)
                assert not duplicate and row.target_type == target_type
            await db.commit()

        async with async_session() as db:
            row, duplicate = await ReportService(db).create("listing", ids["listing"], "spam", None, caller_id, tenant_id)
            assert duplicate
            await db.commit()
        concurrent_target = ids["concurrent_event"]
        async def concurrent_create():
            async with async_session() as db:
                result = await ReportService(db).create("event", concurrent_target, "other", None, caller_id, tenant_id)
                await db.commit()
                return result
        first, second = await asyncio.gather(concurrent_create(), concurrent_create())
        assert {first[0].id, second[0].id}.__len__() == 1
        assert sorted([first[1], second[1]]) == [False, True]
        async with async_session() as db:
            for args in (("listing", ids["other_listing"], "spam", None, caller_id, tenant_id), ("user", caller_id, "spam", None, caller_id, tenant_id), ("message", ids["message"], "spam", None, outsider_id, tenant_id)):
                with pytest.raises(NotFoundError): await ReportService(db).create(*args)
    finally:
        async with async_session() as db:
            for table in (ReportAudit, Report, Message, MessageThread, BenderPost, Event, Listing, Shop, User, Tenant):
                if hasattr(table, "tenant_id"): await db.execute(table.__table__.delete().where(table.tenant_id.in_([tenant_id, other_tenant_id])))
            await db.commit()

@pytest.mark.asyncio
async def test_real_compatibility_admin_hydration_and_resolution_privacy():
    await engine.dispose(); marker=f"task6-admin-{uuid4().hex}"; tenant_id, other_id=uuid4(),uuid4(); caller_id, actor_id=uuid4(),uuid4(); listing_id, other_listing_id, thread_id, message_id=uuid4(),uuid4(),uuid4(),uuid4()
    async with async_session() as db:
        db.add_all([Tenant(id=tenant_id,slug=marker,subdomain=marker,display_name=marker),Tenant(id=other_id,slug=marker+"-o",subdomain=marker+"-o",display_name=marker+"-o")]); await db.flush()
        db.add_all([User(id=caller_id,tenant_id=tenant_id,email=marker+"c@test",password_hash="x",name="Caller",role=UserRole.INDIVIDUAL),User(id=actor_id,tenant_id=tenant_id,email=marker+"a@test",password_hash="x",name="Admin",role=UserRole.COMMUNITY_ADMIN),Listing(id=listing_id,tenant_id=tenant_id,type=ListingType.OFFER,category=ListingCategory.MATERIALS,title=marker,description="safe",pricing_type=PricingType.FREE,is_free=True,urgency=UrgencyLevel.NORMAL,status=ListingStatus.ACTIVE),Listing(id=other_listing_id,tenant_id=other_id,type=ListingType.OFFER,category=ListingCategory.MATERIALS,title=marker,description="other",pricing_type=PricingType.FREE,is_free=True,urgency=UrgencyLevel.NORMAL,status=ListingStatus.ACTIVE),MessageThread(id=thread_id,tenant_id=tenant_id,participant_a=min(caller_id,actor_id,key=str),participant_b=max(caller_id,actor_id,key=str))]); await db.flush(); db.add(Message(id=message_id,thread_id=thread_id,sender_id=caller_id,content="SECRET-PRIVATE-"+marker,attachment_url="secret-contact")); await db.commit()
    try:
        from app.api.v1.listings import report_listing
        async with async_session() as db:
            user=await db.get(User,caller_id)
            assert (await report_listing(listing_id,{"reason":"spam"},db,user))["status"]=="reported"
            assert (await report_listing(listing_id,{"reason":"spam"},db,user))["status"]=="already_reported"
            with pytest.raises(ValidationError):
                await report_listing(listing_id,{"reason":"invalid"},db,user)
            await db.commit()
        async with async_session() as db:
            svc=ReportService(db); items=await svc.list_admin(tenant_id); assert len(items["items"])==1; row=(await db.execute(select(Report).where(Report.target_id==listing_id))).scalar_one(); await svc.resolve(row.id,actor_id,tenant_id,action="content_unpublished"); await db.commit()
        async with async_session() as db:
            row=(await db.execute(select(Report).where(Report.target_id==listing_id))).scalar_one(); await ReportService(db).resolve(row.id,actor_id,tenant_id,action="content_unpublished"); await db.commit(); assert len((await db.execute(select(ReportAudit).where(ReportAudit.report_id==row.id))).scalars().all())==1
            with pytest.raises(NotFoundError):
                await ReportService(db).resolve(row.id,actor_id,other_id)
    finally:
        async with async_session() as db:
            await db.execute(ReportAudit.__table__.delete().where(ReportAudit.tenant_id.in_([tenant_id,other_id]))); await db.execute(Report.__table__.delete().where(Report.tenant_id.in_([tenant_id,other_id]))); await db.execute(Message.__table__.delete().where(Message.id==message_id)); await db.execute(MessageThread.__table__.delete().where(MessageThread.id==thread_id)); await db.execute(Listing.__table__.delete().where(Listing.id.in_([listing_id,other_listing_id]))); await db.execute(User.__table__.delete().where(User.tenant_id.in_([tenant_id,other_id]))); await db.execute(Tenant.__table__.delete().where(Tenant.id.in_([tenant_id,other_id]))); await db.commit()

@pytest.mark.asyncio
async def test_admin_hydrates_all_six_types_and_concurrent_resolve_once():
    await engine.dispose(); marker=f"task6-matrix-{uuid4().hex}"; tid, oid=uuid4(),uuid4(); caller, actor=uuid4(),uuid4(); ids={k:uuid4() for k in ("shop","listing","event","bender","thread","message","other")}
    async with async_session() as db:
        db.add_all([Tenant(id=tid,slug=marker,subdomain=marker,display_name=marker),Tenant(id=oid,slug=marker+"o",subdomain=marker+"o",display_name=marker+"o")]); await db.flush(); db.add_all([User(id=caller,tenant_id=tid,email=marker+"c@test",password_hash="x",name="Caller",role=UserRole.INDIVIDUAL),User(id=actor,tenant_id=tid,email=marker+"a@test",password_hash="x",name="Admin",role=UserRole.COMMUNITY_ADMIN)]); await db.flush(); db.add_all([Shop(id=ids["shop"],tenant_id=tid,name=marker,business_type="x",status=ShopStatus.ACTIVE,admin_user_id=caller),Listing(id=ids["listing"],tenant_id=tid,type=ListingType.OFFER,category=ListingCategory.MATERIALS,title=marker,description="safe",pricing_type=PricingType.FREE,is_free=True,urgency=UrgencyLevel.NORMAL,status=ListingStatus.ACTIVE),Event(id=ids["event"],tenant_id=tid,title=marker,start_date=datetime.utcnow(),category=EventCategory.COMMUNITY,source="manual",status=EventStatus.ACTIVE),BenderPost(id=ids["bender"],tenant_id=tid,author_user_id=caller,caption=marker),MessageThread(id=ids["thread"],tenant_id=tid,participant_a=min(caller,actor,key=str),participant_b=max(caller,actor,key=str)),Listing(id=ids["other"],tenant_id=oid,type=ListingType.OFFER,category=ListingCategory.MATERIALS,title=marker,description="other",pricing_type=PricingType.FREE,is_free=True,urgency=UrgencyLevel.NORMAL,status=ListingStatus.ACTIVE)]); await db.flush(); db.add(Message(id=ids["message"],thread_id=ids["thread"],sender_id=caller,content="SECRET-BODY-"+marker,attachment_url="PRIVATE-CONTACT-"+marker)); await db.flush()
        svc=ReportService(db)
        for typ,key in (("listing","listing"),("shop","shop"),("event","event"),("bender","bender"),("user",actor),("message","message")): await svc.create(typ,ids[key] if isinstance(key,str) else key,"spam",None,caller,tid)
        await db.commit()
    try:
        async with async_session() as db:
            items=(await ReportService(db).list_admin(tid))["items"]; assert {x["target_type"] for x in items}=={"listing","shop","event","bender","user","message"}; msg=next(x for x in items if x["target_type"]=="message"); assert msg["target_summary"]=={"id":str(ids["message"]),"target_type":"message"}; assert "SECRET-BODY" not in str(items) and "PRIVATE-CONTACT" not in str(items)
            await db.execute(Listing.__table__.delete().where(Listing.id==ids["listing"])); await db.commit()
        async with async_session() as db:
            deleted=(await ReportService(db).list_admin(tid))["items"]; assert any(x["target_summary"].get("unavailable") for x in deleted)
            report=(await db.execute(select(Report).where(Report.target_type=="event",Report.tenant_id==tid))).scalar_one(); rid=report.id
        async def resolve_once():
            async with async_session() as db:
                row=await ReportService(db).resolve(rid,actor,tid,"resolved"); await db.commit(); return row.status
        assert await asyncio.gather(resolve_once(),resolve_once())==["resolved","resolved"]
        async with async_session() as db: assert len((await db.execute(select(ReportAudit).where(ReportAudit.report_id==rid))).scalars().all())==1
    finally:
        async with async_session() as db:
            await db.execute(ReportAudit.__table__.delete().where(ReportAudit.tenant_id.in_([tid,oid]))); await db.execute(Report.__table__.delete().where(Report.tenant_id.in_([tid,oid]))); await db.execute(Message.__table__.delete().where(Message.id==ids["message"])); await db.execute(MessageThread.__table__.delete().where(MessageThread.id==ids["thread"])); await db.execute(BenderPost.__table__.delete().where(BenderPost.id==ids["bender"])); await db.execute(Event.__table__.delete().where(Event.tenant_id.in_([tid,oid]))); await db.execute(Listing.__table__.delete().where(Listing.tenant_id.in_([tid,oid]))); await db.execute(Shop.__table__.delete().where(Shop.tenant_id.in_([tid,oid]))); await db.execute(User.__table__.delete().where(User.tenant_id.in_([tid,oid]))); await db.execute(Tenant.__table__.delete().where(Tenant.id.in_([tid,oid]))); await db.commit()
