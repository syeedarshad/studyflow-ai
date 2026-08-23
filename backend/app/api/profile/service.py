"""
StudyFlow AI — User Profile Service
─────────────────────────────────────────────────────────────
Business logic for user profiles and preferences management.
"""

import logging
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.profile.models import UserProfile
from app.api.profile.repository import ProfileRepository

logger = logging.getLogger(__name__)


class ProfileService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ProfileRepository(db)

    async def get_or_create_profile(
        self,
        user_id: int,
        default_display_name: Optional[str] = None,
    ) -> UserProfile:
        profile = await self.repo.get_by_user_id(user_id)
        if not profile:
            profile = await self.repo.create_default(user_id, display_name=default_display_name)
            logger.info("Created default UserProfile for user_id=%s", user_id)
        return profile

    async def update_profile(
        self,
        user_id: int,
        updates: Dict[str, Any],
    ) -> UserProfile:
        updated = await self.repo.update_profile_fields(user_id, updates)
        logger.info("Updated UserProfile for user_id=%s (version=%s)", user_id, updated.version)
        return updated

    async def update_preferences(
        self,
        user_id: int,
        preferences: Dict[str, Any],
    ) -> UserProfile:
        updated = await self.repo.update_preferences(user_id, preferences)
        logger.info("Updated study preferences for user_id=%s (version=%s)", user_id, updated.version)
        return updated

    async def update_avatar(
        self,
        user_id: int,
        avatar_url: Optional[str],
    ) -> UserProfile:
        updated = await self.repo.update_avatar(user_id, avatar_url)
        logger.info("Updated avatar for user_id=%s (version=%s)", user_id, updated.version)
        return updated
