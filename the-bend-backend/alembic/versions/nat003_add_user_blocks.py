"""add tenant-scoped directional user blocks

Revision ID: nat003
Revises: nat002
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "nat003"
down_revision = "nat002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("submitted_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_events_submitted_by_user_tenant", "events", "users",
        ["submitted_by_user_id", "tenant_id"], ["id", "tenant_id"], ondelete="SET NULL",
    )
    op.create_table(
        "user_blocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("blocker_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("blocked_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocker_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocked_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "blocker_id", "blocked_id", name="uq_user_blocks_direction"),
        sa.CheckConstraint("blocker_id <> blocked_id", name="ck_user_blocks_not_self"),
    )
    op.create_index("idx_user_blocks_blocker", "user_blocks", ["tenant_id", "blocker_id"])
    op.create_index("idx_user_blocks_blocked", "user_blocks", ["tenant_id", "blocked_id"])


def downgrade() -> None:
    op.drop_index("idx_user_blocks_blocked", table_name="user_blocks")
    op.drop_index("idx_user_blocks_blocker", table_name="user_blocks")
    op.drop_table("user_blocks")
    op.drop_constraint("fk_events_submitted_by_user_tenant", "events", type_="foreignkey")
    op.drop_column("events", "submitted_by_user_id")
