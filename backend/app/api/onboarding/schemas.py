"""
StudyFlow AI — Onboarding Schemas
─────────────────────────────────────────────────────────────
Pydantic schemas for onboarding messages, file uploads, and state endpoints.
"""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class OnboardingMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000, description="Onboarding conversational message text")
    idempotency_key: Optional[str] = Field(None, max_length=100, description="Optional client idempotency key")


class OnboardingMessageResponse(BaseModel):
    success: bool
    context_id: int
    status: str
    source_type: str
    chunks_created: int
    onboarding_status: str
    message: str


class OnboardingUploadResponse(BaseModel):
    success: bool
    context_id: int
    source_type: str
    filename: str
    status: str
    chunks_created: int
    message: str


class OnboardingStatusResponse(BaseModel):
    onboarding_status: str
    contexts_count: int
    sources: list[str]
    completed: bool


class OnboardingActionResponse(BaseModel):
    success: bool
    onboarding_status: str
    message: str


class ProfileContextDetailResponse(BaseModel):
    id: int
    user_id: int
    source_type: str
    original_content: Optional[str]
    extracted_summary: Optional[str]
    context_metadata: dict[str, Any]
    status: str
    created_at: datetime
    updated_at: datetime
