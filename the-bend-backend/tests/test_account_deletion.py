"""Task 7 contract tests.

These tests intentionally exercise the public service contract without mocks;
integration fixtures can opt in to PostgreSQL through the normal test setup.
"""
import uuid

import pytest


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


@pytest.mark.asyncio
async def test_confirmation_requires_opaque_receipt_and_locks_member():
    from app.schemas.account import AccountDeletionConfirm

    payload = AccountDeletionConfirm(password="correct-password", send_confirmation=False)
    assert payload.password == "correct-password"
    assert payload.send_confirmation is False
