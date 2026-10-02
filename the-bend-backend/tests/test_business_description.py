import types
import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import Text

from app.api.v1.shops import get_shop
from app.models.enums import ShopStatus
from app.models.shop import Shop
from app.schemas.auth import RegisterRequest
from app.schemas.shop import ShopResponse, ShopUpdateRequest
from app.services.auth_service import AuthService
from app.services.shop_service import ShopService


class _ScalarRows:
    def __init__(self, rows=()):
        self.rows = list(rows)

    def all(self):
        return self.rows


class _EmptyQueryResult:
    def scalars(self):
        return _ScalarRows()

    def scalar_one_or_none(self):
        return None

    def scalar_one(self):
        return 0


class _RegistrationDB:
    async def flush(self):
        return None

    async def execute(self, _statement):
        return _EmptyQueryResult()


class _UserRepo:
    async def get_by_email(self, _email):
        return None

    async def create(self, values):
        return types.SimpleNamespace(id=values["id"])


class _ShopRepo:
    def __init__(self):
        self.values = None

    async def create(self, values):
        self.values = values
        return types.SimpleNamespace(id=values["id"])


class _UpdateShopRepo:
    def __init__(self, shop):
        self.shop = shop
        self.values = None

    async def get_by_id(self, _shop_id):
        return self.shop

    async def update(self, _shop_id, values):
        self.values = values
        return self.shop


def test_shop_description_is_optional_text_column():
    column = Shop.__table__.c.description

    assert isinstance(column.type, Text)
    assert column.nullable is True


@pytest.mark.asyncio
async def test_registration_persists_shop_description_up_to_1000_chars():
    description = "A" * 1000
    data = RegisterRequest(
        shop_name="Corner Shop",
        business_type="Retail",
        owner_name="Shop Owner",
        email="owner@example.com",
        phone="555-0100",
        password="Password1",
        guidelines_accepted=True,
        description=description,
    )
    service = AuthService(_RegistrationDB())
    service.user_repo = _UserRepo()
    shop_repo = _ShopRepo()
    service.shop_repo = shop_repo

    await service.register(data)

    assert shop_repo.values["description"] == description


def test_registration_description_rejects_1001_chars():
    with pytest.raises(ValidationError):
        RegisterRequest(
            shop_name="Corner Shop",
            business_type="Retail",
            owner_name="Shop Owner",
            email="owner@example.com",
            password="Password1",
            guidelines_accepted=True,
            description="A" * 1001,
        )


def test_shop_update_description_accepts_1000_and_rejects_1001_chars():
    description = "D" * 1000

    assert ShopUpdateRequest(description=description).description == description

    with pytest.raises(ValidationError):
        ShopUpdateRequest(description=description + "D")


@pytest.mark.asyncio
@pytest.mark.parametrize("description", ["Updated neighborhood services.", None])
async def test_shop_update_persists_description_text_and_explicit_null(description):
    shop_id = uuid.uuid4()
    user_id = uuid.uuid4()
    shop = types.SimpleNamespace(admin_user_id=user_id)
    current_user = types.SimpleNamespace(
        id=user_id,
        role=types.SimpleNamespace(value="shop_admin"),
    )
    service = ShopService(_RegistrationDB())
    shop_repo = _UpdateShopRepo(shop)
    service.shop_repo = shop_repo

    await service.update_shop(shop_id, {"description": description}, current_user)

    assert shop_repo.values == {"description": description}


@pytest.mark.asyncio
async def test_public_shop_detail_exposes_description():
    shop_id = uuid.uuid4()
    description = "Locally owned goods and services."
    shop = types.SimpleNamespace(
        id=shop_id,
        name="Corner Shop",
        business_type="Retail",
        address=None,
        latitude=None,
        longitude=None,
        contact_phone="555-0100",
        whatsapp=None,
        status=ShopStatus.ACTIVE,
        avatar_url=None,
        description=description,
        created_at="2026-08-18T00:00:00",
    )

    class _ShopService:
        async def get_shop(self, _shop_id):
            return {"shop": shop, "active_listings_count": 0, "total_fulfilled": 0}

    result = await get_shop(shop_id, _ShopService(), None, _RegistrationDB())

    assert result["description"] == description


def test_existing_shop_without_description_remains_valid():
    shop = types.SimpleNamespace(
        id=uuid.uuid4(),
        name="Legacy Shop",
        business_type="Retail",
        address=None,
        latitude=None,
        longitude=None,
        contact_phone="555-0100",
        whatsapp=None,
        status=ShopStatus.ACTIVE,
        active_listings_count=0,
        total_fulfilled=0,
        member_since=None,
        description=None,
    )

    response = ShopResponse.model_validate(shop)

    assert response.description is None
