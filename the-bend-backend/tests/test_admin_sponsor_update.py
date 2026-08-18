import types
import uuid

import pytest
from sqlalchemy.dialects import postgresql

from app.api.v1.admin import admin_update_sponsor
from app.core.exceptions import NotFoundError
from app.schemas.sponsor import SponsorUpdate


class _Result:
    def __init__(self, sponsor):
        self.sponsor = sponsor

    def scalar_one_or_none(self):
        return self.sponsor


class _RecordingDB:
    def __init__(self, sponsor):
        self.sponsor = sponsor
        self.statement = None
        self.flushed = False

    async def execute(self, statement):
        self.statement = statement
        return _Result(self.sponsor)

    async def flush(self):
        self.flushed = True


def _bound_values(statement):
    compiled = statement.compile(dialect=postgresql.dialect())
    return set(compiled.params.values())


@pytest.mark.asyncio
async def test_admin_update_sponsor_scopes_lookup_to_admin_tenant():
    sponsor_id = uuid.uuid4()
    tenant_id = uuid.uuid4()
    sponsor = types.SimpleNamespace(id=sponsor_id, name="Old name")
    db = _RecordingDB(sponsor)
    admin = types.SimpleNamespace(tenant_id=tenant_id)

    result = await admin_update_sponsor(
        sponsor_id,
        SponsorUpdate(name="New name"),
        db,
        admin,
    )

    assert _bound_values(db.statement) == {sponsor_id, tenant_id}
    assert sponsor.name == "New name"
    assert db.flushed is True
    assert result == {"id": str(sponsor_id), "status": "updated"}


@pytest.mark.asyncio
async def test_admin_update_sponsor_preserves_global_lookup_for_no_tenant_admin():
    sponsor_id = uuid.uuid4()
    sponsor = types.SimpleNamespace(id=sponsor_id, name="Old name")
    db = _RecordingDB(sponsor)
    super_admin = types.SimpleNamespace(tenant_id=None)

    await admin_update_sponsor(
        sponsor_id,
        SponsorUpdate(name="New name"),
        db,
        super_admin,
    )

    assert _bound_values(db.statement) == {sponsor_id}


@pytest.mark.asyncio
async def test_admin_update_sponsor_returns_not_found_for_another_tenant():
    sponsor_id = uuid.uuid4()
    tenant_id = uuid.uuid4()
    db = _RecordingDB(sponsor=None)
    admin = types.SimpleNamespace(tenant_id=tenant_id)

    with pytest.raises(NotFoundError):
        await admin_update_sponsor(
            sponsor_id,
            SponsorUpdate(name="New name"),
            db,
            admin,
        )

    assert _bound_values(db.statement) == {sponsor_id, tenant_id}
    assert db.flushed is False
