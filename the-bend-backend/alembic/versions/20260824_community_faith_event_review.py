"""Add event organization/review fields and status values."""

from alembic import op
import sqlalchemy as sa


revision = "20260824_community_faith_event_review"
down_revision = "bender_link_preview"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLAlchemy's Enum(EventStatus) persists member names, so these are
    # deliberately uppercase PostgreSQL enum values even though the API
    # values are lowercase strings.
    op.execute("ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'PENDING'")
    op.execute("ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'REJECTED'")
    op.add_column("events", sa.Column("organization_type", sa.String(length=24), nullable=True))
    op.add_column("events", sa.Column("coupon_code_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_events_coupon_code_id_discount_codes",
        "events",
        "discount_codes",
        ["coupon_code_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_events_coupon_code_id_discount_codes", "events", type_="foreignkey")
    op.drop_column("events", "coupon_code_id")
    op.drop_column("events", "organization_type")
    # PostgreSQL enums cannot remove values in place. Map rows using the new
    # values back to the original ACTIVE value, then recreate the type.
    op.execute("UPDATE events SET status = 'ACTIVE' WHERE status IN ('PENDING', 'REJECTED')")
    op.execute("ALTER TYPE event_status RENAME TO event_status_old")
    op.execute("CREATE TYPE event_status AS ENUM ('ACTIVE', 'CANCELLED', 'PAST')")
    op.execute("ALTER TABLE events ALTER COLUMN status TYPE event_status USING status::text::event_status")
    op.execute("DROP TYPE event_status_old")
