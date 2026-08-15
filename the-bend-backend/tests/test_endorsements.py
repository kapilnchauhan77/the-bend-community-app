import types
import uuid

import pytest

from app.api.v1.shops import EndorseRequest, endorse_shop, withdraw_endorsement
from app.core.exceptions import ForbiddenError, ValidationError


class _Result:
    def __init__(self, obj):
        self._obj = obj

    def scalar_one_or_none(self):
        return self._obj


class _FakeDB:
    def __init__(self, target=None, existing=None):
        self.target = target
        self.existing = existing
        self.added = None
        self.committed = False

    async def get(self, _model, _object_id):
        return self.target

    async def execute(self, _query):
        return _Result(self.existing)

    def add(self, obj):
        self.added = obj

    async def delete(self, _obj):
        pass

    async def commit(self):
        self.committed = True


@pytest.mark.asyncio
async def test_endorse_requires_a_business_account():
    user = types.SimpleNamespace(shop_id=None)

    with pytest.raises(ForbiddenError) as exc_info:
        await endorse_shop(uuid.uuid4(), EndorseRequest(), _FakeDB(), user)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"]["message"] == "You must have a business to endorse others"


@pytest.mark.asyncio
async def test_business_cannot_endorse_itself():
    shop_id = uuid.uuid4()
    user = types.SimpleNamespace(shop_id=shop_id)

    with pytest.raises(ValidationError) as exc_info:
        await endorse_shop(shop_id, EndorseRequest(), _FakeDB(), user)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["error"]["message"] == "You cannot endorse your own business"


@pytest.mark.asyncio
async def test_business_can_endorse_another_business():
    endorser_shop_id = uuid.uuid4()
    endorsed_shop_id = uuid.uuid4()
    user = types.SimpleNamespace(shop_id=endorser_shop_id)
    db = _FakeDB(target=types.SimpleNamespace(id=endorsed_shop_id))

    result = await endorse_shop(
        endorsed_shop_id,
        EndorseRequest(message="Great community partner"),
        db,
        user,
    )

    assert result["status"] == "endorsed"
    assert result["id"]
    assert db.committed is True
    assert db.added.endorser_shop_id == endorser_shop_id
    assert db.added.endorsed_shop_id == endorsed_shop_id
    assert db.added.message == "Great community partner"


@pytest.mark.asyncio
async def test_withdraw_requires_a_business_account():
    user = types.SimpleNamespace(shop_id=None)

    with pytest.raises(ForbiddenError) as exc_info:
        await withdraw_endorsement(uuid.uuid4(), _FakeDB(), user)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"]["message"] == "You must have a business"
