from uuid import uuid4

import pytest
from pydantic import ValidationError
from app.schemas.message import SendMessageRequest
from app.services.message_service import MessageService
from app.core.exceptions import ValidationError as AppValidationError


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
