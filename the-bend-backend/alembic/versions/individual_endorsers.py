"""allow individual users to endorse businesses

Revision ID: individual_endorsers
Revises: msg_ref_cols
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "individual_endorsers"
down_revision = "msg_ref_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "endorsements",
        "endorser_shop_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.add_column(
        "endorsements",
        sa.Column("endorser_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_endorsements_endorser_user",
        "endorsements",
        "users",
        ["endorser_user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_user_endorsement_pair",
        "endorsements",
        ["endorser_user_id", "endorsed_shop_id"],
    )
    op.create_index(
        "idx_endorsements_endorser_user",
        "endorsements",
        ["endorser_user_id"],
    )
    op.drop_constraint("ck_no_self_endorsement", "endorsements", type_="check")
    op.create_check_constraint(
        "ck_no_self_endorsement",
        "endorsements",
        "endorser_shop_id IS NULL OR endorser_shop_id != endorsed_shop_id",
    )
    op.create_check_constraint(
        "ck_endorsement_actor",
        "endorsements",
        "(endorser_shop_id IS NOT NULL AND endorser_user_id IS NULL) OR "
        "(endorser_shop_id IS NULL AND endorser_user_id IS NOT NULL)",
    )


def downgrade() -> None:
    op.execute("DELETE FROM endorsements WHERE endorser_user_id IS NOT NULL")
    op.drop_constraint("ck_endorsement_actor", "endorsements", type_="check")
    op.drop_constraint("ck_no_self_endorsement", "endorsements", type_="check")
    op.create_check_constraint(
        "ck_no_self_endorsement",
        "endorsements",
        "endorser_shop_id != endorsed_shop_id",
    )
    op.drop_index("idx_endorsements_endorser_user", table_name="endorsements")
    op.drop_constraint("uq_user_endorsement_pair", "endorsements", type_="unique")
    op.drop_constraint("fk_endorsements_endorser_user", "endorsements", type_="foreignkey")
    op.drop_column("endorsements", "endorser_user_id")
    op.alter_column(
        "endorsements",
        "endorser_shop_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
