import importlib.util
from pathlib import Path

from sqlalchemy.dialects import postgresql


def _load_migration():
    path = Path(__file__).parents[1] / "alembic" / "versions" / "bender_link_preview.py"
    spec = importlib.util.spec_from_file_location("bender_link_preview_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_adds_nullable_jsonb_column(monkeypatch):
    migration = _load_migration()
    captured = {}

    def add_column(table, column):
        captured["table"] = table
        captured["column"] = column

    def drop_column(table, column):
        captured.setdefault("dropped", []).append((table, column))

    monkeypatch.setattr(migration.op, "add_column", add_column)
    monkeypatch.setattr(migration.op, "drop_column", drop_column)
    migration.upgrade()

    assert migration.revision == "bender_link_preview"
    assert migration.down_revision == "westmoreland_pricing"
    assert captured["table"] == "bender_posts"
    assert captured["column"].name == "link_preview"
    assert isinstance(captured["column"].type, postgresql.JSONB)
    assert captured["column"].nullable is True
    migration.downgrade()
    assert ("bender_posts", "link_preview") in captured["dropped"]
