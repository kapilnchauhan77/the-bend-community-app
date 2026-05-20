"""Fix user_role enum: add UPPERCASE 'INDIVIDUAL' to match Python enum NAME convention.

The previous migration (e5f6a7b8c9d0) mistakenly added lowercase 'individual'
to the user_role Postgres enum.  All other values in the enum are UPPERCASE
(SUPER_ADMIN, COMMUNITY_ADMIN, SHOP_ADMIN, SHOP_EMPLOYEE) because SQLAlchemy
persists the Python enum NAME — not .value — when no values_callable is set.
This migration adds the correct 'INDIVIDUAL' value so live registrations stop
returning a 500.  The orphaned lowercase 'individual' is left in place (PG
cannot remove enum values) but will never be written by the application.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
"""
from alembic import op

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE cannot run inside a transaction in Postgres.
    # Commit the surrounding transaction, add the value, then open a new one.
    # Same pattern used in e5f6a7b8c9d0 and referenced migrations.
    op.execute("COMMIT")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'INDIVIDUAL'")
    op.execute("BEGIN")


def downgrade() -> None:
    # Postgres has no clean way to drop an enum value; leave it in place.
    pass
