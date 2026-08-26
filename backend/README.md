# StudyFlow AI — Backend Service

The StudyFlow AI backend is a high-performance, asynchronous REST API and WebSocket service built with **FastAPI**, **PostgreSQL**, **SQLAlchemy (asyncpg)**, and **Alembic**.

It powers the cloud sync, authentication, and Jass AI study orchestration pipelines.

---

## Key Features

- **Asynchronous Architecture**: Built on FastAPI and `asyncpg` for non-blocking I/O.
- **Robust Authentication**: Dual-mode auth with JWT bearer tokens and persistent desktop session tokens.
- **Jass AI Orchestration**: Backend-managed study plan generation, syllabus breakdown, and coach chat.
- **Database Migrations**: Managed via Alembic with automated revision tracking.
- **Multi-Account Isolation**: Strict tenant isolation across all endpoints and queries.
- **RAG & Vector Search**: Per-user document vectorization and semantic search capabilities.

---

## Tech Stack

- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 16+
- **ORM**: SQLAlchemy 2.0 (asyncpg / psycopg2)
- **Migrations**: Alembic
- **Validation**: Pydantic v2
- **Testing**: Pytest & pytest-asyncio

---

## Quickstart

### 1. Prerequisites

- Python 3.11+
- PostgreSQL 14+ or Docker

### 2. Setup Virtual Environment

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure Environment

Copy the example environment file and fill in required values:

```bash
cp .env.example .env
```

### 4. Run Migrations

```bash
alembic upgrade head
```

### 5. Start the Server

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

---

## Running with Docker Compose

To run the backend and PostgreSQL database together:

```bash
docker-compose up --build
```

---

## Testing

Run the test suite with `pytest`:

```bash
pytest
```
