"""Add optional About me text to volunteer profiles."""

from alembic import op
import sqlalchemy as sa

revision = "add_volunteer_about_me"
down_revision = "event_submitted_notification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("volunteers", sa.Column("about_me", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("volunteers", "about_me")
