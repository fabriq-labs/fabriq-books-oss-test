# Fabriq — Build and deploy (monorepo + GHCR)

One **Dockerfile** at the repo root builds **backend/** and **frontend-1/** from the same Git tree (no clone token). CI pushes images to **GitHub Container Registry (GHCR)** via [`.github/workflows/docker-ghcr.yml`](../.github/workflows/docker-ghcr.yml).

---

## 1. Repo layout

| Path | Role |
|------|------|
| **Root** | Dockerfile, nginx, start scripts, compose samples, docs |
| **backend/** | Node/Express API, Prisma, workflows, agent |
| **frontend-1/** | React/Vite app |

```
.
├── Dockerfile
├── docker-compose.yml              # Sample: embedded Postgres
├── docker-compose.external-pg.yml  # Sample: external DATABASE_URL
├── nginx.conf
├── start.sh
├── start-with-pg.sh
├── start-external.sh
├── .dockerignore
├── docker-build-info.js
├── .github/workflows/docker-ghcr.yml
├── backend/
├── frontend-1/
└── docs/
```

---

## 2. Image behaviour

Runtime mode is chosen by **USE_EMBEDDED_PG**:

| Mode | USE_EMBEDDED_PG | At runtime |
|------|-----------------|------------|
| **Embedded PG** | `true` or `1` | Postgres + backend + nginx (data in volume) |
| **External PG** | unset / `false` | Backend + nginx; set **DATABASE_URL** |

### Build metadata

The image includes **`/app/build-info.json`** (and **`/usr/share/nginx/html/build-info.json`**) with monorepo **commit**, **ref**, message, dates, Docker build time, and image tag. OCI labels include `fabriq.source.ref`, `fabriq.image.tag`, etc.

---

## 3. Local: `docker build`

From the repo root (with `backend/` and `frontend-1/` present):

```bash
docker build -t fabriq:latest .
```

Optional metadata (otherwise defaults to `unknown` / empty in `build-info.json`):

```bash
docker build \
  --build-arg SOURCE_REF=$(git branch --show-current) \
  --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) \
  --build-arg SOURCE_COMMIT_DATE=$(git log -1 --format=%cI) \
  --build-arg SOURCE_COMMIT_MESSAGE_B64=$(git log -1 --format=%B | base64 -w0 2>/dev/null || git log -1 --format=%B | base64) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --build-arg IMAGE_TAG=local \
  -t fabriq:latest .
```

On macOS, if `base64` has no `-w0`, use `base64 | tr -d '\n'`.

---

## 4. Local: Docker Compose (samples)

**Embedded Postgres**

```bash
docker compose build && docker compose up -d
```

**External Postgres** — put `DATABASE_URL` and `JWT_SECRET` in `.env`, then:

```bash
docker compose -f docker-compose.external-pg.yml build
docker compose -f docker-compose.external-pg.yml up -d
```

App: **http://localhost:8080** (default). Default login: `admin@example.com` / `admin123`.

---

## 5. GitHub Actions → GHCR

Workflow: **Docker build and push (GHCR)**.

**Triggers:** push to **`main`**, tags **`v*`**, or **workflow_dispatch** (optional “no cache”).

**Registry login:** `GITHUB_TOKEN` (packages write). **No** separate PAT is required for the Docker build context.

**Image:** `ghcr.io/<owner-lowercase>/<repo-lowercase>:<tag>` (human-readable tag includes branch/ref + timestamp). Find packages under the repository on GitHub.

**Tags pushed per build:**
- `<branch>-<UTC timestamp>` — unique, immutable tag for this build (e.g. `demo-20260615-180530`); used for rollback/traceability
- `<branch>-latest` — stable tag that always points at the most recent build for that branch (e.g. `demo-latest`); use this for Railway's "Automatically update to latest tag" or any other tag-polling deploy

This workflow does **not** deploy to any cloud by itself. Pull the image from GHCR on your host (Railway, Fly, raw VM, Cloud Run with GHCR auth, etc.) and set runtime env vars there.

### Build + deploy to Railway

Workflow: **Build and deploy (Railway)** (`.github/workflows/deploy-railway.yml`).
Calls `docker-ghcr.yml` as a reusable workflow (`workflow_call`) for the build
step — no duplicated build logic — then points a Railway service at the
freshly built `<branch>-<timestamp>` image tag via Railway's GraphQL API and
triggers a redeploy.

Requires these repo secrets: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`,
`RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT_ID`. The Railway service must be
configured as **"Deploy from Docker Image"** pointing at
`ghcr.io/<owner-lowercase>/<repo-lowercase>`.

If you'd rather rely on Railway's built-in **"Automatically update to latest
tag"** toggle instead of this workflow's explicit deploy step, point that
toggle at the `<branch>-latest` tag described above.

---

## 6. Railway / other hosts (build from Git)

Connect the **monorepo** and use the root **Dockerfile**. Do **not** set `GH_TOKEN` for cloning. Optional build-time args: same as §3 if the platform supports passing build-args.

---

## 7. Database setup (external Postgres)

Once per environment (empty database):

```bash
cd backend
DATABASE_URL="postgresql://..." npx prisma db push
DATABASE_URL="postgresql://..." node setup-db.js --demo-data=indian-demo --skip-tests
```

---

## 8. Environment variables (runtime)

### Frontend

Baked at **image build** time: `VITE_API_BASE_URL=""`, `VITE_ENABLE_AI="true"` (see Dockerfile).

### Backend

Typical variables (Cloud / compose / `docker run`):

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes (external PG mode) | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Long random secret |
| `NODE_ENV` | No | `production` / `development` |
| `AUTH_PROVIDER` | No | Default `local` |
| `PORT` | No | Nginx listens here (e.g. Railway sets `PORT`) |

See backend `.env` / deployment guides for AI (`GOOGLE_*`, `LLM_MODEL`), GCS, SMTP, ERP encryption, etc.

### Docker build-args (optional)

| Arg | Default | Purpose |
|-----|---------|---------|
| `SOURCE_REF` | `unknown` | Branch or tag name (labels + build-info) |
| `SOURCE_COMMIT` | `unknown` | Git SHA |
| `SOURCE_COMMIT_MESSAGE` | empty | Plain commit message (or use B64 below) |
| `SOURCE_COMMIT_MESSAGE_B64` | empty | Base64 UTF-8 message (CI uses this) |
| `SOURCE_COMMIT_DATE` | empty | ISO commit timestamp |
| `BUILD_TIME` | build clock | OCI `created` |
| `IMAGE_TAG` | `unknown` | Human-readable tag in build-info |
| `CACHEBUST` | `1` | Change to invalidate cached layers |

---

## 9. Quick reference

```bash
# Local image
docker build -t fabriq:latest .

# Embedded PG
docker compose up -d

# Inspect build metadata in a running container
docker compose exec app cat /app/build-info.json
```
