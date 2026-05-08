"""Add tenant_referrals table and referred_by_tenant_id column on tenants.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ENUM

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # create_type=False on the column-bound ENUMs prevents
    # alembic's create_table from attempting to recreate the type.
    referral_status_create = ENUM(
        'pending', 'contacted', 'demo_scheduled', 'launched', 'expired',
        name='referral_status'
    )
    referral_status_create.create(op.get_bind(), checkfirst=True)

    referral_reward_type_create = ENUM(
        'free_months', 'credit', 'revshare',
        name='referral_reward_type'
    )
    referral_reward_type_create.create(op.get_bind(), checkfirst=True)

    referral_status = ENUM(
        'pending', 'contacted', 'demo_scheduled', 'launched', 'expired',
        name='referral_status', create_type=False,
    )
    referral_reward_type = ENUM(
        'free_months', 'credit', 'revshare',
        name='referral_reward_type', create_type=False,
    )

    op.add_column('tenants', sa.Column('referred_by_tenant_id', UUID(as_uuid=True), nullable=True))

    op.create_table(
        'tenant_referrals',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('referrer_tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('referrer_user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('referred_email', sa.String(255), nullable=False),
        sa.Column('referred_name', sa.String(150), nullable=False),
        sa.Column('referred_county_name', sa.String(150), nullable=False),
        sa.Column('referred_message', sa.Text, nullable=True),
        sa.Column('status', referral_status, nullable=False, server_default='pending'),
        sa.Column('reward_type', referral_reward_type, nullable=False, server_default='free_months'),
        sa.Column('reward_amount', sa.Integer, nullable=True),
        sa.Column('reward_granted_at', sa.DateTime, nullable=True),
        sa.Column('resulting_tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='SET NULL'), nullable=True),
        sa.Column('super_admin_notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_referrals_referrer_tenant', 'tenant_referrals', ['referrer_tenant_id'])
    op.create_index('idx_referrals_status', 'tenant_referrals', ['status'])
    op.create_index('idx_referrals_resulting_tenant', 'tenant_referrals', ['resulting_tenant_id'])


def downgrade() -> None:
    op.drop_index('idx_referrals_resulting_tenant', 'tenant_referrals')
    op.drop_index('idx_referrals_status', 'tenant_referrals')
    op.drop_index('idx_referrals_referrer_tenant', 'tenant_referrals')
    op.drop_table('tenant_referrals')
    op.drop_column('tenants', 'referred_by_tenant_id')
    sa.Enum(name='referral_reward_type').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='referral_status').drop(op.get_bind(), checkfirst=True)
