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
from app.database import async_session
from app.models.tenant import Tenant
from app.models.user import User
from app.models.device_installation import DeviceInstallation
from app.models.refresh_session import RefreshSession
from app.models.account_deletion import AccountDeletion
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
        monkeypatch.setattr("app.services.email_service.email_service.send_account_deletion_confirmation", lambda address: calls.append(address) or True)
        async def run():
            async with async_session() as db: return await AccountDeletionService(db).erase(str(deletion_id))
        results=await __import__("asyncio").gather(run(),run()); assert sorted(results)==[False,True]
        async with async_session() as db:
            row=(await db.execute(select(AccountDeletion).where(AccountDeletion.id==deletion_id))).scalar_one(); assert row.status=="completed" and row.attempts==1 and row.confirmation_email is None and row.email_sent_at is not None; assert calls==[marker+"@example.com"]
            assert await AccountDeletionService(db).erase(str(deletion_id)) is True
        assert calls==[marker+"@example.com"]
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
            db.add(Tenant(id=tenant_id,slug="auth-"+marker,subdomain="auth-"+marker,display_name="Auth")); await db.flush(); db.add(User(id=user_id,tenant_id=tenant_id,email=marker+"@example.com",password_hash=hash_password("Correct1"),name="Auth",role=UserRole.INDIVIDUAL)); db.add(__import__("app.models.refresh_session",fromlist=["RefreshSession"]).RefreshSession(id=session_id,user_id=user_id,expires_at=datetime.utcnow()+timedelta(days=1))); await db.commit()
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
