"""
StudyFlow AI — Production Email Service
─────────────────────────────────────────────────────────────
Handles transactional emails (Email Verification, Password Reset)
via FastAPI-Mail with HTML templates and plain text fallbacks.
"""

import logging
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "app" / "templates" / "email"


def get_mail_config() -> ConnectionConfig:
    """Initializes and returns FastAPI-Mail ConnectionConfig based on current settings."""
    use_credentials = bool(settings.MAIL_USERNAME and settings.MAIL_PASSWORD)
    
    # Suppress send if mail username is dummy/unconfigured or in dev mode without SMTP credentials
    suppress = not use_credentials or settings.MAIL_USERNAME == "your_email@example.com"
    
    return ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME or "noreply@studyflow.ai",
        MAIL_PASSWORD=settings.MAIL_PASSWORD or "",
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_STARTTLS=settings.MAIL_TLS,
        MAIL_SSL_TLS=settings.MAIL_SSL,
        MAIL_FROM=settings.MAIL_FROM,
        MAIL_FROM_NAME=settings.APP_NAME,
        TEMPLATE_FOLDER=TEMPLATES_DIR,
        USE_CREDENTIALS=use_credentials,
        VALIDATE_CERTS=True,
        SUPPRESS_SEND=1 if suppress else 0,
        TIMEOUT=15,
    )


class EmailService:
    def __init__(self, config: Optional[ConnectionConfig] = None) -> None:
        self.config = config or get_mail_config()
        self.fastmail = FastMail(self.config)

    async def send_verification_email(self, email_to: str, otp_code: str) -> bool:
        """
        Sends an email verification OTP to the specified address.
        NEVER logs the OTP code or passwords.
        """
        template_body = {
            "otp": otp_code,
            "expiry_minutes": max(1, settings.OTP_EXPIRY_SECONDS // 60),
        }
        
        plain_body = (
            f"Welcome to StudyFlow AI!\n\n"
            f"Your verification code is: {otp_code}\n\n"
            f"This code will expire in {max(1, settings.OTP_EXPIRY_SECONDS // 60)} minutes.\n"
            f"If you did not create a StudyFlow AI account, please ignore this email."
        )

        message = MessageSchema(
            subject="Verify Your StudyFlow AI Account",
            recipients=[email_to],
            template_body=template_body,
            body=plain_body,
            subtype=MessageType.html,
        )

        try:
            await self.fastmail.send_message(message, template_name="verification.html")
            logger.info("Verification email sent successfully to recipient_hash=%s", hash(email_to))
            return True
        except Exception as exc:
            logger.error("Failed to send verification email to recipient_hash=%s — error: %s", hash(email_to), str(exc))
            return False

    async def send_password_reset_email(self, email_to: str, otp_code: str) -> bool:
        """
        Sends a password reset OTP to the specified address.
        NEVER logs the OTP code or passwords.
        """
        template_body = {
            "otp": otp_code,
            "expiry_minutes": max(1, settings.OTP_EXPIRY_SECONDS // 60),
        }

        plain_body = (
            f"StudyFlow AI — Password Reset Request\n\n"
            f"Your password reset code is: {otp_code}\n\n"
            f"This code will expire in {max(1, settings.OTP_EXPIRY_SECONDS // 60)} minutes.\n"
            f"If you did not request a password reset, please secure your account immediately."
        )

        message = MessageSchema(
            subject="Reset Your StudyFlow AI Password",
            recipients=[email_to],
            template_body=template_body,
            body=plain_body,
            subtype=MessageType.html,
        )

        try:
            await self.fastmail.send_message(message, template_name="password_reset.html")
            logger.info("Password reset email sent successfully to recipient_hash=%s", hash(email_to))
            return True
        except Exception as exc:
            logger.error("Failed to send password reset email to recipient_hash=%s — error: %s", hash(email_to), str(exc))
            return False
