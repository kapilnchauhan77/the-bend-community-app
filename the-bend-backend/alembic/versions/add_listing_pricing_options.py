"""Enrich listing pricing: pricing_type enum + price_max + price_unit + price_text.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent ENUM creation
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE pricing_type AS ENUM (
                'free', 'fixed', 'hourly', 'range', 'custom'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    pricing_type = ENUM(
        'free', 'fixed', 'hourly', 'range', 'custom',
        name='pricing_type', create_type=False,
    )

    op.add_column('listings', sa.Column('price_max', sa.Numeric(10, 2), nullable=True))
    op.add_column('listings', sa.Column('price_unit', sa.String(30), nullable=True))
    op.add_column('listings', sa.Column('price_text', sa.String(150), nullable=True))
    op.add_column(
        'listings',
        sa.Column('pricing_type', pricing_type, nullable=False, server_default='free')
    )

    # Backfill: rows with is_free=true → 'free'; otherwise 'fixed'
    op.execute("""
        UPDATE listings
        SET pricing_type = CASE
            WHEN is_free = true THEN 'free'::pricing_type
            ELSE 'fixed'::pricing_type
        END
    """)


def downgrade() -> None:
    op.drop_column('listings', 'pricing_type')
    op.drop_column('listings', 'price_text')
    op.drop_column('listings', 'price_unit')
    op.drop_column('listings', 'price_max')
    op.execute("DROP TYPE IF EXISTS pricing_type")
