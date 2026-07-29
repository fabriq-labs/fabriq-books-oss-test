#!/bin/sh
# Python FastAPI integration sync (POST /sync, GET /health). Listens on INTEGRATION_SYNC_PORT (default 8081).
# Parent shell must export INTEGRATION_SYNC_URL so the Node process inherits it.

if [ "${INTEGRATION_SYNC_ENABLED}" = "false" ]; then
  echo "Integration sync service disabled (INTEGRATION_SYNC_ENABLED=false)."
  exit 0
fi

INTEGRATION_SYNC_PORT="${INTEGRATION_SYNC_PORT:-8081}"
export PYTHONPATH=/opt/fabriq-int
# dbt is installed in the sync venv; run_dbt.py invokes `dbt` via /bin/sh
export PATH="/opt/venv/bin:${PATH}"

# One .env for Node + Python: mount backend/.env at /app/backend/.env (see docker-compose) so file-based loaders see it.
if [ -f /app/backend/.env ]; then
  ln -sf /app/backend/.env /opt/fabriq-int/quickbooks/.env 2>/dev/null || true
  ln -sf /app/backend/.env /opt/fabriq-int/zoho_books/.env 2>/dev/null || true
fi

if [ ! -x /opt/venv/bin/uvicorn ] || [ ! -f /opt/fabriq-int/sync_service/main.py ]; then
  echo "WARNING: Integration sync bundle missing; skipping Python sync service."
  exit 0
fi

echo "Starting integration sync service on port ${INTEGRATION_SYNC_PORT} (${INTEGRATION_SYNC_URL})..."
# Use venv python -m uvicorn (avoids broken console-script shebang if PATH/python drift).
cd /opt/fabriq-int && /opt/venv/bin/python -m uvicorn sync_service.main:app --host 0.0.0.0 --port "${INTEGRATION_SYNC_PORT}" &
SYNC_PID=$!

echo "Waiting for integration sync service..."
i=0
while [ "$i" -lt 45 ]; do
  # GET /health (FastAPI may return 405 for HEAD)
  if wget -q -T 2 -O /dev/null "http://127.0.0.1:${INTEGRATION_SYNC_PORT}/health" 2>/dev/null; then
    echo "Integration sync service is ready."
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done
echo "WARNING: Integration sync service may not be ready yet (PID ${SYNC_PID})."
