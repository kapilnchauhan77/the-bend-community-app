from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from jose import jwt

from app.config import get_settings
from app.core.exceptions import UnauthorizedError
from app.core.security import REFRESH_TOKEN_TYPE
from app.models.enums import UserRole
from app.services import auth_service as auth_module
from app.services.auth_service import AuthService


MISSING = object()


class FakeSession:
    def __init__(self):
        self.refresh_sessions = {}
        self.added = []

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        for value in self.added:
            if value.__class__.__name__ == "RefreshSession":
                self.refresh_sessions[value.id] = value
        self.added.clear()

    async def get(self, model, key):
        return self.refresh_sessions.get(key)


class FakeUserRepository:
    def __init__(self, session):
        self.user = None

    async def get_by_email(self, email):
        return self.user if self.user and self.user.email == email else None

    async def get_by_id(self, user_id):
        return self.user if self.user and self.user.id == user_id else None

    async def update_last_login(self, user_id):
        self.user.last_login_at = datetime.utcnow()


class FakeShopRepository:
    def __init__(self, session):
        pass

    async def get_by_id(self, shop_id):
        return None


@pytest.fixture
def active_user():
    return SimpleNamespace(
        id=uuid4(),
        email="active@example.com",
        password_hash="test-password-hash",
        is_active=True,
        role=UserRole.INDIVIDUAL,
        shop_id=None,
        name="Active User",
        avatar_url=None,
    )


@pytest.fixture
def service(monkeypatch, active_user):
    db = FakeSession()
    users = FakeUserRepository(db)
    users.user = active_user
    monkeypatch.setattr(auth_module, "UserRepository", lambda _: users)
    monkeypatch.setattr(auth_module, "ShopRepository", FakeShopRepository)
    monkeypatch.setattr(auth_module, "verify_password", lambda plain, hashed: plain == "correct-password")
    return AuthService(db), db, active_user


@pytest.mark.asyncio
async def test_login_persists_one_refresh_session_and_claims_sid(service):
    auth, db, user = service

    tokens = await auth.login(user.email, "correct-password")

    assert len(db.refresh_sessions) == 1
    session = next(iter(db.refresh_sessions.values()))
    payload = jwt.get_unverified_claims(tokens.refresh_token)
    assert payload["sid"] == str(session.id)
    assert payload["sub"] == str(user.id)
    assert payload["type"] == REFRESH_TOKEN_TYPE


@pytest.mark.asyncio
async def test_refresh_accepts_active_owned_session_and_updates_last_used(service):
    auth, db, user = service
    tokens = await auth.login(user.email, "correct-password")
    session = next(iter(db.refresh_sessions.values()))

    response = await auth.refresh_token(tokens.refresh_token)

    assert response["token_type"] == "bearer"
    assert response["access_token"]
    assert session.last_used_at is not None


@pytest.mark.asyncio
async def test_refresh_token_can_be_reused_for_compatible_session_protocol(service):
    auth, db, user = service
    tokens = await auth.login(user.email, "correct-password")
    session = next(iter(db.refresh_sessions.values()))

    await auth.refresh_token(tokens.refresh_token)
    first_last_used = session.last_used_at
    await auth.refresh_token(tokens.refresh_token)

    assert session.revoked_at is None
    assert session.last_used_at >= first_last_used


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["missing", "wrong-owner", "revoked", "expired"])
async def test_refresh_rejects_invalid_session_state(service, case):
    auth, db, user = service
    tokens = await auth.login(user.email, "correct-password")
    session = next(iter(db.refresh_sessions.values()))
    if case == "missing":
        db.refresh_sessions.clear()
    elif case == "wrong-owner":
        session.user_id = uuid4()
    elif case == "revoked":
        session.revoked_at = datetime.utcnow()
    else:
        session.expires_at = datetime.utcnow() - timedelta(seconds=1)

    with pytest.raises(UnauthorizedError):
        await auth.refresh_token(tokens.refresh_token)


@pytest.mark.asyncio
async def test_refresh_rejects_malformed_claims_and_missing_sid(service):
    auth, _, user = service
    settings = get_settings()
    for claims in (
        {"sub": str(user.id), "type": REFRESH_TOKEN_TYPE},
        {"sub": "not-a-uuid", "sid": str(uuid4()), "type": REFRESH_TOKEN_TYPE},
        {"sub": str(user.id), "sid": "not-a-uuid", "type": REFRESH_TOKEN_TYPE},
        {"sub": str(user.id), "sid": str(uuid4()), "type": "access"},
    ):
        token = jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm="HS256")
        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(token)


@pytest.mark.asyncio
@pytest.mark.parametrize("claim_value", [123, True, [], {}, None, MISSING, "not-a-uuid"])
@pytest.mark.parametrize("claim_name", ["sub", "sid"])
async def test_refresh_rejects_non_string_or_malformed_claims(service, claim_name, claim_value):
    auth, _, user = service
    settings = get_settings()
    claims = {
        "sub": str(user.id),
        "sid": str(uuid4()),
        "type": REFRESH_TOKEN_TYPE,
    }
    if claim_value is MISSING:
        claims.pop(claim_name)
    else:
        claims[claim_name] = claim_value
    token = jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm="HS256")

    with pytest.raises(UnauthorizedError):
        await auth.refresh_token(token)


@pytest.mark.asyncio
@pytest.mark.parametrize("claim_value", [123, True, [], {}, None, MISSING, "not-a-uuid"])
@pytest.mark.parametrize("claim_name", ["sub", "sid"])
async def test_logout_ignores_non_string_or_malformed_claims_without_mutation(
    service, claim_name, claim_value
):
    auth, db, user = service
    tokens = await auth.login(user.email, "correct-password")
    session = next(iter(db.refresh_sessions.values()))
    settings = get_settings()
    claims = jwt.get_unverified_claims(tokens.refresh_token)
    if claim_value is MISSING:
        claims.pop(claim_name)
    else:
        claims[claim_name] = claim_value
    token = jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm="HS256")

    assert await auth.logout(token) is None
    assert session.revoked_at is None


@pytest.mark.asyncio
async def test_logout_is_idempotent_and_does_not_disclose_session_existence(service):
    auth, db, user = service
    tokens = await auth.login(user.email, "correct-password")
    session = next(iter(db.refresh_sessions.values()))

    assert await auth.logout(tokens.refresh_token) is None
    first_revocation = session.revoked_at
    assert first_revocation is not None
    assert await auth.logout(tokens.refresh_token) is None
    assert session.revoked_at == first_revocation
    assert await auth.logout("malformed") is None


def test_logout_request_and_refresh_response_shapes_remain_compatible():
    from app.schemas.auth import LogoutRequest, RefreshResponse

    assert LogoutRequest(refresh_token="token").refresh_token == "token"
    assert RefreshResponse(access_token="token").model_dump() == {
        "access_token": "token",
        "token_type": "bearer",
    }


@pytest.mark.asyncio
async def test_logout_route_accepts_body_and_returns_generic_success_response():
    from app.api.v1.auth import logout as logout_route
    from app.schemas.auth import LogoutRequest

    class RecordingService:
        def __init__(self):
            self.received = None

        async def logout(self, refresh_token):
            self.received = refresh_token

    service = RecordingService()
    response = await logout_route(LogoutRequest(refresh_token="refresh-token"), service=service)

    assert service.received == "refresh-token"
    assert response == {"message": "Logged out successfully"}


@pytest.mark.asyncio
async def test_refresh_route_preserves_access_only_response_shape():
    from app.api.v1.auth import refresh_token as refresh_route
    from app.schemas.auth import RefreshRequest

    class RecordingService:
        def __init__(self):
            self.received = None

        async def refresh_token(self, refresh_token):
            self.received = refresh_token
            return {"access_token": "access-token", "token_type": "bearer"}

    service = RecordingService()
    response = await refresh_route(RefreshRequest(refresh_token="refresh-token"), service=service)

    assert service.received == "refresh-token"
    assert response == {"access_token": "access-token", "token_type": "bearer"}
