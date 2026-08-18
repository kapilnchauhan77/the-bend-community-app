import types
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.api.v1.advertising import AdOrderRequest, create_checkout


class _Result:
    def scalar_one_or_none(self):
        return None


class _RecordingDB:
    def __init__(self):
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _Result()


def _bound_values(statement):
    compiled = statement.compile(dialect=postgresql.dialect())
    return set(compiled.params.values())


@pytest.mark.asyncio
async def test_checkout_rejects_inactive_or_other_tenant_pricing():
    pricing_id = uuid.uuid4()
    tenant_id = uuid.uuid4()
    db = _RecordingDB()
    tenant = types.SimpleNamespace(id=tenant_id)
    request = AdOrderRequest(
        pricing_id=str(pricing_id),
        name="Westmoreland Sponsor",
        contact_email="sponsor@example.com",
        contact_name="Sponsor Contact",
    )

    with pytest.raises(HTTPException) as exc_info:
        await create_checkout(request, db, tenant)

    assert exc_info.value.status_code == 404
    assert _bound_values(db.statement) == {pricing_id, tenant_id}
    assert "ad_pricing.is_active = true" in str(
        db.statement.compile(dialect=postgresql.dialect())
    )
