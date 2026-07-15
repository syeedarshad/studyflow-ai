"""
StudyFlow AI — Auth Pydantic Schemas
─────────────────────────────────────────────────────────────
Request bodies and response models for all /api/v1/auth/* endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# ─── Shared / Base ────────────────────────────────────────────────────────────

class UserPublic(BaseModel):
    """Safe user projection — never includes password_hash."""
    model_config = {"from_attributes": True}

    id: int
    full_name: str
    email: EmailStr
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None


class SessionPublic(BaseModel):
    """Session info shown on the 'active sessions' management page."""
    model_config = {"from_attributes": True}

    id: int
    device_label: Optional[str] = None
    ip_address: Optional[str] = None
    last_seen_at: datetime
    created_at: datetime
    is_active: bool


# ─── Register ─────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100, strip_whitespace=True)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=200)

    @field_validator("full_name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name cannot be blank.")
        return v.strip()


class RegisterResponse(BaseModel):
    success: bool = True
    message: str = "Account created. Please verify your email."
    user: UserPublic
    session_token: str = Field(
        ...,
        description=(
            "Plaintext session token — store in Electron safeStorage. "
            "This is the ONLY time it is returned."
        ),
    )


# ─── Login ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=200)
    device_label: Optional[str] = Field(
        None,
        max_length=200,
        description="Human-readable device name (e.g. 'Windows 11 / StudyFlow AI 2.0').",
    )


class LoginResponse(BaseModel):
    success: bool = True
    message: str = "Signed in successfully."
    user: UserPublic
    session_token: str = Field(
        ...,
        description="Plaintext session token — store in Electron safeStorage.",
    )


# ─── Session Validation (GET /auth/session) ───────────────────────────────────

class SessionValidationResponse(BaseModel):
    success: bool = True
    user: UserPublic


# ─── Active Sessions List ─────────────────────────────────────────────────────

class SessionsListResponse(BaseModel):
    success: bool = True
    sessions: list[SessionPublic]


# ─── Logout ───────────────────────────────────────────────────────────────────

class LogoutResponse(BaseModel):
    success: bool = True
    message: str = "Signed out successfully."


# ─── OTP ──────────────────────────────────────────────────────────────────────

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    purpose: str = Field(
        "verify_email",
        description="'verify_email' | 'reset_password'",
    )


class ResendOTPRequest(BaseModel):
    email: EmailStr
    purpose: str = Field("verify_email")


class OTPResponse(BaseModel):
    success: bool = True
    message: str


# ─── Forgot / Reset Password ──────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(..., min_length=8, max_length=200)


class PasswordResetResponse(BaseModel):
    success: bool = True
    message: str = "Password reset successful. All sessions have been invalidated."


# ─── Generic Error ────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    detail: Optional[str] = None
