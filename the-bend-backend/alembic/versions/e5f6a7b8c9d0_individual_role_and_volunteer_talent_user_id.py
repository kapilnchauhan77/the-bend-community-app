"""Add 'individual' UserRole + user_id link on volunteers/talent + relax phone NOT NULL.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add 'individual' to the user_role Postgres ENUM.
    # ALTER TYPE ADD VALUE cannot run inside a transaction in Postgres,
    # so we commit the surrounding tx, add the value, then start a new tx
    # for the remaining DDL. Same pattern as add_listing_pricing_options.py
    # would use for enum-add-value (we just inline it here).
    op.execute("COMMIT")
    # PG enum values for user_role are UPPERCASE (matches Python enum NAMES,
    # because the User.role column has no values_callable). Adding 'INDIVIDUAL'
    # to match that convention.
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'INDIVIDUAL'")
    op.execute("BEGIN")

    # 2. volunteers.user_id (nullable FK -> users.id, ON DELETE SET NULL) + index
    op.add_column(
        'volunteers',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_volunteers_user_id',
        'volunteers', 'users',
        ['user_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_volunteers_user_id', 'volunteers', ['user_id'])

    # 3. talent.user_id (nullable FK -> users.id, ON DELETE SET NULL) + index
    op.add_column(
        'talent',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_talent_user_id',
        'talent', 'users',
        ['user_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_talent_user_id', 'talent', ['user_id'])

    # 4. Relax phone NOT NULL on both tables — signed-in users can skip
    # phone/email because the in-app messenger reaches them via user_id.
    op.alter_column(
        'volunteers', 'phone',
        existing_type=sa.String(length=20),
        nullable=True,
    )
    op.alter_column(
        'talent', 'phone',
        existing_type=sa.String(length=20),
        nullable=True,
    )


def downgrade() -> None:
    # Note: we intentionally do NOT remove the 'individual' enum value on
    # downgrade — Postgres has no clean way to drop an enum value, and the
    # value is harmless if unused.

    # Restore NOT NULL on phone. Any rows with NULL phone would break this;
    # operators should reconcile data before downgrading.
    op.alter_column(
        'talent', 'phone',
        existing_type=sa.String(length=20),
        nullable=False,
    )
    op.alter_column(
        'volunteers', 'phone',
        existing_type=sa.String(length=20),
        nullable=False,
    )

    op.drop_index('ix_talent_user_id', table_name='talent')
    op.drop_constraint('fk_talent_user_id', 'talent', type_='foreignkey')
    op.drop_column('talent', 'user_id')

    op.drop_index('ix_volunteers_user_id', table_name='volunteers')
    op.drop_constraint('fk_volunteers_user_id', 'volunteers', type_='foreignkey')
    op.drop_column('volunteers', 'user_id')
