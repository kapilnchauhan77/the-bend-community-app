import asyncio
import os
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings


def _alembic(root: Path, schema: str, *args):
    env = os.environ.copy()
    env["ALEMBIC_SCHEMA"] = schema
    return subprocess.run([str(root / ".venv/bin/alembic"), *args], cwd=root, env=env, capture_output=True, text=True)


@pytest.mark.asyncio
async def test_nat006_upgrade_downgrade_reupgrade_preserves_seeded_rows_and_public_head():
    root = Path(__file__).resolve().parents[1]
    public = subprocess.run([str(root / ".venv/bin/alembic"), "current"], cwd=root, capture_output=True, text=True, check=True).stdout
    assert "nat007" in public
    schema = f"task8_nat006_{uuid4().hex}"
    engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
    tenant_id, pricing_id, sponsor_id, event_id, coupon_id = (uuid4() for _ in range(5))
    try:
        async with engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        assert _alembic(root, schema, "upgrade", "nat005").returncode == 0
        async with engine.begin() as conn:
            await conn.execute(text(f'SET search_path TO "{schema}"'))
            await conn.execute(text("INSERT INTO tenants (id,slug,subdomain,display_name) VALUES (:id,:slug,:sub,:name)"), {"id": tenant_id, "slug": str(tenant_id)[:8], "sub": str(tenant_id)[:8], "name": "Seed"})
            await conn.execute(text("INSERT INTO ad_pricing (id,name,placement,duration_days,price_cents,is_active,sort_order,tenant_id,created_at) VALUES (:id,'Seed','homepage',30,1200,true,0,:tenant,now())"), {"id": pricing_id, "tenant": tenant_id})
            await conn.execute(text("INSERT INTO discount_codes (id,code,name,discount_type,discount_value,usage_count,is_active,coupon_type,tenant_id,created_at,updated_at) VALUES (:id,'NAT006','Seed','flat',100,0,true,'sponsor',:tenant,now(),now())"), {"id": coupon_id, "tenant": tenant_id})
            await conn.execute(text("INSERT INTO sponsors (id,name,placement,tenant_id,paid,approved,is_active,sort_order,pricing_id,coupon_code_id,created_at,updated_at) VALUES (:id,'Seed sponsor','homepage',:tenant,false,false,false,0,:pricing,:coupon,now(),now())"), {"id": sponsor_id, "tenant": tenant_id, "pricing": pricing_id, "coupon": coupon_id})
            await conn.execute(text("INSERT INTO events (id,title,start_date,category,source,tenant_id,status,is_featured,paid,created_at,updated_at) VALUES (:id,'Seed event',now(),'COMMUNITY','manual',:tenant,'ACTIVE',false,false,now(),now())"), {"id": event_id, "tenant": tenant_id})
        upgraded = _alembic(root, schema, "upgrade", "nat006")
        assert upgraded.returncode == 0, upgraded.stderr
        async with engine.begin() as conn:
            await conn.execute(text(f'SET search_path TO "{schema}"'))
            assert (await conn.execute(text("SELECT count(*) FROM sponsors WHERE id=:id"), {"id": sponsor_id})).scalar_one() == 1
            assert (await conn.execute(text("SELECT count(*) FROM events WHERE id=:id"), {"id": event_id})).scalar_one() == 1
            assert (await conn.execute(text("SELECT checkout_status,expected_currency FROM sponsors WHERE id=:id"), {"id": sponsor_id})).one() == ("pending", "usd")
            assert (await conn.execute(text("SELECT count(*) FROM connector_purchases"))).scalar_one() == 0
            indexes = (await conn.execute(text("SELECT indexname FROM pg_indexes WHERE schemaname=:schema AND tablename='connector_purchases'"), {"schema": schema})).scalars().all()
            assert "idx_connector_purchases_tenant_session" in indexes
        assert _alembic(root, schema, "downgrade", "nat005").returncode == 0
        async with engine.begin() as conn:
            await conn.execute(text(f'SET search_path TO "{schema}"'))
            assert (await conn.execute(text("SELECT count(*) FROM sponsors WHERE id=:id"), {"id": sponsor_id})).scalar_one() == 1
            assert not (await conn.execute(text("SELECT 1 FROM information_schema.tables WHERE table_schema=:schema AND table_name='connector_purchases'"), {"schema": schema})).first()
        assert _alembic(root, schema, "upgrade", "nat006").returncode == 0
    finally:
        async with engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await engine.dispose()
    after = subprocess.run([str(root / ".venv/bin/alembic"), "current"], cwd=root, capture_output=True, text=True, check=True).stdout
    assert "nat007" in after


@pytest.mark.asyncio
async def test_nat006_concurrent_schemas_and_invalid_schema_cleanup():
    root = Path(__file__).resolve().parents[1]
    engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
    schemas = [f"task8_nat006_{uuid4().hex}" for _ in range(2)]
    try:
        async with engine.begin() as conn:
            for schema in schemas:
                await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        results = await asyncio.gather(*[asyncio.to_thread(_alembic, root, schema, "upgrade", "nat006") for schema in schemas])
        assert all(result.returncode == 0 for result in results), [result.stderr for result in results]
        invalid = _alembic(root, "bad-schema;drop", "upgrade", "nat006")
        assert invalid.returncode != 0
    finally:
        async with engine.begin() as conn:
            for schema in schemas:
                await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await engine.dispose()
