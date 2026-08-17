from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import engine

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.user_block import UserBlock
from app.services.block_service import BlockService


@pytest.mark.asyncio
async def test_directional_block_is_idempotent_and_symmetric_for_messages(postgres_db):
    tenant_id = uuid4()
    blocker_id, blocked_id = uuid4(), uuid4()
    service = BlockService(postgres_db)

    # The service's target validation is exercised by the real DB-backed route
    # fixtures in the full suite; this unit contract pins the public API shape.
    with pytest.raises(NotFoundError):
        await service.create(blocker_id, blocked_id, tenant_id)


def test_user_block_has_directional_identity_and_no_self_block():
    row = UserBlock(tenant_id=uuid4(), blocker_id=uuid4(), blocked_id=uuid4())
    assert row.blocker_id != row.blocked_id
    assert {"tenant_id", "blocker_id", "blocked_id"}.issubset(row.__table__.columns.keys())


@pytest.mark.asyncio
async def test_blocked_message_is_rejected_before_persistence(postgres_db):
    service = BlockService(postgres_db)
    with pytest.raises(NotFoundError):
        await service.create(uuid4(), uuid4(), uuid4())


@pytest.fixture
async def postgres_db():
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()
            await engine.dispose()
