import types
import uuid

import pytest

import app.services.auth_service as auth_module
from app.core.exceptions import ForbiddenError
from app.models.enums import ShopStatus, UserRole
from app.services.admin_service import AdminService
from app.services.auth_service import AuthService


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _ListResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return self

    def all(self):
        return self._values


class _CountResult:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value


class _FakeDB:
    def __init__(self, shop):
        self.shop = shop
        self.flushed = False

    async def execute(self, _query):
        return _Result(self.shop)

    async def flush(self):
        self.flushed = True


class _ShopListDB:
    def __init__(self, shop):
        self.results = iter([_ListResult([shop]), _Result(None), _CountResult(0)])

    async def execute(self, _query):
        return next(self.results)


class _UserRepo:
    def __init__(self, user):
        self.user = user
        self.updated_last_login = False

    async def get_by_email(self, _email):
        return self.user

    async def update_last_login(self, _user_id):
        self.updated_last_login = True


class _ShopRepo:
    def __init__(self, shop):
        self.shop = shop

    async def get_by_id(self, _shop_id):
        return self.shop


@pytest.mark.asyncio
async def test_reject_registration_stores_rejected_status():
    shop = types.SimpleNamespace(
        id=uuid.uuid4(),
        name="Example Business",
        status=ShopStatus.PENDING,
        rejection_reason=None,
        admin_user_id=None,
    )
    db = _FakeDB(shop)

    await AdminService(db).reject_registration(shop.id, "Outside the service area")

    assert shop.status.value == "rejected"
    assert shop.rejection_reason == "Outside the service area"
    assert db.flushed is True


@pytest.mark.asyncio
async def test_approve_registration_clears_previous_rejection():
    shop = types.SimpleNamespace(
        id=uuid.uuid4(),
        name="Example Business",
        status=ShopStatus.REJECTED,
        rejection_reason="Address could not be verified",
        admin_user_id=None,
    )
    db = _FakeDB(shop)

    await AdminService(db).approve_registration(shop.id)

    assert shop.status == ShopStatus.ACTIVE
    assert shop.rejection_reason is None
    assert db.flushed is True


@pytest.mark.asyncio
async def test_businesses_list_reports_rejected_status():
    shop = types.SimpleNamespace(
        id=uuid.uuid4(),
        name="Example Business",
        business_type="Professional_services",
        status=ShopStatus.REJECTED,
        created_at="2026-08-27",
        admin_user_id=uuid.uuid4(),
        address="1 Main Street",
        contact_phone=None,
    )

    result = await AdminService(_ShopListDB(shop)).get_shops()

    assert result["items"][0]["status"] == "rejected"


@pytest.mark.asyncio
async def test_rejected_business_login_reports_rejection(monkeypatch):
    shop_id = uuid.uuid4()
    user = types.SimpleNamespace(
        id=uuid.uuid4(),
        email="owner@example.com",
        password_hash="hash",
        name="Owner",
        avatar_url=None,
        is_active=True,
        role=UserRole.SHOP_ADMIN,
        shop_id=shop_id,
    )
    shop = types.SimpleNamespace(
        id=shop_id,
        name="Example Business",
        status=ShopStatus.REJECTED,
        avatar_url=None,
    )
    service = AuthService(types.SimpleNamespace())
    service.user_repo = _UserRepo(user)
    service.shop_repo = _ShopRepo(shop)
    monkeypatch.setattr(auth_module, "verify_password", lambda *_args: True)

    with pytest.raises(ForbiddenError, match="registration was not approved"):
        await service.login(user.email, "password")

    assert service.user_repo.updated_last_login is False
