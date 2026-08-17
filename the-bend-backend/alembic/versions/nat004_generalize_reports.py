"""generalize reports and add immutable audit trail
Revision ID: nat004
Revises: nat003
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "nat004"
down_revision = "nat003"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("reports", sa.Column("target_type", sa.String(16), nullable=True))
    op.add_column("reports", sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("reports", sa.Column("status", sa.String(16), nullable=True))
    op.add_column("reports", sa.Column("resolved_at", sa.DateTime(), nullable=True))
    op.add_column("reports", sa.Column("resolved_by_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE reports SET target_type='listing', target_id=listing_id, status=CASE WHEN resolved THEN 'resolved' ELSE 'open' END, resolved_at=CASE WHEN resolved THEN created_at ELSE NULL END WHERE target_id IS NULL")
    op.execute("UPDATE reports r SET tenant_id=COALESCE(r.tenant_id,l.tenant_id) FROM listings l WHERE l.id=r.listing_id AND r.tenant_id IS NULL")
    op.execute("UPDATE reports r SET tenant_id=u.tenant_id FROM users u WHERE u.id=r.reporter_id AND r.tenant_id IS NULL")
    op.alter_column("reports", "target_type", nullable=False)
    op.alter_column("reports", "target_id", nullable=False)
    op.alter_column("reports", "status", nullable=False)
    op.create_foreign_key("fk_reports_resolved_by", "reports", "users", ["resolved_by_id"], ["id"], ondelete="SET NULL")
    op.create_index("idx_reports_target", "reports", ["target_type", "target_id"])
    op.create_unique_constraint("uq_reports_reporter_target", "reports", ["tenant_id", "reporter_id", "target_type", "target_id"])
    op.create_table("report_audits", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True), sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("action", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")), sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="RESTRICT"), sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"))
    op.create_index("idx_report_audits_report", "report_audits", ["report_id", "created_at"])
    op.drop_constraint("reports_listing_id_fkey", "reports", type_="foreignkey")
    op.drop_column("reports", "listing_id")

def downgrade():
    raise RuntimeError("nat004 downgrade is intentionally unsupported after polymorphic backfill")
