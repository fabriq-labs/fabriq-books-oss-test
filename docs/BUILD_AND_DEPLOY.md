# Fabriq – Build and Deploy Strategy

**Use this doc on the cloud VM:** clone only the **root repo** there; backend and frontend are cloned from GitHub. Run the dev build with Docker Compose, verify, then use Cloud Build for production images.

---

## 1. Repo and build strategy

### Three repos (not submodules)

| Repo | Purpose | Where it lives |
|------|--------|----------------|
| **Root** (e.g. `fabriq-ws-setup`) | Deployment only: Dockerfile(s), nginx, start scripts, Cloud Build config, this doc | Checked out on your machine and on the **cloud VM** |
| **Backend** (`fabriq-base`) | Node/Express API, Prisma, workflows, agent | Cloned from GitHub (branch `demo`) into `backend/` |
| **Frontend** (`zeiv-v2`) | React/Vite app | Cloned from GitHub (branch `demo`) into `frontend-1/` |

On the **cloud VM** you only check in/out the **root repo**. You do **not** commit `backend/` or `frontend-1/` there; they are cloned once (or updated with `git pull`) and used as build context.

### Two build paths

| Path | When | How |
|------|------|-----|
| **Local Docker (VM)** | Dev/test on the VM | `docker compose up` (dev) or `docker build` + `docker run`. Uses `backend/` and `frontend-1/` cloned on the VM. |
| **Cloud Build** | CI/production image | `gcloud builds submit` from VM (or Mac). Only root-repo files are uploaded; Cloud Build clones backend and frontend from GitHub. |

### Image types (single Dockerfile)

One **Dockerfile** builds one image (frontend + backend + nginx + PostgreSQL installed). Runtime mode is chosen by **USE_EMBEDDED_PG**:

| Mode | USE_EMBEDDED_PG | Contains at runtime | Use |
|------|-----------------|---------------------|-----|
| **Embedded PG** | `true` or `1` | Postgres + backend + nginx (data in volume) | Local/VM: `docker compose up`. Demos. |
| **External PG** | unset or `false` | Backend + nginx only; uses `DATABASE_URL` | Cloud Run, Railway, or `docker compose -f docker-compose.external-pg.yml up`. |

---

## 2. Root repo layout (what to commit)

All of this lives in the **root repo** and is used on the VM and in Cloud Build:

```
.
├── Dockerfile              # Single image; mode via USE_EMBEDDED_PG at runtime
├── docker-compose.yml      # Embedded PG (USE_EMBEDDED_PG=true)
├── docker-compose.external-pg.yml  # External PG (DATABASE_URL in .env)
├── nginx.conf              # Nginx template (envsubst NGINX_PORT)
├── start.sh                # Entrypoint: runs start-with-pg or start-external by env
├── start-with-pg.sh        # Embedded: postgres + backend + nginx
├── start-external.sh       # External: backend + nginx only
├── .dockerignore
├── .gcloudignore           # So only these files are uploaded to Cloud Build
├── cloudbuild.yaml         # Cloud Build: production image
├── cloudbuild-dev.yaml     # Cloud Build: dev image
├── docs/
│   ├── BUILD_AND_DEPLOY.md # This file
│   └── VM_REMOTE_DEV.md    # VM creation and Cursor Remote SSH
├── backend/                # NOT in root repo – clone from GitHub
└── frontend-1/             # NOT in root repo – clone from GitHub
```

---

## 3. One-time setup on the cloud VM

Assumes you are **on the VM** (SSH or Cursor Remote SSH). Root repo is at **~/repos/fabriq** (user only clones the root repo; the agent clones backend/frontend if missing).

### 3.1 Clone backend and frontend (once)

```bash
cd ~/repos/fabriq

# Use a GitHub token with repo access (classic token or fine-grained)
export GH_TOKEN="your_github_token"

git clone --branch demo --depth 1 "https://${GH_TOKEN}@github.com/fabriq-labs/fabriq-base.git" backend
git clone --branch demo --depth 1 "https://${GH_TOKEN}@github.com/fabriq-labs/zeiv-v2.git" frontend-1
```

To refresh later: `cd backend && git pull && cd ../frontend-1 && git pull && cd ..`

### 3.2 Optional: persist GH_TOKEN for later

```bash
# Store in a file only you can read (do not commit this)
echo 'export GH_TOKEN="your_github_token"' >> ~/.fabriq-env
chmod 600 ~/.fabriq-env
# When needed: source ~/.fabriq-env
```

---

## 4. Run the dev build locally (no Cloud Build)

From the **root repo** on the VM, with `backend/` and `frontend-1/` present:

### 4.1 Build and run with Docker Compose (embedded PostgreSQL)

```bash
cd ~/repos/fabriq

docker compose build
docker compose up -d
```

- Compose sets `USE_EMBEDDED_PG=true`, so the container runs in-container Postgres (same image as external-PG mode).
- First run: builds the image (can take several minutes), inits PostgreSQL and runs demo data seed.
- App: **http://localhost:8080** (on the VM). From your Mac use the VM’s external IP, e.g. **http://34.87.77.156:8080**, or Cursor port forwarding.

### 4.2 Check that it works

```bash
# Container and health
docker compose ps
curl -s http://localhost:8080/health

# Logs (first run will show Postgres init and backend startup)
docker compose logs -f app
```

- Login: `admin@example.com` / `admin123` (change in production).
- Stop: `docker compose down`. Data persists in volume `fabriq_pgdata`.

### 4.3 Rebuild after backend/frontend changes

```bash
cd ~/repos/fabriq
# After git pull in backend/ or frontend-1/
docker compose build --no-cache
docker compose up -d
```

---

## 5. Run production image locally (external PostgreSQL)

Use this when you have a Postgres instance elsewhere (Cloud SQL, RDS, or a Postgres container/server). The app image has no database; it needs `DATABASE_URL` and `JWT_SECRET`.

### 5.1 One-time setup

1. **Backend and frontend** must be present (clone with `./clone-deps.sh` if needed).

2. **Create or edit `.env`** in the repo root with at least:
   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"
   JWT_SECRET="your-secret"
   ```
   Replace `USER`, `PASSWORD`, `HOST`, and `DBNAME` with your external Postgres details. If the DB is on the host machine from a container’s perspective, use `host.docker.internal` (Docker Desktop) or the host IP.

3. **Prepare the database once** (empty DB only). Either:
   - Run schema + seed from your host (Node and Prisma installed):
     ```bash
     cd backend
     DATABASE_URL="postgresql://..." npx prisma db push
     DATABASE_URL="postgresql://..." node setup-db.js --demo-data=indian-demo --skip-tests
     ```
   - Or use a one-off container that mounts backend and runs the same commands against `DATABASE_URL`.

### 5.2 Build and run

**Option A – Docker Compose (recommended)**

```bash
cd ~/repos/fabriq   # or your root path

docker compose -f docker-compose.external-pg.yml build
docker compose -f docker-compose.external-pg.yml up -d
```

App is at **http://localhost:8080**. Logs: `docker compose -f docker-compose.external-pg.yml logs -f app`.

**Option B – Plain Docker**

```bash
cd ~/repos/fabriq

docker build -t fabriq:latest -f Dockerfile .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/fabriq_db" \
  -e JWT_SECRET="your-secret" \
  --env-file .env \
  fabriq:latest
```

(Omit `--env-file .env` if you pass all variables via `-e`.)

---

## 6. Cloud Build and deploy to Cloud Run

Only the **root-repo** files are uploaded (see `.gcloudignore`). Cloud Build clones `backend` and `frontend-1` from GitHub. One image; use external PG on Cloud Run (set `DATABASE_URL` at deploy).

### 6.1 Build the image

From the repo root, with `GH_TOKEN` set (GitHub token with repo access):

```bash
cd ~/repos/fabriq   # or your root path

export GH_TOKEN="your_github_token"

gcloud builds submit --config=cloudbuild.yaml --substitutions="_GH_TOKEN=${GH_TOKEN}" .
```

- Image: `gcr.io/<PROJECT_ID>/fabriq:latest` (and `:$SHORT_SHA`).

### 6.2 Deploy to Cloud Run (using your .env)

After the build succeeds, deploy and pass env vars from your `.env`:

```bash
# Optional: set project and region
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"

gcloud run deploy fabriq \
  --image gcr.io/${PROJECT_ID}/fabriq:latest \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --env-vars-file .env
```

- If `.env` has comments or quoted values, Cloud Run may still accept it; if you get errors, use a cleaned file (one `KEY=VALUE` per line, no `#` or quotes) or pass only the required vars:

  ```bash
  gcloud run deploy fabriq \
    --image gcr.io/${PROJECT_ID}/fabriq:latest \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --set-env-vars "DATABASE_URL=postgresql://...,JWT_SECRET=...,NODE_ENV=production"
  ```

- The container runs in external-PG mode (no `USE_EMBEDDED_PG`), so `DATABASE_URL` and `JWT_SECRET` must be set.

### 6.3 Dev image (optional; same Dockerfile, tag for embedded-PG use)

```bash
gcloud builds submit --config=cloudbuild-dev.yaml --substitutions="_GH_TOKEN=${GH_TOKEN}" .
```

- Image: `gcr.io/<PROJECT_ID>/fabriq-books-dev:latest`. Set `USE_EMBEDDED_PG=true` when running if you use it with a volume for Postgres.

---

## 7. Environment variables

### Frontend (build-time only)

- Set in Dockerfile: `VITE_API_BASE_URL=""`, `VITE_ENABLE_AI="true"` (for dev). No runtime env needed in the container.

### Backend (runtime)

Set in Cloud Run / Railway / or `docker run` / `docker-compose`:

| Variable | Required | Example / default |
|----------|----------|--------------------|
| `DATABASE_URL` | Yes (prod) | `postgresql://user:pass@host:5432/fabriq_db` |
| `JWT_SECRET` | Yes | Any long secret string |
| `NODE_ENV` | No | `production` or `development` |
| `BACKEND_PORT` | No | Set by start scripts to `4000` |
| `GOOGLE_CLOUD_PROJECT_ID` | For AI | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64` | For AI | Base64 service-account JSON |
| Others | Optional | See project docs (LLM, Langfuse, Slack, etc.) |

---

## 8. Quick reference (on the VM)

```bash
# One-time: clone backend + frontend
cd ~/repos/fabriq && source ~/.fabriq-env  # if you saved GH_TOKEN
git clone --branch demo --depth 1 "https://${GH_TOKEN}@github.com/fabriq-labs/fabriq-base.git" backend
git clone --branch demo --depth 1 "https://${GH_TOKEN}@github.com/fabriq-labs/zeiv-v2.git" frontend-1

# Dev: build and run (local, no Cloud Build)
docker compose build && docker compose up -d
curl -s http://localhost:8080/health

# Prod image build (local)
docker build -t fabriq:latest .

# Cloud Build (prod)
gcloud builds submit --config=cloudbuild.yaml --substitutions="_GH_TOKEN=${GH_TOKEN}" .

# Cloud Build (dev image)
gcloud builds submit --config=cloudbuild-dev.yaml --substitutions="_GH_TOKEN=${GH_TOKEN}" .
```

---

## 9. Reference for AI when you’re on the VM

When you’re working on the **cloud VM** and reference this doc:

- **Only the root repo** is checked in/out on the VM; `backend/` and `frontend-1/` are cloned from GitHub (branch `demo`) and are not part of the root repo.
- **Local dev:** use `docker compose` from the root (see Section 4). Build and deploy strategy is in this doc; deployment files (Dockerfile, nginx, start scripts, cloudbuild) are in the root repo.
