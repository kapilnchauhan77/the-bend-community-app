import base64
import json
from datetime import datetime
from uuid import UUID


def encode_cursor(values: dict) -> str:
    """Encode pagination cursor values to an opaque base64 string."""
    serializable = {}
    for key, value in values.items():
        if isinstance(value, datetime):
            serializable[key] = value.isoformat()
        elif isinstance(value, UUID):
            serializable[key] = str(value)
        else:
            serializable[key] = value
    return base64.urlsafe_b64encode(json.dumps(serializable).encode()).decode()


def decode_cursor(cursor: str) -> dict:
    """Decode an opaque cursor string back to pagination values."""
    try:
        return json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
    except Exception:
        return {}


class PaginatedResult:
    """Wrapper for paginated query results."""
    def __init__(self, items: list, next_cursor: str | None, has_more: bool):
        self.items = items
        self.next_cursor = next_cursor
        self.has_more = has_more

    def to_dict(self) -> dict:
        return {
            "items": self.items,
            "next_cursor": self.next_cursor,
            "has_more": self.has_more,
        }
