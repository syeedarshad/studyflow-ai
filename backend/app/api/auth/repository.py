"""
StudyFlow AI — Auth Repository
─────────────────────────────────────────────────────────────
All database queries for the auth module.
Business logic lives in service.py — this layer only talks to the DB.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import Session, User


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.email == email.lower().strip())
        )
        return result.scalar_one_or_none()

    async def email_exists(self, email: str) -> bool:
        user = await self.get_by_email(email)
        return user is not None

    async def create(
        self,
        full_name: str,
        email: str,
        password_hash: str,
    ) -> User:
        user = User(
            full_name=full_name.strip(),
            email=email.lower().strip(),
            password_hash=password_hash,
            is_active=True,
            is_verified=False,  # Email verification via OTP
        )
        self.db.add(user)
        await self.db.flush()  # gets the auto-generated id without committing
        await self.db.refresh(user)
        return user

    async def update_last_login(self, user_id: int) -> None:
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(last_login_at=datetime.now(timezone.utc))
        )

    async def mark_verified(self, user_id: int) -> None:
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(is_verified=True, otp_code=None, otp_expires_at=None, otp_purpose=None)
        )

    async def set_otp(
        self,
        user_id: int,
        otp_code: str,
        expires_at: datetime,
        purpose: str,
    ) -> None:
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(otp_code=otp_code, otp_expires_at=expires_at, otp_purpose=purpose)
        )

    async def clear_otp(self, user_id: int) -> None:
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(otp_code=None, otp_expires_at=None, otp_purpose=None)
        )

    async def update_password(self, user_id: int, new_hash: str) -> None:
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(password_hash=new_hash)
        )


class SessionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        user_id: int,
        token_hash: str,
        device_label: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Session:
        session = Session(
            user_id=user_id,
            token_hash=token_hash,
            device_label=device_label,
            ip_address=ip_address,
            is_active=True,
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def get_by_token_hash(self, token_hash: str) -> Optional[Session]:
        """Hot path: called on every authenticated request."""
        result = await self.db.execute(
            select(Session).where(
                Session.token_hash == token_hash,
                Session.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, session_id: int) -> Optional[Session]:
        result = await self.db.execute(
            select(Session).where(Session.id == session_id)
        )
        return result.scalar_one_or_none()

    async def get_active_for_user(self, user_id: int) -> list[Session]:
        result = await self.db.execute(
            select(Session)
            .where(
                Session.user_id == user_id,
                Session.is_active == True,  # noqa: E712
            )
            .order_by(Session.created_at.asc(), Session.id.asc())
        )
        return list(result.scalars().all())

    async def touch(self, session_id: int) -> None:
        """Update last_seen_at. Called on every authenticated request."""
        await self.db.execute(
            update(Session)
            .where(Session.id == session_id)
            .values(last_seen_at=datetime.now(timezone.utc))
        )

    async def deactivate(self, session_id: int) -> None:
        """Soft-delete: mark is_active=False (preserves audit trail)."""
        await self.db.execute(
            update(Session)
            .where(Session.id == session_id)
            .values(is_active=False)
        )

    async def deactivate_all_for_user(self, user_id: int) -> int:
        """Invalidates every session for a user (logout-all, password reset)."""
        result = await self.db.execute(
            update(Session)
            .where(Session.user_id == user_id, Session.is_active == True)  # noqa: E712
            .values(is_active=False)
        )
        return result.rowcount
