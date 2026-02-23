# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY frontend-1/package*.json ./
RUN npm ci

COPY frontend-1/ ./

# Empty VITE_API_BASE_URL so frontend uses relative /api/ paths (proxied by nginx)
ENV VITE_API_BASE_URL=""
ENV VITE_ENABLE_AI="true"
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# Install all dependencies (need devDependencies for tsc build)
RUN npm ci

COPY backend/ ./

# Compile TypeScript and copy config
RUN npx tsc && cp -r src/config dist/config 2>/dev/null || true

# Generate Prisma client
RUN npx prisma generate

# Prune devDependencies after build
RUN npm prune --production

# Stage 3: Final image with nginx
FROM nginx:alpine

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
    bash

WORKDIR /app

# Copy compiled backend
COPY --from=backend-builder /app /app/backend

# Prisma engine for Alpine (OpenSSL 3)
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/backend/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

# Copy frontend build to nginx html directory
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy nginx config template and start script
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY start.sh /start.sh
RUN chmod +x /start.sh

RUN mkdir -p /app/backend/logs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${NGINX_PORT:-8080}/health || exit 1

CMD ["/start.sh"]
