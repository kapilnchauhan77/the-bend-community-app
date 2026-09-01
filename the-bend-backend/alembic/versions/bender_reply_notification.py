"""Add Bender reply notification type."""

from alembic import op


revision = "bender_reply_notification"
down_revision = "bender_comment_threads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("COMMIT")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'BENDER_REPLY'")
    op.execute("BEGIN")


def downgrade() -> None:
    # PostgreSQL enum labels cannot be removed safely here. Preserve reply
    # notifications by mapping them to the base application's message type.
    op.execute("UPDATE notifications SET type = 'NEW_MESSAGE' WHERE type = 'BENDER_REPLY'")
