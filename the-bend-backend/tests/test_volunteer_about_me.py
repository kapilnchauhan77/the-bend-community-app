import importlib.util
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.deps import get_db
from app.api.v1.volunteers import _serialize_volunteer, get_service, router
from app.core.permissions import get_current_tenant, get_current_user, get_current_user_optional
from app.schemas.volunteer import VolunteerCreate, VolunteerUpdate
from app.services.volunteer_service import VolunteerService


def _app(*, user=None):
    app = FastAPI()
    app.include_router(router)

    async def no_db():
        yield None

    app.dependency_overrides[get_db] = no_db
    app.dependency_overrides[get_current_tenant] = lambda: None
    app.dependency_overrides[get_current_user_optional] = lambda: user
    app.dependency_overrides[get_current_user] = lambda: user
    return app


def _payload(about_me):
    return {
        "name": "Alex Volunteer",
        "phone": "555-0100",
        "skills": "Gardening, a legacy sentence with commas, too",
        "available_time": "Weekends",
        "about_me": about_me,
    }


def test_about_me_is_trimmed_and_capped_in_create_and_update_schema():
    assert VolunteerCreate(**_payload("  helps neighbours  ")).about_me == "helps neighbours"
    assert VolunteerUpdate(about_me="  knows the town  ").about_me == "knows the town"
    assert VolunteerUpdate(about_me="   ").about_me is None
    with pytest.raises(ValidationError):
        VolunteerCreate(**_payload("x" * 2001))
    with pytest.raises(ValidationError):
        VolunteerUpdate(about_me="x" * 2001)


@pytest.mark.parametrize("user", [None, SimpleNamespace(id=uuid4())], ids=["anonymous", "authenticated"])
def test_post_over_limit_returns_422_for_both_manual_validation_paths(user):
    response = TestClient(_app(user=user)).post("/volunteers", json=_payload("x" * 2001))
    assert response.status_code == 422


def test_put_over_limit_returns_422_before_route_execution():
    response = TestClient(_app(user=SimpleNamespace(id=uuid4()))).put(
        f"/volunteers/{uuid4()}", json={"about_me": "x" * 2001}
    )
    assert response.status_code == 422


def test_shared_serializer_and_list_shape_include_about_me():
    row = SimpleNamespace(
        id=uuid4(), name="Alex", phone=None, email=None, skills="Gardening",
        about_me="I help locally.", available_time="Weekends", photo_url=None,
        user_id=None, created_at=datetime(2026, 1, 1),
    )
    result = _serialize_volunteer(row, is_authed=False)
    assert result["about_me"] == "I help locally."


def test_list_route_includes_about_me_in_its_duplicate_mapping():
    row = SimpleNamespace(id=uuid4(), name="Alex", phone=None, email=None, skills="Gardening", about_me="I help", available_time="Weekends", photo_url=None, user_id=None, created_at=datetime(2026, 1, 1))
    class Service:
        tenant_id = None
        async def list_volunteers(self, cursor, limit):
            return SimpleNamespace(items=[row], next_cursor=None, has_more=False)
    app = _app()
    app.dependency_overrides[get_service] = lambda: Service()
    response = TestClient(app).get("/volunteers")
    assert response.status_code == 200
    assert response.json()["items"][0]["about_me"] == "I help"


def test_authenticated_post_returns_persisted_about_me_from_real_route():
    user = SimpleNamespace(id=uuid4())
    class Result:
        def scalar_one_or_none(self):
            return None
    class DB:
        def __init__(self): self.row = None
        async def execute(self, _query): return Result()
        def add(self, row): self.row = row
        async def flush(self): return None
        async def refresh(self, _row): return None
    db = DB()
    app = _app(user=user)
    async def db_override():
        yield db
    app.dependency_overrides[get_db] = db_override
    response = TestClient(app).post("/volunteers", json={**_payload("About me"), "phone": None})
    assert response.status_code == 200
    assert response.json()["about_me"] == "About me"
    assert db.row.about_me == "About me"


@pytest.mark.asyncio
async def test_service_persists_about_me_through_existing_repository_boundary(monkeypatch):
    captured = {}

    class Repo:
        async def create(self, values):
            captured.update(values)
            return SimpleNamespace(**values)

    monkeypatch.setattr("app.services.volunteer_service.VolunteerRepository", lambda _db: Repo())
    result = await VolunteerService(None).enroll(VolunteerCreate(**_payload("  About me  ")))
    assert captured["about_me"] == "About me"
    assert result.about_me == "About me"


def test_about_me_migration_adds_nullable_text_and_drops_it(monkeypatch):
    path = Path(__file__).parents[1] / "alembic/versions/add_volunteer_about_me.py"
    spec = importlib.util.spec_from_file_location("add_volunteer_about_me", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    calls = []
    monkeypatch.setattr(migration.op, "add_column", lambda *args: calls.append(("add", args)))
    monkeypatch.setattr(migration.op, "drop_column", lambda *args: calls.append(("drop", args)))
    migration.upgrade()
    migration.downgrade()
    assert migration.down_revision == "event_submitted_notification"
    assert calls[0][0] == "add"
    assert calls[0][1][0] == "volunteers"
    column = calls[0][1][1]
    assert column.name == "about_me"
    assert column.nullable is True
    assert column.type.__class__.__name__ == "Text"
    assert calls[1] == ("drop", ("volunteers", "about_me"))
