"""
StudyFlow AI — User Profile Repository
─────────────────────────────────────────────────────────────
All database queries for the profile module.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.profile.models import UserProfile


class ProfileRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_user_id(self, user_id: int) -> Optional[UserProfile]:
        result = await self.db.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create_default(
        self,
        user_id: int,
        display_name: Optional[str] = None,
    ) -> UserProfile:
        profile = UserProfile(
            user_id=user_id,
            display_name=display_name,
            timezone="UTC",
            language="en",
            theme="system",
            study_preferences={
                "pomodoro_duration_minutes": 25,
                "short_break_minutes": 5,
                "long_break_minutes": 15,
                "daily_goal_hours": 4,
                "notifications_enabled": True,
            },
            version=1,
        )
        self.db.add(profile)
        await self.db.flush()
        await self.db.refresh(profile)
        return profile

    async def update_profile_fields(
        self,
        user_id: int,
        updates: Dict[str, Any],
    ) -> UserProfile:
        profile = await self.get_by_user_id(user_id)
        if not profile:
            profile = await self.create_default(user_id)

        filtered_updates = {k: v for k, v in updates.items() if v is not None}
        filtered_updates["version"] = profile.version + 1
        filtered_updates["updated_at"] = datetime.now(timezone.utc)

        await self.db.execute(
            update(UserProfile)
            .where(UserProfile.user_id == user_id)
            .values(**filtered_updates)
        )
        await self.db.flush()

        # Re-fetch fresh model instance
        self.db.expire_all()
        return await self.get_by_user_id(user_id)

    async def update_preferences(
        self,
        user_id: int,
        study_preferences: Dict[str, Any],
    ) -> UserProfile:
        profile = await self.get_by_user_id(user_id)
        if not profile:
            profile = await self.create_default(user_id)

        new_version = profile.version + 1
        now = datetime.now(timezone.utc)

        await self.db.execute(
            update(UserProfile)
            .where(UserProfile.user_id == user_id)
            .values(
                study_preferences=study_preferences,
                version=new_version,
                updated_at=now,
            )
        )
        await self.db.flush()

        self.db.expire_all()
        return await self.get_by_user_id(user_id)

    async def update_avatar(
        self,
        user_id: int,
        avatar_url: Optional[str],
    ) -> UserProfile:
        profile = await self.get_by_user_id(user_id)
        if not profile:
            profile = await self.create_default(user_id)

        new_version = profile.version + 1
        now = datetime.now(timezone.utc)

        await self.db.execute(
            update(UserProfile)
            .where(UserProfile.user_id == user_id)
            .values(
                avatar_url=avatar_url,
                version=new_version,
                updated_at=now,
            )
        )
        await self.db.flush()

        self.db.expire_all()
        return await self.get_by_user_id(user_id)
