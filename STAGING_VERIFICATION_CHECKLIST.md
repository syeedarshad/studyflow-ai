# StudyFlow AI — Staging Verification Checklist

Use this checklist to perform end-to-end qualification and acceptance testing on any deployed staging or production environment.

---

## 1. Environment & Configuration Verification

- [ ] **Production Mode:** `ENVIRONMENT=production` and `DEBUG=false` confirmed in container environment.
- [ ] **Fail-Fast Validation:** Verified container refuses to start if required variables are missing or use development defaults (`studyflow:password@localhost`).
- [ ] **Encryption Key:** `ENCRYPTION_KEY` is a 32-byte Fernet key stored securely.
- [ ] **Session & JWT Secrets:** `SESSION_SECRET` and `JWT_SECRET` are distinct, high-entropy secrets (≥32 chars).
- [ ] **AI Provider Keys:** `GEMINI_API_KEY` and/or `GROQ_API_KEY` configured in server environment.
- [ ] **CORS Restrictions:** `CORS_ORIGINS` limited to trusted origins + `null`/`file://`.
- [ ] **Allowed Hosts:** `ALLOWED_HOSTS` configured with deployment hostname (no wildcards in production).

---

## 2. Database & Migration Verification

- [ ] **Database Connectivity:** PostgreSQL container/instance is healthy and accepting connections.
- [ ] **Alembic Migrations:** `alembic upgrade head` executed with zero errors.
- [ ] **Schema Version:** `alembic current` matches HEAD revision (`d4e5f6a7b8c9`).
- [ ] **Foreign Key Constraints:** Verified `ON DELETE CASCADE` and `ON DELETE SET NULL` constraints exist.
- [ ] **Index Verification:** Performance indexes on `user_id`, `created_at`, and task statuses verified.

---

## 3. Service Health & Readiness Probes

- [ ] **Liveness Probe (`GET /health`):** Returns HTTP 200 with `status: "ok"` and valid `uptime`.
- [ ] **Readiness Probe (`GET /ready`):** Returns HTTP 200 with `status: "ready"`, `database: "connected"`.
- [ ] **Security Headers:** Response contains `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.

---

## 4. Authentication & Multi-Account Isolation Verification

- [ ] **User A Registration:** Register User A via `POST /api/v1/auth/register`. Returns session token.
- [ ] **Session Validation:** Validate session via `GET /api/v1/auth/me` with Bearer token.
- [ ] **Password Security:** Password stored as bcrypt hash in PostgreSQL (never plaintext).
- [ ] **Session Token Storage:** Server stores SHA-256 hash of token; Electron stores plaintext in `safeStorage`.
- [ ] **User B Registration:** Register User B in separate browser/client.
- [ ] **Cross-Account Data Isolation:**
  - [ ] User A creates tasks, goals, and notes.
  - [ ] User B logs in — verifies User A records are completely invisible.
  - [ ] Direct API requests as User B targeting User A resource IDs return HTTP 404/403.
- [ ] **Logout & Invalidation:** User A logs out via `POST /api/v1/auth/logout`. Session is invalidated in database.

---

## 5. Onboarding, Uploads & Personal RAG Verification

- [ ] **Onboarding Text Submission:** User submits onboarding message via `POST /api/v1/onboarding/message`.
  - [ ] Context record created in PostgreSQL (`user_profile_context`).
  - [ ] Text chunked and indexed in `/app/uploads/vector_store/user_{user_id}/vectors.json`.
- [ ] **Document Upload:** Upload test study plan or timetable via `POST /api/v1/onboarding/upload`.
  - [ ] File persisted under `/app/uploads/documents/user_{user_id}/<filename>`.
  - [ ] Document text extracted and indexed into user vector store.
- [ ] **Personal RAG Retrieval:** Send query to AI Coach endpoint (`POST /api/v1/ai/coach/chat`).
  - [ ] RAG service retrieves relevant chunks from User A's vector store.
  - [ ] AI response is enriched with personalized context.
- [ ] **RAG Cross-User Isolation:**
  - [ ] User B sends AI query asking about User A's uploaded timetable/study plan.
  - [ ] Verify AI response does NOT leak any of User A's confidential onboarding information.

---

## 6. Container Restart & Volume Persistence Verification

- [ ] **Stop & Restart Backend:** `docker compose restart backend`.
  - [ ] Health check passes on startup.
  - [ ] User can still authenticate without data loss.
- [ ] **Stop & Restart Database:** `docker compose restart db`.
  - [ ] PostgreSQL data in `postgres_data` volume is fully preserved.
- [ ] **File Storage Persistence:**
  - [ ] `/app/uploads/documents/user_{user_id}/` files intact after container rebuild/restart.
  - [ ] `/app/uploads/vector_store/user_{user_id}/vectors.json` intact after container rebuild/restart.

---

## 7. Electron Desktop Remote Backend Verification

- [ ] **Environment Injection:** Electron launched with `STUDYFLOW_BACKEND_URL=https://api.yourdomain.com`.
- [ ] **Dynamic CSP:** Verified Chromium network inspector allows `https://api.yourdomain.com` and `wss://api.yourdomain.com`.
- [ ] **No Insecure CSP:** Verified `connect-src *` is NOT present.
- [ ] **Remote Registration & Login:** Full authentication cycle works against remote staging URL.
- [ ] **Offline Sync Queue:** Local SQLite cache operates and sync queue flushes on reconnect.
- [ ] **Account Switching in App:** Log out of Account A, log in to Account B in Electron UI — cache and queue cleanly isolate.
