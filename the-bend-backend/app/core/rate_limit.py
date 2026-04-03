"""Redis-based sliding window rate limiter."""
import time
from typing import Callable

from fastapi import Request, Depends
from redis.asyncio import Redis

from app.config import get_settings
from app.core.exceptions import RateLimitError

settings = get_settings()

# Lazy Redis connection
_redis_client: Redis | None = None


async def get_redis() -> Redis:
    """Get or create Redis connection."""
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


# Rate limit configurations per endpoint pattern
RATE_LIMITS = {
    "POST:/api/v1/auth/login": (5, 900),          # 5 per 15 min
    "POST:/api/v1/auth/register": (3, 3600),       # 3 per hour
    "POST:/api/v1/auth/forgot-password": (3, 3600), # 3 per hour
    "POST:/api/v1/listings": (10, 3600),            # 10 per hour
    "POST:/api/v1/messages": (60, 60),              # 60 per min
    "POST:/api/v1/interests": (20, 3600),           # 20 per hour
}

DEFAULT_RATE_LIMIT = (100, 60)  # 100 per minute


async def check_rate_limit(
    request: Request,
    identifier: str,
    max_requests: int,
    window_seconds: int,
):
    """Check rate limit using Redis sliding window counter."""
    redis = await get_redis()
    key = f"rate:{identifier}:{request.method}:{request.url.path}"
    now = time.time()
    window_start = now - window_seconds

    pipe = redis.pipeline()
    # Remove old entries
    pipe.zremrangebyscore(key, 0, window_start)
    # Add current request
    pipe.zadd(key, {str(now): now})
    # Count requests in window
    pipe.zcard(key)
    # Set expiry on the key
    pipe.expire(key, window_seconds)
    results = await pipe.execute()

    request_count = results[2]
    if request_count > max_requests:
        raise RateLimitError(retry_after=window_seconds)


def rate_limit(max_requests: int | None = None, window_seconds: int | None = None):
    """Dependency factory for rate limiting a specific endpoint."""
    async def dependency(request: Request):
        # Determine identifier (user_id if authenticated, IP if not)
        identifier = request.client.host if request.client else "unknown"
        
        # Check for auth header to get user ID
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            try:
                from app.core.security import decode_access_token
                payload = decode_access_token(auth[7:])
                identifier = payload.get("sub", identifier)
            except Exception:
                pass

        # Get rate limit config
        endpoint_key = f"{request.method}:{request.url.path}"
        if max_requests is not None and window_seconds is not None:
            limit = (max_requests, window_seconds)
        else:
            limit = RATE_LIMITS.get(endpoint_key, DEFAULT_RATE_LIMIT)

        await check_rate_limit(request, identifier, limit[0], limit[1])

    return dependency
