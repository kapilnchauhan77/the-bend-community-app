from unittest.mock import patch

import pytest
from fastapi import Request

from app.core.exceptions import RateLimitError
from app.core.rate_limit import check_rate_limit


class StatefulPipeline:
    def __init__(self, redis):
        self.redis = redis
        self.commands = []

    def zremrangebyscore(self, key, minimum, maximum):
        self.commands.append(("zremrangebyscore", (key, minimum, maximum)))
        return self

    def zadd(self, key, members):
        self.commands.append(("zadd", (key, members)))
        return self

    def zcard(self, key):
        self.commands.append(("zcard", (key,)))
        return self

    def expire(self, key, seconds):
        self.commands.append(("expire", (key, seconds)))
        return self

    async def execute(self):
        if self.redis.failure is not None:
            raise self.redis.failure
        results = []
        for command, args in self.commands:
            if command == "zremrangebyscore":
                key, _minimum, maximum = args
                entries = self.redis.zsets.setdefault(key, {})
                removed = sum(score <= maximum for score in entries.values())
                self.redis.zsets[key] = {member: score for member, score in entries.items() if score > maximum}
                results.append(removed)
            elif command == "zadd":
                key, members = args
                self.redis.zsets.setdefault(key, {}).update(members)
                results.append(1)
            elif command == "zcard":
                results.append(len(self.redis.zsets.get(args[0], {})))
            elif command == "expire":
                self.redis.expiries[args[0]] = args[1]
                results.append(True)
        self.redis.pipelines.append(self)
        return results


class StatefulRedis:
    def __init__(self, *, failure=None):
        self.zsets = {}
        self.expiries = {}
        self.pipelines = []
        self.failure = failure

    def pipeline(self):
        return StatefulPipeline(self)


def _request(path="/api/v1/bender/link-preview"):
    scope = {
        "type": "http", "method": "POST", "path": path, "headers": [],
        "client": ("127.0.0.1", 1), "scheme": "http", "server": ("test", 80),
        "query_string": b"",
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_stateful_limiter_keeps_unique_members_and_atomic_command_order():
    redis = StatefulRedis()
    with patch("app.core.rate_limit.get_redis", return_value=redis), patch("app.core.rate_limit.time.time", return_value=1000.0):
        for _ in range(11):
            await check_rate_limit(_request(), "same-user", 20, 60)
    key = "rate:same-user:POST:/api/v1/bender/link-preview"
    assert len(redis.zsets[key]) == 11
    assert all(member.startswith("1000.000000000:") for member in redis.zsets[key])
    assert all(
        [command[0] for command in pipeline.commands] == ["zremrangebyscore", "zadd", "zcard", "expire"]
        for pipeline in redis.pipelines
    )


@pytest.mark.asyncio
async def test_stateful_limiter_allows_ten_then_rejects_eleventh_and_prunes_old_entries():
    redis = StatefulRedis()
    with patch("app.core.rate_limit.get_redis", return_value=redis), patch("app.core.rate_limit.time.time", return_value=1000.0):
        for _ in range(10):
            await check_rate_limit(_request(), "same-user", 10, 60)
        with pytest.raises(RateLimitError):
            await check_rate_limit(_request(), "same-user", 10, 60)
        with patch("app.core.rate_limit.time.time", return_value=1061.0):
            await check_rate_limit(_request(), "same-user", 10, 60)
    key = "rate:same-user:POST:/api/v1/bender/link-preview"
    assert len(redis.zsets[key]) == 1
    assert redis.expiries[key] == 60


@pytest.mark.asyncio
async def test_stateful_limiter_isolates_users_and_endpoint_paths():
    redis = StatefulRedis()
    with patch("app.core.rate_limit.get_redis", return_value=redis), patch("app.core.rate_limit.time.time", return_value=1000.0):
        await check_rate_limit(_request(), "user-a", 1, 60)
        await check_rate_limit(_request(), "user-b", 1, 60)
        await check_rate_limit(_request("/api/v1/bender/other"), "user-a", 1, 60)
    assert set(redis.zsets) == {
        "rate:user-a:POST:/api/v1/bender/link-preview",
        "rate:user-b:POST:/api/v1/bender/link-preview",
        "rate:user-a:POST:/api/v1/bender/other",
    }


@pytest.mark.asyncio
async def test_timestamp_only_member_regression_would_collapse_same_timestamp_requests():
    redis = StatefulRedis()
    with patch("app.core.rate_limit.get_redis", return_value=redis), patch("app.core.rate_limit.time.time", return_value=1000.0):
        await check_rate_limit(_request(), "same-user", 20, 60)
        await check_rate_limit(_request(), "same-user", 20, 60)
    key = "rate:same-user:POST:/api/v1/bender/link-preview"
    assert len(redis.zsets[key]) == 2
    assert len({member.split(":", 1)[0] for member in redis.zsets[key]}) == 1
