from uuid import uuid4

import pytest

from app import seed


class _SeedSession:
    def __init__(self):
        self.added = []

    async def execute(self, _statement):
        return None

    async def flush(self):
        return None

    def add_all(self, sponsors):
        self.added.extend(sponsors)

    async def commit(self):
        return None


class _SeedSessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, _exc_type, _exc, _traceback):
        return False


@pytest.mark.asyncio
async def test_seed_prioritizes_proline_and_retires_provoke_in_every_placement(monkeypatch):
    session = _SeedSession()
    monkeypatch.setattr(seed, "async_session", lambda: _SeedSessionContext(session))
    monkeypatch.setattr(seed, "_default_tenant_id", uuid4())

    await seed.seed_sponsors()

    assert all(sponsor.name != "Provoke" for sponsor in session.added)

    proline = [sponsor for sponsor in session.added if sponsor.name == "ProLine Group"]
    assert {sponsor.placement for sponsor in proline} == {
        "homepage",
        "browse",
        "events",
        "footer",
    }
    assert all(sponsor.is_active for sponsor in proline)
    assert all(sponsor.sort_order == -100 for sponsor in proline)
