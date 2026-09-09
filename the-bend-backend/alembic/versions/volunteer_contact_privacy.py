"""Add per-field volunteer contact consent flags."""

from alembic import op
import sqlalchemy as sa

revision = "volunteer_contact_privacy"
down_revision = "add_volunteer_about_me"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "volunteers",
        sa.Column("show_phone", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "volunteers",
        sa.Column("show_email", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("volunteers", "show_email")
    op.drop_column("volunteers", "show_phone")
