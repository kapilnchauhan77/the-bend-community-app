"""Add bender_posts, bender_likes, bender_comments tables.

Bender is an Instagram-style community feed. Any signed-in user (individual
or business) can author a post with a caption + optional 9-second video or
photo. Any signed-in user can like or comment; the feed is cursor-paginated
by (created_at, id) DESC.

Three tables:
- bender_posts: the post itself; cached like_count / comment_count for the
  feed query so we don't fan out aggregates on every page.
- bender_likes: (post_id, user_id) is unique → idempotent like / unlike.
- bender_comments: ASC by created_at when listed under a post.

Plain op.create_table — no PG enums. media_type is a String(16) holding
'image' or 'video' (matches the existing message_attachments pattern).

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
"""
from alembic import op
import sqlalchemy as sa


revision = 'f0a1b2c3d4e5'
down_revision = 'e9f0a1b2c3d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'bender_posts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('author_user_id', sa.UUID(), nullable=False),
        sa.Column('author_shop_id', sa.UUID(), nullable=True),
        sa.Column('tenant_id', sa.UUID(), nullable=True),
        sa.Column('caption', sa.Text(), nullable=True),
        sa.Column('media_url', sa.String(length=500), nullable=True),
        sa.Column('media_thumbnail_url', sa.String(length=500), nullable=True),
        sa.Column('media_type', sa.String(length=16), nullable=True),
        sa.Column('like_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('comment_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['author_shop_id'], ['shops.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_bender_posts_tenant_created',
        'bender_posts',
        ['tenant_id', 'created_at'],
        unique=False,
    )
    op.create_index(
        'idx_bender_posts_author_user',
        'bender_posts',
        ['author_user_id'],
        unique=False,
    )

    op.create_table(
        'bender_likes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('post_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['bender_posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    # Unique (post_id, user_id) gives us idempotent like/unlike at the DB
    # level — a duplicate insert raises IntegrityError which the service
    # converts into a no-op.
    op.create_index(
        'uq_bender_likes_post_user',
        'bender_likes',
        ['post_id', 'user_id'],
        unique=True,
    )

    op.create_table(
        'bender_comments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('post_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['bender_posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_bender_comments_post_created',
        'bender_comments',
        ['post_id', 'created_at'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('idx_bender_comments_post_created', table_name='bender_comments')
    op.drop_table('bender_comments')

    op.drop_index('uq_bender_likes_post_user', table_name='bender_likes')
    op.drop_table('bender_likes')

    op.drop_index('idx_bender_posts_author_user', table_name='bender_posts')
    op.drop_index('idx_bender_posts_tenant_created', table_name='bender_posts')
    op.drop_table('bender_posts')
