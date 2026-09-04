"""Business signup emails use the saved registration and cannot block signup."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.api.v1.auth import register
from app.core.exceptions import ConflictError
from app.schemas.auth import RegisterRequest
from app.services.auth_service import AuthService
from app.services.email_service import email_service


@pytest.fixture
def signup(monkeypatch):
    events = []
    deliveries = []
    db = AsyncMock()

    async def commit():
        events.append("commit")

    db.commit.side_effect = commit
    db.execute.return_value = SimpleNamespace(
        scalars=lambda: SimpleNamespace(all=lambda: [])
    )
    service = AuthService(db)
    service.user_repo.get_by_email = AsyncMock(return_value=None)
    service.user_repo.create = AsyncMock(side_effect=lambda values: SimpleNamespace(**values))
    service.shop_repo.create = AsyncMock(side_effect=lambda values: SimpleNamespace(**values))
    monkeypatch.setattr("app.services.auth_service.hash_password", lambda value: "test-hash")
    monkeypatch.setattr(email_service, "resend_api_key", "test-only")
    monkeypatch.setattr(email_service, "sendgrid_api_key", "")
    monkeypatch.setattr(email_service, "from_email", "support@bend.community")
    monkeypatch.setattr(email_service, "from_name", "The Bend Community")

    def post(url, **kwargs):
        events.append("email")
        deliveries.append(kwargs["json"])
        return httpx.Response(200, json={"id": "test-message"})

    monkeypatch.setattr(httpx, "post", post)
    data = RegisterRequest(
        shop_name="Example Business", business_type="Professional_services",
        owner_name="Example Owner", email="owner@example.com",
        password="Testpassword123", guidelines_accepted=True,
    )
    return SimpleNamespace(
        service=service, db=db, events=events, deliveries=deliveries, data=data,
    )


@pytest.mark.asyncio
async def test_business_signup_sends_confirmation_after_commit(signup):
    result = await register(signup.data, signup.service, None)

    assert result["message"] == "Registration submitted for review"
    assert result["shop_id"]
    assert signup.events == ["commit", "email"]
    assert len(signup.deliveries) == 1
    message = signup.deliveries[0]
    assert message["from"] == "The Bend Community <support@bend.community>"
    assert message["to"] == ["owner@example.com"]
    assert message["subject"] == "Registration Received — The Bend"
    assert "<strong>Example Business</strong>" in message["html"]
    assert "review your application" in message["html"]


@pytest.mark.asyncio
async def test_commit_failure_never_sends_confirmation(signup):
    signup.db.commit.side_effect = RuntimeError("database unavailable")

    with pytest.raises(RuntimeError, match="database unavailable"):
        await register(signup.data, signup.service, None)

    assert signup.deliveries == []


@pytest.mark.asyncio
async def test_duplicate_signup_never_sends_confirmation(signup):
    signup.service.user_repo.get_by_email.return_value = SimpleNamespace(id="existing")

    with pytest.raises(ConflictError):
        await register(signup.data, signup.service, None)

    assert signup.events == []
    assert signup.deliveries == []


@pytest.mark.asyncio
async def test_individual_signup_does_not_receive_business_review_email(signup):
    signup.data.user_type = "individual"

    result = await register(signup.data, signup.service, None)

    assert result["message"] == "Registration successful"
    assert signup.deliveries == []


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["rejected", "timeout", "unexpected"])
async def test_email_failure_keeps_registration_successful(signup, monkeypatch, caplog, failure):
    def post(*args, **kwargs):
        if failure == "timeout":
            raise httpx.TimeoutException("mail unavailable")
        return httpx.Response(503, text="mail unavailable")

    monkeypatch.setattr(httpx, "post", post)
    if failure == "unexpected":
        def fail(*args):
            raise RuntimeError("unexpected mail error")
        monkeypatch.setattr(email_service, "send_registration_confirmation", fail)

    result = await register(signup.data, signup.service, None)

    assert result["message"] == "Registration submitted for review"
    assert signup.events == ["commit"]
    assert "Registration confirmation email failed" in caplog.text


@pytest.mark.asyncio
async def test_business_name_is_text_not_email_markup(signup):
    signup.data.shop_name = 'Shop <img src="https://example.com/tracker"> & Co'

    await register(signup.data, signup.service, None)

    assert len(signup.deliveries) == 1
    body = signup.deliveries[0]["html"]
    assert "<img" not in body
    assert "&lt;img" in body
    assert "&amp; Co" in body
