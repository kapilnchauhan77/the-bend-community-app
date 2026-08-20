"""add explicit platform admin report attribution

Revision ID: nat007
Revises: nat006
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "nat007"
down_revision = "nat006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "reports",
        sa.Column(
            "resolved_by_platform_admin_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_reports_platform_resolver",
        "reports",
        "users",
        ["resolved_by_platform_admin_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_reports_single_resolver",
        "reports",
        "resolved_by_id IS NULL OR resolved_by_platform_admin_id IS NULL",
    )

    op.alter_column("report_audits", "actor_id", nullable=True)
    op.add_column(
        "report_audits",
        sa.Column(
            "platform_actor_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_report_audits_platform_actor",
        "report_audits",
        "users",
        ["platform_actor_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_report_audits_single_actor",
        "report_audits",
        "num_nonnulls(actor_id, platform_actor_id) = 1",
    )


def downgrade():
    bind = op.get_bind()
    platform_attribution_count = bind.execute(
        sa.text(
            "SELECT "
            "(SELECT count(*) FROM reports "
            "WHERE resolved_by_platform_admin_id IS NOT NULL) + "
            "(SELECT count(*) FROM report_audits "
            "WHERE platform_actor_id IS NOT NULL)"
        )
    ).scalar_one()
    if platform_attribution_count:
        raise RuntimeError(
            "nat007 downgrade refused: platform report attribution exists"
        )

    op.drop_constraint("ck_report_audits_single_actor", "report_audits", type_="check")
    op.drop_constraint(
        "fk_report_audits_platform_actor", "report_audits", type_="foreignkey"
    )
    op.drop_column("report_audits", "platform_actor_id")
    op.alter_column("report_audits", "actor_id", nullable=False)

    op.drop_constraint("ck_reports_single_resolver", "reports", type_="check")
    op.drop_constraint("fk_reports_platform_resolver", "reports", type_="foreignkey")
    op.drop_column("reports", "resolved_by_platform_admin_id")
