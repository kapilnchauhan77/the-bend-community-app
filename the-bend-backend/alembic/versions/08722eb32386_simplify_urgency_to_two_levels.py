"""simplify_urgency_to_two_levels

Revision ID: 08722eb32386
Revises: bd7851b8c93e
Create Date: 2026-04-11 14:07:15.615204

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '08722eb32386'
down_revision: Union[str, Sequence[str], None] = 'bd7851b8c93e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Convert all 'CRITICAL' to 'URGENT' in the database
    op.execute("UPDATE listings SET urgency = 'URGENT' WHERE urgency = 'CRITICAL'")
    # Recreate enum without CRITICAL value
    op.execute("ALTER TYPE urgency_level RENAME TO urgency_level_old")
    op.execute("CREATE TYPE urgency_level AS ENUM ('NORMAL', 'URGENT')")
    op.execute("ALTER TABLE listings ALTER COLUMN urgency TYPE urgency_level USING urgency::text::urgency_level")
    op.execute("DROP TYPE urgency_level_old")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TYPE urgency_level RENAME TO urgency_level_old")
    op.execute("CREATE TYPE urgency_level AS ENUM ('NORMAL', 'URGENT', 'CRITICAL')")
    op.execute("ALTER TABLE listings ALTER COLUMN urgency TYPE urgency_level USING urgency::text::urgency_level")
    op.execute("DROP TYPE urgency_level_old")
