"""Tests for the sponsor paid/approval notification helper.

Locks in the fix for: a paid sponsor never appeared in the admin "Pending
Approval" queue and no admin was ever notified. The helper must flip paid,
notify every community admin in the sponsor's tenant, and be idempotent so the
Stripe webhook and the success-page verification can't double-notify.
"""
import types
import uuid

import pytest

import app.services.notification_service as notif_module
from app.api.v1.advertising import _mark_paid_and_notify
from app.models.enums import NotificationType


class _FakeResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return self._items


class _FakeDB:
    """Minimal async DB stub: returns the given admins from any execute()."""
    def __init__(self, admins):
        self._admins = admins
        self.flushed = False

    async def execute(self, _query):
        return _FakeResult(self._admins)

    async def flush(self):
        self.flushed = True


class _RecordingNotifier:
    """Stands in for NotificationService, recording every notify() call."""
    instances = []

    def __init__(self, db):
        self.calls = []
        _RecordingNotifier.instances.append(self)

    async def notify(self, **kwargs):
        self.calls.append(kwargs)


def _sponsor(paid=False, tenant_id=None):
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        name="Acme Co",
        placement="homepage",
        paid=paid,
        starts_at=None,
        expires_at=None,
        tenant_id=tenant_id or uuid.uuid4(),
    )


def _admins(n):
    return [types.SimpleNamespace(id=uuid.uuid4()) for _ in range(n)]


@pytest.fixture(autouse=True)
def _patch_notifier(monkeypatch):
    _RecordingNotifier.instances = []
    monkeypatch.setattr(notif_module, "NotificationService", _RecordingNotifier)


@pytest.mark.asyncio
async def test_marks_paid_and_notifies_each_admin():
    sponsor = _sponsor(paid=False)
    db = _FakeDB(_admins(2))
    pricing = types.SimpleNamespace(duration_days=30)

    changed = await _mark_paid_and_notify(db, sponsor, pricing)

    assert changed is True
    assert sponsor.paid is True
    assert sponsor.starts_at is not None and sponsor.expires_at is not None
    notifier = _RecordingNotifier.instances[-1]
    assert len(notifier.calls) == 2  # one per admin
    call = notifier.calls[0]
    assert call["type"] == NotificationType.REGISTRATION_SUBMITTED
    assert call["data"]["sponsor_id"] == str(sponsor.id)
    assert "Acme Co" in call["body"]


@pytest.mark.asyncio
async def test_idempotent_when_already_paid():
    sponsor = _sponsor(paid=True)
    db = _FakeDB(_admins(3))

    changed = await _mark_paid_and_notify(db, sponsor)

    assert changed is False
    # No NotificationService should have been constructed/used at all.
    assert all(len(n.calls) == 0 for n in _RecordingNotifier.instances)


@pytest.mark.asyncio
async def test_no_admins_still_marks_paid():
    sponsor = _sponsor(paid=False)
    db = _FakeDB([])

    changed = await _mark_paid_and_notify(db, sponsor)

    assert changed is True
    assert sponsor.paid is True
