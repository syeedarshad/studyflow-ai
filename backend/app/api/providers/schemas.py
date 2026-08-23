"""
StudyFlow AI — AI Provider Vault Schemas
─────────────────────────────────────────────────────────────
Request bodies and response models for /api/v1/providers endpoints.
Strictly enforces provider enum validation and masked key responses.
"""

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class AllowedProvider(str, Enum):
    GEMINI = "gemini"
    OPENAI = "openai"
    GROQ = "groq"
    CLAUDE = "claude"


class ProviderStatusResponse(BaseModel):
    """Masked provider status response — NEVER includes plaintext keys."""
    provider: str
    configured: bool
    masked_key: Optional[str] = "••••••••"


class ProvidersListResponse(BaseModel):
    success: bool = True
    providers: List[ProviderStatusResponse]


class SaveProviderKeyRequest(BaseModel):
    provider: str = Field(..., description="Provider identifier: gemini | openai | groq | claude")
    api_key: str = Field(..., min_length=1, max_length=1000, description="Plaintext API key — encrypted immediately on server.")


class RemoveProviderResponse(BaseModel):
    success: bool = True
    message: str = "Provider API key removed successfully."
