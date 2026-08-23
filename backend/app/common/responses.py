"""
StudyFlow AI — Standard API Response Envelope
─────────────────────────────────────────────────────────────
All Phase 2B+ modules (Profile, Providers, …) MUST use this
envelope for every response.  The Auth module is exempt and
retains its current flat schema for backward compatibility
with the Electron frontend.

Response contract
──────────────────
  {
    "success": true | false,
    "message": "Human-readable description",
    "data":    <typed payload> | null,
    "errors":  null | ["error message 1", "error message 2"]
  }

Frontend note (api-client.js)
──────────────────────────────
  api-client.js wraps the raw parsed JSON body into `res.data`:
    res = { success, data: <parsed_body>, status }

  This means frontend code reading a Profile response would use:
    const profile = res.data.data;   // res.data = parsed body, .data = payload

  Feature-specific API files (profile-api.js, providers-api.js) are
  responsible for extracting the nested .data field correctly.

Usage in routers
─────────────────
  # 200 OK with payload
  return ok_response(
      data=ProfileOut.model_validate(profile),
      message="Profile retrieved.",
  )

  # 201 Created
  return created_response(
      data=ProfileOut.model_validate(new_profile),
      message="Profile created.",
  )

  # Error (rare — prefer raising domain exceptions so handlers do this)
  return error_response(
      message="Timezone is invalid.",
      errors=["'Mars/Olympus' is not a recognised IANA timezone."],
      status_code=422,
  )
"""

from typing import Generic, List, Optional, TypeVar

from fastapi import status
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

T = TypeVar("T")


# ─── Envelope Model ───────────────────────────────────────────────────────────

class APIResponse(BaseModel, Generic[T]):
    """
    Generic Pydantic envelope for all Phase 2B+ API responses.

    Type parameter T is the shape of the `data` payload, e.g.:
      APIResponse[ProfileOut]
      APIResponse[list[ProviderStatusOut]]
      APIResponse[None]
    """

    success: bool
    message: str = ""
    data: Optional[T] = None
    errors: Optional[List[str]] = None

    model_config = {"arbitrary_types_allowed": True}

    # ─── Factory class methods ────────────────────────────────────────────

    @classmethod
    def ok(
        cls,
        data: Optional[T] = None,
        message: str = "OK",
    ) -> "APIResponse[T]":
        """Return a successful response wrapper."""
        return cls(success=True, message=message, data=data, errors=None)

    @classmethod
    def fail(
        cls,
        message: str = "An error occurred.",
        errors: Optional[List[str]] = None,
    ) -> "APIResponse[None]":
        """Return a failure response wrapper."""
        return cls(success=False, message=message, data=None, errors=errors)

    # ─── Conversion ───────────────────────────────────────────────────────

    def to_json_response(
        self,
        status_code: int = status.HTTP_200_OK,
    ) -> JSONResponse:
        """Serialize to a FastAPI-compatible JSONResponse."""
        return JSONResponse(
            status_code=status_code,
            content=self.model_dump(mode="json"),
        )


# ─── Shortcut helpers for routers ─────────────────────────────────────────────

def ok_response(
    data: Optional[object] = None,
    message: str = "OK",
    status_code: int = status.HTTP_200_OK,
) -> JSONResponse:
    """
    200 OK with the standard envelope.

    Args:
        data:        Pydantic model instance, dict, list, or None.
        message:     Human-readable success description.
        status_code: Override if a non-200 2xx code is needed.
    """
    return APIResponse.ok(data=data, message=message).to_json_response(status_code)


def created_response(
    data: Optional[object] = None,
    message: str = "Created successfully.",
) -> JSONResponse:
    """
    201 Created with the standard envelope.
    Use for POST endpoints that create a new resource.
    """
    return APIResponse.ok(data=data, message=message).to_json_response(
        status.HTTP_201_CREATED
    )


def no_content_response() -> Response:
    """
    204 No Content.
    Use for DELETE or actions that produce no response body.
    Returns a bare Response (not JSONResponse) because 204 has no body.
    """
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def error_response(
    message: str = "An error occurred.",
    errors: Optional[list] = None,
    status_code: int = status.HTTP_400_BAD_REQUEST,
) -> JSONResponse:
    """
    Error response with the standard envelope.

    Prefer raising domain exceptions (app.common.exceptions) and letting
    the registered handlers in main.py build this response automatically.
    Use this helper only when you must return an error without raising.
    """
    return APIResponse.fail(message=message, errors=errors).to_json_response(
        status_code
    )
