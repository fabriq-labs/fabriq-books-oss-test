#!/bin/sh
set -e

# External PostgreSQL: no embedded DB; backend + nginx only.
# Requires DATABASE_URL and JWT_SECRET from environment.

export NGINX_PORT="${PORT:-8080}"
export BACKEND_PORT="4000"

# Prisma: use whichever query engine was built (openssl-3.0.x or 1.1.x)
PRISMA_CLIENT_DIR="/app/backend/node_modules/.prisma/client"
if [ -d "$PRISMA_CLIENT_DIR" ]; then
  ENGINE=$(ls "$PRISMA_CLIENT_DIR"/libquery_engine-linux-musl-*.so.node 2>/dev/null | head -1)
  if [ -n "$ENGINE" ]; then export PRISMA_QUERY_ENGINE_LIBRARY="$ENGINE"; fi
fi

# Replace env vars in nginx config template
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
