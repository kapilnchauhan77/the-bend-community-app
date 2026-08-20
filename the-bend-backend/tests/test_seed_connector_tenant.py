"""Tenant-safe seed and sync coverage for the bundled Local Scoop connector."""

from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import delete, or_, select

from app import seed
from app.database import async_session, engine
from app.models.enums import ConnectorType, EventCategory
from app.models.event import EventConnector
from app.models.tenant import Tenant
from app.services.connector_service import ConnectorService


@pytest_asyncio.fixture
async def seed_connector_rows():
    await engine.dispose()
    marker = uuid4().hex
    ids = {"default": uuid4(), "other": uuid4()}
    connector_name = f"Local Scoop seed test {marker}"

    async with async_session() as db:
        db.add_all(
            [
                Tenant(
                    id=ids["default"],
                    slug=f"seed-default-{marker}",
                    subdomain=f"seed-default-{marker}",
                    display_name="Seed default tenant",
                ),
                Tenant(
                    id=ids["other"],
                    slug=f"seed-other-{marker}",
                    subdomain=f"seed-other-{marker}",
                    display_name="Seed other tenant",
                ),
            ]
        )
        await db.commit()

    try:
        yield {**ids, "connector_name": connector_name}
    finally:
        async with async_session() as db:
            await db.execute(
                delete(EventConnector).where(
                    or_(
                        EventConnector.name == connector_name,
                        EventConnector.tenant_id.in_([ids["default"], ids["other"]]),
                    )
                )
            )
            await db.execute(
                delete(Tenant).where(Tenant.id.in_([ids["default"], ids["other"]]))
            )
            await db.commit()
        await engine.dispose()


def _patch_default_connector(monkeypatch, rows):
    assert hasattr(seed, "_LOCAL_SCOOP_NAME"), "seed connector constants are missing"
    assert hasattr(seed, "_LOCAL_SCOOP_URL"), "seed connector constants are missing"

    calls: list[str] = []

    async def resolve_default_tenant():
        calls.append("resolved")
        return rows["default"]

    monkeypatch.setattr(seed, "ensure_default_tenant", resolve_default_tenant)
    monkeypatch.setattr(seed, "_LOCAL_SCOOP_NAME", rows["connector_name"])
    monkeypatch.setattr(seed, "_LOCAL_SCOOP_URL", "https://example.com/events.xml")
    return calls


def _connector(connector_id, tenant_id, name):
    return EventConnector(
        id=connector_id,
        tenant_id=tenant_id,
        name=name,
        type=ConnectorType.RSS,
        url="https://example.com/events.xml",
        category=EventCategory.COMMUNITY,
        is_active=True,
    )


@pytest.mark.asyncio
async def test_fresh_seed_creates_the_connector_in_the_resolved_default_tenant(
    seed_connector_rows, monkeypatch
):
    rows = seed_connector_rows
    calls = _patch_default_connector(monkeypatch, rows)

    await seed.seed_connector()

    async with async_session() as db:
        connectors = (
            (
                await db.execute(
                    select(EventConnector).where(
                        EventConnector.name == rows["connector_name"]
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(connectors) == 1
        assert connectors[0].tenant_id == rows["default"]
    assert calls == ["resolved"]


@pytest.mark.asyncio
async def test_seed_repairs_a_legacy_null_tenant_connector_in_place(
    seed_connector_rows, monkeypatch
):
    rows = seed_connector_rows
    calls = _patch_default_connector(monkeypatch, rows)
    legacy_id = uuid4()
    async with async_session() as db:
        db.add(_connector(legacy_id, None, rows["connector_name"]))
        await db.commit()

    await seed.seed_connector()

    async with async_session() as db:
        repaired = await db.get(EventConnector, legacy_id)
        assert repaired is not None
        assert repaired.tenant_id == rows["default"]
        count = len(
            (
                (
                    await db.execute(
                        select(EventConnector).where(
                            EventConnector.name == rows["connector_name"]
                        )
                    )
                )
                .scalars()
                .all()
            )
        )
        assert count == 1
    assert calls == ["resolved"]


@pytest.mark.asyncio
async def test_seed_does_not_adopt_another_tenants_same_name_connector(
    seed_connector_rows, monkeypatch
):
    rows = seed_connector_rows
    _patch_default_connector(monkeypatch, rows)
    other_connector_id = uuid4()
    async with async_session() as db:
        db.add(
            _connector(
                other_connector_id,
                rows["other"],
                rows["connector_name"],
            )
        )
        await db.commit()

    await seed.seed_connector()

    async with async_session() as db:
        connectors = (
            (
                await db.execute(
                    select(EventConnector)
                    .where(EventConnector.name == rows["connector_name"])
                    .order_by(EventConnector.tenant_id)
                )
            )
            .scalars()
            .all()
        )
        assert {connector.tenant_id for connector in connectors} == {
            rows["default"],
            rows["other"],
        }
        assert (await db.get(EventConnector, other_connector_id)).tenant_id == rows[
            "other"
        ]


@pytest.mark.asyncio
async def test_seed_sync_repairs_legacy_connector_and_invokes_real_service_with_tenant(
    seed_connector_rows, monkeypatch
):
    rows = seed_connector_rows
    calls = _patch_default_connector(monkeypatch, rows)
    legacy_id = uuid4()
    other_id = uuid4()
    async with async_session() as db:
        db.add_all(
            [
                _connector(legacy_id, None, rows["connector_name"]),
                _connector(other_id, rows["other"], rows["connector_name"]),
            ]
        )
        await db.commit()

    invocations = []

    async def record_sync(self, connector_id):
        invocations.append((self.tenant_id, connector_id))
        return {"synced": 0, "total_parsed": 0}

    monkeypatch.setattr(ConnectorService, "sync_connector", record_sync)

    await seed.sync_connector()

    assert calls == ["resolved"]
    assert invocations == [(rows["default"], legacy_id)]
    async with async_session() as db:
        assert (await db.get(EventConnector, legacy_id)).tenant_id == rows["default"]
        assert (await db.get(EventConnector, other_id)).tenant_id == rows["other"]


@pytest.mark.asyncio
async def test_concurrent_seed_sessions_create_only_one_default_connector(
    seed_connector_rows, monkeypatch
):
    rows = seed_connector_rows
    _patch_default_connector(monkeypatch, rows)
    original_resolve = seed._resolve_local_scoop_connector
    both_created = asyncio.Event()
    created_count = 0

    async def widen_the_insert_race(session, tenant_id, *, create):
        nonlocal created_count
        result = await original_resolve(session, tenant_id, create=create)
        if result[1] == "created":
            created_count += 1
            if created_count == 2:
                both_created.set()
            try:
                await asyncio.wait_for(both_created.wait(), timeout=0.2)
            except TimeoutError:
                pass
        return result

    monkeypatch.setattr(
        seed,
        "_resolve_local_scoop_connector",
        widen_the_insert_race,
    )

    await asyncio.wait_for(
        asyncio.gather(seed.seed_connector(), seed.seed_connector()),
        timeout=2,
    )

    async with async_session() as db:
        connectors = (
            (
                await db.execute(
                    select(EventConnector).where(
                        EventConnector.name == rows["connector_name"],
                        EventConnector.tenant_id == rows["default"],
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(connectors) == 1
