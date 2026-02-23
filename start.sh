#!/bin/sh
set -e

# Cloud Run / Railway / any platform sets PORT for the container
# Nginx listens on that port; backend always runs on 4000
export NGINX_PORT="${PORT:-8080}"
export BACKEND_PORT="4000"

# Replace env vars in nginx config template
envsubst '${NGINX_PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

echo "Starting backend on port ${BACKEND_PORT}..."
cd /app/backend
BACKEND_PORT="${BACKEND_PORT}" node dist/index.js &
BACKEND_PID=$!

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
