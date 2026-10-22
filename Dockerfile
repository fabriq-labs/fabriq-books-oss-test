# Default production image: Debian bookworm-slim + Node + Python + nginx.
# One glibc stack — Node/Python shebangs and Prisma (debian-openssl-3.0.x) align.
# uv is build-only; runtime uses baked .venv (dbt / uvicorn).
# Legacy Alpine build: Dockerfile.alpine (kept for reference only).

ARG NODE_RUNTIME_VERSION=24.14.1

# --- Integrations (dbt + sync_service) ---
FROM python:3.12-slim-bookworm AS integrations-builder
WORKDIR /app/backend/integrations
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/* \
    && curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"
COPY backend/integrations/pyproject.toml backend/integrations/uv.lock ./
COPY backend/integrations/README.md ./
RUN uv sync --frozen --no-dev
COPY backend/integrations/ ./
RUN uv sync --frozen --no-dev \
  && test -x .venv/bin/uvicorn \
  && test -x .venv/bin/dbt

# --- Frontend ---
FROM node:${NODE_RUNTIME_VERSION}-bookworm-slim AS frontend-builder
WORKDIR /app
COPY frontend-0/package*.json ./
RUN npm ci
COPY frontend-0/ ./
ENV VITE_API_BASE_URL=""
ENV VITE_ENABLE_AI="true"
RUN npm run build

# --- Backend (Node + Prisma debian openssl-3) ---
FROM node:${NODE_RUNTIME_VERSION}-bookworm-slim AS backend-builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
COPY backend/prisma ./prisma/
RUN npm ci
COPY backend/ ./
RUN npm run build \
  && npx prisma generate \
  && test -f node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node

# --- Build info ---
# .git is dockerignored. Callers must pass SOURCE_* / IMAGE_TAG / BUILD_TIME
# build-args (GitHub Actions, ./docker-build.sh, or any other builder).
FROM node:${NODE_RUNTIME_VERSION}-bookworm-slim AS build-info
COPY docker-build-info.js /docker-build-info.js
ARG SOURCE_REF=unknown
ARG SOURCE_COMMIT=unknown
ARG SOURCE_COMMIT_MESSAGE=
ARG SOURCE_COMMIT_MESSAGE_B64=
ARG SOURCE_COMMIT_DATE=
ARG BUILD_TIME
ARG IMAGE_TAG=unknown
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

# Official images as named stages (BuildKit forbids ARG expansion in COPY --from)
FROM node:${NODE_RUNTIME_VERSION}-bookworm-slim AS node-runtime
FROM python:3.12-slim-bookworm AS python-runtime

# --- Runtime: one Debian base, all shebangs resolve ---
FROM debian:bookworm-slim
ARG NODE_RUNTIME_VERSION=24.14.1

RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx \
      gettext-base \
      ca-certificates \
      curl \
      wget \
      bash \
      libpq5 \
      postgresql-client \
      openssl \
      libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Python first, then Node/npm on top so /usr/local from Python does not wipe npm.
COPY --from=python-runtime /usr/local /usr/local
RUN ln -sf /usr/local/bin/python3.12 /usr/local/bin/python3 \
 && ln -sf /usr/local/bin/python3.12 /usr/local/bin/python

# Node + npm/npx (same glibc). npm/npx needed for AUTO_SETUP while we still
# invoke prisma/seeds via npx; can move to baked SQL later.
# Copy the npm package tree and link the real CLIs — copying /usr/local/bin/npm
# as a file breaks its require('../lib/cli.js') relative to bin/.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && ln -sf /usr/local/bin/node /usr/bin/node \
 && ln -sf /usr/local/bin/npm /usr/bin/npm \
 && ln -sf /usr/local/bin/npx /usr/bin/npx \
 && node -v | grep -q "v${NODE_RUNTIME_VERSION}" \
 && npm -v >/dev/null \
 && npx -v >/dev/null

WORKDIR /app
COPY --from=backend-builder /app /app/backend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY --from=build-info /build-info.json /app/build-info.json
COPY --from=build-info /build-info.json /usr/share/nginx/html/build-info.json
COPY --from=integrations-builder /app/backend/integrations /app/backend/integrations

# Smoke: venv works without uv on PATH
RUN /app/backend/integrations/.venv/bin/python -c "import uvicorn, fastapi; print('sync_service deps ok')" \
 && test -x /app/backend/integrations/.venv/bin/uvicorn \
 && test -x /app/backend/integrations/.venv/bin/dbt \
 && ! command -v uv >/dev/null

COPY nginx.main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY start.sh /start.sh
# Debian apt nginx runs as www-data (Alpine nginx image uses user nginx).
RUN chmod +x /start.sh \
 && mkdir -p /app/backend/logs \
 && mkdir -p /var/log/nginx /var/cache/nginx /var/lib/nginx/body \
 && mkdir -p /run/nginx \
 && sed -i 's/^user  nginx;/user  www-data;/' /etc/nginx/nginx.conf

ENV PYTHONPATH=/app/backend/integrations
ENV SYNC_PORT=8090
ENV ENABLE_SYNC_SERVICE=true
ENV SYNC_SERVICE_URL=http://127.0.0.1:8090

ARG BUILD_TIME
ARG IMAGE_TAG=unknown
ARG SOURCE_REF=unknown
LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL fabriq.image.variant="debian-bookworm-slim"
LABEL fabriq.node.runtime="${NODE_RUNTIME_VERSION}"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-8080}/health || exit 1

CMD ["/start.sh"]
