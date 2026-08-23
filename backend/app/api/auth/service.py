"""
StudyFlow AI — Auth Service
─────────────────────────────────────────────────────────────
All authentication business logic:
  - register
  - login
  - validate_session
  - logout / logout_all
  - OTP (verify email, resend, forgot password, reset password)

The service uses AuthRepository for all DB access and
core.security for all cryptographic operations.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import Session, User
from app.api.auth.repository import SessionRepository, UserRepository
from core.config import get_settings
from core.security import (
    generate_otp,
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
    verify_session_token,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# Timing-safety dummy hash: used when the email doesn't exist so we still
# run a full bcrypt compare and don't reveal whether an email is registered.
_DUMMY_HASH = hash_password("studyflow-timing-safety-dummy-2024")


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.sessions = SessionRepository(db)

    # ─── Register ─────────────────────────────────────────────────────────────

    async def register(
        self,
        full_name: str,
        email: str,
        password: str,
        device_label: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> tuple[User, str, str]:
        """
        Creates a new user and immediately opens a desktop session.

        Returns: (user, plaintext_session_token, otp_code)
        The caller returns the plaintext token to the Electron client;
        only the hash is persisted.
        """
        email = email.lower().strip()

        if await self.users.email_exists(email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

        password_hash = hash_password(password)
        user = await self.users.create(full_name, email, password_hash)

        # Issue an OTP for email verification
        otp, expires_at = self._make_otp("verify_email")
        await self.users.set_otp(user.id, otp, expires_at, "verify_email")

        # Open a persistent desktop session right away so the user can
        # start using the app without waiting for email verification.
        token, session = await self._create_session(
            user.id, device_label, ip_address
        )

        logger.info("New account registered: user_id=%s email=%s", user.id, email)

        # Re-fetch user to get all fields (e.g. created_at) after the flush
        await self.db.refresh(user)
        return user, token, otp

    # ─── Login ────────────────────────────────────────────────────────────────

    async def login(
        self,
        email: str,
        password: str,
        device_label: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> tuple[User, str]:
        """
        Verifies credentials and opens a new desktop session.

        Returns: (user, plaintext_session_token)
        """
        email = email.lower().strip()
        user = await self.users.get_by_email(email)

        # Always run a full bcrypt compare to prevent timing oracle.
        hash_to_check = user.password_hash if user else _DUMMY_HASH
        password_ok = verify_password(password, hash_to_check)

        if not user or not password_ok:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated.",
            )

        await self.users.update_last_login(user.id)
        token, session = await self._create_session(
            user.id, device_label, ip_address
        )

        logger.info("Login: user_id=%s device=%s", user.id, device_label)
        await self.db.refresh(user)
        return user, token

    # ─── Session Validation ───────────────────────────────────────────────────

    async def validate_session_token(
        self,
        token: str,
    ) -> tuple[User, Session]:
        """
        Validates the session token sent by Electron on every app launch /
        authenticated request.

        Returns: (user, session)
        Raises HTTPException 401 on any failure.
        """
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No session token provided.",
            )

        token_hash = hash_session_token(token)
        session = await self.sessions.get_by_token_hash(token_hash)

        if not session or not session.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session not found or has been invalidated.",
            )

        # Optional: enforce max session age if configured
        if settings.SESSION_TOKEN_LIFETIME_SECONDS > 0:
            age = (
                datetime.now(timezone.utc) - session.created_at
            ).total_seconds()
            if age > settings.SESSION_TOKEN_LIFETIME_SECONDS:
                await self.sessions.deactivate(session.id)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session has expired. Please sign in again.",
                )

        user = await self.users.get_by_id(session.user_id)
        if not user or not user.is_active:
            await self.sessions.deactivate(session.id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account not found or deactivated.",
            )

        # Heartbeat — update last_seen without blocking the response
        await self.sessions.touch(session.id)

        return user, session

    # ─── Logout ───────────────────────────────────────────────────────────────

    async def logout(self, session_id: int) -> None:
        """Invalidates a single session (the current device's session)."""
        await self.sessions.deactivate(session_id)

    async def logout_all(self, user_id: int) -> int:
        """Invalidates all sessions for a user (all devices)."""
        count = await self.sessions.deactivate_all_for_user(user_id)
        logger.info("Logout all: user_id=%s, %s session(s) invalidated", user_id, count)
        return count

    async def revoke_session(self, session_id: int, user_id: int) -> None:
        """
        Revokes a specific session by ID — used by the 'Sessions' management UI.
        Only allows revoking sessions that belong to the requesting user.
        """
        session = await self.sessions.get_by_id(session_id)
        if not session or session.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found.",
            )
        await self.sessions.deactivate(session_id)

    # ─── OTP ──────────────────────────────────────────────────────────────────

    async def send_verification_otp(self, user_id: int) -> str:
        """Issues a new OTP for email verification and returns the code."""
        otp, expires_at = self._make_otp("verify_email")
        await self.users.set_otp(user_id, otp, expires_at, "verify_email")
        return otp

    async def send_password_reset_otp(self, email: str) -> Optional[str]:
        """
        Issues a reset OTP.  Returns the OTP code (so the caller can send
        an email), or None if the email is not registered.
        We NEVER reveal whether the email exists in the response — the caller
        should always respond with a success message regardless.
        """
        user = await self.users.get_by_email(email)
        if not user:
            return None
        otp, expires_at = self._make_otp("reset_password")
        await self.users.set_otp(user.id, otp, expires_at, "reset_password")
        return otp

    async def verify_otp(
        self,
        email: str,
        otp_code: str,
        purpose: str,
    ) -> User:
        """
        Validates an OTP.  On success:
          - 'verify_email' marks the account as verified.
          - 'reset_password' clears the OTP (caller proceeds to reset password).
        Returns the User on success; raises 400 on failure.
        """
        user = await self.users.get_by_email(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP.",
            )

        now = datetime.now(timezone.utc)
        if (
            user.otp_code != otp_code
            or user.otp_purpose != purpose
            or not user.otp_expires_at
            or user.otp_expires_at.astimezone(timezone.utc) < now
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OTP.",
            )

        if purpose == "verify_email":
            await self.users.mark_verified(user.id)
        else:
            await self.users.clear_otp(user.id)

        await self.db.refresh(user)
        return user

    async def reset_password(
        self,
        email: str,
        otp_code: str,
        new_password: str,
    ) -> User:
        """
        Verifies the OTP and resets the password.
        Invalidates ALL sessions after a password reset.
        """
        user = await self.verify_otp(email, otp_code, "reset_password")
        new_hash = hash_password(new_password)
        await self.users.update_password(user.id, new_hash)
        # Invalidate all sessions — standard security practice after password change
        await self.sessions.deactivate_all_for_user(user.id)
        logger.info("Password reset: user_id=%s — all sessions invalidated", user.id)
        await self.db.refresh(user)
        return user

    # ─── Active Sessions List ─────────────────────────────────────────────────

    async def get_active_sessions(self, user_id: int) -> list[Session]:
        return await self.sessions.get_active_for_user(user_id)

    # ─── Private helpers ──────────────────────────────────────────────────────

    async def _create_session(
        self,
        user_id: int,
        device_label: Optional[str],
        ip_address: Optional[str],
    ) -> tuple[str, Session]:
        """Generates token, hashes it, persists the hash, returns plaintext token."""
        token = generate_session_token()
        token_hash = hash_session_token(token)
        session = await self.sessions.create(
            user_id=user_id,
            token_hash=token_hash,
            device_label=device_label,
            ip_address=ip_address,
        )
        return token, session

    def _make_otp(self, purpose: str) -> tuple[str, datetime]:
        otp = generate_otp()
        expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=settings.OTP_EXPIRY_SECONDS
        )
        return otp, expires_at
