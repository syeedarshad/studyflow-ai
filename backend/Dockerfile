# ── Production Dockerfile for StudyFlow AI Backend ───────────────────────────
FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    UPLOAD_DIR=/app/uploads

WORKDIR /app

# Install system dependencies & security tools (curl for HEALTHCHECK)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create non-root user & configure permissions
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/sh -m appuser && \
    mkdir -p /app/uploads && \
    chown -R appuser:appgroup /app

# Copy application source code
COPY --chown=appuser:appgroup . .

# Switch to unprivileged user
USER appuser

# Expose backend port
EXPOSE 8000

# Mountable volume for persistent document uploads and RAG vector store
VOLUME ["/app/uploads"]

# Health check verifies application availability
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/health || exit 1

# Production command with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
