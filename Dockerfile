# Single Dockerfile for both embedded-PG and external-PG. Mode at runtime via USE_EMBEDDED_PG.
# Build: clone repos → build frontend & backend → final nginx image.
# Works the same on Cloud Build, Railway, and local docker build.
# Pass GH_TOKEN as --build-arg (or set as build-time env in Railway).

# Stage 0: Clone source repos from GitHub
FROM alpine/git AS source
ARG GH_TOKEN
ARG BACKEND_BRANCH=demo
ARG FRONTEND_BRANCH=demo
WORKDIR /src
ENV GIT_TERMINAL_PROMPT=0
RUN git clone --branch "${BACKEND_BRANCH}" --depth 1 \
      "https://x-access-token:${GH_TOKEN}@github.com/fabriq-labs/fabriq-base.git" backend \
 && git clone --branch "${FRONTEND_BRANCH}" --depth 1 \
      "https://x-access-token:${GH_TOKEN}@github.com/fabriq-labs/zeiv-v2.git" frontend-1
      
# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY --from=source /src/frontend-1/package*.json ./
RUN npm ci

COPY --from=source /src/frontend-1/ ./

ENV VITE_API_BASE_URL=""
ENV VITE_ENABLE_AI="true"
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY --from=source /src/backend/package*.json ./
COPY --from=source /src/backend/prisma ./prisma/

RUN npm install

COPY --from=source /src/backend/ ./

# Ensure Prisma generates engine for Alpine runtime (openssl-3.0.x)
RUN sed -i '/provider = "prisma-client-js"/a\
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]' prisma/schema/schema.prisma

RUN npx tsc && cp -r src/config dist/config 2>/dev/null || true
RUN npx prisma generate
# Do not prune: OpenTelemetry/Langfuse deps are in devDependencies but required at runtime

# Stage 2b: Git + image metadata for debugging (SHA, message, commit date, branches, build time, tag)
FROM node:20-alpine AS build-info
RUN apk add --no-cache git
COPY --from=source /src/backend /src/backend
COPY --from=source /src/frontend-1 /src/frontend-1
COPY docker-build-info.js /docker-build-info.js

ARG BACKEND_BRANCH=demo
ARG FRONTEND_BRANCH=demo
ARG BUILD_TIME
ARG IMAGE_TAG=unknown

RUN export BUILD_TIME="${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" && \
    export IMAGE_TAG="${IMAGE_TAG}" && \
    export BACKEND_BRANCH="${BACKEND_BRANCH}" && \
    export FRONTEND_BRANCH="${FRONTEND_BRANCH}" && \
    node /docker-build-info.js

# Stage 3: Final image (nginx + node + PostgreSQL; start script chosen by USE_EMBEDDED_PG)
FROM nginx:alpine

ARG BUILD_TIME
ARG IMAGE_TAG=unknown
ARG BACKEND_BRANCH=demo
ARG FRONTEND_BRANCH=demo

LABEL org.opencontainers.image.created="${BUILD_TIME}"
LABEL org.opencontainers.image.title="fabriq"
LABEL fabriq.backend.branch="${BACKEND_BRANCH}"
LABEL fabriq.frontend.branch="${FRONTEND_BRANCH}"
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
