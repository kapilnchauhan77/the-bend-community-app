"""Add attachment columns to messages.

Phase 2 of the in-app camera feature: a chat message may carry a single
photo OR a short video alongside (or in place of) its text body. We add
three nullable columns to `messages`:

  - attachment_url            -- absolute or relative URL to the asset
  - attachment_type           -- 'image' | 'video' (plain VARCHAR; we only
                                 have two values and a PG enum would make
                                 the migration heavier without payoff)
  - attachment_thumbnail_url  -- URL to the poster frame for videos / a
                                 smaller variant for images. May equal
                                 attachment_url for photos.

All three are nullable so existing text-only messages keep working
untouched.

Revision ID: c7d8e9f0a1b2
Revises: bf3e9a1c4d05
"""
from alembic import op
import sqlalchemy as sa


revision = 'c7d8e9f0a1b2'
down_revision = 'bf3e9a1c4d05'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'messages',
        sa.Column('attachment_url', sa.String(length=500), nullable=True),
    )
    op.add_column(
        'messages',
        sa.Column('attachment_type', sa.String(length=16), nullable=True),
    )
    op.add_column(
        'messages',
        sa.Column('attachment_thumbnail_url', sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('messages', 'attachment_thumbnail_url')
    op.drop_column('messages', 'attachment_type')
    op.drop_column('messages', 'attachment_url')
