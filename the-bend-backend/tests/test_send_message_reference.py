import types
from uuid import uuid4

import pytest
from pydantic import ValidationError
from app.schemas.message import SendMessageRequest
from app.services.message_service import MessageService
from app.core.exceptions import ValidationError as AppValidationError
from app.api.v1.messages import send_message
import app.services.message_service as _ms


def test_reference_only_is_valid():
    r = SendMessageRequest(reference_type="listing", reference_id="1a2b")
    assert r.reference_type == "listing"


def test_empty_message_rejected():
    with pytest.raises(ValidationError):
        SendMessageRequest()


def test_attachment_plus_reference_rejected():
    with pytest.raises(ValidationError):
        SendMessageRequest(attachment_url="/u/a.jpg", attachment_type="image",
                           reference_type="listing", reference_id="1a2b")


def test_reference_requires_both_fields():
    with pytest.raises(ValidationError):
        SendMessageRequest(reference_type="listing")  # missing id


class _FakeThread:
    def __init__(self, tenant_id=None):
        self.tenant_id = tenant_id


class _FakeMessageRepo:
    """Minimal stand-in for MessageRepository — only the two methods
    send_message touches before it ever reaches resolve_reference/create_message."""

    async def is_participant(self, thread_id, user_id):
        return True

    async def get_thread_by_id(self, thread_id):
        return _FakeThread()


async def test_malformed_reference_id_raises_app_validation_error_not_value_error():
    """A non-UUID reference_id must surface as the app's 400-mapped
    ValidationError, not a bare ValueError (which FastAPI would turn into an
    unhandled 500)."""
    service = MessageService(db=None)
    service.message_repo = _FakeMessageRepo()

    with pytest.raises(AppValidationError):
        await service.send_message(
            thread_id=uuid4(),
            sender_id=uuid4(),
            content=None,
            reference_type="listing",
            reference_id="not-a-uuid",
        )


class _FakeThreadWithTenant:
    def __init__(self, tenant_id=None):
        self.tenant_id = tenant_id


class _FakeMessage:
    """Minimal stand-in for the Message model attributes the send_message
    ROUTE handler reads when assembling its response dict."""

    def __init__(self, reference_type=None, reference_id=None):
        self.id = uuid4()
        self.thread_id = uuid4()
        self.sender_id = uuid4()
        self.content = ""
        self.created_at = "2024-01-01T00:00:00"
        self.attachment_url = None
        self.attachment_type = None
        self.attachment_thumbnail_url = None
        self.reference_type = reference_type
        self.reference_id = reference_id


class _FakeRepoForRoute:
    def __init__(self, thread):
        self._thread = thread

    async def get_thread_by_id(self, thread_id):
        return self._thread


class _FakeServiceForRoute:
    """Stand-in for MessageService used to exercise the send_message ROUTE
    handler's response shape directly, without needing a real DB session."""

    def __init__(self, msg, thread):
        self.db = object()
        self.message_repo = _FakeRepoForRoute(thread)
        self._msg = msg

    async def send_message(self, *args, **kwargs):
        return self._msg


async def test_send_route_response_includes_hydrated_reference(monkeypatch):
    """Regression test for the review finding: POST /messages/threads/{id}
    must return the just-sent message WITH a hydrated `reference` card —
    same shape as GET /messages/threads/{id} — otherwise the sender's own
    reference card disappears from the chat until reload.

    Fails against the pre-fix route: the old handler never added a
    `reference` key to the returned dict at all, so `result["reference"]`
    raised KeyError.
    """
    shop_id = uuid4()
    msg = _FakeMessage(reference_type="shop", reference_id=shop_id)
    thread = _FakeThreadWithTenant(tenant_id=None)
    service = _FakeServiceForRoute(msg, thread)
    current_user = types.SimpleNamespace(id=uuid4(), tenant_id=uuid4())
    data = SendMessageRequest(reference_type="shop", reference_id=str(shop_id))

    async def fake_resolve_reference(db, tenant_id, reference_type, reference_id):
        return {"type": "shop", "id": str(reference_id), "title": "Test Shop"}

    monkeypatch.setattr(
        "app.services.reference_service.resolve_reference",
        fake_resolve_reference,
    )

    result = await send_message(
        thread_id=uuid4(),
        data=data,
        service=service,
        current_user=current_user,
    )

    assert "reference" in result
    assert result["reference"] == {"type": "shop", "id": str(shop_id), "title": "Test Shop"}


async def test_send_route_response_reference_is_explicit_none_without_reference():
    """A plain text send (no reference) must still return an explicit
    `reference: None` key so the frontend response shape matches GET."""
    msg = _FakeMessage(reference_type=None, reference_id=None)
    thread = _FakeThreadWithTenant(tenant_id=None)
    service = _FakeServiceForRoute(msg, thread)
    current_user = types.SimpleNamespace(id=uuid4(), tenant_id=uuid4())
    data = SendMessageRequest(content="hello")

    result = await send_message(
        thread_id=uuid4(),
        data=data,
        service=service,
        current_user=current_user,
    )

    assert "reference" in result
    assert result["reference"] is None


# --- Regression: reference must resolve against the CALLER's tenant, not the
#     thread's tenant_id (which is NULL on legacy/direct threads). ---
import types
import uuid
import pytest
from app.services import message_service as _ms
from app.services import reference_service as _rs


@pytest.mark.asyncio
async def test_send_resolves_reference_against_caller_tenant_not_thread(monkeypatch):
    caller_tenant = uuid.uuid4()
    ref_id = uuid.uuid4()
    captured = {}

    class _Thread:
        tenant_id = None  # the bug condition: legacy/direct thread
        participant_a = uuid.uuid4()
        participant_b = uuid.uuid4()

    class _Repo:
        async def is_participant(self, t, u):
            return True

        async def get_thread_by_id(self, t):
            return _Thread()

        async def create_message(self, thread_id, sender_id, body, **kw):
            return types.SimpleNamespace(
                id=uuid.uuid4(), thread_id=thread_id, sender_id=sender_id,
                content=body, created_at="now", read_at=None,
                attachment_url=None, attachment_type=None, attachment_thumbnail_url=None,
                reference_type=kw.get("reference_type"), reference_id=kw.get("reference_id"),
            )

    async def _fake_resolve(db, tenant_id, rtype, rid):
        captured["tenant_id"] = tenant_id
        # Only the caller's tenant can see the listing; thread tenant (None) cannot.
        return {"type": "listing", "id": str(rid)} if tenant_id == caller_tenant else None

    monkeypatch.setattr(_rs, "resolve_reference", _fake_resolve)
    async def _fake_notify(self, **kwargs):
        return types.SimpleNamespace(id=uuid4())
    monkeypatch.setattr(_ms.NotificationService, "notify", _fake_notify)

    svc = _ms.MessageService(db=object())
    svc.message_repo = _Repo()

    # Must NOT raise (would raise ValidationError if resolved against thread tenant None).
    msg = await svc.send_message(
        uuid.uuid4(), uuid.uuid4(), "hi",
        reference_type="listing", reference_id=str(ref_id),
        caller_tenant_id=caller_tenant,
    )
    assert captured["tenant_id"] == caller_tenant  # not None (thread tenant)
    assert msg.reference_type == "listing"
