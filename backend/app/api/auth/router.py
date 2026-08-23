"""
StudyFlow AI — Auth Router
─────────────────────────────────────────────────────────────
All /api/v1/auth/* endpoints.

Endpoints
─────────
POST   /api/v1/auth/register          Create account + open session
POST   /api/v1/auth/login             Verify credentials + open session
GET    /api/v1/auth/session           Validate stored session (app launch)
GET    /api/v1/auth/me                Get current user profile
GET    /api/v1/auth/sessions          List all active sessions
DELETE /api/v1/auth/sessions/{id}     Revoke a specific session
POST   /api/v1/auth/logout            Invalidate current session
POST   /api/v1/auth/logout-all        Invalidate all sessions
POST   /api/v1/auth/verify-otp        Verify email / password-reset OTP
POST   /api/v1/auth/resend-otp        Re-send verification OTP
POST   /api/v1/auth/forgot-password   Trigger password-reset OTP email
POST   /api/v1/auth/reset-password    Complete password reset
"""

import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.dependencies import CurrentAuth, require_auth
from app.api.auth.schemas import (
    ErrorResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    OTPResponse,
    PasswordResetResponse,
    RegisterRequest,
    RegisterResponse,
    ResendOTPRequest,
    ResetPasswordRequest,
    SessionPublic,
    SessionsListResponse,
    SessionValidationResponse,
    UserPublic,
    VerifyOTPRequest,
)
from app.api.auth.service import AuthService
from core.config import get_settings
from core.limiter import limiter
from database.base import get_db
from services.email_service import EmailService

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/auth", tags=["Authentication"])


def _get_ip(request: Request) -> Optional[str]:
    """Extract client IP, accounting for reverse proxies."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


# ─── POST /auth/register ──────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account",
    responses={409: {"model": ErrorResponse}},
)
@limiter.limit(f"{settings.AUTH_RATE_LIMIT_PER_MINUTE}/minute")
async def register(
    body: RegisterRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    """
    Creates a new account and immediately opens a persistent desktop session.
    Returns the session token **once** — the Electron client must store it
    securely using safeStorage.
    """
    service = AuthService(db)
    device_label = request.headers.get("X-Device-Label")
    user, token, otp = await service.register(
        full_name=body.full_name,
        email=body.email,
        password=body.password,
        device_label=device_label,
        ip_address=_get_ip(request),
    )

    # Queue verification email dispatch asynchronously
    email_service = EmailService()
    background_tasks.add_task(
        email_service.send_verification_email,
        email_to=user.email,
        otp_code=otp,
    )

    return RegisterResponse(
        user=UserPublic.model_validate(user),
        session_token=token,
        message=(
            "Account created successfully. Please verify your email "
            "when convenient — you can use the app immediately."
        ),
    )


# ─── POST /auth/login ─────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Sign in with email and password",
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
@limiter.limit(f"{settings.AUTH_RATE_LIMIT_PER_MINUTE}/minute")
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Authenticates the user and creates a new persistent desktop session.
    Returns the session token **once** — store in Electron safeStorage.
    """
    service = AuthService(db)
    user, token = await service.login(
        email=body.email,
        password=body.password,
        device_label=body.device_label or request.headers.get("X-Device-Label"),
        ip_address=_get_ip(request),
    )
    return LoginResponse(
        user=UserPublic.model_validate(user),
        session_token=token,
    )


# ─── GET /auth/session ────────────────────────────────────────────────────────

@router.get(
    "/session",
    response_model=SessionValidationResponse,
    summary="Validate stored session (called on every app launch)",
    responses={401: {"model": ErrorResponse}},
)
async def validate_session(
    auth: CurrentAuth = Depends(require_auth),
) -> SessionValidationResponse:
    """
    Validates the session token stored in Electron's safeStorage.
    Called once on every app launch — if this succeeds the user goes
    straight to the dashboard without seeing the login screen.
    """
    return SessionValidationResponse(user=UserPublic.model_validate(auth.user))


# ─── GET /auth/me ─────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserPublic,
    summary="Get the currently authenticated user",
)
async def get_me(
    auth: CurrentAuth = Depends(require_auth),
) -> UserPublic:
    return UserPublic.model_validate(auth.user)


# ─── GET /auth/sessions ───────────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=SessionsListResponse,
    summary="List all active sessions for the current user",
)
async def list_sessions(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> SessionsListResponse:
    service = AuthService(db)
    sessions = await service.get_active_sessions(auth.user.id)
    return SessionsListResponse(
        sessions=[SessionPublic.model_validate(s) for s in sessions]
    )


# ─── DELETE /auth/sessions/{id} ───────────────────────────────────────────────

@router.delete(
    "/sessions/{session_id}",
    response_model=LogoutResponse,
    summary="Revoke a specific session (remote device logout)",
)
async def revoke_session(
    session_id: int,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> LogoutResponse:
    service = AuthService(db)
    await service.revoke_session(session_id=session_id, user_id=auth.user.id)
    return LogoutResponse(message="Session revoked.")


# ─── POST /auth/logout ────────────────────────────────────────────────────────

@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Sign out of the current session",
)
async def logout(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> LogoutResponse:
    service = AuthService(db)
    await service.logout(auth.session.id)
    return LogoutResponse()


# ─── POST /auth/logout-all ────────────────────────────────────────────────────

@router.post(
    "/logout-all",
    response_model=LogoutResponse,
    summary="Sign out of all devices",
)
async def logout_all(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> LogoutResponse:
    service = AuthService(db)
    count = await service.logout_all(auth.user.id)
    return LogoutResponse(message=f"Signed out of {count} session(s).")


# ─── POST /auth/verify-otp ────────────────────────────────────────────────────

@router.post(
    "/verify-otp",
    response_model=OTPResponse,
    summary="Verify email or password-reset OTP",
    responses={400: {"model": ErrorResponse}},
)
@limiter.limit(f"{settings.AUTH_RATE_LIMIT_PER_MINUTE}/minute")
async def verify_otp(
    body: VerifyOTPRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> OTPResponse:
    service = AuthService(db)
    user = await service.verify_otp(
        email=body.email,
        otp_code=body.otp,
        purpose=body.purpose,
    )
    msg = (
        "Email verified successfully."
        if body.purpose == "verify_email"
        else "OTP verified. You may now reset your password."
    )
    return OTPResponse(message=msg)


# ─── POST /auth/resend-otp ────────────────────────────────────────────────────

@router.post(
    "/resend-otp",
    response_model=OTPResponse,
    summary="Re-send OTP (email verification)",
)
@limiter.limit(f"{settings.AUTH_RATE_LIMIT_PER_MINUTE}/minute")
async def resend_otp(
    body: ResendOTPRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> OTPResponse:
    """
    Issues a fresh OTP and dispatches verification email via BackgroundTasks.
    Always returns success to avoid revealing whether the email is registered.
    """
    from app.api.auth.repository import UserRepository
    users = UserRepository(db)
    user = await users.get_by_email(body.email)
    if user:
        service = AuthService(db)
        otp = await service.send_verification_otp(user.id)
        email_service = EmailService()
        background_tasks.add_task(
            email_service.send_verification_email,
            email_to=user.email,
            otp_code=otp,
        )
        logger.info("Resend OTP triggered for user_id=%s purpose=%s", user.id, body.purpose)

    return OTPResponse(
        message="If that email is registered, a new code has been sent."
    )


# ─── POST /auth/forgot-password ───────────────────────────────────────────────

@router.post(
    "/forgot-password",
    response_model=OTPResponse,
    summary="Trigger password-reset OTP email",
)
@limiter.limit(f"{settings.AUTH_RATE_LIMIT_PER_MINUTE}/minute")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> OTPResponse:
    """
    Sends a password-reset OTP to the registered email via BackgroundTasks.
    Always returns success to avoid email enumeration.
    """
    service = AuthService(db)
    otp = await service.send_password_reset_otp(body.email)
    if otp:
        email_service = EmailService()
        background_tasks.add_task(
            email_service.send_password_reset_email,
            email_to=body.email,
            otp_code=otp,
        )
        logger.info("Password reset requested for email_hash=%s", hash(body.email))

    return OTPResponse(
        message="If that email is registered, a reset code has been sent."
    )


# ─── POST /auth/reset-password ────────────────────────────────────────────────

@router.post(
    "/reset-password",
    response_model=PasswordResetResponse,
    summary="Complete password reset with OTP",
    responses={400: {"model": ErrorResponse}},
)
@limiter.limit(f"{settings.AUTH_RATE_LIMIT_PER_MINUTE}/minute")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PasswordResetResponse:
    service = AuthService(db)
    await service.reset_password(
        email=body.email,
        otp_code=body.otp,
        new_password=body.new_password,
    )
    return PasswordResetResponse()
