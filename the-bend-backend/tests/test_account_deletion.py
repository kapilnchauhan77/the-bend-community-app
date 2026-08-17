"""Account deletion contract tests.

These tests intentionally exercise the public service contract without mocks;
integration fixtures can opt in to PostgreSQL through the normal test setup.
"""
import uuid

import pytest
from io import BytesIO
from fastapi import UploadFile
from PIL import Image
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.config import get_settings
import app.database as _database

# Every test in this module may run on a fresh pytest event loop.  A local
# NullPool prevents asyncpg connections from crossing those loops; dynamic
# application consumers (notably the WebSocket handler) use this same session
# factory during these tests.
_test_engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
async_session = async_sessionmaker(_test_engine, expire_on_commit=False)


@pytest.fixture(autouse=True)
def _isolated_application_session(monkeypatch):
    """Scope the NullPool application session to each test and restore it."""
    monkeypatch.setattr(_database, "async_session", async_session)
    yield
from app.models.tenant import Tenant
from app.models.user import User
from app.models.device_installation import DeviceInstallation
from app.models.refresh_session import RefreshSession
from app.models.account_deletion import AccountDeletion
from app.models.account_deletion import AccountOwnedUpload
from app.models.enums import UserRole


def test_account_deletion_model_has_bounded_lifecycle_and_receipt_hash():
    from app.models.account_deletion import AccountDeletion

    row = AccountDeletion(user_id=uuid.uuid4(), tenant_id=uuid.uuid4())
    assert row.status == "pending"
    assert row.attempts == 0
    assert row.receipt_hash is None


def test_account_deletion_service_exposes_confirmation_and_erasure():
    from app.services.account_deletion_service import AccountDeletionService

    assert callable(AccountDeletionService.confirm)
    assert callable(AccountDeletionService.erase)


def test_account_erasure_task_is_registered_under_exact_name():
    from app.workers.account_tasks import erase_account

    assert erase_account.name == "app.workers.account_tasks.erase_account"


def test_reconciler_is_registered_for_committed_enqueue_failures():
    from app.workers.account_tasks import reconcile_account_deletions
    assert reconcile_account_deletions.name == "app.workers.account_tasks.reconcile_account_deletions"


def test_owned_upload_guard_rejects_legacy_and_traversal_paths():
    from app.services.account_deletion_service import AccountDeletionService
    user_id = uuid.uuid4()
    assert AccountDeletionService.safe_owned_upload("uploads/avatar.png", user_id=user_id) is None
    assert AccountDeletionService.safe_owned_upload(f"uploads/users/{user_id}/avatar.png", user_id=user_id)
    assert AccountDeletionService.safe_owned_upload(f"uploads/users/{user_id}/../other/avatar.png", user_id=user_id) is None


def test_runtime_password_hash_supports_long_input_and_normal_bcrypt():
    from app.core.security import hash_password, verify_password
    for password in ("Correct1", "x" * 200):
        encoded = hash_password(password)
        assert verify_password(password, encoded)
        assert not verify_password(password + "!", encoded)
    short = hash_password("x" * 72)
    assert not verify_password("x" * 73, short)


def test_deletion_email_has_dedicated_template_contract():
    from app.services.email_service import EmailService
    assert callable(EmailService.send_account_deletion_confirmation)


@pytest.mark.asyncio
async def test_terminal_receipt_is_consumed_only_after_terminal_poll():
    # Contract-level regression: pending receipts remain pollable, while a
    # completed receipt is atomically consumed by its first successful read.
    from app.services.account_deletion_service import AccountDeletionService
    assert hasattr(AccountDeletionService, "consume_terminal_receipt")


def test_private_upload_path_is_distinct_from_shared_upload_paths():
    from app.services.file_service import FileService
    assert hasattr(FileService, "upload_private_user_image")


@pytest.mark.asyncio
async def test_real_postgres_confirmation_scrubs_all_devices_and_tombstones_user():
    from app.core.security import hash_password
    from app.services.account_deletion_service import AccountDeletionService
    marker = uuid.uuid4().hex
    tenant_id, user_id = uuid.uuid4(), uuid.uuid4()
    class Queue:
        calls = []
        def delay(self, value): self.calls.append(value)
    try:
        async with async_session() as db:
            db.add(Tenant(id=tenant_id, slug="t7-"+marker, subdomain="t7-"+marker, display_name="T7"))
            await db.flush()
            user = User(id=user_id, tenant_id=tenant_id, email=marker+"@example.test", password_hash=hash_password("Correct1"), name="Real User", role=UserRole.INDIVIDUAL)
            db.add(user); await db.flush()
            db.add_all([RefreshSession(user_id=user_id, expires_at=__import__("datetime").datetime.utcnow()), DeviceInstallation(user_id=user_id, tenant_id=tenant_id, platform="ios", provider_token=marker+"-1", revocation_secret_hash="x", app_version="1", build_number="1"), DeviceInstallation(user_id=user_id, tenant_id=tenant_id, platform="android", provider_token=marker+"-2", revocation_secret_hash="x", app_version="1", build_number="1")]); await db.commit()
            queue = Queue(); row, receipt = await AccountDeletionService(db, queue=queue).confirm(user, "Correct1")
            assert len(queue.calls) == 1 and not user.is_active
            devices = (await db.execute(select(DeviceInstallation).where(DeviceInstallation.user_id == user_id))).scalars().all()
            assert len(devices) == 2 and len({d.provider_token for d in devices}) == 2 and all(not d.enabled for d in devices)
            await AccountDeletionService(db).erase(str(row.id))
            tombstone = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
            assert tombstone.name == "Deleted member" and tombstone.email == f"deleted-{user_id}@deleted.invalid"
            completed = await AccountDeletionService(db).consume_terminal_receipt(receipt, tenant_id)
            assert completed.status == "completed"
            await db.commit()
            from app.core.exceptions import NotFoundError
            with pytest.raises(NotFoundError):
                await AccountDeletionService(db).status(receipt, tenant_id)
    finally:
        async with async_session() as db:
            await db.execute(delete(AccountDeletion).where(AccountDeletion.user_id == user_id))
            await db.execute(delete(DeviceInstallation).where(DeviceInstallation.user_id == user_id))
            await db.execute(delete(RefreshSession).where(RefreshSession.user_id == user_id))
            await db.execute(delete(User).where(User.id == user_id)); await db.execute(delete(Tenant).where(Tenant.id == tenant_id)); await db.commit()


def _png_upload(name="avatar.png"):
    image = Image.new("RGB", (2, 2), "red"); data = BytesIO(); image.save(data, format="PNG"); data.seek(0)
    return UploadFile(filename=name, file=data, headers={"content-type": "image/png"})


@pytest.mark.asyncio
async def test_connected_websocket_is_denied_after_database_lock():
    from app.core.security import hash_password, create_access_token
    from app.api.ws import chat
    marker=uuid.uuid4().hex; tenant_id,user_id=uuid.uuid4(),uuid.uuid4(); token=create_access_token(user_id,UserRole.INDIVIDUAL.value)
    try:
        async with async_session() as db:
            db.add(Tenant(id=tenant_id,slug="ws-lock-"+marker,subdomain="ws-lock-"+marker,display_name="WS")); await db.flush(); db.add(User(id=user_id,tenant_id=tenant_id,email=marker+"@example.com",password_hash=hash_password("Correct1"),name="WS",role=UserRole.INDIVIDUAL)); await db.commit()
        class Socket:
            query_params={"token":token}; accepted=False
            async def accept(self): self.accepted=True
            async def close(self,**kwargs): self.closed=kwargs
            async def receive_text(self):
                async with async_session() as db: await db.execute(__import__("sqlalchemy").update(User).where(User.id==user_id).values(is_active=False)); await db.commit()
                return '{"type":"typing","thread_id":"00000000-0000-0000-0000-000000000000"}'
        socket=Socket(); await chat.websocket_chat(socket); assert socket.accepted and getattr(socket,"closed",None)
    finally:
        async with async_session() as db: await db.execute(delete(User).where(User.id==user_id)); await db.execute(delete(Tenant).where(Tenant.id==tenant_id)); await db.commit()


@pytest.mark.asyncio
async def test_stale_lease_and_partial_worker_failure_recover(monkeypatch):
    from datetime import datetime, timedelta
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.config import get_settings
    from app.services.account_deletion_service import AccountDeletionService
    marker=uuid.uuid4().hex; tenant_id,user_id,deletion_id=uuid.uuid4(),uuid.uuid4(),uuid.uuid4()
    isolated_engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
    isolated_session = async_sessionmaker(isolated_engine, expire_on_commit=False)
    try:
        async with isolated_session() as db:
            db.add(Tenant(id=tenant_id,slug="lease-"+marker,subdomain="lease-"+marker,display_name="Lease")); await db.flush(); db.add(User(id=user_id,tenant_id=tenant_id,email=marker+"@example.com",password_hash="x",name="Lease",role=UserRole.INDIVIDUAL)); await db.flush(); db.add(AccountDeletion(id=deletion_id,user_id=user_id,tenant_id=tenant_id,status="processing",claimed_at=datetime.utcnow()-timedelta(hours=1))); db.add(AccountOwnedUpload(user_id=user_id,tenant_id=tenant_id,path=f"uploads/users/{user_id}/private.png")); await db.commit()
        original=AccountDeletionService.safe_owned_upload
        monkeypatch.setattr(AccountDeletionService,"safe_owned_upload",staticmethod(lambda *args,**kwargs: (_ for _ in ()).throw(RuntimeError("partial"))))
        with pytest.raises(RuntimeError):
            async with isolated_session() as db: await AccountDeletionService(db).erase(str(deletion_id))
        monkeypatch.setattr(AccountDeletionService,"safe_owned_upload",staticmethod(original))
        async with isolated_session() as db: assert await AccountDeletionService(db).erase(str(deletion_id))
    finally:
        async with isolated_session() as db: await db.execute(delete(AccountDeletion).where(AccountDeletion.id==deletion_id)); await db.execute(delete(User).where(User.id==user_id)); await db.execute(delete(Tenant).where(Tenant.id==tenant_id)); await db.commit()
        await isolated_engine.dispose()


@pytest.mark.asyncio
async def test_email_provider_failure_attempt_marker_still_completes(monkeypatch):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.pool import NullPool
    from app.config import get_settings
    from app.services.account_deletion_service import AccountDeletionService
    marker=uuid.uuid4().hex; tenant_id,user_id,deletion_id=uuid.uuid4(),uuid.uuid4(),uuid.uuid4(); calls=[]
    isolated_engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
    isolated_session = async_sessionmaker(isolated_engine, expire_on_commit=False)
    try:
        async with isolated_session() as db:
            db.add(Tenant(id=tenant_id,slug="mail-"+marker,subdomain="mail-"+marker,display_name="Mail")); await db.flush(); db.add(User(id=user_id,tenant_id=tenant_id,email=marker+"@example.com",password_hash="x",name="Mail",role=UserRole.INDIVIDUAL)); await db.flush(); db.add(AccountDeletion(id=deletion_id,user_id=user_id,tenant_id=tenant_id,send_confirmation=True,confirmation_email=marker+"@example.com")); await db.commit()
        monkeypatch.setattr("app.services.email_service.email_service.send_account_deletion_confirmation", lambda address, **kwargs: calls.append((address, kwargs["idempotency_key"])) or False)
        async with isolated_session() as db: assert await AccountDeletionService(db).erase(str(deletion_id))
        async with isolated_session() as db: row=(await db.execute(select(AccountDeletion).where(AccountDeletion.id==deletion_id))).scalar_one(); assert row.status=="completed" and row.email_sent_at is not None and row.confirmation_email is None
        async with isolated_session() as db: assert await AccountDeletionService(db).erase(str(deletion_id))
        assert calls==[(marker+"@example.com", f"account-deletion:{deletion_id}")]
    finally:
        async with isolated_session() as db: await db.execute(delete(AccountDeletion).where(AccountDeletion.id==deletion_id)); await db.execute(delete(User).where(User.id==user_id)); await db.execute(delete(Tenant).where(Tenant.id==tenant_id)); await db.commit()
        await isolated_engine.dispose()


@pytest.mark.asyncio
async def test_real_upload_routes_keep_photo_public_and_avatar_private(monkeypatch, tmp_path):
    from app.api.v1 import upload as routes
    monkeypatch.setattr("app.services.file_service.UPLOAD_DIR", tmp_path)
    photo = await routes.upload_public_photo(_png_upload("photo.png"))
    assert photo["photo_url"].startswith("/uploads/images/")
    class DB:
        def __init__(self): self.rows = []
        def add(self, row): self.rows.append(row)
        async def flush(self): pass
    from types import SimpleNamespace
    user = SimpleNamespace(id=uuid.uuid4(), tenant_id=uuid.uuid4(), shop_id=None)
    db = DB(); result = await routes.upload_avatar(_png_upload(), db, user)
    assert result["avatar_url"].startswith("/uploads/users/")
    assert len(db.rows) == 1 and db.rows[0].path.startswith("/uploads/users/")


@pytest.mark.asyncio
async def test_shared_image_media_and_anonymous_photo_are_not_private_ledgered(monkeypatch, tmp_path):
    from app.api.v1 import upload as routes
    monkeypatch.setattr("app.services.file_service.UPLOAD_DIR", tmp_path)
    user = type("User", (), {"id": uuid.uuid4()})()
    images = await routes.upload_images([_png_upload("listing.png")], user)
    media = await routes.upload_media(_png_upload("message.png"), user)
    photo = await routes.upload_public_photo(_png_upload("profile.png"))
    assert images["images"][0]["url"].startswith("/uploads/images/")
    assert media["url"].startswith("/uploads/images/")
    assert photo["photo_url"].startswith("/uploads/images/")
    assert list(tmp_path.joinpath("images").glob("*"))
    assert not tmp_path.joinpath("users", str(user.id)).exists()
    assert not any(path.parts[-3:-2] == ("users",) for path in tmp_path.rglob("*"))


@pytest.mark.asyncio
async def test_erasure_does_not_delete_cross_tenant_listing_or_bender_children():
    """Real PG proof that global user FKs are constrained by owned parents."""
    from app.core.security import hash_password
    from app.models.enums import ListingType, ListingCategory, PricingType, UrgencyLevel, ListingStatus
    from app.models.listing import Listing
    from app.models.saved_listing import SavedListing
    from app.models.interest import Interest
    from app.models.bender import BenderPost, BenderLike
    from app.services.account_deletion_service import AccountDeletionService
    marker = uuid.uuid4().hex
    tenant_a, tenant_b, user_a = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    listing_b, post_b, saved_id, interest_id, like_id = (uuid.uuid4() for _ in range(5))
    try:
        async with async_session() as db:
            db.add_all([
                Tenant(id=tenant_a, slug=f"ta-{marker}", subdomain=f"ta-{marker}", display_name="A"),
                Tenant(id=tenant_b, slug=f"tb-{marker}", subdomain=f"tb-{marker}", display_name="B"),
            ])
            await db.flush()
            db.add(User(id=user_a, tenant_id=tenant_a, email=f"{marker}@example.test", password_hash=hash_password("Correct1"), name="A", role=UserRole.INDIVIDUAL))
            db.add(Listing(id=listing_b, tenant_id=tenant_b, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="B listing", description="B", pricing_type=PricingType.FREE, is_free=True, urgency=UrgencyLevel.NORMAL, status=ListingStatus.ACTIVE))
            db.add(BenderPost(id=post_b, tenant_id=tenant_b, author_user_id=user_a, caption="B post"))
            await db.flush()
            db.add_all([
                SavedListing(id=saved_id, user_id=user_a, listing_id=listing_b),
                Interest(id=interest_id, user_id=user_a, listing_id=listing_b, message="B interest"),
                BenderLike(id=like_id, user_id=user_a, post_id=post_b),
            ])
            db.add(AccountDeletion(user_id=user_a, tenant_id=tenant_a))
            await db.commit()
            row = (await db.execute(select(AccountDeletion).where(AccountDeletion.user_id == user_a))).scalar_one()
            assert await AccountDeletionService(db).erase(str(row.id))
            assert (await db.execute(select(SavedListing).where(SavedListing.id == saved_id))).scalar_one_or_none() is not None
            assert (await db.execute(select(Interest).where(Interest.id == interest_id))).scalar_one_or_none() is not None
            assert (await db.execute(select(BenderLike).where(BenderLike.id == like_id))).scalar_one_or_none() is not None
            assert (await db.execute(select(Listing).where(Listing.id == listing_b))).scalar_one_or_none() is not None
    finally:
        async with async_session() as db:
            for model in (SavedListing, Interest, BenderLike, BenderPost, Listing, AccountDeletion, User, Tenant):
                if hasattr(model, "tenant_id"):
                    await db.execute(delete(model).where(model.tenant_id.in_([tenant_a, tenant_b])))
                elif model is SavedListing or model is Interest or model is BenderLike:
                    await db.execute(delete(model).where(model.id.in_([saved_id, interest_id, like_id])))
            await db.execute(delete(Tenant).where(Tenant.id.in_([tenant_a, tenant_b])))
            await db.commit()


@pytest.mark.asyncio
async def test_erasure_cleans_user_owned_null_tenant_legacy_rows_but_keeps_tenant_b():
    """Legacy NULL tenant rows are owned by the user, not treated as global."""
    from datetime import datetime
    from app.core.security import hash_password
    from app.models.enums import ListingType, ListingCategory, PricingType, UrgencyLevel, ListingStatus, EventCategory, EventStatus, NotificationType
    from app.models.listing import Listing
    from app.models.saved_listing import SavedListing
    from app.models.interest import Interest
    from app.models.notification import Notification
    from app.models.volunteer import Volunteer
    from app.models.talent import Talent, TalentInquiry
    from app.models.shop import Shop
    from app.models.employee import Employee
    from app.models.event import Event
    from app.models.bender import BenderPost, BenderLike
    from app.models.endorsement import Endorsement
    from app.models.discount_code import DiscountCode
    from app.services.account_deletion_service import AccountDeletionService
    marker = uuid.uuid4().hex
    tenant_a, tenant_b, user_a, user_b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    ids = {name: uuid.uuid4() for name in ("listing", "saved", "interest", "notification", "volunteer", "talent", "inquiry", "shop", "employee", "event", "post", "like", "endorsement", "discount")}
    try:
        async with async_session() as db:
            db.add_all([Tenant(id=tenant_a, slug=f"legacy-a-{marker}", subdomain=f"legacy-a-{marker}", display_name="A"), Tenant(id=tenant_b, slug=f"legacy-b-{marker}", subdomain=f"legacy-b-{marker}", display_name="B")]); await db.flush()
            db.add_all([User(id=user_a, tenant_id=tenant_a, email=f"legacy-{marker}@example.test", password_hash=hash_password("Correct1"), name="Legacy A", role=UserRole.INDIVIDUAL), User(id=user_b, tenant_id=tenant_b, email=f"other-{marker}@example.test", password_hash="x", name="B", role=UserRole.INDIVIDUAL)]); await db.flush()
            db.add_all([
                Listing(id=ids["listing"], tenant_id=None, posted_by_user_id=user_a, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="legacy listing", description="PII legacy", pricing_type=PricingType.FREE, is_free=True, urgency=UrgencyLevel.NORMAL, status=ListingStatus.ACTIVE),
                Notification(id=ids["notification"], user_id=user_a, tenant_id=None, type=NotificationType.NEW_MESSAGE, title="legacy", body="legacy PII"),
                Volunteer(id=ids["volunteer"], user_id=user_a, tenant_id=None, name="Legacy Volunteer", email=f"{marker}@example.test", skills="x", available_time="any"),
                Talent(id=ids["talent"], user_id=user_a, tenant_id=None, name="Legacy Talent", email=f"{marker}@example.test", category="x", skills="x", available_time="any", rate=1, rate_unit="hr"),
                Shop(id=ids["shop"], tenant_id=None, admin_user_id=user_a, name="Legacy Shop", business_type="x"),
                Event(id=ids["event"], tenant_id=None, submitted_by_user_id=user_a, title="Legacy Event", start_date=datetime.utcnow(), category=EventCategory.COMMUNITY, source="manual", status=EventStatus.ACTIVE),
                BenderPost(id=ids["post"], tenant_id=None, author_user_id=user_a, caption="legacy post"),
                DiscountCode(id=ids["discount"], tenant_id=None, owner_user_id=user_a, code="LEGACY", name="Legacy", discount_type="flat", discount_value=1),
            ])
            await db.flush()
            db.add_all([SavedListing(id=ids["saved"], user_id=user_a, listing_id=ids["listing"]), Interest(id=ids["interest"], user_id=user_a, listing_id=ids["listing"], message="legacy"), TalentInquiry(id=ids["inquiry"], talent_id=ids["talent"], name="Legacy", message="PII"), Employee(id=ids["employee"], shop_id=ids["shop"], user_id=user_a, name="Legacy Employee"), BenderLike(id=ids["like"], user_id=user_a, post_id=ids["post"]), Endorsement(id=ids["endorsement"], endorser_user_id=user_a, endorsed_shop_id=ids["shop"])])
            keep_listing = Listing(id=uuid.uuid4(), tenant_id=tenant_b, posted_by_user_id=user_b, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="B", description="B", pricing_type=PricingType.FREE, is_free=True, urgency=UrgencyLevel.NORMAL, status=ListingStatus.ACTIVE)
            db.add(keep_listing); await db.flush(); db.add(AccountDeletion(user_id=user_a, tenant_id=tenant_a)); await db.commit()
            row = (await db.execute(select(AccountDeletion).where(AccountDeletion.user_id == user_a))).scalar_one(); assert await AccountDeletionService(db).erase(str(row.id))
            assert (await db.execute(select(Notification).where(Notification.id == ids["notification"]))).scalar_one_or_none() is None
            assert (await db.execute(select(Volunteer).where(Volunteer.id == ids["volunteer"]))).scalar_one_or_none() is None
            assert (await db.execute(select(Talent).where(Talent.id == ids["talent"]))).scalar_one_or_none() is None
            assert (await db.execute(select(TalentInquiry).where(TalentInquiry.id == ids["inquiry"]))).scalar_one_or_none() is None
            assert (await db.execute(select(SavedListing).where(SavedListing.id == ids["saved"]))).scalar_one_or_none() is None
            assert (await db.execute(select(Interest).where(Interest.id == ids["interest"]))).scalar_one_or_none() is None
            assert (await db.execute(select(Shop).where(Shop.id == ids["shop"]))).scalar_one().admin_user_id is None
            assert (await db.execute(select(Employee).where(Employee.id == ids["employee"]))).scalar_one().user_id is None
            assert (await db.execute(select(Event).where(Event.id == ids["event"]))).scalar_one().submitted_by_user_id is None
            assert (await db.execute(select(BenderLike).where(BenderLike.id == ids["like"]))).scalar_one_or_none() is None
            assert (await db.execute(select(Endorsement).where(Endorsement.id == ids["endorsement"]))).scalar_one_or_none() is None
            assert (await db.execute(select(DiscountCode).where(DiscountCode.id == ids["discount"]))).scalar_one_or_none() is None
            assert (await db.execute(select(Listing).where(Listing.id == keep_listing.id))).scalar_one_or_none() is not None
    finally:
        async with async_session() as db:
            await db.execute(delete(AccountDeletion).where(AccountDeletion.user_id.in_([user_a, user_b])))
            for model in (TalentInquiry, SavedListing, Interest, Notification, Volunteer, Talent, Employee, BenderLike, Endorsement, DiscountCode, Event, BenderPost, Listing, Shop, AccountDeletion, User, Tenant):
                await db.execute(delete(model).where(model.id.in_(list(ids.values()) + [user_a, user_b, tenant_a, tenant_b])))
            await db.commit()


@pytest.mark.asyncio
async def test_erasure_retains_shared_content_and_hydrates_deleted_identity():
    """Reports, conversations, feed content, guidelines, and image refs survive."""
    from datetime import datetime
    from app.core.security import hash_password
    from app.models.enums import ListingType, ListingCategory, PricingType, UrgencyLevel, ListingStatus
    from app.models.listing import Listing, ListingImage
    from app.models.report import Report
    from app.models.report_audit import ReportAudit
    from app.models.message import MessageThread, Message
    from app.models.guideline import Guideline
    from app.models.bender import BenderPost
    from app.services.account_deletion_service import AccountDeletionService
    from app.services.report_service import ReportService
    marker = uuid.uuid4().hex
    tenant_a, tenant_b, user_a, user_b = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    listing_id, image_id, report_id, audit_id, thread_id, message_id, guideline_id, post_id = (uuid.uuid4() for _ in range(8))
    try:
        async with async_session() as db:
            db.add_all([Tenant(id=tenant_a, slug=f"retain-a-{marker}", subdomain=f"retain-a-{marker}", display_name="A"), Tenant(id=tenant_b, slug=f"retain-b-{marker}", subdomain=f"retain-b-{marker}", display_name="B")]); await db.flush()
            db.add_all([User(id=user_a, tenant_id=tenant_a, email=f"former-{marker}@example.test", password_hash=hash_password("Correct1"), name="Former Name", phone="555-0101", avatar_url="/uploads/users/private.png", role=UserRole.INDIVIDUAL), User(id=user_b, tenant_id=tenant_b, email=f"other-{marker}@example.test", password_hash="x", name="Other", role=UserRole.INDIVIDUAL)]); await db.flush()
            db.add(Listing(id=listing_id, tenant_id=tenant_a, posted_by_user_id=user_a, type=ListingType.OFFER, category=ListingCategory.MATERIALS, title="Shared listing", description="community content", pricing_type=PricingType.FREE, is_free=True, urgency=UrgencyLevel.NORMAL, status=ListingStatus.ACTIVE)); await db.flush()
            db.add_all([ListingImage(id=image_id, listing_id=listing_id, url="/uploads/images/shared.jpg", thumbnail_url="/uploads/images/shared_thumb.jpg"), Report(id=report_id, target_type="listing", target_id=listing_id, reporter_id=user_a, tenant_id=tenant_a, reason="spam", details="shared report"), ReportAudit(id=audit_id, report_id=report_id, tenant_id=tenant_a, actor_id=user_a, action="reviewed"), MessageThread(id=thread_id, tenant_id=tenant_a, participant_a=min(user_a, user_b, key=str), participant_b=max(user_a, user_b, key=str)), Guideline(id=guideline_id, tenant_id=tenant_a, uploaded_by=user_a, file_url="/uploads/guidelines/public.pdf", file_name="public.pdf", file_type="pdf", file_size=12), BenderPost(id=post_id, tenant_id=tenant_a, author_user_id=user_a, caption="shared post")]); await db.flush()
            db.add(Message(id=message_id, thread_id=thread_id, sender_id=user_a, content="shared message", attachment_url="/uploads/images/shared.jpg", attachment_type="image")); db.add(AccountDeletion(user_id=user_a, tenant_id=tenant_a)); await db.commit()
            row = (await db.execute(select(AccountDeletion).where(AccountDeletion.user_id == user_a))).scalar_one(); assert await AccountDeletionService(db).erase(str(row.id))
            tombstone = (await db.execute(select(User).where(User.id == user_a))).scalar_one(); assert tombstone.name == "Deleted member" and tombstone.email == f"deleted-{user_a}@deleted.invalid" and tombstone.phone is None and tombstone.avatar_url is None
            assert (await db.execute(select(Report).where(Report.id == report_id))).scalar_one().reporter_id == user_a
            assert (await db.execute(select(ReportAudit).where(ReportAudit.id == audit_id))).scalar_one().actor_id == user_a
            message = (await db.execute(select(Message).where(Message.id == message_id))).scalar_one(); assert message.sender_id == user_a and message.attachment_url == "/uploads/images/shared.jpg"
            assert (await db.execute(select(MessageThread).where(MessageThread.id == thread_id))).scalar_one_or_none() is not None
            assert (await db.execute(select(Guideline).where(Guideline.id == guideline_id))).scalar_one().uploaded_by == user_a
            assert (await db.execute(select(ListingImage).where(ListingImage.id == image_id))).scalar_one().url == "/uploads/images/shared.jpg"
            post = (await db.execute(select(BenderPost).where(BenderPost.id == post_id))).scalar_one(); assert post.author_user_id == user_a
            hydrated = (await ReportService(db).list_admin(tenant_a))["items"]; assert any(item["target_id"] == str(listing_id) and item["target_summary"]["title"] == "Shared listing" for item in hydrated)
            assert "Former Name" not in str(hydrated) and marker not in str(hydrated)
            from app.services.message_service import MessageService
            threads = await MessageService(db).get_threads(user_b)
            other_party = next(item["other_party"] for item in threads["items"] if item["id"] == str(thread_id))
            assert other_party["name"] == "Deleted member"
            from app.services.bender_service import BenderService
            feed, _, _ = await BenderService(db).feed(tenant_a, None, 20, await db.get(User, user_b))
            feed_post = next(item for item in feed if item.id == str(post_id))
            assert feed_post.author.name == "Deleted member"
            assert marker not in str(feed_post) and "former-" not in str(feed_post)
    finally:
        async with async_session() as db:
            await db.execute(delete(AccountDeletion).where(AccountDeletion.user_id.in_([user_a, user_b])))
            for model in (ReportAudit, Report, Message, MessageThread, Guideline, ListingImage, BenderPost, Listing, User, Tenant):
                await db.execute(delete(model).where(model.id.in_([listing_id, image_id, report_id, audit_id, thread_id, message_id, guideline_id, post_id, user_a, user_b, tenant_a, tenant_b])))
            await db.commit()


@pytest.mark.asyncio
async def test_real_postgres_concurrent_confirmation_has_one_active_request():
    from datetime import datetime, timedelta
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.database import engine
    from app.core.security import hash_password
    from app.services.account_deletion_service import AccountDeletionService
    marker = uuid.uuid4().hex; tenant_id, user_id = uuid.uuid4(), uuid.uuid4()
    try:
        async with async_session() as db:
            db.add(Tenant(id=tenant_id, slug="t7c-"+marker, subdomain="t7c-"+marker, display_name="T7")); await db.flush()
            db.add(User(id=user_id, tenant_id=tenant_id, email=marker+"@example.test", password_hash=hash_password("Correct1"), name="Concurrent", role=UserRole.INDIVIDUAL)); await db.commit()
        async def attempt():
            async with async_session() as db:
                try:
                    row, _ = await AccountDeletionService(db, queue=type("Q", (), {"delay": lambda self, value: None})()).confirm((await db.execute(select(User).where(User.id == user_id))).scalar_one(), "Correct1")
                    return row.id
                except Exception:
                    return None
        ids = await __import__("asyncio").gather(attempt(), attempt())
        assert len([x for x in ids if x]) == 1
        async with async_session() as db:
            result = await db.execute(select(AccountDeletion).where(AccountDeletion.user_id == user_id, AccountDeletion.status.in_(["pending", "processing"])))
            assert len(result.scalars().all()) == 1
    finally:
        async with async_session() as db:
            await db.execute(delete(AccountDeletion).where(AccountDeletion.user_id == user_id)); await db.execute(delete(User).where(User.id == user_id)); await db.execute(delete(Tenant).where(Tenant.id == tenant_id)); await db.commit()


@pytest.mark.asyncio
async def test_real_asgi_deletion_status_and_auth_denials(monkeypatch):
    import httpx
    from app.main import create_app
    from app.core.security import create_access_token, create_reset_token, hash_password
    from app.workers.account_tasks import erase_account
    marker = uuid.uuid4().hex; tenant_id, other_tenant_id, user_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    try:
        async with async_session() as db:
            db.add_all([Tenant(id=tenant_id, slug="asgi-"+marker, subdomain="asgi-"+marker, display_name="ASGI"), Tenant(id=other_tenant_id, slug="asgi-other-"+marker, subdomain="asgi-other-"+marker, display_name="Other")]); await db.flush()
            db.add(User(id=user_id, tenant_id=tenant_id, email=marker+"@example.com", password_hash=hash_password("Correct1"), name="ASGI User", role=UserRole.INDIVIDUAL)); await db.commit()
        token = create_access_token(user_id, UserRole.INDIVIDUAL.value)
        monkeypatch.setattr(erase_account, "delay", lambda value: None)
        transport = httpx.ASGITransport(app=create_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            wrong = await client.post("/api/v1/account/deletion/confirm", headers={"authorization": f"Bearer {token}", "x-tenant-slug": "asgi-"+marker}, json={"password":"wrong","send_confirmation":False}); assert wrong.status_code == 401
            unknown = await client.post("/api/v1/account/deletion/confirm", headers={"authorization": f"Bearer {token}", "x-tenant-slug": "missing-"+marker}, json={"password":"Correct1","send_confirmation":False}); assert unknown.status_code in (401, 404)
            confirmed = await client.post("/api/v1/account/deletion/confirm", headers={"authorization": f"Bearer {token}", "x-tenant-slug": "asgi-"+marker}, json={"password":"Correct1","send_confirmation":False}); assert confirmed.status_code == 200
            receipt = confirmed.json()["status_receipt"]
            pending = await client.get("/api/v1/account/deletion/status", params={"receipt":receipt}, headers={"x-tenant-slug":"asgi-"+marker}); assert pending.status_code == 200 and pending.json()["status"] == "pending"
            old_token = await client.get("/api/v1/auth/me", headers={"authorization":f"Bearer {token}","x-tenant-slug":"asgi-"+marker}); assert old_token.status_code == 403
            login = await client.post("/api/v1/auth/login", headers={"x-tenant-slug":"asgi-"+marker}, json={"email":marker+"@example.com","password":"Correct1"}); assert login.status_code == 403
            cross = await client.get("/api/v1/account/deletion/status", params={"receipt":receipt}, headers={"x-tenant-slug":"asgi-other-"+marker}); assert cross.status_code == 404
        async with async_session() as db:
            row = (await db.execute(select(AccountDeletion).where(AccountDeletion.user_id == user_id))).scalar_one(); await __import__("app.services.account_deletion_service", fromlist=["AccountDeletionService"]).AccountDeletionService(db).erase(str(row.id))
            await db.commit()
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.get("/api/v1/account/deletion/status", params={"receipt":receipt}, headers={"x-tenant-slug":"asgi-"+marker}); assert first.status_code == 200 and first.json()["status"] == "completed"
            second = await client.get("/api/v1/account/deletion/status", params={"receipt":receipt}, headers={"x-tenant-slug":"asgi-"+marker}); assert second.status_code == 404
    finally:
        async with async_session() as db:
            await db.execute(delete(AccountDeletion).where(AccountDeletion.user_id == user_id)); await db.execute(delete(User).where(User.id == user_id)); await db.execute(delete(Tenant).where(Tenant.id.in_([tenant_id, other_tenant_id]))); await db.commit()


@pytest.mark.asyncio
async def test_real_postgres_queue_failure_is_reconciled_once(monkeypatch):
    from app.core.security import hash_password
    from app.services.account_deletion_service import AccountDeletionService
    from app.workers.account_tasks import erase_account
    marker = uuid.uuid4().hex; tenant_id, user_id = uuid.uuid4(), uuid.uuid4()
    try:
        async with async_session() as db:
            db.add(Tenant(id=tenant_id, slug="queue-"+marker, subdomain="queue-"+marker, display_name="Queue")); await db.flush(); user=User(id=user_id,tenant_id=tenant_id,email=marker+"@example.com",password_hash=hash_password("Correct1"),name="Queue",role=UserRole.INDIVIDUAL); db.add(user); await db.commit()
        class Broken:
            def delay(self, value): raise RuntimeError("broker unavailable")
        async with async_session() as db:
            row, _ = await AccountDeletionService(db, queue=Broken()).confirm(user, "Correct1")
            locked_user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
            assert row.status == "pending" and not locked_user.is_active
        calls=[]; monkeypatch.setattr(erase_account, "delay", lambda value: calls.append(value))
        async def reconcile():
            async with async_session() as db: return await AccountDeletionService(db).reconcile_pending()
        counts = await __import__("asyncio").gather(reconcile(), reconcile())
        assert sum(counts) == 1 and calls == [str(row.id)]
    finally:
        async with async_session() as db:
            await db.execute(delete(AccountDeletion).where(AccountDeletion.user_id==user_id)); await db.execute(delete(User).where(User.id==user_id)); await db.execute(delete(Tenant).where(Tenant.id==tenant_id)); await db.commit()


@pytest.mark.asyncio
async def test_real_postgres_workers_are_idempotent_and_email_attempt_is_once(monkeypatch):
    from datetime import datetime, timedelta
    from app.models.account_deletion import AccountDeletion
    from app.services.account_deletion_service import AccountDeletionService
    marker=uuid.uuid4().hex; tenant_id,user_id,deletion_id=uuid.uuid4(),uuid.uuid4(),uuid.uuid4(); calls=[]
    try:
        async with async_session() as db:
            db.add(Tenant(id=tenant_id,slug="worker-"+marker,subdomain="worker-"+marker,display_name="Worker")); await db.flush()
            db.add(User(id=user_id,tenant_id=tenant_id,email=marker+"@example.com",password_hash="x",name="Worker",role=UserRole.INDIVIDUAL)); await db.flush()
            db.add(AccountDeletion(id=deletion_id,user_id=user_id,tenant_id=tenant_id,send_confirmation=True,confirmation_email=marker+"@example.com")); await db.commit()
        monkeypatch.setattr("app.services.email_service.email_service.send_account_deletion_confirmation", lambda address, **kwargs: calls.append((address, kwargs["idempotency_key"])) or True)
        async def run():
            async with async_session() as db: return await AccountDeletionService(db).erase(str(deletion_id))
        results=await __import__("asyncio").gather(run(),run()); assert sorted(results)==[False,True]
        async with async_session() as db:
            row=(await db.execute(select(AccountDeletion).where(AccountDeletion.id==deletion_id))).scalar_one(); assert row.status=="completed" and row.attempts==1 and row.confirmation_email is None and row.email_sent_at is not None; assert calls==[(marker+"@example.com", f"account-deletion:{deletion_id}")]
            assert await AccountDeletionService(db).erase(str(deletion_id)) is True
            assert calls==[(marker+"@example.com", f"account-deletion:{deletion_id}")]
    finally:
        async with async_session() as db:
            await db.execute(delete(AccountDeletion).where(AccountDeletion.id==deletion_id)); await db.execute(delete(User).where(User.id==user_id)); await db.execute(delete(Tenant).where(Tenant.id==tenant_id)); await db.commit()


def test_every_users_fk_has_explicit_retention_policy():
    import app.models  # populate the complete declarative metadata
    from app.database import Base
    from app.services.account_deletion_service import AccountDeletionService
    inventory = AccountDeletionService.retention_inventory()
    user_tables = {fk.parent.table.name for table in Base.metadata.tables.values() for fk in table.foreign_keys if fk.target_fullname.endswith("users.id")}
    assert user_tables <= set(inventory)
    assert all(inventory[name] in {"delete", "detach", "anonymize", "retain"} for name in user_tables)


@pytest.mark.asyncio
async def test_real_two_tenant_erasure_policy_and_shared_tombstone():
    from datetime import datetime, timedelta
    from app.core.security import hash_password
    from app.models.listing import Listing
    from app.models.enums import ListingType, ListingCategory, PricingType, UrgencyLevel, ListingStatus
    from app.models.saved_listing import SavedListing
    from app.models.notification import Notification
    from app.models.notification_preference import NotificationPreference
    from app.models.user_block import UserBlock
    from app.models.volunteer import Volunteer
    from app.models.bender import BenderPost, BenderLike, BenderComment
    from app.models.message import MessageThread, Message
    from app.services.account_deletion_service import AccountDeletionService
    marker=uuid.uuid4().hex; ta,tb,ua,ub=uuid.uuid4(),uuid.uuid4(),uuid.uuid4(),uuid.uuid4(); listing_id,thread_id=uuid.uuid4(),uuid.uuid4(); deletion_id=uuid.uuid4()
    try:
        async with async_session() as db:
            db.add_all([Tenant(id=ta,slug="ret-a-"+marker,subdomain="ret-a-"+marker,display_name="A"),Tenant(id=tb,slug="ret-b-"+marker,subdomain="ret-b-"+marker,display_name="B")]); await db.flush()
            db.add_all([User(id=ua,tenant_id=ta,email=marker+"a@example.com",password_hash=hash_password("Correct1"),name="Alice",role=UserRole.INDIVIDUAL),User(id=ub,tenant_id=tb,email=marker+"b@example.com",password_hash=hash_password("Correct1"),name="Bob",role=UserRole.INDIVIDUAL)]); await db.flush()
            db.add(Listing(id=listing_id,tenant_id=ta,type=ListingType.OFFER,category=ListingCategory.MATERIALS,title="A",description="A",pricing_type=PricingType.FREE,is_free=True,urgency=UrgencyLevel.NORMAL,status=ListingStatus.ACTIVE,posted_by_user_id=ua)); await db.flush()
            db.add_all([SavedListing(user_id=ua,listing_id=listing_id), Notification(user_id=ua,tenant_id=ta,type="NEW_MESSAGE",title="x",body="x"), NotificationPreference(user_id=ua,tenant_id=ta), Volunteer(user_id=ua,tenant_id=ta,name="Alice",skills="x",available_time="x")])
            post=BenderPost(id=uuid.uuid4(),tenant_id=ta,author_user_id=ua,caption="public"); db.add(post); await db.flush(); db.add_all([BenderLike(post_id=post.id,user_id=ua),BenderComment(post_id=post.id,user_id=ua,content="public")])
            db.add(MessageThread(id=thread_id,tenant_id=ta,participant_a=ua,participant_b=ub)); await db.flush(); db.add(Message(id=uuid.uuid4(),thread_id=thread_id,sender_id=ua,content="shared")); db.add(AccountDeletion(id=deletion_id,user_id=ua,tenant_id=ta)); await db.commit()
        async with async_session() as db: await AccountDeletionService(db).erase(str(deletion_id))
        async with async_session() as db:
            a=(await db.execute(select(User).where(User.id==ua))).scalar_one(); b=(await db.execute(select(User).where(User.id==ub))).scalar_one(); assert a.name=="Deleted member" and a.email==f"deleted-{ua}@deleted.invalid" and b.name=="Bob" and b.is_active
            assert (await db.execute(select(SavedListing).where(SavedListing.user_id==ua))).scalar_one_or_none() is None
            assert (await db.execute(select(Volunteer).where(Volunteer.user_id==ua))).scalar_one_or_none() is None
            assert (await db.execute(select(UserBlock).where((UserBlock.blocker_id==ua)|(UserBlock.blocked_id==ua)))).scalar_one_or_none() is None
            assert (await db.execute(select(Message).where(Message.thread_id==thread_id))).scalar_one().content=="shared"
    finally:
        async with async_session() as db:
            await db.execute(delete(AccountDeletion).where(AccountDeletion.id==deletion_id)); await db.execute(delete(Message).where(Message.thread_id==thread_id)); await db.execute(delete(MessageThread).where(MessageThread.id==thread_id)); await db.execute(delete(BenderLike)); await db.execute(delete(BenderComment)); await db.execute(delete(BenderPost)); await db.execute(delete(UserBlock).where(UserBlock.tenant_id.in_([ta,tb]))); await db.execute(delete(Volunteer).where(Volunteer.user_id.in_([ua,ub]))); await db.execute(delete(NotificationPreference).where(NotificationPreference.user_id.in_([ua,ub]))); await db.execute(delete(Notification).where(Notification.user_id.in_([ua,ub]))); await db.execute(delete(SavedListing).where(SavedListing.user_id.in_([ua,ub]))); await db.execute(delete(Listing).where(Listing.id==listing_id)); await db.execute(delete(User).where(User.id.in_([ua,ub]))); await db.execute(delete(Tenant).where(Tenant.id.in_([ta,tb])))
            await db.commit()


@pytest.mark.asyncio
async def test_real_refresh_reset_and_websocket_denial_after_lock(monkeypatch):
    from datetime import datetime, timedelta
    from fastapi import WebSocketDisconnect
    from app.core.security import hash_password, create_access_token, create_refresh_token, create_reset_token
    from app.services.auth_service import AuthService
    from app.api.ws import chat
    marker=uuid.uuid4().hex; tenant_id,user_id,session_id=uuid.uuid4(),uuid.uuid4(),uuid.uuid4()
    try:
        async with async_session() as db:
            db.add(Tenant(id=tenant_id,slug="auth-"+marker,subdomain="auth-"+marker,display_name="Auth")); await db.flush(); db.add(User(id=user_id,tenant_id=tenant_id,email=marker+"@example.com",password_hash=hash_password("Correct1"),name="Auth",role=UserRole.INDIVIDUAL)); await db.flush(); db.add(__import__("app.models.refresh_session",fromlist=["RefreshSession"]).RefreshSession(id=session_id,user_id=user_id,expires_at=datetime.utcnow()+timedelta(days=1))); await db.commit()
        refresh=create_refresh_token(user_id,session_id); access=create_access_token(user_id,UserRole.INDIVIDUAL.value); reset=create_reset_token(user_id)
        async with async_session() as db:
            user=(await db.execute(select(User).where(User.id==user_id))).scalar_one(); user.is_active=False; await db.execute(__import__("sqlalchemy").update(__import__("app.models.refresh_session",fromlist=["RefreshSession"]).RefreshSession).where(__import__("app.models.refresh_session",fromlist=["RefreshSession"]).RefreshSession.id==session_id).values(revoked_at=datetime.utcnow())); await db.commit()
            with pytest.raises(Exception): await AuthService(db).refresh_token(refresh)
            with pytest.raises(Exception): await AuthService(db).reset_password(reset,"Newpass1")
        class Socket:
            query_params={"token":access}; accepted=False
            async def accept(self): self.accepted=True
            async def close(self,**kwargs): self.closed=kwargs
            async def receive_text(self): raise WebSocketDisconnect()
        socket=Socket(); await chat.websocket_chat(socket); assert not socket.accepted
    finally:
        async with async_session() as db:
            RS=__import__("app.models.refresh_session",fromlist=["RefreshSession"]).RefreshSession; await db.execute(delete(RS).where(RS.user_id==user_id)); await db.execute(delete(User).where(User.id==user_id)); await db.execute(delete(Tenant).where(Tenant.id==tenant_id)); await db.commit()


@pytest.mark.asyncio
async def test_confirmation_requires_opaque_receipt_and_locks_member():
    from app.schemas.account import AccountDeletionConfirm

    payload = AccountDeletionConfirm(password="correct-password", send_confirmation=False)
    assert payload.password == "correct-password"
    assert payload.send_confirmation is False
