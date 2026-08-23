"""
StudyFlow AI — Onboarding API Router
─────────────────────────────────────────────────────────────
Endpoints:
  POST /api/v1/onboarding/message   — ingest conversational profile message into PostgreSQL & RAG
  POST /api/v1/onboarding/upload    — upload timetable/resume/study plan/notes into PostgreSQL & RAG
  POST /api/v1/onboarding/complete  — explicitly mark onboarding complete
  POST /api/v1/onboarding/skip      — mark onboarding skipped
  GET  /api/v1/onboarding/status    — get authoritative onboarding status
  GET  /api/v1/onboarding/documents/{context_id} — get specific context record (strictly user-owned)

Security:
  - All endpoints require authentication via require_auth.
  - User identity is derived strictly from session token (auth.user.id).
  - Cross-user data retrieval is rejected with HTTP 404.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.dependencies import CurrentAuth, require_auth
from app.api.onboarding.schemas import (
    OnboardingActionResponse,
    OnboardingMessageRequest,
    OnboardingMessageResponse,
    OnboardingStatusResponse,
    OnboardingUploadResponse,
    ProfileContextDetailResponse,
)
from app.api.onboarding.service import OnboardingService
from database.base import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["Onboarding & RAG Context"])


@router.post(
    "/message",
    response_model=OnboardingMessageResponse,
    summary="Submit onboarding conversational message and index into user RAG",
    status_code=status.HTTP_200_OK,
)
async def submit_onboarding_message(
    body: OnboardingMessageRequest,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> OnboardingMessageResponse:
    """
    Submits a conversational message about the student's background/goals.
    Saves canonical content to PostgreSQL and embeds vectors into user's isolated RAG store.
    """
    service = OnboardingService(db)
    result = await service.process_message(
        user_id=auth.user.id,
        content=body.content,
        idempotency_key=body.idempotency_key,
    )
    return OnboardingMessageResponse(**result)


@router.post(
    "/upload",
    response_model=OnboardingUploadResponse,
    summary="Upload and index timetable, study plan, resume, or notes",
    status_code=status.HTTP_200_OK,
)
async def upload_onboarding_document(
    file: UploadFile = File(...),
    source_type: str = Form(..., description="One of: timetable, study_plan, resume, notes"),
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> OnboardingUploadResponse:
    """
    Uploads a document, extracts text, stores canonical record, and indexes into user RAG store.
    """
    service = OnboardingService(db)
    result = await service.process_upload(
        user_id=auth.user.id,
        file=file,
        source_type=source_type,
    )
    return OnboardingUploadResponse(**result)


@router.post(
    "/complete",
    response_model=OnboardingActionResponse,
    summary="Mark onboarding as completed",
    status_code=status.HTTP_200_OK,
)
async def complete_onboarding(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> OnboardingActionResponse:
    """Explicitly marks onboarding status as completed for the authenticated user."""
    service = OnboardingService(db)
    result = await service.complete_onboarding(user_id=auth.user.id)
    return OnboardingActionResponse(**result)


@router.post(
    "/skip",
    response_model=OnboardingActionResponse,
    summary="Skip onboarding for now",
    status_code=status.HTTP_200_OK,
)
async def skip_onboarding(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> OnboardingActionResponse:
    """Sets onboarding status to skipped without creating fabricated profile data."""
    service = OnboardingService(db)
    result = await service.skip_onboarding(user_id=auth.user.id)
    return OnboardingActionResponse(**result)


@router.get(
    "/status",
    response_model=OnboardingStatusResponse,
    summary="Get user onboarding status and context summary",
    status_code=status.HTTP_200_OK,
)
async def get_onboarding_status(
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> OnboardingStatusResponse:
    """Fetches the authoritative onboarding status for the authenticated user."""
    service = OnboardingService(db)
    result = await service.get_status(user_id=auth.user.id)
    return OnboardingStatusResponse(**result)


@router.get(
    "/documents/{context_id}",
    response_model=ProfileContextDetailResponse,
    summary="Get details of a specific context document",
    status_code=status.HTTP_200_OK,
)
async def get_document_detail(
    context_id: int,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> ProfileContextDetailResponse:
    """Fetches document details strictly verifying that the document belongs to the requesting user."""
    service = OnboardingService(db)
    record = await service.get_document(user_id=auth.user.id, context_id=context_id)
    return ProfileContextDetailResponse(
        id=record.id,
        user_id=record.user_id,
        source_type=record.source_type,
        original_content=record.original_content,
        extracted_summary=record.extracted_summary,
        context_metadata=record.context_metadata,
        status=record.status,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
