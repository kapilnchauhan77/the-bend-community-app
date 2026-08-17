"""persist native push installations, preferences, and outbox rows

Revision ID: nat002
Revises: nat001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "nat002"
down_revision = "nat001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "device_installations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("provider_token", sa.Text(), nullable=False),
        sa.Column("revocation_secret_hash", sa.String(length=128), nullable=False),
        sa.Column("app_version", sa.String(length=32), nullable=False),
        sa.Column("build_number", sa.String(length=32), nullable=False),
        sa.Column("locale", sa.String(length=16), server_default="en-US", nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_token", name="uq_device_installations_provider_token"),
    )
    op.create_index("idx_device_installations_user", "device_installations", ["user_id"])
    op.create_index("idx_device_installations_tenant", "device_installations", ["tenant_id"])

    op.create_table(
        "notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("push_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("message_received", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("listing_interest_received", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("registration_decision", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("urgent_listing_published", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "tenant_id", name="uq_notification_preferences_user_tenant"),
    )
    op.create_index("idx_notification_preferences_user", "notification_preferences", ["user_id"])
    op.create_index("idx_notification_preferences_tenant", "notification_preferences", ["tenant_id"])

    op.create_table(
        "notification_outbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("notification_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("available_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("provider_results", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("last_error_code", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["notification_id"], ["notifications.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("notification_id", name="uq_notification_outbox_notification"),
        sa.CheckConstraint("status IN ('pending', 'processing', 'delivered', 'failed')", name="ck_notification_outbox_status"),
    )
    op.create_index("idx_notification_outbox_tenant_status", "notification_outbox", ["tenant_id", "status"])
    op.create_index("idx_notification_outbox_available", "notification_outbox", ["status", "available_at"])


def downgrade() -> None:
    op.drop_index("idx_notification_outbox_available", table_name="notification_outbox")
    op.drop_index("idx_notification_outbox_tenant_status", table_name="notification_outbox")
    op.drop_table("notification_outbox")
    op.drop_index("idx_notification_preferences_tenant", table_name="notification_preferences")
    op.drop_index("idx_notification_preferences_user", table_name="notification_preferences")
    op.drop_table("notification_preferences")
    op.drop_index("idx_device_installations_tenant", table_name="device_installations")
    op.drop_index("idx_device_installations_user", table_name="device_installations")
    op.drop_table("device_installations")
