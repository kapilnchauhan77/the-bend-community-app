"""Add nullable Bender link preview snapshots."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "bender_link_preview"
down_revision = "westmoreland_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bender_posts",
        sa.Column(
            "link_preview",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("bender_posts", "link_preview")
