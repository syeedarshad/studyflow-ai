"""
StudyFlow AI — User Profile Router
─────────────────────────────────────────────────────────────
All /api/v1/profile/* endpoints.

GET    /api/v1/profile             Get current user profile
PUT    /api/v1/profile             Update profile fields
PATCH  /api/v1/profile/preferences Update study preferences JSON
PATCH  /api/v1/profile/avatar      Update avatar URL
DELETE /api/v1/profile/avatar      Remove avatar URL
"""

import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.dependencies import CurrentAuth, require_auth
from app.api.profile.schemas import (
    AvatarUpdateRequest,
    PreferencesUpdateRequest,
    ProfilePublic,
    ProfileResponse,
    ProfileUpdateRequest,
)
from app.api.profile.service import ProfileService
from database.base import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["User Profile"])


@router.get(
    "",
    response_model=ProfileResponse,
    summary="Get current user profile",
)
async def get_profile(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    service = ProfileService(db)
    profile = await service.get_or_create_profile(
        user_id=auth.user.id,
        default_display_name=auth.user.full_name,
    )
    return ProfileResponse(profile=ProfilePublic.model_validate(profile))


@router.put(
    "",
    response_model=ProfileResponse,
    summary="Update profile details",
)
async def update_profile(
    body: ProfileUpdateRequest,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    service = ProfileService(db)
    updates = body.model_dump(exclude_unset=True)
    profile = await service.update_profile(user_id=auth.user.id, updates=updates)
    return ProfileResponse(profile=ProfilePublic.model_validate(profile))


@router.patch(
    "/preferences",
    response_model=ProfileResponse,
    summary="Update study preferences",
)
async def update_preferences(
    body: PreferencesUpdateRequest,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    service = ProfileService(db)
    profile = await service.update_preferences(
        user_id=auth.user.id,
        preferences=body.study_preferences,
    )
    return ProfileResponse(profile=ProfilePublic.model_validate(profile))


@router.patch(
    "/avatar",
    response_model=ProfileResponse,
    summary="Update profile avatar URL",
)
async def update_avatar(
    body: AvatarUpdateRequest,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    service = ProfileService(db)
    profile = await service.update_avatar(
        user_id=auth.user.id,
        avatar_url=body.avatar_url,
    )
    return ProfileResponse(profile=ProfilePublic.model_validate(profile))


@router.delete(
    "/avatar",
    response_model=ProfileResponse,
    summary="Delete profile avatar URL",
)
async def delete_avatar(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    service = ProfileService(db)
    profile = await service.update_avatar(user_id=auth.user.id, avatar_url=None)
    return ProfileResponse(profile=ProfilePublic.model_validate(profile))
