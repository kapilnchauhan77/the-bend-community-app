"""Add discount_codes table.

Server-side discount codes that can be created by either a business
(owner_shop_id) or an individual community-member poster (owner_user_id).
Viewers see active codes on the business profile / listing detail and can
copy them at point of sale; an optional "I used this" click increments
usage_count.

Exactly one owner column is non-null per row. Uniqueness of `code` is
scoped PER OWNER via two partial-unique indexes so that two different
shops can each have their own SPRING20 without colliding.

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
"""
from alembic import op
import sqlalchemy as sa


revision = 'e9f0a1b2c3d4'
down_revision = 'd8e9f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'discount_codes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('owner_shop_id', sa.UUID(), nullable=True),
        sa.Column('owner_user_id', sa.UUID(), nullable=True),
        sa.Column('tenant_id', sa.UUID(), nullable=True),
        sa.Column('code', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('description', sa.String(length=280), nullable=True),
        sa.Column('discount_type', sa.String(length=16), nullable=False),
        sa.Column('discount_value', sa.Integer(), nullable=False),
        sa.Column('expiry_date', sa.DateTime(), nullable=True),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['owner_shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['owner_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_discount_codes_owner_shop',
        'discount_codes',
        ['owner_shop_id'],
        unique=False,
    )
    op.create_index(
        'idx_discount_codes_owner_user',
        'discount_codes',
        ['owner_user_id'],
        unique=False,
    )
    op.create_index(
        'idx_discount_codes_tenant_id',
        'discount_codes',
        ['tenant_id'],
        unique=False,
    )
    # Partial-unique indexes: code is unique per owner, not globally.
    op.create_index(
        'uq_discount_codes_shop_code',
        'discount_codes',
        ['owner_shop_id', 'code'],
        unique=True,
        postgresql_where=sa.text('owner_shop_id IS NOT NULL'),
    )
    op.create_index(
        'uq_discount_codes_user_code',
        'discount_codes',
        ['owner_user_id', 'code'],
        unique=True,
        postgresql_where=sa.text('owner_user_id IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_table('discount_codes')
