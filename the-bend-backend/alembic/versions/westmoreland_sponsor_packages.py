"""Install the Westmoreland 30/60/90-day sponsor package catalog.

Revision ID: westmoreland_pricing
Revises: individual_endorsers
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "westmoreland_pricing"
down_revision = "individual_endorsers"
branch_labels = None
depends_on = None


_PACKAGE_NAMESPACE = uuid.UUID("84e4dc64-049b-49df-b8e1-fc37a4f9d266")


def _package_id(placement: str, duration_days: int) -> uuid.UUID:
    return uuid.uuid5(
        _PACKAGE_NAMESPACE,
        f"westmoreland:{placement}:{duration_days}",
    )


_PLACEMENTS = (
    (
        "homepage",
        "Homepage Feature",
        "Premium placement on the homepage between services and community board",
        10,
        ((30, 10000), (60, 18000), (90, 24000)),
    ),
    (
        "footer",
        "Footer Partners",
        "Displayed on every page in the partner strip",
        20,
        ((30, 6000), (60, 10800), (90, 14400)),
    ),
    (
        "events",
        "Events Page",
        "Reach the community event audience",
        30,
        ((30, 8000), (60, 14400), (90, 19200)),
    ),
    (
        "browse",
        "Browse Page",
        "Shown to users actively browsing listings",
        40,
        ((30, 8000), (60, 14400), (90, 19200)),
    ),
)


def _packages() -> tuple[dict, ...]:
    packages = []
    for placement, name, description, sort_base, durations in _PLACEMENTS:
        for offset, (duration_days, price_cents) in enumerate(durations):
            packages.append(
                {
                    "id": _package_id(placement, duration_days),
                    "name": name,
                    "description": description,
                    "placement": placement,
                    "duration_days": duration_days,
                    "price_cents": price_cents,
                    "is_active": True,
                    "sort_order": sort_base + offset,
                }
            )
    return tuple(packages)


def _tables():
    tenants = sa.table(
        "tenants",
        sa.column("id", sa.Uuid()),
        sa.column("slug", sa.String()),
    )
    pricing = sa.table(
        "ad_pricing",
        sa.column("id", sa.Uuid()),
        sa.column("tenant_id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("description", sa.Text()),
        sa.column("placement", sa.String()),
        sa.column("duration_days", sa.Integer()),
        sa.column("price_cents", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
        sa.column("sort_order", sa.Integer()),
        sa.column("created_at", sa.DateTime()),
    )
    return tenants, pricing


def _resolve_westmoreland_tenant(connection, tenants) -> uuid.UUID:
    tenant_id = connection.execute(
        sa.select(tenants.c.id).where(tenants.c.slug == "westmoreland")
    ).scalar_one_or_none()
    if tenant_id is not None:
        return tenant_id

    # Fresh databases still have the original default slug at migration time;
    # app.seed renames this same tenant to westmoreland immediately afterward.
    tenant_id = connection.execute(
        sa.select(tenants.c.id).where(tenants.c.slug == "montross")
    ).scalar_one_or_none()
    if tenant_id is None:
        raise RuntimeError("Westmoreland tenant was not found")
    return tenant_id


def _reconcile_westmoreland_pricing(connection) -> None:
    tenants, pricing = _tables()
    tenant_id = _resolve_westmoreland_tenant(connection, tenants)
    packages = _packages()
    canonical_ids = [package["id"] for package in packages]

    collision = connection.execute(
        sa.select(pricing.c.id, pricing.c.tenant_id).where(
            pricing.c.id.in_(canonical_ids),
            sa.or_(
                pricing.c.tenant_id.is_(None),
                pricing.c.tenant_id != tenant_id,
            ),
        )
    ).first()
    if collision is not None:
        raise RuntimeError(
            "Westmoreland canonical pricing ID collision with another tenant"
        )

    # Preserve retired rows (and their historical sponsor references) while
    # ensuring the public catalog contains only the approved twelve packages.
    connection.execute(
        sa.update(pricing)
        .where(
            pricing.c.tenant_id == tenant_id,
            pricing.c.is_active.is_(True),
            pricing.c.id.not_in(canonical_ids),
        )
        .values(is_active=False)
    )

    for package in packages:
        values = {**package, "tenant_id": tenant_id}
        result = connection.execute(
            sa.update(pricing)
            .where(
                pricing.c.id == package["id"],
                pricing.c.tenant_id == tenant_id,
            )
            .values(**values)
        )
        if result.rowcount == 0:
            connection.execute(
                sa.insert(pricing).values(**values, created_at=sa.func.now())
            )


def upgrade() -> None:
    _reconcile_westmoreland_pricing(op.get_bind())


def _deactivate_westmoreland_catalog(connection) -> None:
    # Do not delete rows that may already be referenced by sponsors. A data
    # downgrade can safely hide this catalog but cannot reconstruct which
    # pre-existing custom plans were active before the upgrade.
    tenants, pricing = _tables()
    tenant_id = _resolve_westmoreland_tenant(connection, tenants)
    connection.execute(
        sa.update(pricing)
        .where(
            pricing.c.id.in_([package["id"] for package in _packages()]),
            pricing.c.tenant_id == tenant_id,
        )
        .values(is_active=False)
    )


def downgrade() -> None:
    _deactivate_westmoreland_catalog(op.get_bind())
