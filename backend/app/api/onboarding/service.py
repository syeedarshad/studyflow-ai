"""
StudyFlow AI — Onboarding Service
─────────────────────────────────────────────────────────────
Orchestrates:
  1. Canonical PostgreSQL persistence of onboarding messages and uploaded documents.
  2. Idempotent content hashing & duplicate protection.
  3. Text extraction for documents (PDF, text, markdown).
  4. RAG indexing with user namespace isolation.
  5. User onboarding state lifecycle transitions.
"""

import hashlib
import logging
import os
import re
from typing import Optional
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.onboarding.models import UserProfileContext
from app.api.onboarding.repository import OnboardingRepository
from app.services.rag_service import rag_service
from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_SOURCE_TYPES = {"onboarding_message", "timetable", "study_plan", "resume", "notes"}
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg"}


def _compute_hash(user_id: int, source_type: str, content: str) -> str:
    """Deterministic hash for per-user duplicate detection."""
    normalized = re.sub(r"\s+", " ", content.strip().lower())
    payload = f"{user_id}:{source_type}:{normalized}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class OnboardingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = OnboardingRepository(db)

    async def process_message(
        self,
        user_id: int,
        content: str,
        idempotency_key: Optional[str] = None
    ) -> dict:
        """
        Processes and stores an onboarding message with RAG vector indexing.
        """
        cleaned_content = content.strip()
        if not cleaned_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Message content cannot be empty."
            )

        content_hash = _compute_hash(user_id, "onboarding_message", cleaned_content)

        # Idempotency check: if identical message already ingested for this user
        existing = await self.repo.get_by_content_hash(user_id, content_hash)
        if existing and existing.status == "completed":
            logger.info("Duplicate onboarding message for user_id=%d, returning existing context_id=%d", user_id, existing.id)
            user_status = await self.repo.get_user_onboarding_status(user_id)
            return {
                "success": True,
                "context_id": existing.id,
                "status": existing.status,
                "source_type": existing.source_type,
                "chunks_created": existing.context_metadata.get("chunks_count", 1),
                "onboarding_status": user_status,
                "message": "Information already saved.",
            }

        # 1. Store canonical PostgreSQL record in 'pending' state
        record = await self.repo.create_context(
            user_id=user_id,
            source_type="onboarding_message",
            original_content=cleaned_content,
            extracted_summary=None,
            context_metadata={"idempotency_key": idempotency_key},
            content_hash=content_hash,
            status="processing",
        )

        # 2. Ingest into user-isolated RAG vector store
        chunks_count = 0
        try:
            chunks = await rag_service.ingest(
                user_id=user_id,
                context_id=record.id,
                source_type="onboarding_message",
                content=cleaned_content,
                metadata={"source": "onboarding_message"}
            )
            chunks_count = len(chunks)
            await self.repo.update_status(
                user_id=user_id,
                context_id=record.id,
                status="completed",
                metadata_update={"chunks_count": chunks_count}
            )

            # Update user onboarding status if currently not_started
            curr_status = await self.repo.get_user_onboarding_status(user_id)
            if curr_status == "not_started":
                await self.repo.set_user_onboarding_status(user_id, "in_progress")
                curr_status = "in_progress"

            return {
                "success": True,
                "context_id": record.id,
                "status": "completed",
                "source_type": "onboarding_message",
                "chunks_created": chunks_count,
                "onboarding_status": curr_status,
                "message": "Your information has been saved and indexed.",
            }

        except Exception as exc:
            logger.error("RAG indexing failed for user_id=%d context_id=%d: %s", user_id, record.id, exc)
            await self.repo.update_status(
                user_id=user_id,
                context_id=record.id,
                status="failed",
                error_message=str(exc),
            )
            curr_status = await self.repo.get_user_onboarding_status(user_id)
            return {
                "success": False,
                "context_id": record.id,
                "status": "failed",
                "source_type": "onboarding_message",
                "chunks_created": 0,
                "onboarding_status": curr_status,
                "message": f"Saved to profile but vector indexing encountered an issue: {exc}",
            }

    async def process_upload(
        self,
        user_id: int,
        file: UploadFile,
        source_type: str
    ) -> dict:
        """
        Securely uploads and processes user documents (timetable, resume, study plan, notes).
        """
        if source_type not in ALLOWED_SOURCE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid source_type. Allowed: {sorted(list(ALLOWED_SOURCE_TYPES))}"
            )

        filename = os.path.basename(file.filename or "uploaded_doc")
        _, ext = os.path.splitext(filename.lower())
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File extension {ext} not allowed. Supported: {sorted(list(ALLOWED_EXTENSIONS))}"
            )

        # Read file contents
        content_bytes = await file.read()
        if len(content_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum size limit of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB."
            )

        # Secure user-isolated document storage
        user_doc_dir = os.path.join(settings.UPLOAD_DIR, "documents", f"user_{user_id}")
        os.makedirs(user_doc_dir, exist_ok=True)
        safe_file_path = os.path.join(user_doc_dir, filename)

        with open(safe_file_path, "wb") as f:
            f.write(content_bytes)

        # Extract text content
        extracted_text = ""
        if ext in (".txt", ".md"):
            try:
                extracted_text = content_bytes.decode("utf-8", errors="replace")
            except Exception:
                extracted_text = f"Document content from {filename}"
        elif ext == ".pdf":
            extracted_text = self._extract_text_from_pdf(safe_file_path, filename)
        else:
            extracted_text = f"Uploaded {source_type} image/document: {filename}"

        content_hash = _compute_hash(user_id, source_type, extracted_text)

        # 1. Canonical PostgreSQL record
        record = await self.repo.create_context(
            user_id=user_id,
            source_type=source_type,
            original_content=extracted_text,
            extracted_summary=None,
            context_metadata={
                "filename": filename,
                "file_size_bytes": len(content_bytes),
                "file_path": safe_file_path,
                "mime_type": file.content_type,
            },
            content_hash=content_hash,
            status="processing",
        )

        # 2. Ingest into user-isolated RAG index
        chunks_count = 0
        try:
            chunks = await rag_service.ingest(
                user_id=user_id,
                context_id=record.id,
                source_type=source_type,
                content=extracted_text,
                metadata={"filename": filename, "source": source_type}
            )
            chunks_count = len(chunks)
            await self.repo.update_status(
                user_id=user_id,
                context_id=record.id,
                status="completed",
                metadata_update={"chunks_count": chunks_count}
            )

            # Update onboarding status
            curr_status = await self.repo.get_user_onboarding_status(user_id)
            if curr_status == "not_started":
                await self.repo.set_user_onboarding_status(user_id, "in_progress")

            return {
                "success": True,
                "context_id": record.id,
                "source_type": source_type,
                "filename": filename,
                "status": "completed",
                "chunks_created": chunks_count,
                "message": f"Uploaded and indexed {filename} successfully.",
            }

        except Exception as exc:
            logger.error("RAG upload indexing failed for user_id=%d context_id=%d: %s", user_id, record.id, exc)
            await self.repo.update_status(
                user_id=user_id,
                context_id=record.id,
                status="failed",
                error_message=str(exc),
            )
            return {
                "success": False,
                "context_id": record.id,
                "source_type": source_type,
                "filename": filename,
                "status": "failed",
                "chunks_created": 0,
                "message": f"Uploaded document saved, but indexing failed: {exc}",
            }

    @staticmethod
    def _extract_text_from_pdf(file_path: str, filename: str) -> str:
        """Lightweight text extraction from PDF without external heavy binaries."""
        try:
            with open(file_path, "rb") as f:
                raw_bytes = f.read()
            # Simple text stream extraction from uncompressed PDF blocks
            text_chunks = re.findall(rb"\((.*?)\)Tj", raw_bytes)
            if text_chunks:
                decoded = " ".join([c.decode("latin-1", errors="ignore") for c in text_chunks])
                if len(decoded.strip()) > 20:
                    return decoded.strip()
        except Exception as e:
            logger.warning("PDF text extraction note for %s: %s", filename, e)
        return f"PDF document {filename} content (processed)."

    async def get_status(self, user_id: int) -> dict:
        """Returns the user's authoritative onboarding status and context summary."""
        status_val = await self.repo.get_user_onboarding_status(user_id)
        contexts = await self.repo.list_by_user(user_id)
        sources = list({c.source_type for c in contexts if c.status == "completed"})
        return {
            "onboarding_status": status_val,
            "contexts_count": len(contexts),
            "sources": sources,
            "completed": status_val in ("completed", "skipped"),
        }

    async def complete_onboarding(self, user_id: int) -> dict:
        """Explicitly marks onboarding as completed for the authenticated user."""
        await self.repo.set_user_onboarding_status(user_id, "completed")
        return {
            "success": True,
            "onboarding_status": "completed",
            "message": "Onboarding completed successfully.",
        }

    async def skip_onboarding(self, user_id: int) -> dict:
        """Sets onboarding_status to skipped without fabricating data."""
        await self.repo.set_user_onboarding_status(user_id, "skipped")
        return {
            "success": True,
            "onboarding_status": "skipped",
            "message": "Onboarding skipped for now.",
        }

    async def get_document(self, user_id: int, context_id: int) -> UserProfileContext:
        """Fetches a document record strictly scoped to the requesting user."""
        record = await self.repo.get_by_id(user_id, context_id)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Context document not found or access denied."
            )
        return record
