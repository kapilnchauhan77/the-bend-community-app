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
    invalid = op.get_bind().execute(sa.text("SELECT count(*) FROM reports WHERE target_type IS NULL OR target_id IS NULL OR status IS NULL OR tenant_id IS NULL")).scalar_one()
    total = op.get_bind().execute(sa.text("SELECT count(*) FROM reports")).scalar_one()
    backfilled = op.get_bind().execute(sa.text("SELECT count(*) FROM reports WHERE target_type='listing' AND target_id IS NOT NULL AND status IN ('open','resolved') AND tenant_id IS NOT NULL")).scalar_one()
    if invalid or total != backfilled:
        raise RuntimeError(f"nat004 backfill validation failed: total={total} backfilled={backfilled} invalid={invalid}")
    op.alter_column("reports", "target_type", nullable=False)
    op.alter_column("reports", "target_id", nullable=False)
    op.alter_column("reports", "status", nullable=False)
    op.alter_column("reports", "tenant_id", nullable=False)
    op.create_unique_constraint("uq_reports_id_tenant", "reports", ["id", "tenant_id"])
    op.create_foreign_key("fk_reports_reporter_tenant", "reports", "users", ["reporter_id", "tenant_id"], ["id", "tenant_id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_reports_resolved_by_tenant", "reports", "users", ["resolved_by_id", "tenant_id"], ["id", "tenant_id"], ondelete="SET NULL")
    op.create_index("idx_reports_target", "reports", ["target_type", "target_id"])
    op.create_unique_constraint("uq_reports_reporter_target", "reports", ["tenant_id", "reporter_id", "target_type", "target_id"])
    op.create_table("report_audits", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("action", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")), sa.ForeignKeyConstraint(["report_id", "tenant_id"], ["reports.id", "reports.tenant_id"], ondelete="RESTRICT"), sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"), sa.ForeignKeyConstraint(["actor_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="RESTRICT"))
    op.create_index("idx_report_audits_report", "report_audits", ["report_id", "created_at"])
    op.create_unique_constraint("uq_report_audits_action", "report_audits", ["report_id", "action"])
    op.drop_constraint("reports_listing_id_fkey", "reports", type_="foreignkey")
    op.drop_column("reports", "listing_id")

def downgrade():
    bind = op.get_bind()
    non_listing = bind.execute(sa.text("SELECT count(*) FROM reports WHERE target_type <> 'listing'")).scalar_one()
    if non_listing:
        raise RuntimeError("nat004 downgrade refused: non-listing reports exist")
    op.add_column("reports", sa.Column("listing_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE reports SET listing_id=target_id")
    op.create_foreign_key("reports_listing_id_fkey", "reports", "listings", ["listing_id"], ["id"], ondelete="CASCADE")
    op.drop_table("report_audits")
    op.execute("ALTER TABLE reports DROP CONSTRAINT IF EXISTS uq_reports_reporter_target")
    op.execute("ALTER TABLE reports DROP CONSTRAINT IF EXISTS uq_reports_id_tenant")
    op.execute("ALTER TABLE reports DROP CONSTRAINT IF EXISTS fk_reports_reporter_tenant")
    op.execute("ALTER TABLE reports DROP CONSTRAINT IF EXISTS fk_reports_resolved_by_tenant")
    op.drop_index("idx_reports_target", table_name="reports")
    for column in ("resolved_by_id", "resolved_at", "status", "target_id", "target_type"):
        op.drop_column("reports", column)
    op.alter_column("reports", "tenant_id", nullable=True)
    op.alter_column("reports", "listing_id", nullable=False)
