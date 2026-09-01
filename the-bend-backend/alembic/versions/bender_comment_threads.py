"""Add threaded comments and comment hearts."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "bender_comment_threads"
down_revision = "rejected_shop_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bender_comments",
        sa.Column(
            "parent_comment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bender_comments.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "bender_comments",
        sa.Column("like_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column("bender_comments", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index(
        "idx_bender_comments_parent_created",
        "bender_comments",
        ["parent_comment_id", "created_at"],
    )
    op.create_table(
        "bender_comment_likes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "comment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bender_comments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "uq_bender_comment_likes_comment_user",
        "bender_comment_likes",
        ["comment_id", "user_id"],
        unique=True,
    )


def downgrade() -> None:
    # Drop feature rows while all feature columns still exist. Remove hearts
    # explicitly, then replies before their tombstone parents. Finally repair
    # the cached count to match the flattened base comment table.
    op.execute(
        "DELETE FROM bender_comment_likes WHERE comment_id IN "
        "(SELECT id FROM bender_comments WHERE parent_comment_id IS NOT NULL "
        "OR deleted_at IS NOT NULL)"
    )
    op.execute("DELETE FROM bender_comments WHERE parent_comment_id IS NOT NULL")
    op.execute("DELETE FROM bender_comments WHERE deleted_at IS NOT NULL")
    op.execute(
        "UPDATE bender_posts SET comment_count = "
        "(SELECT count(*) FROM bender_comments "
        "WHERE bender_comments.post_id = bender_posts.id)"
    )
    op.drop_index("uq_bender_comment_likes_comment_user", table_name="bender_comment_likes")
    op.drop_table("bender_comment_likes")
    op.drop_index("idx_bender_comments_parent_created", table_name="bender_comments")
    op.drop_column("bender_comments", "deleted_at")
    op.drop_column("bender_comments", "like_count")
    op.drop_column("bender_comments", "parent_comment_id")
