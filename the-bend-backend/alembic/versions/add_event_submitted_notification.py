"""Add EVENT_SUBMITTED to the notification type enum."""

from alembic import op


revision = "event_submitted_notification"
down_revision = "bender_reply_notification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("COMMIT")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'EVENT_SUBMITTED'")
    op.execute("BEGIN")


def downgrade() -> None:
    # PostgreSQL enum labels cannot be removed safely in place. Preserve the
    # notifications by mapping them to the existing registration type.
    op.execute("UPDATE notifications SET type = 'REGISTRATION_SUBMITTED' WHERE type = 'EVENT_SUBMITTED'")
