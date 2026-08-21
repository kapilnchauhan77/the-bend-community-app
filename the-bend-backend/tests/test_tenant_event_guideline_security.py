"""Tenant boundaries for public events and community guidelines."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
import stripe
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import get_db
from app.api.v1.upload import router as upload_router
from app.core.exceptions import AppException, NotFoundError
from app.core.permissions import get_current_tenant, get_current_user
from app.core.security import create_access_token
from app.database import async_session, engine
from app.main import create_app
from app.models.enums import EventCategory, EventStatus, UserRole
from app.models.event import Event
from app.models.guideline import Guideline
from app.models.tenant import Tenant
from app.models.user import User
from app.services.event_service import EventService


class _GuidelineUploads:
    def __init__(self):
        self.calls = 0

    async def upload_guidelines(self, file):
        self.calls += 1
        return {
            "file_url": f"/uploads/guidelines/upload-{self.calls}.pdf",
            "file_name": file.filename or "guidelines.pdf",
            "file_type": "pdf",
            "file_size": 17,
        }


@pytest_asyncio.fixture
async def tenant_boundary_rows():
    await engine.dispose()
    marker = uuid4().hex
    names = (
        "tenant_a",
        "tenant_b",
        "admin_a",
        "admin_b",
        "west_admin",
        "super_admin",
        "event_a",
        "event_b",
        "event_westmoreland",
        "guideline_a",
        "guideline_b",
        "guideline_legacy",
    )
    ids = {name: uuid4() for name in names}
    slugs = {
        "tenant_a_slug": f"security-a-{marker}",
        "tenant_b_slug": f"security-b-{marker}",
    }

    async with async_session() as db:
        existing_westmoreland = (
            await db.execute(select(Tenant).where(Tenant.slug == "westmoreland"))
        ).scalar_one_or_none()
        westmoreland_id = existing_westmoreland.id if existing_westmoreland else uuid4()
        if existing_westmoreland is None:
            await db.execute(
                insert(Tenant)
                .values(
                    id=westmoreland_id,
                    slug="westmoreland",
                    subdomain="westmoreland.bend.community",
                    display_name="Westmoreland",
                    is_active=True,
                )
                .on_conflict_do_nothing(index_elements=[Tenant.slug])
            )
            await db.flush()
            westmoreland_id = (
                await db.execute(select(Tenant.id).where(Tenant.slug == "westmoreland"))
            ).scalar_one()

        ids["westmoreland"] = westmoreland_id
        ids["created_westmoreland"] = existing_westmoreland is None
        db.add_all(
            [
                Tenant(
                    id=ids["tenant_a"],
                    slug=slugs["tenant_a_slug"],
                    subdomain=slugs["tenant_a_slug"],
                    display_name="Security tenant A",
                    stripe_webhook_secret="whsec_tenant_boundary",
                ),
                Tenant(
                    id=ids["tenant_b"],
                    slug=slugs["tenant_b_slug"],
                    subdomain=slugs["tenant_b_slug"],
                    display_name="Security tenant B",
                ),
            ]
        )
        await db.flush()
        db.add_all(
            [
                User(
                    id=ids["admin_a"],
                    tenant_id=ids["tenant_a"],
                    email=f"security-admin-a-{marker}@example.test",
                    password_hash="x",
                    name="Tenant A admin",
                    role=UserRole.COMMUNITY_ADMIN,
                ),
                User(
                    id=ids["admin_b"],
                    tenant_id=ids["tenant_b"],
                    email=f"security-admin-b-{marker}@example.test",
                    password_hash="x",
                    name="Tenant B admin",
                    role=UserRole.COMMUNITY_ADMIN,
                ),
                User(
                    id=ids["west_admin"],
                    tenant_id=ids["westmoreland"],
                    email=f"security-west-admin-{marker}@example.test",
                    password_hash="x",
                    name="Westmoreland admin",
                    role=UserRole.COMMUNITY_ADMIN,
                ),
                User(
                    id=ids["super_admin"],
                    tenant_id=None,
                    email=f"security-super-admin-{marker}@example.test",
                    password_hash="x",
                    name="Platform admin",
                    role=UserRole.SUPER_ADMIN,
                ),
            ]
        )
        await db.flush()

        future = datetime.utcnow() + timedelta(days=30)
        db.add_all(
            [
                Event(
                    id=ids["event_a"],
                    tenant_id=ids["tenant_a"],
                    title=f"Tenant A event {marker}",
                    start_date=future,
                    category=EventCategory.COMMUNITY,
                    status=EventStatus.ACTIVE,
                    source="manual",
                ),
                Event(
                    id=ids["event_b"],
                    tenant_id=ids["tenant_b"],
                    title=f"Tenant B event {marker}",
                    start_date=future,
                    category=EventCategory.COMMUNITY,
                    status=EventStatus.ACTIVE,
                    source="manual",
                ),
                Event(
                    id=ids["event_westmoreland"],
                    tenant_id=ids["westmoreland"],
                    title=f"Westmoreland event {marker}",
                    start_date=future,
                    category=EventCategory.COMMUNITY,
                    status=EventStatus.ACTIVE,
                    source="manual",
                ),
                Guideline(
                    id=ids["guideline_a"],
                    tenant_id=ids["tenant_a"],
                    uploaded_by=ids["admin_a"],
                    file_url="/uploads/guidelines/tenant-a.pdf",
                    file_name="tenant-a.pdf",
                    file_type="pdf",
                    file_size=11,
                    is_active=True,
                ),
                Guideline(
                    id=ids["guideline_b"],
                    tenant_id=ids["tenant_b"],
                    uploaded_by=ids["admin_b"],
                    file_url="/uploads/guidelines/tenant-b.pdf",
                    file_name="tenant-b.pdf",
                    file_type="pdf",
                    file_size=12,
                    is_active=True,
                ),
                Guideline(
                    id=ids["guideline_legacy"],
                    tenant_id=None,
                    uploaded_by=ids["west_admin"],
                    file_url="/uploads/guidelines/legacy-westmoreland.pdf",
                    file_name="legacy-westmoreland.pdf",
                    file_type="pdf",
                    file_size=13,
                    is_active=True,
                ),
            ]
        )
        await db.commit()

    try:
        yield {**ids, **slugs, "marker": marker}
    finally:
        async with async_session() as db:
            await db.execute(
                delete(Guideline).where(
                    Guideline.uploaded_by.in_(
                        [
                            ids["admin_a"],
                            ids["admin_b"],
                            ids["west_admin"],
                            ids["super_admin"],
                        ]
                    )
                )
            )
            await db.execute(
                delete(Event).where(
                    Event.id.in_(
                        [ids["event_a"], ids["event_b"], ids["event_westmoreland"]]
                    )
                )
            )
            await db.execute(
                delete(User).where(
                    User.id.in_(
                        [
                            ids["admin_a"],
                            ids["admin_b"],
                            ids["west_admin"],
                            ids["super_admin"],
                        ]
                    )
                )
            )
            await db.execute(
                delete(Tenant).where(Tenant.id.in_([ids["tenant_a"], ids["tenant_b"]]))
            )
            if ids["created_westmoreland"]:
                await db.execute(delete(Tenant).where(Tenant.id == ids["westmoreland"]))
            await db.commit()
        await engine.dispose()


def _token(user_id, role: UserRole) -> str:
    return create_access_token(user_id, role.value)


async def _get(client: httpx.AsyncClient, path: str, slug: str | None = None):
    headers = {"X-Tenant-Slug": slug} if slug is not None else None
    return await client.get(path, headers=headers)


@pytest.mark.asyncio
async def test_event_routes_reject_unknown_explicit_tenants_and_isolate_valid_tenants(
    tenant_boundary_rows,
):
    rows = tenant_boundary_rows
    app = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        unknown_header = await _get(client, "/api/v1/events", "tenant-does-not-exist")
        unknown_upcoming = await _get(
            client, "/api/v1/events/upcoming", "tenant-does-not-exist"
        )
        empty_header = await _get(client, "/api/v1/events", "")
        unknown_subdomain = await client.get(
            "/api/v1/events", headers={"Host": "tenant-does-not-exist.bend.community"}
        )
        health = await _get(client, "/api/v1/health", "tenant-does-not-exist")
        super_admin = await client.get(
            "/api/v1/super-admin/tenants",
            headers={
                "X-Tenant-Slug": "tenant-does-not-exist",
                "Authorization": f"Bearer {_token(rows['super_admin'], UserRole.SUPER_ADMIN)}",
            },
        )
        tenant_a = await _get(client, "/api/v1/events", rows["tenant_a_slug"])
        upcoming_a = await _get(
            client, "/api/v1/events/upcoming", rows["tenant_a_slug"]
        )
        default_tenant = await _get(client, "/api/v1/events")

    assert unknown_header.status_code == 404
    assert unknown_upcoming.status_code == 404
    assert empty_header.status_code == 404
    assert unknown_subdomain.status_code == 404
    assert health.status_code == 200
    assert super_admin.status_code == 200
    assert {item["id"] for item in tenant_a.json()["items"]} == {str(rows["event_a"])}
    assert {item["id"] for item in upcoming_a.json()["items"]} == {str(rows["event_a"])}
    assert {item["id"] for item in default_tenant.json()["items"]} == {
        str(rows["event_westmoreland"])
    }


@pytest.mark.asyncio
async def test_event_service_rejects_missing_tenant_for_list_and_upcoming():
    async with async_session() as db:
        service = EventService(db, tenant_id=None)
        with pytest.raises(NotFoundError):
            await service.browse_events()
        with pytest.raises(NotFoundError):
            await service.get_upcoming()


@pytest.mark.asyncio
async def test_production_api_host_reaches_signed_stripe_webhook_without_tenant_header(
    tenant_boundary_rows,
):
    import json
    import time

    rows = tenant_boundary_rows
    payload = {
        "id": "evt_tenant_boundary",
        "type": "customer.created",
        "data": {
            "object": {
                "id": "cus_tenant_boundary",
                "metadata": {"tenant_id": str(rows["tenant_a"])},
            }
        },
    }
    raw = json.dumps(payload)
    timestamp = int(time.time())
    signature = stripe.WebhookSignature._compute_signature(
        f"{timestamp}.{raw}", "whsec_tenant_boundary"
    )
    app = create_app()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="https://api.bend.community"
    ) as client:
        response = await client.post(
            "/api/v1/advertising/webhook",
            content=raw,
            headers={"Stripe-Signature": f"t={timestamp},v1={signature}"},
        )
        shared_host_events = await client.get("/api/v1/events")
        explicit_unknown = await client.post(
            "/api/v1/advertising/webhook",
            content=raw,
            headers={
                "Stripe-Signature": f"t={timestamp},v1={signature}",
                "X-Tenant-Slug": "tenant-does-not-exist",
            },
        )
        unknown_subdomain = await client.post(
            "/api/v1/advertising/webhook",
            content=raw,
            headers={
                "Host": "tenant-does-not-exist.bend.community",
                "Stripe-Signature": f"t={timestamp},v1={signature}",
            },
        )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert shared_host_events.status_code == 404
    assert explicit_unknown.status_code == 404
    assert unknown_subdomain.status_code == 404


@pytest.mark.asyncio
async def test_guideline_reads_are_tenant_scoped_with_westmoreland_legacy_fallback(
    tenant_boundary_rows,
):
    rows = tenant_boundary_rows
    app = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        tenant_a = await _get(
            client, "/api/v1/upload/guidelines/current", rows["tenant_a_slug"]
        )
        tenant_b = await _get(
            client, "/api/v1/upload/guidelines/current", rows["tenant_b_slug"]
        )
        default_tenant = await _get(client, "/api/v1/upload/guidelines/current")

    assert tenant_a.json()["id"] == str(rows["guideline_a"])
    assert tenant_b.json()["id"] == str(rows["guideline_b"])
    assert default_tenant.json()["id"] == str(rows["guideline_legacy"])


@pytest.mark.asyncio
async def test_guideline_upload_authorizes_before_write_and_only_replaces_selected_tenant(
    tenant_boundary_rows, monkeypatch
):
    rows = tenant_boundary_rows
    uploads = _GuidelineUploads()
    monkeypatch.setattr("app.api.v1.upload.file_service", uploads)
    app = create_app()
    files = {"file": ("new-guidelines.pdf", b"test-guidelines", "application/pdf")}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        mismatch = await client.post(
            "/api/v1/upload/guidelines",
            headers={
                "X-Tenant-Slug": rows["tenant_a_slug"],
                "Authorization": f"Bearer {_token(rows['admin_b'], UserRole.COMMUNITY_ADMIN)}",
            },
            files=files,
        )
        unknown = await client.post(
            "/api/v1/upload/guidelines",
            headers={
                "X-Tenant-Slug": "tenant-does-not-exist",
                "Authorization": f"Bearer {_token(rows['admin_a'], UserRole.COMMUNITY_ADMIN)}",
            },
            files=files,
        )
        allowed = await client.post(
            "/api/v1/upload/guidelines",
            headers={
                "X-Tenant-Slug": rows["tenant_a_slug"],
                "Authorization": f"Bearer {_token(rows['admin_a'], UserRole.COMMUNITY_ADMIN)}",
            },
            files=files,
        )

    assert mismatch.status_code == 403
    assert unknown.status_code == 404
    assert allowed.status_code == 200
    assert uploads.calls == 1

    async with async_session() as db:
        active_a = (
            await db.execute(
                select(Guideline).where(
                    Guideline.tenant_id == rows["tenant_a"],
                    Guideline.is_active.is_(True),
                )
            )
        ).scalar_one()
        original_a = await db.get(Guideline, rows["guideline_a"])
        original_b = await db.get(Guideline, rows["guideline_b"])
        legacy = await db.get(Guideline, rows["guideline_legacy"])
        assert str(active_a.id) == allowed.json()["id"]
        assert active_a.uploaded_by == rows["admin_a"]
        assert original_a is not None and original_a.is_active is False
        assert original_b is not None and original_b.is_active is True
        assert legacy is not None and legacy.is_active is True


@pytest.mark.asyncio
async def test_tenantless_super_admin_can_replace_guidelines_for_selected_tenant(
    tenant_boundary_rows, monkeypatch
):
    rows = tenant_boundary_rows
    uploads = _GuidelineUploads()
    monkeypatch.setattr("app.api.v1.upload.file_service", uploads)
    app = create_app()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/upload/guidelines",
            headers={
                "X-Tenant-Slug": rows["tenant_b_slug"],
                "Authorization": f"Bearer {_token(rows['super_admin'], UserRole.SUPER_ADMIN)}",
            },
            files={"file": ("platform-guidelines.pdf", b"platform", "application/pdf")},
        )

    assert response.status_code == 200
    assert uploads.calls == 1
    async with async_session() as db:
        current = (
            await db.execute(
                select(Guideline).where(
                    Guideline.tenant_id == rows["tenant_b"],
                    Guideline.is_active.is_(True),
                )
            )
        ).scalar_one()
        assert str(current.id) == response.json()["id"]
        assert current.uploaded_by == rows["super_admin"]


@pytest.mark.asyncio
async def test_guideline_routes_reject_missing_resolved_tenant_before_upload(
    tenant_boundary_rows, monkeypatch
):
    rows = tenant_boundary_rows
    uploads = _GuidelineUploads()
    monkeypatch.setattr("app.api.v1.upload.file_service", uploads)
    app = FastAPI()

    @app.exception_handler(AppException)
    async def app_exception_handler(_, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    app.include_router(upload_router, prefix="/api/v1")

    async def db_override():
        async with async_session() as db:
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    async def no_tenant():
        return None

    async def admin_a():
        async with async_session() as db:
            return await db.get(User, rows["admin_a"])

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_tenant] = no_tenant
    app.dependency_overrides[get_current_user] = admin_a

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        read = await client.get("/api/v1/upload/guidelines/current")
        write = await client.post(
            "/api/v1/upload/guidelines",
            files={"file": ("denied.pdf", b"denied", "application/pdf")},
        )

    assert read.status_code == 404
    assert write.status_code == 404
    assert uploads.calls == 0
    async with async_session() as db:
        count = (
            await db.execute(
                select(func.count())
                .select_from(Guideline)
                .where(Guideline.uploaded_by == rows["admin_a"])
            )
        ).scalar_one()
        assert count == 1
