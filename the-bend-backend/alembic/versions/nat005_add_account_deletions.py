"""account deletion requests and opaque status receipts
Revision ID: nat005
Revises: nat004
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "nat005"
down_revision = "nat004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "account_deletions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("receipt_hash", sa.String(64), nullable=True),
        sa.Column("receipt_expires_at", sa.DateTime(), nullable=True),
        sa.Column("send_confirmation", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("confirmation_email", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("available_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("last_error_code", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
    )
    op.create_index("idx_account_deletions_claim", "account_deletions", ["status", "available_at"])
    op.create_index("idx_account_deletions_receipt", "account_deletions", ["receipt_hash"])
    # Only one active request is possible; completed history is retained.
    op.create_index(
        "uq_account_deletions_user_active",
        "account_deletions",
        ["user_id", "tenant_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )


def downgrade():
    op.drop_index("uq_account_deletions_user_active", table_name="account_deletions")
    op.drop_index("idx_account_deletions_receipt", table_name="account_deletions")
    op.drop_index("idx_account_deletions_claim", table_name="account_deletions")
    op.drop_table("account_deletions")
