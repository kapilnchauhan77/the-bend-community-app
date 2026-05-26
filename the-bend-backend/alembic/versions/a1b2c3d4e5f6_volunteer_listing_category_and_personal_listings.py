"""Add VOLUNTEER listing category + nullable shop_id + posted_by_user_id.

Adds support for "Volunteer Opportunity" listings that may be posted by any
signed-in user, including individuals with no shop. To enable that we:

  1. Add 'VOLUNTEER' to the listing_category Postgres enum. Per existing
     convention (see cc20f8bfadd0_initial_schema and
     f6a7b8c9d0e1_user_role_individual_uppercase), the enum values are
     UPPERCASE because the column has no values_callable and SQLAlchemy
     persists the Python enum NAME rather than .value.
  2. Make listings.shop_id nullable, so an individual without a shop can
     still own a listing.
  3. Add listings.posted_by_user_id (nullable FK -> users.id, ON DELETE
     SET NULL) + an index, so we can attribute a listing to a user when
     no shop is involved.

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'a1b2c3d4e5f6'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add 'VOLUNTEER' to listing_category. ALTER TYPE ADD VALUE cannot
    # run inside a transaction in Postgres, so commit, add the value, then
    # open a new transaction for the remaining DDL.
    op.execute("COMMIT")
    op.execute("ALTER TYPE listing_category ADD VALUE IF NOT EXISTS 'VOLUNTEER'")
    op.execute("BEGIN")

    # 2. Make listings.shop_id nullable so individual-posted listings
    # (volunteer opportunities) without a shop can be stored.
    op.alter_column(
        "listings", "shop_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )

    # 3. Add listings.posted_by_user_id (nullable FK -> users.id) + index.
    op.add_column(
        "listings",
        sa.Column("posted_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_listings_posted_by_user_id",
        "listings", "users",
        ["posted_by_user_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_listings_posted_by_user_id",
        "listings", ["posted_by_user_id"],
    )


def downgrade() -> None:
    # Drop the FK + column + index for posted_by_user_id.
    op.drop_index("idx_listings_posted_by_user_id", table_name="listings")
    op.drop_constraint("fk_listings_posted_by_user_id", "listings", type_="foreignkey")
    op.drop_column("listings", "posted_by_user_id")

    # Restore NOT NULL on shop_id. Caveat: this will fail if any rows have
    # shop_id IS NULL (e.g. individual-posted volunteer listings).
    # Operators must reconcile data (delete or reassign) before downgrading.
    op.alter_column(
        "listings", "shop_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )

    # Note: 'VOLUNTEER' is intentionally left in the listing_category enum.
    # Postgres has no clean way to drop an enum value, and a leftover unused
    # value is harmless.
