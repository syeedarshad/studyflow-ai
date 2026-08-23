"""
StudyFlow AI — Centralized RAG (Retrieval-Augmented Generation) Service
─────────────────────────────────────────────────────────────
Provides strictly user-isolated document chunking, embedding generation,
vector persistence, and semantic context retrieval.

Multi-Tenant Isolation Guarantee:
  - Vector indices and metadata are stored in dedicated per-user directories:
      uploads/vector_store/user_{user_id}/vectors.json
  - Retrieval queries ONLY load and search the requested user's namespace.
  - Every retrieved chunk validates chunk['user_id'] == requested_user_id.
  - Cross-user retrieval is mathematically and physically impossible.
"""

import asyncio
import json
import logging
import math
import os
import re
import urllib.request
import urllib.error
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

EMBEDDING_MODEL = "text-embedding-004"
VECTOR_DIM = 256


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Computes cosine similarity between two float vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


class RAGService:
    """
    Central RAG service with strict user namespace isolation.
    """

    def __init__(self, base_dir: Optional[str] = None) -> None:
        upload_base = base_dir or getattr(settings, "UPLOAD_DIR", "./uploads")
        self.vector_store_root = os.path.join(upload_base, "vector_store")
        os.makedirs(self.vector_store_root, exist_ok=True)
        self._locks: dict[int, asyncio.Lock] = {}

    def _get_user_lock(self, user_id: int) -> asyncio.Lock:
        """Returns or creates a per-user asyncio.Lock for serialized writes."""
        if user_id not in self._locks:
            self._locks[user_id] = asyncio.Lock()
        return self._locks[user_id]

    def _get_user_dir(self, user_id: int) -> str:
        """Returns the isolated directory for a specific user ID."""
        user_dir = os.path.join(self.vector_store_root, f"user_{user_id}")
        os.makedirs(user_dir, exist_ok=True)
        return user_dir

    def _get_user_vector_file(self, user_id: int) -> str:
        return os.path.join(self._get_user_dir(user_id), "vectors.json")

    # ─── Text Chunking ───────────────────────────────────────────────────────

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> list[str]:
        """
        Splits text into coherent chunks respecting sentence/paragraph boundaries.
        """
        if not text or not text.strip():
            return []

        cleaned = re.sub(r"\r\n", "\n", text.strip())
        paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]

        chunks: list[str] = []
        current_chunk: list[str] = []
        current_len = 0

        for para in paragraphs:
            para_len = len(para)
            if current_len + para_len <= chunk_size:
                current_chunk.append(para)
                current_len += para_len + 2
            else:
                if current_chunk:
                    chunks.append("\n\n".join(current_chunk))
                # If paragraph itself exceeds chunk_size, split by sentences
                if para_len > chunk_size:
                    sentences = re.split(r"(?<=[.!?])\s+", para)
                    sub_chunk: list[str] = []
                    sub_len = 0
                    for s in sentences:
                        s_len = len(s)
                        if sub_len + s_len <= chunk_size:
                            sub_chunk.append(s)
                            sub_len += s_len + 1
                        else:
                            if sub_chunk:
                                chunks.append(" ".join(sub_chunk))
                            sub_chunk = [s]
                            sub_len = s_len
                    if sub_chunk:
                        chunks.append(" ".join(sub_chunk))
                    current_chunk = []
                    current_len = 0
                else:
                    current_chunk = [para]
                    current_len = para_len

        if current_chunk:
            chunks.append("\n\n".join(current_chunk))

        # Filter out empty or trivially short chunks
        return [c.strip() for c in chunks if len(c.strip()) > 10] or [cleaned[:chunk_size]]

    # ─── Embedding Generation ────────────────────────────────────────────────

    async def generate_embedding(self, text: str) -> list[float]:
        """
        Generates embedding vector.
        In production: Calls Gemini Embedding API if key configured.
        In development / test mode or fallback: Generates high-quality semantic hash vector.
        """
        api_key = getattr(settings, "effective_gemini_key", None)
        is_prod = getattr(settings, "is_production", False)

        if api_key and not getattr(settings, "is_testing", False):
            try:
                return await self._call_gemini_embedding(text, api_key)
            except Exception as exc:
                if is_prod:
                    logger.error("Gemini embedding API failed in production: %s", exc)
                    raise RuntimeError(f"Embedding service error: {exc}")
                logger.warning("Gemini embedding failed in dev mode, using semantic vectorizer: %s", exc)

        if is_prod and not api_key:
            raise RuntimeError("Gemini API key required for production embedding.")

        # Deterministic semantic vectorizer for dev/tests
        return self._deterministic_semantic_embedding(text)

    async def _call_gemini_embedding(self, text: str, api_key: str) -> list[float]:
        """Calls Google Gemini embedContent API."""
        body = json.dumps({
            "model": f"models/{EMBEDDING_MODEL}",
            "content": {"parts": [{"text": text[:2048]}]},
        }).encode("utf-8")

        def _sync():
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:embedContent?key={api_key}"
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            values = data.get("embedding", {}).get("values", [])
            if not values:
                raise ValueError("Empty embedding returned from Gemini")
            return values

        return await asyncio.get_event_loop().run_in_executor(None, _sync)

    @staticmethod
    def _deterministic_semantic_embedding(text: str, dim: int = VECTOR_DIM) -> list[float]:
        """
        Generates a normalized semantic vector using term hashing & n-gram frequency.
        Ensures consistent, testable cosine similarities for queries and documents.
        """
        vec = [0.0] * dim
        normalized = text.lower()
        words = re.findall(r"\b\w+\b", normalized)

        for w in words:
            # Word level hash
            h = abs(hash(w)) % dim
            vec[h] += 2.0
            # Character bigrams and trigrams
            for i in range(max(0, len(w) - 1)):
                bi = w[i:i+2]
                vec[abs(hash(bi)) % dim] += 0.5
            for i in range(max(0, len(w) - 2)):
                tri = w[i:i+3]
                vec[abs(hash(tri)) % dim] += 0.8

        # L2 normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

    # ─── Ingestion ───────────────────────────────────────────────────────────

    async def ingest(
        self,
        user_id: int,
        context_id: int,
        source_type: str,
        content: str,
        metadata: Optional[dict] = None
    ) -> list[dict]:
        """
        Chunks text, creates embeddings, and saves vectors into user-specific vector store.
        """
        chunks = self.chunk_text(content)
        if not chunks:
            return []

        async with self._get_user_lock(user_id):
            user_file = self._get_user_vector_file(user_id)
            existing_records: list[dict] = []
            if os.path.exists(user_file):
                try:
                    with open(user_file, "r", encoding="utf-8") as f:
                        existing_records = json.load(f)
                except Exception as e:
                    logger.warning("Could not read vector file for user %s, re-initializing: %s", user_id, e)
                    existing_records = []

            # Remove existing chunks for this specific context_id to maintain idempotency
            filtered_records = [r for r in existing_records if r.get("context_id") != context_id]

            new_chunks = []
            for idx, chunk_str in enumerate(chunks):
                embedding = await self.generate_embedding(chunk_str)
                chunk_record = {
                    "chunk_id": str(uuid.uuid4()),
                    "context_id": context_id,
                    "user_id": user_id,
                    "source_type": source_type,
                    "chunk_index": idx,
                    "content": chunk_str,
                    "embedding": embedding,
                    "metadata": metadata or {},
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                filtered_records.append(chunk_record)
                new_chunks.append(chunk_record)

            # Atomic write to user namespace
            tmp_file = f"{user_file}.tmp"
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(filtered_records, f, ensure_ascii=False)
            os.replace(tmp_file, user_file)

            logger.info(
                "Ingested %d chunks for user_id=%d context_id=%d source_type=%s",
                len(new_chunks), user_id, context_id, source_type
            )
            return new_chunks

    # ─── Retrieval ───────────────────────────────────────────────────────────

    async def retrieve(
        self,
        user_id: int,
        query: str,
        top_k: int = 3,
        min_similarity: float = 0.01
    ) -> list[dict]:
        """
        Retrieves relevant context strictly from the user's isolated namespace.
        Enforces defense-in-depth ownership validation on every chunk.
        """
        if not query or not query.strip():
            return []

        user_file = self._get_user_vector_file(user_id)
        if not os.path.exists(user_file):
            return []

        try:
            with open(user_file, "r", encoding="utf-8") as f:
                records = json.load(f)
        except Exception as e:
            logger.error("Error reading vector file for user %s: %s", user_id, e)
            return []

        query_embedding = await self.generate_embedding(query)

        scored: list[tuple[float, dict]] = []
        for r in records:
            # DEFENSE IN DEPTH: Verify chunk ownership
            if r.get("user_id") != user_id:
                logger.critical(
                    "SECURITY ALERT: Found cross-user vector %s in user_%d store! Discarding.",
                    r.get("chunk_id"), user_id
                )
                continue

            sim = _cosine_similarity(query_embedding, r.get("embedding", []))
            if sim >= min_similarity:
                scored.append((sim, r))

        scored.sort(key=lambda x: x[0], reverse=True)
        top_results = []
        for sim, item in scored[:top_k]:
            top_results.append({
                "chunk_id": item.get("chunk_id"),
                "context_id": item.get("context_id"),
                "user_id": item.get("user_id"),
                "source_type": item.get("source_type"),
                "content": item.get("content"),
                "similarity": round(sim, 4),
                "metadata": item.get("metadata", {}),
                "created_at": item.get("created_at")
            })

        return top_results


# Global singleton instance
rag_service = RAGService()
