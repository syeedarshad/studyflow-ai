"""
StudyFlow AI — AI Proxy & Usage Router
─────────────────────────────────────────────────────────────
Endpoints:
  POST /api/v1/ai/generate    — proxy AI request (Gemini → Groq)
  GET  /api/v1/usage          — per-user daily usage summary
  GET  /api/v1/ai/status      — server-managed provider availability

Security:
  - All endpoints require authentication.
  - Provider credentials NEVER appear in any response.
  - Users can only see their own usage (derived from session token).
"""

import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.dependencies import CurrentAuth, require_auth
from app.api.ai.repository import AIUsageRepository
from app.api.ai.schemas import (
    AIGenerateRequest,
    AIGenerateResponse,
    ProviderAvailabilityResponse,
    UsageResponse,
)
from app.api.ai.service import AIProviderService
from core.config import get_settings
from database.base import get_db

logger = logging.getLogger(__name__)
settings = get_settings()

# Two routers: one under /ai, one standalone for /usage
ai_router = APIRouter(prefix="/ai", tags=["AI Service"])
usage_router = APIRouter(tags=["AI Usage"])


# ─── POST /api/v1/ai/generate ────────────────────────────────────────────────

@ai_router.post(
    "/generate",
    response_model=AIGenerateResponse,
    summary="Proxy an AI generation request through the server",
    status_code=status.HTTP_200_OK,
)
async def generate_ai_response(
    body: AIGenerateRequest,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> AIGenerateResponse:
    """
    Authenticated AI proxy endpoint.

    The frontend sends the fully-built prompt; the backend:
      1. Validates the session
      2. Enforces the daily quota (HTTP 429 if exceeded)
      3. Calls Gemini → Groq fallback using SERVER-SIDE keys
      4. Records the request in ai_usage_logs
      5. Returns the AI text response

    Provider credentials are NEVER returned.
    """
    service = AIProviderService(db)
    result = await service.generate(
        user_id=auth.user.id,
        prompt=body.prompt,
        feature=body.feature,
        expect_json=body.expect_json,
    )

    return AIGenerateResponse(
        success=result["success"],
        text=result.get("text", ""),
        provider=result.get("provider", "offline"),
        model=result.get("model"),
        offline=result.get("offline", not result["success"]),
        fallback_used=result.get("fallback_used", False),
        tokens_used=result.get("tokens_used"),
        error=result.get("error"),
    )


# ─── GET /api/v1/usage ───────────────────────────────────────────────────────

@usage_router.get(
    "/usage",
    response_model=UsageResponse,
    summary="Get the authenticated user's daily AI usage",
    status_code=status.HTTP_200_OK,
)
async def get_usage(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> UsageResponse:
    """
    Returns today's usage for the authenticated user only.

    User identity is derived from the session token — users cannot
    query another user's usage.  No user_id parameter is accepted.

    Response never includes provider credentials.
    """
    repo = AIUsageRepository(db)
    summary = await repo.get_today_summary(
        user_id=auth.user.id,
        daily_limit=settings.AI_DAILY_REQUEST_LIMIT,
    )

    return UsageResponse(**summary)


# ─── GET /api/v1/ai/status ───────────────────────────────────────────────────

@ai_router.get(
    "/status",
    response_model=ProviderAvailabilityResponse,
    summary="Check which AI providers are configured server-side",
    status_code=status.HTTP_200_OK,
)
async def get_provider_status(
    auth: CurrentAuth = Depends(require_auth),
) -> ProviderAvailabilityResponse:
    """
    Returns which AI providers have server-side keys configured and their health state.
    Used by the Settings 'AI Services' card.

    ONLY returns boolean availability and health status — never the actual keys.
    """
    health = AIProviderService.get_provider_health()
    return ProviderAvailabilityResponse(
        gemini_available=health["gemini"]["available"],
        groq_available=health["groq"]["available"],
        gemini_status=health["gemini"]["status"],
        groq_status=health["groq"]["status"],
    )
