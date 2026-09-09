import importlib.util
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.v1.volunteers import _serialize_volunteer
from app.schemas.volunteer import VolunteerCreate, VolunteerUpdate


def _row(*, owner_id=None, show_phone=False, show_email=False, tenant_id=None):
    return SimpleNamespace(
        id=uuid4(),
        name="Alex",
        phone="555-0100",
        email="alex@example.com",
        show_phone=show_phone,
        show_email=show_email,
        skills="Gardening",
        about_me=None,
        available_time="Weekends",
        photo_url=None,
        user_id=owner_id,
        tenant_id=tenant_id or uuid4(),
        created_at=datetime(2026, 1, 1),
    )


def test_private_contacts_are_absent_for_anonymous_viewers():
    result = _serialize_volunteer(_row(), viewer=None)
    assert result["phone"] is None
    assert result["email"] is None


def test_public_viewers_receive_only_independently_enabled_fields():
    result = _serialize_volunteer(_row(show_phone=True), viewer=None)
    assert result["phone"] == "555-0100"
    assert result["email"] is None


def test_owner_receives_both_full_contacts_even_when_private():
    owner_id = uuid4()
    result = _serialize_volunteer(_row(owner_id=owner_id), viewer=SimpleNamespace(id=owner_id))
    assert result["phone"] == "555-0100"
    assert result["email"] == "alex@example.com"


def test_linked_non_owner_receives_only_opted_in_contacts():
    result = _serialize_volunteer(_row(owner_id=uuid4(), show_email=True), viewer=SimpleNamespace(id=uuid4()))
    assert result["phone"] is None
    assert result["email"] == "alex@example.com"


def test_serializer_never_returns_masked_actionable_contact_values():
    result = _serialize_volunteer(_row(), viewer=None)
    assert result["phone"] is None
    assert result["email"] is None
    assert "555-" not in str(result)
    assert "alex@example.com" not in str(result)


def test_contact_consent_defaults_false_and_is_persistable_in_schemas():
    create = VolunteerCreate(
        name="Alex", phone="555-0100", skills="Gardening", available_time="Weekends"
    )
    update = VolunteerUpdate(show_phone=True, show_email=True)
    assert create.show_phone is False
    assert create.show_email is False
    assert update.show_phone is True
    assert update.show_email is True


@pytest.mark.asyncio
async def test_service_persists_contact_consent_flags(monkeypatch):
    captured = {}

    class Repo:
        async def create(self, values):
            captured.update(values)
            return SimpleNamespace(**values)

    monkeypatch.setattr("app.services.volunteer_service.VolunteerRepository", lambda _db: Repo())
    from app.services.volunteer_service import VolunteerService
    data = VolunteerCreate(
        name="Alex", phone="555-0100", email="alex@example.com", skills="Gardening",
        available_time="Weekends", show_phone=True, show_email=False,
    )
    await VolunteerService(None).enroll(data)
    assert captured["show_phone"] is True
    assert captured["show_email"] is False


def test_anonymous_create_requires_an_enabled_contact():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.deps import get_db
    from app.api.v1.volunteers import router
    from app.core.permissions import get_current_tenant, get_current_user_optional
    app = FastAPI()
    app.include_router(router)
    async def no_db():
        yield None
    app.dependency_overrides[get_db] = no_db
    app.dependency_overrides[get_current_tenant] = lambda: None
    app.dependency_overrides[get_current_user_optional] = lambda: None
    response = TestClient(app).post("/volunteers", json={
        "name": "Alex", "phone": "555-0100", "email": "alex@example.com",
        "skills": "Gardening", "available_time": "Weekends",
        "show_phone": False, "show_email": False,
    })
    assert response.status_code == 422
    assert response.json()["detail"] == "At least one contact field must be public"


@pytest.mark.parametrize("payload", [
    {"show_phone": True, "phone": None, "show_email": False, "email": None},
    {"show_phone": True, "phone": "   ", "show_email": False, "email": None},
    {"show_phone": False, "phone": None, "show_email": True, "email": "   "},
])
def test_anonymous_create_requires_reachable_enabled_contact(payload):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.deps import get_db
    from app.api.v1.volunteers import router
    from app.core.permissions import get_current_tenant, get_current_user_optional
    app = FastAPI()
    app.include_router(router)
    async def no_db():
        yield None
    app.dependency_overrides[get_db] = no_db
    app.dependency_overrides[get_current_tenant] = lambda: None
    app.dependency_overrides[get_current_user_optional] = lambda: None
    response = TestClient(app).post("/volunteers", json={
        "name": "Alex", "phone": payload["phone"], "email": payload["email"],
        "skills": "Gardening", "available_time": "Weekends", **payload,
    })
    assert response.status_code == 422


def test_update_rejects_explicit_null_consent_and_omitted_flags_are_unchanged():
    with pytest.raises(ValueError):
        VolunteerUpdate(show_phone=None)
    assert "show_phone" not in VolunteerUpdate(name="Updated").model_dump(exclude_unset=True)
    assert "show_email" not in VolunteerUpdate(name="Updated").model_dump(exclude_unset=True)


def test_idempotent_create_returns_full_contacts_to_actual_owner():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.deps import get_db
    from app.api.v1.volunteers import get_service, router
    from app.core.permissions import get_current_tenant, get_current_user, get_current_user_optional
    owner_id = uuid4()
    owner = SimpleNamespace(id=owner_id)
    existing = _row(owner_id=owner_id, show_phone=False, show_email=False)
    class Result:
        def scalar_one_or_none(self):
            return existing
    class DB:
        async def execute(self, _query): return Result()
    app = FastAPI()
    app.include_router(router)
    async def no_db():
        yield DB()
    app.dependency_overrides[get_db] = no_db
    app.dependency_overrides[get_current_tenant] = lambda: None
    app.dependency_overrides[get_current_user_optional] = lambda: owner
    app.dependency_overrides[get_current_user] = lambda: owner
    response = TestClient(app).post("/volunteers", json={
        "name": "Alex", "skills": "Gardening", "available_time": "Weekends",
    })
    assert response.status_code == 200
    assert response.json()["phone"] == "555-0100"
    assert response.json()["email"] == "alex@example.com"


def test_admin_update_response_does_not_reveal_private_contacts():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.deps import get_db
    from app.api.v1.volunteers import router
    from app.core.permissions import get_current_tenant, get_current_user
    from app.models.enums import UserRole
    tenant_id = uuid4()
    row = _row(owner_id=uuid4(), tenant_id=tenant_id)
    admin = SimpleNamespace(id=uuid4(), role=UserRole.COMMUNITY_ADMIN)
    class Result:
        def scalar_one_or_none(self): return row
    class DB:
        async def execute(self, _query): return Result()
        async def flush(self): return None
        async def refresh(self, _row): return None
    app = FastAPI()
    app.include_router(router)
    async def db_override(): yield DB()
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_tenant] = lambda: SimpleNamespace(id=tenant_id)
    app.dependency_overrides[get_current_user] = lambda: admin
    response = TestClient(app).put(f"/volunteers/{row.id}", json={"name": "Edited"})
    assert response.status_code == 200
    assert response.json()["phone"] is None
    assert response.json()["email"] is None


def test_admin_cannot_enable_private_contact_visibility():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.deps import get_db
    from app.api.v1.volunteers import router
    from app.core.permissions import get_current_tenant, get_current_user
    from app.models.enums import UserRole
    tenant_id = uuid4()
    row = _row(owner_id=uuid4(), tenant_id=tenant_id)
    admin = SimpleNamespace(id=uuid4(), role=UserRole.COMMUNITY_ADMIN)
    class Result:
        def scalar_one_or_none(self): return row
    class DB:
        async def execute(self, _query): return Result()
        async def flush(self): return None
        async def refresh(self, _row): return None
    app = FastAPI()
    app.include_router(router)
    async def db_override(): yield DB()
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_tenant] = lambda: SimpleNamespace(id=tenant_id)
    app.dependency_overrides[get_current_user] = lambda: admin
    response = TestClient(app).put(f"/volunteers/{row.id}", json={"show_phone": True})
    assert response.status_code == 403
    assert row.show_phone is False
    assert row.show_email is False


def test_migration_adds_non_null_false_server_default_columns(monkeypatch):
    versions = Path(__file__).parents[1] / "alembic/versions"
    path = next(versions.glob("*volunteer_contact_privacy.py"))
    spec = importlib.util.spec_from_file_location("volunteer_contact_privacy", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    calls = []
    monkeypatch.setattr(migration.op, "add_column", lambda *args: calls.append(args))
    monkeypatch.setattr(migration.op, "drop_column", lambda *args: calls.append(("drop", *args)))
    migration.upgrade()
    migration.downgrade()
    assert migration.down_revision == "add_volunteer_about_me"
    assert calls[0][0] == "volunteers"
    assert calls[0][1].nullable is False
    assert str(calls[0][1].server_default.arg) == "false"
    assert calls[1][1].nullable is False
    assert calls[2] == ("drop", "volunteers", "show_email")
    assert calls[3] == ("drop", "volunteers", "show_phone")
