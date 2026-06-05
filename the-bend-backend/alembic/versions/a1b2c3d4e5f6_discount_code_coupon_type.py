"""Add coupon_type to discount_codes and coupon_code_id to sponsors.

Extends the existing discount-code system so community admins can issue
limited-use sponsor coupons (coupon_type='sponsor') in addition to the
existing shop/individual promo codes (coupon_type='shop_promo').

Two surfaces touched in a single migration:

1. discount_codes.coupon_type
   - Discriminator between owner-issued shop/individual codes
     ('shop_promo') and tenant-admin-issued sponsor-slot coupons
     ('sponsor'). server_default='shop_promo' so existing rows are
     backfilled with the legacy behaviour.
   - Indexed for the lookup-by-type path used during sponsor checkout.

2. sponsors.coupon_code_id
   - Nullable FK pointing at the discount_codes row that was applied
     during sponsor purchase (if any). ON DELETE SET NULL so deleting a
     coupon does not cascade and wipe out historical sponsor rows.

Revision ID: a1b2c3d4e5f6
Revises: f0a1b2c3d4e5
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'a1b2c3d4e5f6'
down_revision = 'f0a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # discount_codes.coupon_type
    op.add_column(
        'discount_codes',
        sa.Column(
            'coupon_type',
            sa.String(length=16),
            nullable=False,
            server_default='shop_promo',
        ),
    )
    op.create_index(
        'idx_discount_codes_coupon_type',
        'discount_codes',
        ['coupon_type'],
        unique=False,
    )

    # sponsors.coupon_code_id
    op.add_column(
        'sponsors',
        sa.Column('coupon_code_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_sponsors_coupon_code',
        'sponsors',
        'discount_codes',
        ['coupon_code_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'idx_sponsors_coupon_code',
        'sponsors',
        ['coupon_code_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('idx_sponsors_coupon_code', table_name='sponsors')
    op.drop_constraint('fk_sponsors_coupon_code', 'sponsors', type_='foreignkey')
    op.drop_column('sponsors', 'coupon_code_id')

    op.drop_index('idx_discount_codes_coupon_type', table_name='discount_codes')
    op.drop_column('discount_codes', 'coupon_type')
