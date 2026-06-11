"""Add latitude/longitude columns to shops table.

Revision ID: ab12cd34ef56
Revises: c0d1e2f3a4b5
"""
from alembic import op
import sqlalchemy as sa

revision = 'ab12cd34ef56'
down_revision = 'c0d1e2f3a4b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('shops', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('shops', sa.Column('longitude', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('shops', 'longitude')
    op.drop_column('shops', 'latitude')
