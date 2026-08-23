"""
StudyFlow AI — Onboarding & Personal RAG Context Test Suite
─────────────────────────────────────────────────────────────
Comprehensive coverage for:
  - Unauthenticated request rejection (HTTP 401)
  - Canonical PostgreSQL persistence of messages and uploaded documents
  - Strict user-isolated RAG vector chunking, embedding, and retrieval
  - Onboarding state transitions (not_started -> in_progress -> completed / skipped)
  - Idempotency & duplicate protection
  - Graceful failure handling (embedding errors preserve DB record)
  - MANDATORY MULTI-ACCOUNT RAG REGRESSION TEST (User A Python vs User B Java)
"""

import io
import json
import os
import uuid
from unittest.mock import patch, AsyncMock
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.onboarding.models import UserProfileContext
from app.services.rag_service import rag_service


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _register_user(client: AsyncClient, email: str, name: str = "Test User") -> dict:
    """Helper to register and return { user_id, token, headers }."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={"full_name": name, "email": email, "password": "SecurePassword123!"}
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    token = data["session_token"]
    return {
        "user_id": data["user"]["id"],
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"}
    }


# ─── 1. Authentication Tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_onboarding_rejected_401(async_client: AsyncClient):
    """Verify all onboarding endpoints reject unauthenticated callers with 401."""
    resp1 = await async_client.post("/api/v1/onboarding/message", json={"content": "Hello"})
    assert resp1.status_code == 401

    resp2 = await async_client.get("/api/v1/onboarding/status")
    assert resp2.status_code == 401

    resp3 = await async_client.post("/api/v1/onboarding/skip", json={})
    assert resp3.status_code == 401

    resp4 = await async_client.post("/api/v1/onboarding/complete", json={})
    assert resp4.status_code == 401


# ─── 2. Message Ingestion & RAG Indexing ──────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_onboarding_message_and_rag_indexing(async_client: AsyncClient, db: AsyncSession):
    """Verify message creates PostgreSQL row, updates status, and generates vector chunks."""
    user = await _register_user(async_client, f"user_{uuid.uuid4().hex[:8]}@example.com")

    content = "I am an ECE student in third year aiming for software engineering roles. Learning Python and DSA."
    resp = await async_client.post(
        "/api/v1/onboarding/message",
        json={"content": content},
        headers=user["headers"]
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert data["status"] == "completed"
    assert data["chunks_created"] >= 1
    assert data["onboarding_status"] == "in_progress"

    # Verify PostgreSQL state
    context_id = data["context_id"]
    record = await db.get(UserProfileContext, context_id)
    assert record is not None
    assert record.user_id == user["user_id"]
    assert record.source_type == "onboarding_message"
    assert record.original_content == content
    assert record.status == "completed"

    # Verify RAG retrieval finds this content
    retrieved = await rag_service.retrieve(user_id=user["user_id"], query="What is my branch and what am I studying in ECE?", top_k=2)
    assert len(retrieved) >= 1
    assert "ECE student" in retrieved[0]["content"]
    assert retrieved[0]["user_id"] == user["user_id"]


# ─── 3. File Upload Ingestion ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_onboarding_document_and_rag_indexing(async_client: AsyncClient, db: AsyncSession):
    """Verify document upload writes canonical DB row and indexes chunks."""
    user = await _register_user(async_client, f"uploader_{uuid.uuid4().hex[:8]}@example.com")

    resume_text = "Experienced with React, Node.js, and PostgreSQL. Built StudyFlow AI productivity assistant."
    file_bytes = io.BytesIO(resume_text.encode("utf-8"))

    files = {"file": ("my_resume.txt", file_bytes, "text/plain")}
    data = {"source_type": "resume"}

    resp = await async_client.post(
        "/api/v1/onboarding/upload",
        files=files,
        data=data,
        headers=user["headers"]
    )
    assert resp.status_code == 200, resp.text
    res_data = resp.json()
    assert res_data["success"] is True
    assert res_data["source_type"] == "resume"
    assert res_data["filename"] == "my_resume.txt"
    assert res_data["chunks_created"] >= 1

    # Verify document retrieval
    doc_resp = await async_client.get(f"/api/v1/onboarding/documents/{res_data['context_id']}", headers=user["headers"])
    assert doc_resp.status_code == 200
    assert doc_resp.json()["user_id"] == user["user_id"]


# ─── 4. Onboarding Status Lifecycle ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_onboarding_status_lifecycle(async_client: AsyncClient):
    """Verify not_started -> in_progress -> completed transitions."""
    user = await _register_user(async_client, f"lifecycle_{uuid.uuid4().hex[:8]}@example.com")

    # Initial status
    s1 = await async_client.get("/api/v1/onboarding/status", headers=user["headers"])
    assert s1.status_code == 200
    assert s1.json()["onboarding_status"] == "not_started"
    assert s1.json()["completed"] is False

    # Message submission -> in_progress
    await async_client.post(
        "/api/v1/onboarding/message",
        json={"content": "I am studying Computer Science."},
        headers=user["headers"]
    )
    s2 = await async_client.get("/api/v1/onboarding/status", headers=user["headers"])
    assert s2.json()["onboarding_status"] == "in_progress"
    assert s2.json()["contexts_count"] == 1

    # Complete onboarding -> completed
    c_resp = await async_client.post("/api/v1/onboarding/complete", json={}, headers=user["headers"])
    assert c_resp.status_code == 200
    assert c_resp.json()["onboarding_status"] == "completed"

    s3 = await async_client.get("/api/v1/onboarding/status", headers=user["headers"])
    assert s3.json()["onboarding_status"] == "completed"
    assert s3.json()["completed"] is True


@pytest.mark.asyncio
async def test_onboarding_skip(async_client: AsyncClient):
    """Verify skip sets onboarding_status to skipped without fabricating records."""
    user = await _register_user(async_client, f"skip_{uuid.uuid4().hex[:8]}@example.com")

    resp = await async_client.post("/api/v1/onboarding/skip", json={}, headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json()["onboarding_status"] == "skipped"

    s = await async_client.get("/api/v1/onboarding/status", headers=user["headers"])
    assert s.json()["onboarding_status"] == "skipped"
    assert s.json()["contexts_count"] == 0
    assert s.json()["completed"] is True


# ─── 5. Failure Handling (PostgreSQL preserved on RAG error) ──────────────────

@pytest.mark.asyncio
async def test_embedding_failure_marks_context_failed(async_client: AsyncClient, db: AsyncSession):
    """Verify if RAG vector indexing fails, PostgreSQL canonical record is saved with status='failed'."""
    user = await _register_user(async_client, f"fail_{uuid.uuid4().hex[:8]}@example.com")

    with patch.object(rag_service, "ingest", side_effect=RuntimeError("Vector indexing service offline")):
        resp = await async_client.post(
            "/api/v1/onboarding/message",
            json={"content": "Critical notes to preserve."},
            headers=user["headers"]
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["status"] == "failed"

        # Canonical PostgreSQL record is NOT lost
        record = await db.get(UserProfileContext, data["context_id"])
        assert record is not None
        assert record.original_content == "Critical notes to preserve."
        assert record.status == "failed"
        assert "Vector indexing service offline" in record.error_message


# ─── 6. Duplicate Submission Protection ───────────────────────────────────────

@pytest.mark.asyncio
async def test_duplicate_onboarding_submission_is_idempotent(async_client: AsyncClient, db: AsyncSession):
    """Verify submitting identical message repeatedly does not create duplicate rows or vector spam."""
    user = await _register_user(async_client, f"dup_{uuid.uuid4().hex[:8]}@example.com")

    msg = "I am a mechanical engineering student learning C++."
    resp1 = await async_client.post("/api/v1/onboarding/message", json={"content": msg}, headers=user["headers"])
    assert resp1.status_code == 200
    id1 = resp1.json()["context_id"]

    resp2 = await async_client.post("/api/v1/onboarding/message", json={"content": msg}, headers=user["headers"])
    assert resp2.status_code == 200
    id2 = resp2.json()["context_id"]

    assert id1 == id2, "Duplicate submission must return existing context record ID"

    # Count records for user in DB
    stmt = select(UserProfileContext).where(UserProfileContext.user_id == user["user_id"])
    records = (await db.execute(stmt)).scalars().all()
    assert len(records) == 1


# ─── 7. MANDATORY MULTI-ACCOUNT RAG REGRESSION TEST ───────────────────────────

@pytest.mark.asyncio
async def test_mandatory_multi_account_rag_isolation_regression(async_client: AsyncClient):
    """
    MANDATORY REGRESSION TEST:
    1. User A (Python) registers and submits onboarding: 'I am preparing for Python interviews'
    2. User B (Java) registers and submits onboarding: 'I am preparing for Java interviews'
    3. User A retrieval -> receives Python context ONLY (NEVER Java)
    4. User B retrieval -> receives Java context ONLY (NEVER Python)
    5. User A asks AI -> enriched prompt includes Python context ONLY
    6. User B asks AI -> enriched prompt includes Java context ONLY
    7. User A cannot access User B's context documents (HTTP 404)
    8. User B cannot access User A's context documents (HTTP 404)
    """
    user_a = await _register_user(async_client, f"user_a_{uuid.uuid4().hex[:8]}@example.com", name="User A")
    user_b = await _register_user(async_client, f"user_b_{uuid.uuid4().hex[:8]}@example.com", name="User B")

    assert user_a["user_id"] != user_b["user_id"]

    # User A submits Python info
    resp_a = await async_client.post(
        "/api/v1/onboarding/message",
        json={"content": "I am preparing for Python interviews, learning Django and FastApi."},
        headers=user_a["headers"]
    )
    assert resp_a.status_code == 200
    context_a_id = resp_a.json()["context_id"]

    # User B submits Java info
    resp_b = await async_client.post(
        "/api/v1/onboarding/message",
        json={"content": "I am preparing for Java interviews, learning Spring Boot and Hibernate."},
        headers=user_b["headers"]
    )
    assert resp_b.status_code == 200
    context_b_id = resp_b.json()["context_id"]

    # ── Verify direct RAG retrieval isolation ───────────────────────────────
    rag_a = await rag_service.retrieve(user_id=user_a["user_id"], query="What language am I learning?", top_k=5)
    rag_b = await rag_service.retrieve(user_id=user_b["user_id"], query="What language am I learning?", top_k=5)

    assert len(rag_a) > 0
    assert len(rag_b) > 0

    content_a_str = " ".join([c["content"] for c in rag_a])
    content_b_str = " ".join([c["content"] for c in rag_b])

    # Strict isolation verification
    assert "Python" in content_a_str, "User A must receive Python context"
    assert "Java" not in content_a_str, "CRITICAL: User A must NEVER receive User B's Java context"

    assert "Java" in content_b_str, "User B must receive Java context"
    assert "Python" not in content_b_str, "CRITICAL: User B must NEVER receive User A's Python context"

    # ── Verify AI generation proxy prompt enrichment isolation ─────────────
    from app.api.ai.service import AIProviderService
    captured_prompts = []

    async def mock_call_gemini(*args, **kwargs):
        prompt = kwargs.get("prompt") or (args[1] if len(args) > 1 else args[0])
        captured_prompts.append(str(prompt))
        return {"text": json.dumps({"response": "Mocked response"}), "model": "gemini-2.5-flash", "tokens_used": 50}

    with patch.object(AIProviderService, "_call_gemini", side_effect=mock_call_gemini):
        # User A asks AI
        captured_prompts.clear()
        ai_resp_a = await async_client.post(
            "/api/v1/ai/generate",
            json={"prompt": "What should I study today for my interviews?", "feature": "coach"},
            headers=user_a["headers"]
        )
        assert ai_resp_a.status_code == 200
        assert len(captured_prompts) == 1
        prompt_for_a = captured_prompts[0]
        assert "Python" in prompt_for_a
        assert "Java" not in prompt_for_a, "CRITICAL: User A prompt must NOT contain User B's Java data"

        # User B asks AI
        captured_prompts.clear()
        ai_resp_b = await async_client.post(
            "/api/v1/ai/generate",
            json={"prompt": "What should I study today for my interviews?", "feature": "coach"},
            headers=user_b["headers"]
        )
        assert ai_resp_b.status_code == 200
        assert len(captured_prompts) == 1
        prompt_for_b = captured_prompts[0]
        assert "Java" in prompt_for_b
        assert "Python" not in prompt_for_b, "CRITICAL: User B prompt must NOT contain User A's Python data"

    # ── Verify cross-user document access is strictly blocked ───────────────
    # User A tries to view User B's context document
    leak_attempt_a = await async_client.get(f"/api/v1/onboarding/documents/{context_b_id}", headers=user_a["headers"])
    assert leak_attempt_a.status_code == 404, "User A must not be able to access User B's document"

    # User B tries to view User A's context document
    leak_attempt_b = await async_client.get(f"/api/v1/onboarding/documents/{context_a_id}", headers=user_b["headers"])
    assert leak_attempt_b.status_code == 404, "User B must not be able to access User A's document"
