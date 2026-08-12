import pytest
from pydantic import ValidationError
from app.schemas.message import SendMessageRequest


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
