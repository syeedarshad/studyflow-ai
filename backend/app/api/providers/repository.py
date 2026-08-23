"""
StudyFlow AI — AI Provider Vault Repository
─────────────────────────────────────────────────────────────
Database queries for provider_keys table with optimistic versioning.
"""

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.providers.models import ProviderKey


class ProviderRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_user_and_provider(
        self, user_id: int, provider: str
    ) -> Optional[ProviderKey]:
        result = await self.db.execute(
            select(ProviderKey).where(
                ProviderKey.user_id == user_id,
                ProviderKey.provider == provider.lower().strip(),
            )
        )
        return result.scalar_one_or_none()

    async def get_all_for_user(self, user_id: int) -> List[ProviderKey]:
        result = await self.db.execute(
            select(ProviderKey)
            .where(ProviderKey.user_id == user_id)
            .order_by(ProviderKey.provider.asc())
        )
        return list(result.scalars().all())

    async def save_or_update(
        self,
        user_id: int,
        provider: str,
        encrypted_key: str,
    ) -> ProviderKey:
        provider = provider.lower().strip()
        existing = await self.get_by_user_and_provider(user_id, provider)

        if existing:
            new_version = existing.version + 1
            now = datetime.now(timezone.utc)
            await self.db.execute(
                update(ProviderKey)
                .where(ProviderKey.user_id == user_id, ProviderKey.provider == provider)
                .values(
                    encrypted_key=encrypted_key,
                    version=new_version,
                    updated_at=now,
                )
            )
            await self.db.flush()
            self.db.expire_all()
            return await self.get_by_user_and_provider(user_id, provider)
        else:
            record = ProviderKey(
                user_id=user_id,
                provider=provider,
                encrypted_key=encrypted_key,
                version=1,
            )
            self.db.add(record)
            await self.db.flush()
            await self.db.refresh(record)
            return record

    async def delete_by_user_and_provider(self, user_id: int, provider: str) -> bool:
        provider = provider.lower().strip()
        result = await self.db.execute(
            delete(ProviderKey).where(
                ProviderKey.user_id == user_id,
                ProviderKey.provider == provider,
            )
        )
        return result.rowcount > 0
