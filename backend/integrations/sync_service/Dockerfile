# Build from repo: docker build -f sync_service/Dockerfile .
# Context directory must be backend/integrations (so zoho_books/, quickbooks/, shared/ are available).
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev git \
  && rm -rf /var/lib/apt/lists/*

COPY sync_service/requirements.txt /app/sync_service/requirements.txt
RUN pip install --no-cache-dir -r /app/sync_service/requirements.txt

COPY zoho_books /app/zoho_books
COPY quickbooks /app/quickbooks
COPY shared /app/shared
COPY sync_service /app/sync_service

ENV PYTHONPATH=/app
EXPOSE 8080

CMD ["sh", "-c", "uvicorn sync_service.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
