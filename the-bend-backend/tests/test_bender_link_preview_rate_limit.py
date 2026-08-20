import asyncio
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import Request

from app.core.exceptions import RateLimitError
from app.core.rate_limit import check_rate_limit


class FakePipeline:
    def __init__(self, redis):
        self.redis = redis
        self.commands = []

    def zremrangebyscore(self, *args):
        self.commands.append(("zremrangebyscore", args))
        return self

    def zadd(self, *args):
        self.commands.append(("zadd", args))
        return self

    def zcard(self, *args):
        self.commands.append(("zcard", args))
        return self

    def expire(self, *args):
        self.commands.append(("expire", args))
        return self

    async def execute(self):
        self.redis.pipelines.append(self)
        count = self.redis.counts.pop(0) if self.redis.counts else 1
        return [0, 1, count, True]


class FakeRedis:
    def __init__(self, counts=None):
        self.counts = list(counts or [])
        self.pipelines = []

    def pipeline(self):
        return FakePipeline(self)


def _request(path="/api/v1/bender/link-preview"):
    scope = {"type": "http", "method": "POST", "path": path, "headers": [], "client": ("127.0.0.1", 1), "scheme": "http", "server": ("test", 80), "query_string": b""}
    return Request(scope)


@pytest.mark.asyncio
async def test_same_timestamp_uses_unique_members_and_atomic_command_order():
    redis = FakeRedis(counts=[1] * 11)
    with patch("app.core.rate_limit.get_redis", return_value=redis), patch("app.core.rate_limit.time.time", return_value=1000.0):
        for _ in range(11):
            await check_rate_limit(_request(), str(uuid4()), 20, 60)
    members = [next(command[1][1].keys().__iter__()) for pipeline in redis.pipelines for command in pipeline.commands if command[0] == "zadd"]
    assert len(members) == len(set(members)) == 11
    assert all([ [command[0] for command in pipeline.commands] == ["zremrangebyscore", "zadd", "zcard", "expire"] for pipeline in redis.pipelines ])


@pytest.mark.asyncio
async def test_only_first_ten_requests_pass_for_one_user():
    redis = FakeRedis(counts=list(range(1, 12)))
    with patch("app.core.rate_limit.get_redis", return_value=redis), patch("app.core.rate_limit.time.time", return_value=1000.0):
        for _ in range(10):
            await check_rate_limit(_request(), "user", 10, 60)
        with pytest.raises(RateLimitError):
            await check_rate_limit(_request(), "user", 10, 60)

