#!/bin/sh
set -e

export NGINX_PORT="${PORT:-8080}"
export BACKEND_PORT="4000"
export PGDATA="${PGDATA:-/var/lib/postgresql/data}"
export DATABASE_URL="${DATABASE_URL:-postgresql://fabriq:fabriq@127.0.0.1:5432/fabriq_db}"

# Prisma: use whichever query engine was built (openssl-3.0.x or 1.1.x)
PRISMA_CLIENT_DIR="/app/backend/node_modules/.prisma/client"
if [ -d "$PRISMA_CLIENT_DIR" ]; then
  ENGINE=$(ls "$PRISMA_CLIENT_DIR"/libquery_engine-linux-musl-*.so.node 2>/dev/null | head -1)
  if [ -n "$ENGINE" ]; then export PRISMA_QUERY_ENGINE_LIBRARY="$ENGINE"; fi
fi

# ── PostgreSQL ──────────────────────────────────────────────────
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL..."
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$PGDATA"
    su-exec postgres initdb -D "$PGDATA" --auth=trust

    echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
    echo "listen_addresses = '*'" >> "$PGDATA/postgresql.conf"
    echo "unix_socket_directories = '$PGDATA'" >> "$PGDATA/postgresql.conf"

    su-exec postgres pg_ctl -D "$PGDATA" start -w -o "-p 5432 -c unix_socket_directories=$PGDATA"
    su-exec postgres psql -h "$PGDATA" -p 5432 -c "CREATE USER fabriq WITH PASSWORD 'fabriq' SUPERUSER;"
    su-exec postgres psql -h "$PGDATA" -p 5432 -c "CREATE DATABASE fabriq_db OWNER fabriq;"

    echo "Running kernel database setup..."
    cd /app/backend
    DATABASE_URL="${DATABASE_URL}" npm run setup:kernel
    cd /app
else
    echo "Starting existing PostgreSQL..."
    # Use PGDATA for socket/lock file so we don't need /run/postgresql in the container
    if ! grep -q 'unix_socket_directories' "$PGDATA/postgresql.conf"; then
        echo "unix_socket_directories = '$PGDATA'" >> "$PGDATA/postgresql.conf"
    fi
    su-exec postgres pg_ctl -D "$PGDATA" start -w -o "-p 5432 -c unix_socket_directories=$PGDATA"
fi

# ── Nginx ───────────────────────────────────────────────────────
envsubst '${NGINX_PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# ── Backend ─────────────────────────────────────────────────────
echo "Starting backend on port ${BACKEND_PORT} (with auto-restart)..."
cd /app/backend
(
  while true; do
    BACKEND_PORT="${BACKEND_PORT}" DATABASE_URL="${DATABASE_URL}" node dist/index.js &
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
