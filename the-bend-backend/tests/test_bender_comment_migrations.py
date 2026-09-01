import importlib.util
from pathlib import Path

from sqlalchemy.dialects import postgresql


def _load(name: str):
    path = Path(__file__).parents[1] / "alembic" / "versions" / name
    spec = importlib.util.spec_from_file_location(name.replace(".", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_comment_threads_revision_extends_current_head(monkeypatch):
    migration = _load("bender_comment_threads.py")
    assert migration.revision == "bender_comment_threads"
    assert migration.down_revision == "rejected_shop_status"

    calls = []
    class Op:
        def add_column(self, table, column): calls.append(("add_column", table, column))
        def create_index(self, name, table, columns, **kwargs): calls.append(("create_index", name, table, columns, kwargs))
        def create_table(self, name, *columns): calls.append(("create_table", name, columns))
        def drop_index(self, name, **kwargs): calls.append(("drop_index", name, kwargs))
        def drop_table(self, name): calls.append(("drop_table", name))
        def drop_column(self, table, name): calls.append(("drop_column", table, name))
        def execute(self, statement): calls.append(("execute", statement))
    monkeypatch.setattr(migration, "op", Op())
    migration.upgrade()
    parent = calls[0][2]
    assert parent.name == "parent_comment_id" and parent.nullable is True
    assert isinstance(parent.type, postgresql.UUID)
    parent_fk = next(iter(parent.foreign_keys))
    assert parent_fk.target_fullname == "bender_comments.id"
    assert parent_fk.ondelete == "CASCADE"
    like_count = calls[1][2]
    assert like_count.name == "like_count" and like_count.nullable is False
    assert str(like_count.server_default.arg) == "0"
    assert calls[2][2].name == "deleted_at" and calls[2][2].nullable is True
    assert calls[3] == ("create_index", "idx_bender_comments_parent_created", "bender_comments", ["parent_comment_id", "created_at"], {})
    assert calls[4][0:2] == ("create_table", "bender_comment_likes")
    likes = calls[4][2]
    columns = {column.name: column for column in likes}
    assert isinstance(columns["id"].type, postgresql.UUID) and columns["id"].primary_key
    assert columns["created_at"].nullable is False
    comment_fk = next(iter(columns["comment_id"].foreign_keys))
    user_fk = next(iter(columns["user_id"].foreign_keys))
    assert comment_fk.target_fullname == "bender_comments.id" and comment_fk.ondelete == "CASCADE"
    assert user_fk.target_fullname == "users.id" and user_fk.ondelete == "CASCADE"
    assert calls[5] == ("create_index", "uq_bender_comment_likes_comment_user", "bender_comment_likes", ["comment_id", "user_id"], {"unique": True})

    calls.clear()
    migration.downgrade()
    cleanup = [call for call in calls if call[0] == "execute"]
    assert [statement for _, statement in cleanup] == [
        "DELETE FROM bender_comment_likes WHERE comment_id IN (SELECT id FROM bender_comments WHERE parent_comment_id IS NOT NULL OR deleted_at IS NOT NULL)",
        "DELETE FROM bender_comments WHERE parent_comment_id IS NOT NULL",
        "DELETE FROM bender_comments WHERE deleted_at IS NOT NULL",
        "UPDATE bender_posts SET comment_count = (SELECT count(*) FROM bender_comments WHERE bender_comments.post_id = bender_posts.id)",
    ]
    assert calls.index(cleanup[-1]) < calls.index(("drop_index", "uq_bender_comment_likes_comment_user", {"table_name": "bender_comment_likes"}))
    assert calls[-3:] == [
        ("drop_column", "bender_comments", "deleted_at"),
        ("drop_column", "bender_comments", "like_count"),
        ("drop_column", "bender_comments", "parent_comment_id"),
    ]


def test_reply_notification_revision_follows_comment_schema():
    migration = _load("bender_reply_notification.py")
    assert migration.revision == "bender_reply_notification"
    assert migration.down_revision == "bender_comment_threads"
    statements = []
    migration.op.execute = statements.append
    migration.upgrade()
    assert statements == ["COMMIT", "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'BENDER_REPLY'", "BEGIN"]


def test_reply_notification_downgrade_deletes_feature_rows_before_base_enum_is_used():
    migration = _load("bender_reply_notification.py")
    statements = []
    migration.op.execute = statements.append
    migration.downgrade()
    assert statements == ["DELETE FROM notifications WHERE type = 'BENDER_REPLY'"]
