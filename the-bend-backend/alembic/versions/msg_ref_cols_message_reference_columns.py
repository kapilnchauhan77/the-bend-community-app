"""message reference columns

Revision ID: msg_ref_cols
Revises: ab12cd34ef56
Create Date: 2026-08-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "msg_ref_cols"
down_revision = "ab12cd34ef56"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("messages", sa.Column("reference_type", sa.String(length=16), nullable=True))
    op.add_column("messages", sa.Column("reference_id", UUID(as_uuid=True), nullable=True))


def downgrade():
    op.drop_column("messages", "reference_id")
    op.drop_column("messages", "reference_type")
