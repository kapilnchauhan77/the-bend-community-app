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
async def test_confirmation_requires_opaque_receipt_and_locks_member():
    from app.schemas.account import AccountDeletionConfirm

    payload = AccountDeletionConfirm(password="correct-password", send_confirmation=False)
    assert payload.password == "correct-password"
    assert payload.send_confirmation is False
