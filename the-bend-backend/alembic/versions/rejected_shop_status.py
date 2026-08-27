"""Add an explicit rejected status for business registrations.

Revision ID: rejected_shop_status
Revises: individual_endorsers
"""

from alembic import op


revision = "rejected_shop_status"
down_revision = "individual_endorsers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLAlchemy persists enum member names for this column, so PostgreSQL
    # stores REJECTED rather than the Python value "rejected".
    op.execute("COMMIT")
    op.execute("ALTER TYPE shop_status ADD VALUE IF NOT EXISTS 'REJECTED'")
    op.execute("BEGIN")

    # Older releases represented rejection as PENDING plus a reason. Converge
    # those rows on the explicit state. The predicate makes the backfill safe
    # if operators need to repeat it after a partial deployment.
    op.execute(
        """
        UPDATE shops
        SET status = 'REJECTED', updated_at = NOW()
        WHERE status = 'PENDING' AND rejection_reason IS NOT NULL
        """
    )


def downgrade() -> None:
    # PostgreSQL cannot remove one enum value cleanly. Convert rows before old
    # application code resumes, then leave the unused value in the type.
    op.execute(
        """
        UPDATE shops
        SET status = 'PENDING', updated_at = NOW()
        WHERE status = 'REJECTED'
        """
    )
