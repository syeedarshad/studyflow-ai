"""
StudyFlow AI — User Profile Pydantic Schemas
─────────────────────────────────────────────────────────────
Request bodies and response schemas for /api/v1/profile endpoints.
"""

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class ProfilePublic(BaseModel):
    """Public profile projection, including optimistic versioning field."""
    model_config = {"from_attributes": True}

    id: int
    user_id: int
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    timezone: str = "UTC"
    country: Optional[str] = None
    language: str = "en"
    theme: str = "system"
    study_preferences: Dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    created_at: datetime
    updated_at: datetime


class ProfileResponse(BaseModel):
    success: bool = True
    profile: ProfilePublic


class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(None, max_length=100)
    bio: Optional[str] = None
    timezone: Optional[str] = Field(None, max_length=50)
    country: Optional[str] = Field(None, max_length=100)
    language: Optional[str] = Field(None, max_length=10)
    theme: Optional[str] = Field(None, max_length=20)


class PreferencesUpdateRequest(BaseModel):
    study_preferences: Dict[str, Any] = Field(..., description="Custom study preferences JSON object.")


class AvatarUpdateRequest(BaseModel):
    avatar_url: Optional[str] = Field(None, description="URL or base64 data for profile avatar.")
