"""Add sponsor_strip_label column to tenants table.

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('sponsor_strip_label', sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'sponsor_strip_label')
