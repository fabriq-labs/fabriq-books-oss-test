# Kernel image: nginx serves frontend-0 and proxies /api to the Node backend.
# Single-tenant also runs the Python sync/dbt service on loopback (SYNC_PORT).
# Build context is the repo root (./backend and ./frontend-0).
# PostgreSQL is external. /start.sh requires DATABASE_URL and JWT_SECRET.
# CI: GitHub Actions → GHCR. Optional build-args: SOURCE_* for /app/build-info.json.
#
# Runtime Node is pinned (see node-runtime stage). Do not use unpinned `apk add nodejs`.
# Integrations (dbt) use a Debian slim builder so manylinux wheels install cleanly;
# the venv is copied into the Alpine runtime via a dedicated musl build stage.

# Pinned Node.js for production runtime (nginx final stage). Bump only after validation.
ARG NODE_RUNTIME_VERSION=24.14.1
FROM node:${NODE_RUNTIME_VERSION}-alpine AS node-runtime

# Integrations: uv + dbt on Alpine (same libc as final image).
# Workdir must match the final path so venv shebangs resolve after COPY.
FROM python:3.12-alpine AS integrations-builder
WORKDIR /app/backend/integrations
RUN apk add --no-cache build-base libpq-dev curl \
  && curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"
COPY backend/integrations/pyproject.toml backend/integrations/uv.lock ./
COPY backend/integrations/README.md ./
RUN uv sync --frozen --no-dev
COPY backend/integrations/ ./
# Re-sync after full copy so local package layout is intact
RUN uv sync --frozen --no-dev \
  && test -x .venv/bin/uvicorn

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY frontend-0/package*.json ./
RUN npm ci

COPY frontend-0/ ./

ENV VITE_API_BASE_URL=""
ENV VITE_ENABLE_AI="true"
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app

# openssl so prisma generate can resolve linux-musl-openssl-3.0.x (not 1.1.x).
RUN apk add --no-cache python3 make g++ openssl

COPY backend/package*.json ./
COPY backend/prisma ./prisma/

RUN npm ci

COPY backend/ ./

# tsc does not emit JSON under src/config; copy is required at runtime (ModelRegistry).
RUN npm run build
RUN npx prisma generate \
  && test -f node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
# Do not prune: OpenTelemetry deps are in devDependencies but required at runtime

# Stage 2b: Image metadata JSON (env-only — do not COPY app trees or this stage
# invalidates on every code change and slows the build for no benefit).
FROM node:20-alpine AS build-info
COPY docker-build-info.js /docker-build-info.js

ARG SOURCE_REF=unknown
ARG SOURCE_COMMIT=unknown
ARG SOURCE_COMMIT_MESSAGE=
ARG SOURCE_COMMIT_MESSAGE_B64=
ARG SOURCE_COMMIT_DATE=
ARG BUILD_TIME
ARG IMAGE_TAG=unknown
# Bust this stage only (not runtime apk / npm) when CI passes a new commit.
ARG CACHEBUST=1

ENV SOURCE_REF=${SOURCE_REF}
ENV SOURCE_COMMIT=${SOURCE_COMMIT}
ENV SOURCE_COMMIT_MESSAGE=${SOURCE_COMMIT_MESSAGE}
ENV SOURCE_COMMIT_MESSAGE_B64=${SOURCE_COMMIT_MESSAGE_B64}
ENV SOURCE_COMMIT_DATE=${SOURCE_COMMIT_DATE}
ENV IMAGE_TAG=${IMAGE_TAG}

RUN BUILD_TIME="${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" && \
    export BUILD_TIME && \
    node /docker-build-info.js

# Stage 3a: OS + pinned Node runtime deps.
# Keep this stage free of per-build ARG/LABEL (BUILD_TIME, IMAGE_TAG, SOURCE_*) so
# code-only CI rebuilds can cache the apk layer.
FROM nginx:alpine AS runtime-deps

ARG NODE_RUNTIME_VERSION=24.14.1

RUN apk add --no-cache \
    wget \
    gettext \
    bash \
    postgresql16-client \
    openssl \
    libstdc++ \
    libpq \
    python3

# Pinned Node from official image (not Alpine apk — version must not float).
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN ln -sf /usr/local/bin/node /usr/bin/node \
 && node -v | grep -q "v${NODE_RUNTIME_VERSION}"

WORKDIR /app

# Stage 3: Final image (app layers + labels)
FROM runtime-deps

ARG NODE_RUNTIME_VERSION=24.14.1

COPY --from=backend-builder /app /app/backend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY --from=build-info /build-info.json /app/build-info.json
COPY --from=build-info /build-info.json /usr/share/nginx/html/build-info.json
# Overwrite integrations with the Alpine-built uv venv (dbt + sync_service).
COPY --from=integrations-builder /app/backend/integrations /app/backend/integrations
# Venv shebangs point at /usr/local/bin/python3.12 from python:3.12-alpine.
# nginx:alpine only has apk python3 — bring the matching CPython so uvicorn runs.
COPY --from=integrations-builder /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=integrations-builder /usr/local/bin/python3.12 /usr/local/bin/python3.12
# Shared lib for the copied interpreter (path varies slightly by Alpine patch level).
COPY --from=integrations-builder /usr/local/lib /tmp/python-local-lib
RUN cp -a /tmp/python-local-lib/libpython3.12.so* /usr/local/lib/ 2>/dev/null || true \
 && rm -rf /tmp/python-local-lib \
 && ln -sf /usr/local/bin/python3.12 /usr/local/bin/python3 \
 && ln -sf /usr/local/bin/python3.12 /usr/local/bin/python \
 && /app/backend/integrations/.venv/bin/python -c "import uvicorn, fastapi; print('sync_service deps ok')" \
 && test -x /app/backend/integrations/.venv/bin/uvicorn \
 && test -x /app/backend/integrations/.venv/bin/dbt

COPY nginx.main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY start.sh /start.sh
RUN chmod +x /start.sh

RUN mkdir -p /app/backend/logs
ENV PYTHONPATH=/app/backend/integrations
ENV SYNC_PORT=8090
ENV ENABLE_SYNC_SERVICE=true
ENV SYNC_SERVICE_URL=http://127.0.0.1:8090

# Per-build metadata LAST so LABEL/ARG changes do not invalidate apk / Node above.
ARG BUILD_TIME
ARG IMAGE_TAG=unknown
ARG SOURCE_REF=unknown

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.title="kernel"
LABEL fabriq.source.ref="${SOURCE_REF}"
LABEL fabriq.backend.branch="${SOURCE_REF}"
LABEL fabriq.frontend.branch="${SOURCE_REF}"
LABEL fabriq.image.tag="${IMAGE_TAG}"
LABEL fabriq.node.runtime="${NODE_RUNTIME_VERSION}"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-8080}/health || exit 1

CMD ["/start.sh"]
