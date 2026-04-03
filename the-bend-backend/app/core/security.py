from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings
from app.core.exceptions import UnauthorizedError

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Token types
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
RESET_TOKEN_TYPE = "reset"


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    user_id: UUID,
    role: str,
    shop_id: UUID | None = None,
) -> str:
    """Create a short-lived access token (30 min)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "shop_id": str(shop_id) if shop_id else None,
        "exp": expire,
        "type": ACCESS_TOKEN_TYPE,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def create_refresh_token(user_id: UUID) -> str:
    """Create a long-lived refresh token (7 days)."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": REFRESH_TOKEN_TYPE,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def create_reset_token(user_id: UUID) -> str:
    """Create a password reset token (1 hour)."""
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": RESET_TOKEN_TYPE,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def decode_token(token: str, expected_type: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        raise UnauthorizedError("Invalid or expired token")

    if payload.get("type") != expected_type:
        raise UnauthorizedError(f"Invalid token type: expected {expected_type}")

    return payload


def decode_access_token(token: str) -> dict:
    """Decode an access token and return payload."""
    return decode_token(token, ACCESS_TOKEN_TYPE)


def decode_refresh_token(token: str) -> dict:
    """Decode a refresh token and return payload."""
    return decode_token(token, REFRESH_TOKEN_TYPE)


def decode_reset_token(token: str) -> dict:
    """Decode a password reset token and return payload."""
    return decode_token(token, RESET_TOKEN_TYPE)
