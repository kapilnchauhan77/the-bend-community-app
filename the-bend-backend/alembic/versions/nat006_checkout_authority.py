"""tenant-owned checkout authority and connector purchases

Revision ID: nat006
Revises: nat005
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "nat006"
down_revision = "nat005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sponsors", sa.Column("checkout_status", sa.String(20), nullable=False, server_default="pending"))
    op.add_column("sponsors", sa.Column("expected_amount", sa.Integer(), nullable=True))
    op.add_column("sponsors", sa.Column("expected_currency", sa.String(3), nullable=False, server_default="usd"))
    op.add_column("events", sa.Column("checkout_status", sa.String(20), nullable=False, server_default="pending"))
    op.add_column("events", sa.Column("expected_amount", sa.Integer(), nullable=True))
    op.add_column("events", sa.Column("expected_currency", sa.String(3), nullable=False, server_default="usd"))
    op.create_table(
        "connector_purchases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("website_url", sa.String(500), nullable=False),
        sa.Column("contact_name", sa.String(200), nullable=False),
        sa.Column("contact_email", sa.String(255), nullable=False),
        sa.Column("business_name", sa.String(200), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("expected_amount", sa.Integer(), nullable=False),
        sa.Column("expected_currency", sa.String(3), nullable=False, server_default="usd"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("setup_complete", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("stripe_session_id", sa.String(255), unique=True),
        sa.Column("stripe_payment_intent", sa.String(255)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("idx_connector_purchases_tenant_session", "connector_purchases", ["tenant_id", "stripe_session_id"])
    op.create_index("idx_connector_purchases_tenant_status", "connector_purchases", ["tenant_id", "status"])
    op.create_index("uq_sponsors_tenant_stripe_session", "sponsors", ["tenant_id", "stripe_session_id"], unique=True, postgresql_where=sa.text("stripe_session_id IS NOT NULL"))
    op.create_index("uq_events_tenant_stripe_session", "events", ["tenant_id", "stripe_session_id"], unique=True, postgresql_where=sa.text("stripe_session_id IS NOT NULL"))


def downgrade():
    op.drop_index("uq_events_tenant_stripe_session", table_name="events")
    op.drop_index("uq_sponsors_tenant_stripe_session", table_name="sponsors")
    op.drop_index("idx_connector_purchases_tenant_status", table_name="connector_purchases")
    op.drop_index("idx_connector_purchases_tenant_session", table_name="connector_purchases")
    op.drop_table("connector_purchases")
    for table in ("events", "sponsors"):
        op.drop_column(table, "expected_currency")
        op.drop_column(table, "expected_amount")
        op.drop_column(table, "checkout_status")
