"""add optional shop description

Revision ID: add_shop_description
Revises: individual_endorsers
"""

from alembic import op
import sqlalchemy as sa


revision = "add_shop_description"
down_revision = "individual_endorsers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shops", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("shops", "description")
