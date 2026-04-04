# Single Dockerfile for both embedded-PG and external-PG. Mode at runtime via USE_EMBEDDED_PG.
# Build: COPY monorepo backend/ + frontend-1/ → build → final nginx image.
# CI: GitHub Actions → GHCR. Optional build-args: SOURCE_* for /app/build-info.json.

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY frontend-1/package*.json ./
RUN npm ci

COPY frontend-1/ ./

ENV VITE_API_BASE_URL=""
ENV VITE_ENABLE_AI="true"
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
COPY backend/prisma ./prisma/

RUN npm install

COPY backend/ ./

# Ensure Prisma generates engine for Alpine runtime (openssl-3.0.x)
RUN sed -i '/provider = "prisma-client-js"/a\
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]' prisma/schema/schema.prisma

RUN npx tsc && cp -r src/config dist/config 2>/dev/null || true
RUN npx prisma generate
# Do not prune: OpenTelemetry/Langfuse deps are in devDependencies but required at runtime

# Stage 2b: Image metadata for debugging (monorepo commit, ref, build time, tag)
FROM node:20-alpine AS build-info
WORKDIR /work
COPY backend /src/backend
COPY frontend-1 /src/frontend-1
COPY docker-build-info.js /docker-build-info.js

ARG SOURCE_REF=unknown
ARG SOURCE_COMMIT=unknown
ARG SOURCE_COMMIT_MESSAGE=
ARG SOURCE_COMMIT_MESSAGE_B64=
ARG SOURCE_COMMIT_DATE=
ARG BUILD_TIME
ARG IMAGE_TAG=unknown
# Bust cache when CI passes a new value (e.g. commit SHA).
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

# Stage 3: Final image (nginx + node + PostgreSQL; start script chosen by USE_EMBEDDED_PG)
FROM nginx:alpine

ARG BUILD_TIME
ARG IMAGE_TAG=unknown
ARG SOURCE_REF=unknown

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.title="fabriq"
LABEL fabriq.source.ref="${SOURCE_REF}"
LABEL fabriq.backend.branch="${SOURCE_REF}"
LABEL fabriq.frontend.branch="${SOURCE_REF}"
LABEL fabriq.image.tag="${IMAGE_TAG}"

RUN apk add --no-cache \
    nodejs \
    npm \
    wget \
    gettext \
    python3 \
    make \
    g++ \
    antiword \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    bash \
    postgresql16 \
    postgresql16-contrib \
    su-exec \
    openssl

WORKDIR /app

COPY --from=backend-builder /app /app/backend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY --from=build-info /build-info.json /app/build-info.json
COPY --from=build-info /build-info.json /usr/share/nginx/html/build-info.json

COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY start-with-pg.sh /start-with-pg.sh
COPY start-external.sh /start-external.sh
COPY start.sh /start.sh
RUN chmod +x /start.sh /start-with-pg.sh /start-external.sh

RUN mkdir -p /app/backend/logs
RUN mkdir -p /var/lib/postgresql/data && chown -R postgres:postgres /var/lib/postgresql

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${NGINX_PORT:-8080}/health || exit 1

CMD ["/start.sh"]
