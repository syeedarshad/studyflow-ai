"""
StudyFlow AI — Domain Exceptions
─────────────────────────────────────────────────────────────
Pure domain exceptions with zero dependency on FastAPI or HTTP.

Design principle (Clean Architecture)
───────────────────────────────────────
Services raise domain exceptions.
Routers catch them and translate them to HTTP responses.
This keeps business logic transport-agnostic and fully testable
without spinning up an HTTP server.

Exception hierarchy
────────────────────
  StudyFlowError                  ← base; always safe to catch
    ├── NotFoundError             → HTTP 404
    ├── ConflictError             → HTTP 409
    ├── AuthenticationError       → HTTP 401
    ├── AuthorizationError        → HTTP 403
    └── DomainValidationError     → HTTP 422

Registered exception handlers (in app/main.py) translate each
exception type to its appropriate HTTP status code and the
standard { success, message, data, errors } envelope.

Usage in services:
    if not user:
        raise NotFoundError("User")

    if await self.repo.email_exists(email):
        raise ConflictError("An account with that email already exists.", code="email_taken")
"""

from typing import Optional


# ─── Base ─────────────────────────────────────────────────────────────────────

class StudyFlowError(Exception):
    """
    Base class for all StudyFlow domain errors.

    Every subclass exposes:
      .message  — human-readable description (safe to surface in API responses)
      .code     — machine-readable slug (e.g. 'email_taken') for frontend i18n
    """

    def __init__(self, message: str, code: Optional[str] = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code or "error"


# ─── Concrete domain exceptions ───────────────────────────────────────────────

class NotFoundError(StudyFlowError):
    """
    Raised when a requested resource does not exist in the database.
    Translates to HTTP 404.

    Args:
        resource:   Human-readable resource name, e.g. "User", "Profile".
        identifier: Optional value used to identify the resource in the message.
    """

    def __init__(
        self,
        resource: str = "Resource",
        identifier: Optional[str] = None,
    ) -> None:
        if identifier:
            msg = f"{resource} '{identifier}' not found."
        else:
            msg = f"{resource} not found."
        super().__init__(msg, code="not_found")
        self.resource = resource
        self.identifier = identifier


class ConflictError(StudyFlowError):
    """
    Raised when an operation would violate a uniqueness constraint or
    create an invalid duplicate state.
    Translates to HTTP 409.

    Args:
        message: Specific description of the conflict.
        code:    Optional machine-readable code (default: 'conflict').
    """

    def __init__(
        self,
        message: str = "A conflict occurred.",
        code: str = "conflict",
    ) -> None:
        super().__init__(message, code=code)


class AuthenticationError(StudyFlowError):
    """
    Raised when credentials are missing, invalid, or a session has been
    revoked / expired.
    Translates to HTTP 401.

    Note: The auth module currently raises HTTPException directly for
    backward compatibility.  This exception is used by all NEW modules
    (Profile, Providers, etc.) and will be back-applied to auth in a
    future migration phase.
    """

    def __init__(self, message: str = "Authentication required.") -> None:
        super().__init__(message, code="unauthenticated")


class AuthorizationError(StudyFlowError):
    """
    Raised when an authenticated user lacks permission to perform an action.
    Translates to HTTP 403.
    """

    def __init__(
        self,
        message: str = "You do not have permission to perform this action.",
    ) -> None:
        super().__init__(message, code="forbidden")


class DomainValidationError(StudyFlowError):
    """
    Raised when input passes Pydantic schema validation but fails
    domain-level business rules (e.g. "end_date must be after start_date").
    Translates to HTTP 422.

    Args:
        message: Clear description of the validation failure.
        field:   Optional field name to pinpoint the problematic input.
    """

    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
    ) -> None:
        super().__init__(message, code="validation_error")
        self.field = field
