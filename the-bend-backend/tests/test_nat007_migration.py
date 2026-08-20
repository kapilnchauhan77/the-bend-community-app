import os
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings


def _alembic(root: Path, schema: str, *args: str) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["ALEMBIC_SCHEMA"] = schema
    return subprocess.run(
        [str(root / ".venv/bin/alembic"), *args],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
    )


@pytest.mark.asyncio
async def test_nat007_platform_report_actors_upgrade_and_guarded_downgrade():
    root = Path(__file__).resolve().parents[1]
    public_before = subprocess.run(
        [str(root / ".venv/bin/alembic"), "current"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    schema = f"nat007_report_actors_{uuid4().hex}"
    engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
    tenant_id, reporter_id, platform_id, report_id, audit_id = (
        uuid4() for _ in range(5)
    )
    try:
        async with engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        assert _alembic(root, schema, "upgrade", "nat006").returncode == 0
        async with engine.begin() as conn:
            await conn.execute(text(f'SET search_path TO "{schema}"'))
            await conn.execute(
                text(
                    "INSERT INTO tenants "
                    "(id, slug, subdomain, display_name) "
                    "VALUES (:id, :slug, :slug, 'Tenant')"
                ),
                {"id": tenant_id, "slug": str(tenant_id)},
            )
            await conn.execute(
                text(
                    "INSERT INTO users "
                    "(id, email, password_hash, name, role, tenant_id, "
                    "is_active, created_at, updated_at) VALUES "
                    "(:reporter, :reporter_email, 'x', 'Reporter', "
                    "'INDIVIDUAL', :tenant, true, now(), now()), "
                    "(:platform, :platform_email, 'x', 'Platform admin', "
                    "'SUPER_ADMIN', NULL, true, now(), now())"
                ),
                {
                    "reporter": reporter_id,
                    "reporter_email": f"{reporter_id}@example.test",
                    "platform": platform_id,
                    "platform_email": f"{platform_id}@example.test",
                    "tenant": tenant_id,
                },
            )
            await conn.execute(
                text(
                    "INSERT INTO reports "
                    "(id, target_type, target_id, reporter_id, reason, status, "
                    "resolved, tenant_id, created_at) VALUES "
                    "(:id, 'listing', :target, :reporter, 'spam', 'open', "
                    "false, :tenant, now())"
                ),
                {
                    "id": report_id,
                    "target": uuid4(),
                    "reporter": reporter_id,
                    "tenant": tenant_id,
                },
            )

        upgraded = _alembic(root, schema, "upgrade", "nat007")
        assert upgraded.returncode == 0, upgraded.stderr
        async with engine.begin() as conn:
            await conn.execute(text(f'SET search_path TO "{schema}"'))
            await conn.execute(
                text(
                    "UPDATE reports SET status='resolved', resolved=true, "
                    "resolved_by_platform_admin_id=:actor WHERE id=:report"
                ),
                {"actor": platform_id, "report": report_id},
            )
            await conn.execute(
                text(
                    "INSERT INTO report_audits "
                    "(id, report_id, tenant_id, actor_id, platform_actor_id, "
                    "action, created_at) VALUES "
                    "(:id, :report, :tenant, NULL, :actor, 'resolved', now())"
                ),
                {
                    "id": audit_id,
                    "report": report_id,
                    "tenant": tenant_id,
                    "actor": platform_id,
                },
            )
            constraints = set(
                (
                    await conn.execute(
                        text(
                            "SELECT conname FROM pg_constraint "
                            "WHERE connamespace = CAST(:schema AS regnamespace) "
                            "AND conname IN "
                            "('ck_reports_single_resolver', "
                            "'ck_report_audits_single_actor')"
                        ),
                        {"schema": schema},
                    )
                ).scalars()
            )
            assert constraints == {
                "ck_reports_single_resolver",
                "ck_report_audits_single_actor",
            }

        refused = _alembic(root, schema, "downgrade", "nat006")
        assert refused.returncode != 0
        assert "platform report attribution exists" in refused.stderr

        async with engine.begin() as conn:
            await conn.execute(text(f'SET search_path TO "{schema}"'))
            await conn.execute(
                text("DELETE FROM report_audits WHERE id=:id"), {"id": audit_id}
            )
            await conn.execute(
                text(
                    "UPDATE reports SET resolved_by_platform_admin_id=NULL WHERE id=:id"
                ),
                {"id": report_id},
            )
        downgraded = _alembic(root, schema, "downgrade", "nat006")
        assert downgraded.returncode == 0, downgraded.stderr
        reupgraded = _alembic(root, schema, "upgrade", "nat007")
        assert reupgraded.returncode == 0, reupgraded.stderr
    finally:
        async with engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await engine.dispose()
    public_after = subprocess.run(
        [str(root / ".venv/bin/alembic"), "current"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert public_after == public_before
