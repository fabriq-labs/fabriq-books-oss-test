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

# Prisma: use whichever query engine was built (openssl-3.0.x or 1.1.x)
PRISMA_CLIENT_DIR="/app/backend/node_modules/.prisma/client"
if [ -d "$PRISMA_CLIENT_DIR" ]; then
  ENGINE=$(ls "$PRISMA_CLIENT_DIR"/libquery_engine-linux-musl-*.so.node 2>/dev/null | head -1)
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
