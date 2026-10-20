#!/bin/sh
set -e

# Container entrypoint. PostgreSQL is external. Requires DATABASE_URL and JWT_SECRET.
# Nginx listens on PORT (default 8080). The API listens on 4000 inside the container.

if [ -z "${DATABASE_URL}" ]; then
  echo "DATABASE_URL is required. This image does not start PostgreSQL." >&2
  exit 1
fi
if [ -z "${JWT_SECRET}" ]; then
  echo "JWT_SECRET is required." >&2
  exit 1
fi

# Optional: full service account JSON in env (for example a Railway secret).
if [ -n "${GCP_SA_JSON}" ]; then
  printf '%s' "${GCP_SA_JSON}" > /tmp/gcp-sa.json
  chmod 600 /tmp/gcp-sa.json 2>/dev/null || true
  export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-sa.json
fi

export NGINX_PORT="${PORT:-8080}"
export BACKEND_PORT="4000"
export SYNC_PORT="${SYNC_PORT:-8090}"
# Single-tenant: sync/dbt runs in this same container on loopback (default on).
export ENABLE_SYNC_SERVICE="${ENABLE_SYNC_SERVICE:-true}"

# Prefer the Alpine openssl-3.0.x query engine (matches nginx:alpine runtime).
PRISMA_CLIENT_DIR="/app/backend/node_modules/.prisma/client"
if [ -d "$PRISMA_CLIENT_DIR" ]; then
  ENGINE=""
  for candidate in \
    "$PRISMA_CLIENT_DIR"/libquery_engine-linux-musl-openssl-3.0.x.so.node \
    "$PRISMA_CLIENT_DIR"/libquery_engine-linux-musl-openssl-1.1.x.so.node \
    "$PRISMA_CLIENT_DIR"/libquery_engine-linux-musl.so.node
  do
    if [ -f "$candidate" ]; then ENGINE="$candidate"; break; fi
  done
  if [ -n "$ENGINE" ]; then export PRISMA_QUERY_ENGINE_LIBRARY="$ENGINE"; fi
fi

envsubst '${NGINX_PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

echo "Starting backend on port ${BACKEND_PORT} (with auto-restart)..."
cd /app/backend
(
  while true; do
    BACKEND_PORT="${BACKEND_PORT}" node dist/index.js &
    BACKEND_PID=$!
    echo "Backend started with pid ${BACKEND_PID}"
    wait "${BACKEND_PID}"
    EXIT_CODE=$?
    echo "WARNING: Backend (pid ${BACKEND_PID}) exited with code ${EXIT_CODE}; restarting in 2s..."
    sleep 2
  done
) &

# Forward-sync service (Airbyte + dbt) — same image, loopback only.
# Use venv python -m uvicorn so a broken uvicorn script shebang is not required.
INTEGRATIONS_DIR="/app/backend/integrations"
VENV_PYTHON="${INTEGRATIONS_DIR}/.venv/bin/python"
if [ "${ENABLE_SYNC_SERVICE}" = "true" ] || [ "${ENABLE_SYNC_SERVICE}" = "1" ]; then
  if [ -x "${VENV_PYTHON}" ] && "${VENV_PYTHON}" -c "import uvicorn" 2>/dev/null; then
    echo "Starting sync_service on 127.0.0.1:${SYNC_PORT}..."
    (
      cd "${INTEGRATIONS_DIR}"
      export PYTHONPATH="${INTEGRATIONS_DIR}"
      # Prefer baked venv binaries (dbt, etc.) over missing build-tool `uv` on PATH.
      export PATH="${INTEGRATIONS_DIR}/.venv/bin:${PATH}"
      while true; do
        "${VENV_PYTHON}" -m uvicorn sync_service.main:app --host 127.0.0.1 --port "${SYNC_PORT}" &
        SYNC_PID=$!
        echo "sync_service started with pid ${SYNC_PID}"
        wait "${SYNC_PID}"
        EXIT_CODE=$?
        echo "WARNING: sync_service (pid ${SYNC_PID}) exited with code ${EXIT_CODE}; restarting in 2s..."
        sleep 2
      done
    ) &
  else
    echo "WARNING: ENABLE_SYNC_SERVICE=true but sync venv is not runnable (${VENV_PYTHON}); skip sync."
    ls -la "${INTEGRATIONS_DIR}/.venv/bin" 2>/dev/null || true
    "${VENV_PYTHON}" -c "import uvicorn" 2>&1 || true
  fi
else
  echo "ENABLE_SYNC_SERVICE=${ENABLE_SYNC_SERVICE}; sync_service not started."
fi

echo "Waiting for backend..."
for i in $(seq 1 30); do
    if wget --spider --quiet "http://127.0.0.1:${BACKEND_PORT}/api/health" 2>/dev/null; then
        echo "Backend is ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "WARNING: Backend may not be ready yet, starting nginx anyway."
    fi
    sleep 1
done

echo "Starting nginx on port ${NGINX_PORT}..."
exec nginx -g 'daemon off;'