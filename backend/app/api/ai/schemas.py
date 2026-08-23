"""
StudyFlow AI — AI Proxy & Usage Pydantic Schemas
─────────────────────────────────────────────────────────────
Request/response models for:
  POST /api/v1/ai/generate   — AI proxy endpoint
  GET  /api/v1/usage         — per-user usage summary
"""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


# ─── AI Generate Request ──────────────────────────────────────────────────────

class AIGenerateRequest(BaseModel):
    """
    Payload sent by Electron provider-manager.js to the backend AI proxy.

    The frontend NEVER sends or receives provider API keys.
    prompt: the fully-built prompt string (assembled by provider-manager.js)
    feature: optional label for logging (e.g. 'planner', 'coach', 'roadmap')
    expect_json: whether the caller expects JSON back (default True)
    """
    prompt: str = Field(..., min_length=1, max_length=65536)
    feature: Optional[str] = Field(None, max_length=50)
    expect_json: bool = Field(True)


class AIGenerateResponse(BaseModel):
    """
    Response from the AI proxy.  NEVER includes provider credentials.
    """
    success: bool
    text: str = ""                # the AI-generated text
    provider: str = "offline"     # 'gemini', 'groq', or 'offline'
    model: Optional[str] = None   # model name if available
    tokens_used: Optional[int] = None
    error: Optional[str] = None   # safe user-facing error message only


# ─── Usage Summary ────────────────────────────────────────────────────────────

class UsageResponse(BaseModel):
    """
    Safe usage summary returned by GET /api/v1/usage.
    NEVER includes provider credentials or internal secrets.
    """
    used: int
    daily_limit: int
    remaining: int
    reset_at: str   # ISO-8601 UTC timestamp of next reset (midnight UTC)


# ─── Provider Status (for AI Services card in Settings) ──────────────────────

class ProviderAvailabilityResponse(BaseModel):
    """Indicates whether each server-side provider key is configured."""
    gemini_available: bool
    groq_available: bool
