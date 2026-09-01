from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError
from app.schemas.bender import BenderAuthor, BenderCommentCreate, BenderCommentHeartResponse, BenderCommentResponse
from app.models.bender import BenderComment


def _author():
    return BenderAuthor(id=uuid4(), name="Alex")


def test_top_level_comment_request_remains_valid():
    payload = BenderCommentCreate.model_validate({"content": "Hello"})
    assert payload.content == "Hello"
    assert payload.parent_comment_id is None


def test_reply_request_accepts_parent_uuid():
    parent_id = uuid4()
    payload = BenderCommentCreate.model_validate({"content": "Reply", "parent_comment_id": str(parent_id)})
    assert payload.parent_comment_id == parent_id


def test_comment_content_is_trimmed_and_rejects_whitespace_only_input():
    """Would fail if API validation accepts an empty comment after normalizing it."""
    assert BenderCommentCreate.model_validate({"content": "  hello  "}).content == "hello"
    assert BenderCommentCreate.model_validate({"content": f" {'x' * 1000} "}).content == "x" * 1000
    with pytest.raises(ValidationError):
        BenderCommentCreate.model_validate({"content": " \n\t "})
    with pytest.raises(ValidationError):
        BenderCommentCreate.model_validate({"content": "x" * 1001})


def test_comment_response_defaults_keep_older_builders_valid():
    response = BenderCommentResponse(id=uuid4(), author=_author(), content="Hello", created_at=datetime.now(UTC))
    assert response.parent_comment_id is None
    assert response.reply_count == 0
    assert response.like_count == 0
    assert response.viewer_has_liked is False
    assert response.is_deleted is False


def test_comment_response_stringifies_identifiers():
    comment_id, parent_id = uuid4(), uuid4()
    response = BenderCommentResponse(id=comment_id, author=_author(), content="Reply", created_at=datetime.now(UTC), parent_comment_id=parent_id)
    assert response.id == str(comment_id)
    assert response.parent_comment_id == str(parent_id)


def test_comment_heart_response_serializes_exactly():
    comment_id = uuid4()
    response = BenderCommentHeartResponse(id=comment_id, like_count=3, viewer_has_liked=True)
    assert response.model_dump() == {"id": str(comment_id), "like_count": 3, "viewer_has_liked": True}


def test_parent_comment_relationship_does_not_delete_replies():
    assert "delete-orphan" not in BenderComment.replies.property.cascade
    assert "delete" not in BenderComment.replies.property.cascade


def test_comment_model_declares_the_reply_grouping_index():
    assert "idx_bender_comments_parent_created" in {
        index.name for index in BenderComment.__table__.indexes
    }
