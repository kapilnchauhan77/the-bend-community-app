import types
import uuid

import pytest
from sqlalchemy.dialects import postgresql

from app.api.v1.router import community_stats
from app.models.enums import UserRole


class _CountResult:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value


class _RecordingDB:
    def __init__(self, counts):
        self._counts = iter(counts)
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return _CountResult(next(self._counts))


@pytest.mark.asyncio
async def test_community_stats_counts_only_active_individuals_in_current_tenant():
    tenant_id = uuid.uuid4()
    db = _RecordingDB([31, 25, 1, 42])
    request = types.SimpleNamespace(
        state=types.SimpleNamespace(tenant=types.SimpleNamespace(id=tenant_id))
    )

    result = await community_stats(db=db, request=request)

    assert result == {
        "active_shops": 31,
        "active_listings": 25,
        "items_shared": 1,
        "active_individuals": 42,
    }
    individual_query = db.statements[3].compile(dialect=postgresql.dialect())
    assert "users.role =" in str(individual_query)
    assert "users.is_active IS true" in str(individual_query)
    assert set(individual_query.params.values()) == {UserRole.INDIVIDUAL, tenant_id}
