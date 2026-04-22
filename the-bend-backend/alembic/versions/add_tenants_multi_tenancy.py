"""Add tenants table and tenant_id to all scoped tables for multi-tenancy.

Revision ID: f1a2b3c4d5e6
Revises: None (run after all existing migrations)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from uuid import uuid4

# revision identifiers
revision = 'f1a2b3c4d5e6'
down_revision = '5d6016f29cb1'
branch_labels = None
depends_on = None

# Default tenant ID for backfill
DEFAULT_TENANT_ID = uuid4()


def upgrade() -> None:
    # 1. Add SUPER_ADMIN to user_role enum
    # Must run outside transaction for PostgreSQL ADD VALUE
    op.execute("COMMIT")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPER_ADMIN' BEFORE 'COMMUNITY_ADMIN'")
    op.execute("BEGIN")

    # 2. Create tenants table
    op.create_table(
        'tenants',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('slug', sa.String(63), unique=True, nullable=False),
        sa.Column('subdomain', sa.String(100), unique=True, nullable=False),
        sa.Column('display_name', sa.String(150), nullable=False),
        sa.Column('tagline', sa.Text),
        sa.Column('about_text', sa.Text),
        sa.Column('hero_image_url', sa.String(500)),
        sa.Column('logo_url', sa.String(500)),
        sa.Column('primary_color', sa.String(20), nullable=False, server_default='hsl(160,25%,24%)'),
        sa.Column('footer_text', sa.String(300)),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # 3. Insert default "montross" tenant
    op.execute(
        f"""
        INSERT INTO tenants (id, slug, subdomain, display_name, tagline, about_text, hero_image_url, primary_color, footer_text, is_active, created_at, updated_at)
        VALUES (
            '{DEFAULT_TENANT_ID}',
            'montross',
            'montross.thebend.app',
            'The Bend — Montross',
            'Find opportunity within your neighborhood',
            'An unexpected bend in the road can cause businesses and community members to work and live inefficiently. The Bend exists to support the many "bends" in Westmoreland County roads that have flipped the script, and serve as community hubs and places of opportunity.',
            '/images/the-bend-hero.jpg',
            'hsl(160,25%,24%)',
            'Preserving community, one connection at a time',
            true,
            NOW(),
            NOW()
        )
        """
    )

    # 4. Add tenant_id column to all scoped tables (nullable first for backfill)
    tables_with_tenant = [
        'users', 'shops', 'listings', 'events', 'event_connectors',
        'volunteers', 'talent', 'sponsors', 'ad_pricing',
        'notifications', 'message_threads', 'success_stories',
        'reports', 'guidelines',
    ]

    for table in tables_with_tenant:
        op.add_column(table, sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True))

    # 5. Backfill existing rows with default tenant
    for table in tables_with_tenant:
        if table == 'users':
            # Only backfill non-super_admin users
            op.execute(f"UPDATE {table} SET tenant_id = '{DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL AND role != 'SUPER_ADMIN'")
        else:
            op.execute(f"UPDATE {table} SET tenant_id = '{DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL")

    # 6. Add indexes
    for table in tables_with_tenant:
        op.create_index(f'idx_{table}_tenant_id', table, ['tenant_id'])


def downgrade() -> None:
    tables_with_tenant = [
        'users', 'shops', 'listings', 'events', 'event_connectors',
        'volunteers', 'talent', 'sponsors', 'ad_pricing',
        'notifications', 'message_threads', 'success_stories',
        'reports', 'guidelines',
    ]

    for table in tables_with_tenant:
        op.drop_index(f'idx_{table}_tenant_id', table_name=table)
        op.drop_column(table, 'tenant_id')

    op.drop_table('tenants')

    # Note: Cannot remove enum value in PostgreSQL, so super_admin stays
