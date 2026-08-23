"""
StudyFlow AI — AI Provider Vault Router (DEPRECATED write paths)
─────────────────────────────────────────────────────────────
GET    /api/v1/providers            Returns server-managed provider status
GET    /api/v1/providers/{provider} Status for a specific provider (server-managed)

DEPRECATED (410 Gone):
PUT    /api/v1/providers            User key management removed — keys are server-side
DELETE /api/v1/providers/{provider} User key management removed — keys are server-side

As of Phase 4, AI provider credentials are managed exclusively by the backend
via GEMINI_API_KEY / GROQ_API_KEY environment variables.
Users no longer supply their own provider keys.

The provider_keys database table is preserved for migration safety
but is no longer written to by any user-facing API.
"""

import logging

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.dependencies import CurrentAuth, require_auth
from app.api.providers.schemas import (
    ProvidersListResponse,
    ProviderStatusResponse,
)
from core.config import get_settings
from database.base import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/providers", tags=["AI Provider Vault"])
settings = get_settings()

# Safe deprecation message — never mentions actual key values
_DEPRECATED_MSG = (
    "User API key management has been removed. "
    "AI provider credentials are now managed server-side by StudyFlow AI."
)


@router.get(
    "",
    response_model=ProvidersListResponse,
    summary="Get server-managed provider availability status",
)
async def list_providers(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> ProvidersListResponse:
    """
    Returns the availability of server-managed AI providers.
    No user API keys involved — status reflects server configuration only.
    API keys are NEVER returned.
    """
    gemini_configured = bool(settings.effective_gemini_key)
    groq_configured = bool(settings.effective_groq_key)

    return ProvidersListResponse(
        providers=[
            ProviderStatusResponse(
                provider="gemini",
                configured=gemini_configured,
                masked_key=None,  # Never expose key status as masked chars
            ),
            ProviderStatusResponse(
                provider="groq",
                configured=groq_configured,
                masked_key=None,
            ),
        ]
    )


@router.put(
    "",
    summary="[DEPRECATED] User API key management removed",
    status_code=status.HTTP_410_GONE,
    response_class=JSONResponse,
)
async def save_provider_key_deprecated(
    auth: CurrentAuth = Depends(require_auth),
) -> JSONResponse:
    """
    This endpoint has been permanently removed.
    AI provider credentials are now managed server-side via environment variables.
    """
    logger.info(
        "Deprecated PUT /providers called by user_id=%s — returning 410",
        auth.user.id,
    )
    return JSONResponse(
        status_code=status.HTTP_410_GONE,
        content={
            "success": False,
            "message": _DEPRECATED_MSG,
            "detail": "Use the server-managed AI service instead.",
        },
    )


@router.get(
    "/{provider}",
    response_model=ProviderStatusResponse,
    summary="Get server-managed status for a specific provider",
)
async def get_provider_status(
    provider: str,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> ProviderStatusResponse:
    """
    Returns whether the specified provider is configured server-side.
    API keys are NEVER returned.
    """
    provider_clean = provider.lower().strip()
    if provider_clean == "gemini":
        configured = bool(settings.effective_gemini_key)
    elif provider_clean == "groq":
        configured = bool(settings.effective_groq_key)
    else:
        configured = False

    return ProviderStatusResponse(
        provider=provider_clean,
        configured=configured,
        masked_key=None,
    )


@router.delete(
    "/{provider}",
    summary="[DEPRECATED] User API key management removed",
    status_code=status.HTTP_410_GONE,
    response_class=JSONResponse,
)
async def remove_provider_key_deprecated(
    provider: str,
    auth: CurrentAuth = Depends(require_auth),
) -> JSONResponse:
    """
    This endpoint has been permanently removed.
    AI provider credentials are now managed server-side via environment variables.
    """
    logger.info(
        "Deprecated DELETE /providers/%s called by user_id=%s — returning 410",
        provider, auth.user.id,
    )
    return JSONResponse(
        status_code=status.HTTP_410_GONE,
        content={
            "success": False,
            "message": _DEPRECATED_MSG,
            "detail": "Use the server-managed AI service instead.",
        },
    )
