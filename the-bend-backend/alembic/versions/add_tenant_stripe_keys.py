"""Add per-tenant Stripe credential columns to tenants table.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('stripe_secret_key', sa.String(length=255), nullable=True))
    op.add_column('tenants', sa.Column('stripe_publishable_key', sa.String(length=255), nullable=True))
    op.add_column('tenants', sa.Column('stripe_webhook_secret', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'stripe_webhook_secret')
    op.drop_column('tenants', 'stripe_publishable_key')
    op.drop_column('tenants', 'stripe_secret_key')
