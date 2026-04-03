from fastapi import HTTPException, status


class AppException(HTTPException):
    """Base application exception."""
    def __init__(self, status_code: int, code: str, message: str, details: list | None = None):
        self.code = code
        self.details = details
        super().__init__(status_code=status_code, detail={
            "error": {
                "code": code,
                "message": message,
                "details": details or [],
            }
        })


class ValidationError(AppException):
    def __init__(self, message: str = "Validation error", details: list | None = None):
        super().__init__(status.HTTP_400_BAD_REQUEST, "VALIDATION_ERROR", message, details)


class UnauthorizedError(AppException):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", message)


class ForbiddenError(AppException):
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(status.HTTP_403_FORBIDDEN, "FORBIDDEN", message)


class NotFoundError(AppException):
    def __init__(self, resource: str = "Resource", message: str | None = None):
        super().__init__(status.HTTP_404_NOT_FOUND, "NOT_FOUND", message or f"{resource} not found")


class ConflictError(AppException):
    def __init__(self, message: str = "Resource already exists"):
        super().__init__(status.HTTP_409_CONFLICT, "CONFLICT", message)


class BusinessRuleViolation(AppException):
    def __init__(self, message: str):
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY, "BUSINESS_RULE_VIOLATION", message)


class RateLimitError(AppException):
    def __init__(self, retry_after: int = 60):
        super().__init__(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            f"Too many requests. Retry after {retry_after} seconds",
        )
        self.retry_after = retry_after
