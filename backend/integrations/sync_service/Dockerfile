# Optional standalone sync image (multi-tenant / scale-out).
# Single-tenant Books uses the root Dockerfile (sync on loopback).
#
# Build from backend/integrations:
#   docker build -f sync_service/Dockerfile .
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev

COPY shared /app/shared
COPY quickbooks /app/quickbooks
COPY sync_service /app/sync_service

ENV PYTHONPATH=/app
EXPOSE 8080
CMD ["sh", "-c", "uv run uvicorn sync_service.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
