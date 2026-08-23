"""
StudyFlow AI — AI Provider Vault Service
─────────────────────────────────────────────────────────────
All business logic for encrypted AI provider API key management.
Centralizes encryption/decryption calls through EncryptionService.
"""

import logging
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.providers.repository import ProviderRepository
from app.api.providers.schemas import AllowedProvider, ProviderStatusResponse
from core.security import EncryptionService

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = [p.value for p in AllowedProvider]


class ProviderVaultService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = ProviderRepository(db)
        self.crypto = EncryptionService()

    def validate_provider(self, provider: str) -> str:
        provider_clean = provider.lower().strip()
        if provider_clean not in SUPPORTED_PROVIDERS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown or unsupported provider '{provider}'. Allowed: {', '.join(SUPPORTED_PROVIDERS)}",
            )
        return provider_clean

    async def get_all_provider_statuses(self, user_id: int) -> List[ProviderStatusResponse]:
        configured_records = await self.repo.get_all_for_user(user_id)
        configured_map = {r.provider: r for r in configured_records}

        statuses = []
        for p in SUPPORTED_PROVIDERS:
            is_configured = p in configured_map
            statuses.append(
                ProviderStatusResponse(
                    provider=p,
                    configured=is_configured,
                    masked_key=self.crypto.mask_key("key") if is_configured else None,
                )
            )
        return statuses

    async def get_provider_status(self, user_id: int, provider: str) -> ProviderStatusResponse:
        provider = self.validate_provider(provider)
        record = await self.repo.get_by_user_and_provider(user_id, provider)
        is_configured = record is not None
        return ProviderStatusResponse(
            provider=provider,
            configured=is_configured,
            masked_key=self.crypto.mask_key("key") if is_configured else None,
        )

    async def save_provider_key(self, user_id: int, provider: str, api_key: str) -> ProviderStatusResponse:
        provider = self.validate_provider(provider)
        if not api_key or not api_key.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="API key cannot be empty.",
            )

        encrypted = self.crypto.encrypt(api_key.strip())
        record = await self.repo.save_or_update(user_id, provider, encrypted)
        logger.info("Saved encrypted API key for user_id=%s provider=%s (version=%s)", user_id, provider, record.version)

        return ProviderStatusResponse(
            provider=provider,
            configured=True,
            masked_key=self.crypto.mask_key(api_key),
        )

    async def get_decrypted_key(self, user_id: int, provider: str) -> Optional[str]:
        """Internal helper for AI proxy calls. Never exposed over API endpoints."""
        provider = self.validate_provider(provider)
        record = await self.repo.get_by_user_and_provider(user_id, provider)
        if not record:
            return None
        return self.crypto.decrypt(record.encrypted_key)

    async def remove_provider_key(self, user_id: int, provider: str) -> bool:
        provider = self.validate_provider(provider)
        removed = await self.repo.delete_by_user_and_provider(user_id, provider)
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No configured API key found for provider '{provider}'.",
            )
        logger.info("Removed API key for user_id=%s provider=%s", user_id, provider)
        return True
