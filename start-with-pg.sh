#!/bin/sh
set -e

export NGINX_PORT="${PORT:-8080}"
export BACKEND_PORT="4000"
export PGDATA="${PGDATA:-/var/lib/postgresql/data}"
export DATABASE_URL="${DATABASE_URL:-postgresql://fabriq:fabriq@127.0.0.1:5432/fabriq_db}"

# ── PostgreSQL ──────────────────────────────────────────────────
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL..."
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$PGDATA"
    su-exec postgres initdb -D "$PGDATA" --auth=trust

    echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
    echo "listen_addresses = '*'" >> "$PGDATA/postgresql.conf"

    su-exec postgres pg_ctl -D "$PGDATA" start -w -o "-p 5432"
    su-exec postgres psql -p 5432 -c "CREATE USER fabriq WITH PASSWORD 'fabriq' SUPERUSER;"
    su-exec postgres psql -p 5432 -c "CREATE DATABASE fabriq_db OWNER fabriq;"

    echo "Running database setup..."
    cd /app/backend
    DATABASE_URL="${DATABASE_URL}" npx prisma db push
    DATABASE_URL="${DATABASE_URL}" node setup-db.js --demo-data=indian-demo --skip-tests
    cd /app
else
    echo "Starting existing PostgreSQL..."
    su-exec postgres pg_ctl -D "$PGDATA" start -w -o "-p 5432"
fi

# ── Nginx ───────────────────────────────────────────────────────
envsubst '${NGINX_PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# ── Backend ─────────────────────────────────────────────────────
echo "Starting backend on port ${BACKEND_PORT}..."
cd /app/backend
BACKEND_PORT="${BACKEND_PORT}" DATABASE_URL="${DATABASE_URL}" node dist/index.js &
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
