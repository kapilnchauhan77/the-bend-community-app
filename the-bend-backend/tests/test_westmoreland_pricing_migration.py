import importlib.util
import uuid
from datetime import datetime
from pathlib import Path

import pytest
import sqlalchemy as sa


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "westmoreland_sponsor_packages.py"
)

EXPECTED_PACKAGES = {
    ("homepage", 30, 10000),
    ("homepage", 60, 18000),
    ("homepage", 90, 24000),
    ("footer", 30, 6000),
    ("footer", 60, 10800),
    ("footer", 90, 14400),
    ("events", 30, 8000),
    ("events", 60, 14400),
    ("events", 90, 19200),
    ("browse", 30, 8000),
    ("browse", 60, 14400),
    ("browse", 90, 19200),
}


def _load_migration():
    if not MIGRATION_PATH.exists():
        pytest.fail("Westmoreland sponsor pricing migration is not implemented")
    spec = importlib.util.spec_from_file_location(
        "westmoreland_sponsor_packages", MIGRATION_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _schema():
    metadata = sa.MetaData()
    tenants = sa.Table(
        "tenants",
        metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("slug", sa.String(63), nullable=False, unique=True),
    )
    pricing = sa.Table(
        "ad_pricing",
        metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("placement", sa.String(50), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    return metadata, tenants, pricing


def _old_plan(tenant_id, *, placement, price_cents, is_active=True):
    names = {
        "homepage": "Homepage Feature",
        "footer": "Footer Partners",
        "events": "Events Page",
        "browse": "Browse Page",
    }
    return {
        "id": uuid.uuid4(),
        "tenant_id": tenant_id,
        "name": names[placement],
        "description": "Existing plan",
        "placement": placement,
        "duration_days": 90,
        "price_cents": price_cents,
        "is_active": is_active,
        "sort_order": 1,
        "created_at": datetime(2026, 8, 1),
    }


def _active_package_set(connection, pricing, tenant_id):
    rows = connection.execute(
        sa.select(
            pricing.c.placement,
            pricing.c.duration_days,
            pricing.c.price_cents,
        ).where(
            pricing.c.tenant_id == tenant_id,
            pricing.c.is_active.is_(True),
        )
    ).all()
    return set(rows)


def test_reconcile_replaces_only_westmoreland_active_catalog_and_is_idempotent():
    migration = _load_migration()
    engine = sa.create_engine("sqlite://")
    metadata, tenants, pricing = _schema()
    metadata.create_all(engine)
    westmoreland_id = uuid.uuid4()
    other_tenant_id = uuid.uuid4()

    with engine.begin() as connection:
        connection.execute(
            tenants.insert(),
            [
                {"id": westmoreland_id, "slug": "westmoreland"},
                {"id": other_tenant_id, "slug": "blacksburg"},
            ],
        )
        westmoreland_legacy = [
            _old_plan(
                westmoreland_id,
                placement="homepage",
                price_cents=17999,
            ),
            _old_plan(
                westmoreland_id,
                placement="browse",
                price_cents=12999,
            ),
            _old_plan(
                westmoreland_id,
                placement="events",
                price_cents=12999,
            ),
            _old_plan(
                westmoreland_id,
                placement="footer",
                price_cents=7999,
            ),
        ]
        other_plan = _old_plan(
            other_tenant_id,
            placement="homepage",
            price_cents=77777,
        )
        connection.execute(pricing.insert(), [*westmoreland_legacy, other_plan])

        migration._reconcile_westmoreland_pricing(connection)

        assert _active_package_set(connection, pricing, westmoreland_id) == EXPECTED_PACKAGES
        legacy_rows = connection.execute(
            sa.select(pricing.c.id, pricing.c.is_active).where(
                pricing.c.id.in_([plan["id"] for plan in westmoreland_legacy])
            )
        ).all()
        assert len(legacy_rows) == 4
        assert all(is_active is False for _, is_active in legacy_rows)
        assert connection.execute(
            sa.select(pricing.c.price_cents, pricing.c.is_active).where(
                pricing.c.id == other_plan["id"]
            )
        ).one() == (77777, True)

        canonical_ids = set(
            connection.execute(
                sa.select(pricing.c.id).where(
                    pricing.c.tenant_id == westmoreland_id,
                    pricing.c.is_active.is_(True),
                )
            ).scalars()
        )
        migration._reconcile_westmoreland_pricing(connection)

        assert _active_package_set(connection, pricing, westmoreland_id) == EXPECTED_PACKAGES
        assert set(
            connection.execute(
                sa.select(pricing.c.id).where(
                    pricing.c.tenant_id == westmoreland_id,
                    pricing.c.is_active.is_(True),
                )
            ).scalars()
        ) == canonical_ids


def test_reconcile_supports_fresh_database_with_legacy_montross_tenant():
    migration = _load_migration()
    engine = sa.create_engine("sqlite://")
    metadata, tenants, pricing = _schema()
    metadata.create_all(engine)
    tenant_id = uuid.uuid4()

    with engine.begin() as connection:
        connection.execute(
            tenants.insert(), {"id": tenant_id, "slug": "montross"}
        )

        migration._reconcile_westmoreland_pricing(connection)

        assert _active_package_set(connection, pricing, tenant_id) == EXPECTED_PACKAGES


def test_reconcile_fails_when_default_tenant_is_missing():
    migration = _load_migration()
    engine = sa.create_engine("sqlite://")
    metadata, _, _ = _schema()
    metadata.create_all(engine)

    with engine.begin() as connection, pytest.raises(
        RuntimeError, match="Westmoreland tenant"
    ):
        migration._reconcile_westmoreland_pricing(connection)
