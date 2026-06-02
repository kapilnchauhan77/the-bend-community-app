"""Add LISTING_REPORTED to the notification_type Postgres enum.

Previously the report-a-listing flow reused REGISTRATION_SUBMITTED as
its notification type, which made admins clicking the notification
land on /admin/registrations instead of the flagged-posts queue. A
dedicated value keeps the routing clean.

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
"""
from alembic import op

revision = 'd8e9f0a1b2c3'
down_revision = 'c7d8e9f0a1b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE cannot run inside a transaction in Postgres.
    op.execute("COMMIT")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LISTING_REPORTED'")
    op.execute("BEGIN")


def downgrade() -> None:
    # Postgres can't drop enum values cleanly; leave it in place.
    pass
