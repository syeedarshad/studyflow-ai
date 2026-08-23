"""
StudyFlow AI — Onboarding Context Repository
─────────────────────────────────────────────────────────────
Direct database operations for UserProfileContext and User onboarding status.
All queries strictly enforce user_id scoping.
"""

from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.onboarding.models import UserProfileContext


class OnboardingRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, user_id: int, context_id: int) -> Optional[UserProfileContext]:
        """Fetch a specific context record strictly ensuring user ownership."""
        stmt = select(UserProfileContext).where(
            UserProfileContext.id == context_id,
            UserProfileContext.user_id == user_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_content_hash(self, user_id: int, content_hash: str) -> Optional[UserProfileContext]:
        """Fetch existing context by user_id and content_hash for idempotency."""
        stmt = select(UserProfileContext).where(
            UserProfileContext.user_id == user_id,
            UserProfileContext.content_hash == content_hash
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: int) -> list[UserProfileContext]:
        """List all context records belonging to the authenticated user."""
        stmt = select(UserProfileContext).where(
            UserProfileContext.user_id == user_id
        ).order_by(UserProfileContext.created_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_context(
        self,
        user_id: int,
        source_type: str,
        original_content: Optional[str] = None,
        extracted_summary: Optional[str] = None,
        context_metadata: Optional[dict] = None,
        content_hash: Optional[str] = None,
        status: str = "completed",
        error_message: Optional[str] = None,
    ) -> UserProfileContext:
        """Create a new canonical UserProfileContext record in PostgreSQL."""
        record = UserProfileContext(
            user_id=user_id,
            source_type=source_type,
            original_content=original_content,
            extracted_summary=extracted_summary,
            context_metadata=context_metadata or {},
            content_hash=content_hash,
            status=status,
            error_message=error_message,
        )
        self.db.add(record)
        await self.db.flush()
        await self.db.refresh(record)
        return record

    async def update_status(
        self,
        user_id: int,
        context_id: int,
        status: str,
        error_message: Optional[str] = None,
        metadata_update: Optional[dict] = None,
    ) -> Optional[UserProfileContext]:
        """Update processing status and error info for a context record."""
        record = await self.get_by_id(user_id, context_id)
        if not record:
            return None
        record.status = status
        record.error_message = error_message
        if metadata_update:
            updated_meta = dict(record.context_metadata or {})
            updated_meta.update(metadata_update)
            record.context_metadata = updated_meta
        await self.db.flush()
        await self.db.refresh(record)
        return record

    async def set_user_onboarding_status(self, user_id: int, new_status: str) -> None:
        """Update onboarding_status on the User model."""
        stmt = update(User).where(User.id == user_id).values(onboarding_status=new_status)
        await self.db.execute(stmt)
        await self.db.flush()

    async def get_user_onboarding_status(self, user_id: int) -> str:
        """Get current onboarding_status for the user."""
        stmt = select(User.onboarding_status).where(User.id == user_id)
        result = await self.db.execute(stmt)
        status_val = result.scalar_one_or_none()
        return status_val or "not_started"
