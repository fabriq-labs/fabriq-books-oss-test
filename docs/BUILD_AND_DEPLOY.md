# Fabriq – Build and Deploy Strategy

One **Dockerfile** that clones backend + frontend from GitHub, builds everything, and produces a single image. Works identically on **Cloud Build**, **Railway**, and **local `docker build`**. The only difference is how `GH_TOKEN` is passed.

---

## 1. Repo and build strategy

### Three repos (not submodules)

| Repo | Purpose |
|------|---------|
| **Root** (`fabriq-ws-setup`) | Deployment: Dockerfile, nginx, start scripts, Cloud Build config, docs |
| **Backend** (`fabriq-base`) | Node/Express API, Prisma, workflows, agent |
| **Frontend** (`zeiv-v2`) | React/Vite app |

The Dockerfile clones backend and frontend from GitHub during the build (Stage 0). No need to have them in the build context.

### Unified build

| Platform | How `GH_TOKEN` is passed |
|----------|--------------------------|
| **Cloud Build** | `--substitutions="_GH_TOKEN=${GH_TOKEN}"` → passed as `--build-arg` |
| **Railway** | Set `GH_TOKEN` as a build-time variable in the service settings |
| **Local** | `docker build --build-arg GH_TOKEN=xxx .` or `GH_TOKEN=xxx docker compose build` |

### Image types (single Dockerfile)

One image; runtime mode chosen by **USE_EMBEDDED_PG**:

| Mode | USE_EMBEDDED_PG | Contains at runtime | Use |
|------|-----------------|---------------------|-----|
| **Embedded PG** | `true` or `1` | Postgres + backend + nginx (data in volume) | Local/VM: `docker compose up`. Demos. |
| **External PG** | unset or `false` | Backend + nginx only; uses `DATABASE_URL` | Cloud Run, Railway, production. |

---

## 2. Root repo layout (what to commit)

```
.
├── Dockerfile                      # Clones repos + builds image; mode via USE_EMBEDDED_PG at runtime
├── docker-compose.yml              # Embedded PG (USE_EMBEDDED_PG=true)
├── docker-compose.external-pg.yml  # External PG (DATABASE_URL in .env)
├── nginx.conf                      # Nginx template (envsubst NGINX_PORT)
├── start.sh                        # Entrypoint: runs start-with-pg or start-external by env
├── start-with-pg.sh                # Embedded: postgres + backend + nginx
├── start-external.sh               # External: backend + nginx only
├── .dockerignore
├── .gcloudignore
├── cloudbuild.yaml                 # Cloud Build config (just docker build + push)
├── docs/
│   ├── BUILD_AND_DEPLOY.md         # This file
│   └── VM_REMOTE_DEV.md
├── backend/                        # NOT committed – cloned from GitHub inside Dockerfile
└── frontend-1/                     # NOT committed – cloned from GitHub inside Dockerfile
```

---

## 3. Build the image

All three platforms use the same Dockerfile. You need a **GitHub token** (`GH_TOKEN`) with repo access to clone the private repos during build.

### 3.1 Local (docker build)

```bash
cd ~/repos/fabriq   # or your root path
export GH_TOKEN="your_github_token"

docker build --build-arg GH_TOKEN=${GH_TOKEN} -t fabriq:latest .
```

Override branches if needed:

```bash
docker build \
  --build-arg GH_TOKEN=${GH_TOKEN} \
  --build-arg BACKEND_BRANCH=feature-xyz \
  --build-arg FRONTEND_BRANCH=demo \
  -t fabriq:latest .
```

### 3.2 Local (docker compose)

```bash
export GH_TOKEN="your_github_token"

# Embedded PG (dev)
docker compose build && docker compose up -d

# External PG (production-like)
docker compose -f docker-compose.external-pg.yml build
docker compose -f docker-compose.external-pg.yml up -d
```

Docker Compose reads `GH_TOKEN` from the environment and passes it as a build arg.

### 3.3 Cloud Build

```bash
export GH_TOKEN="your_github_token"

gcloud builds submit --config=cloudbuild.yaml \
  --substitutions="_GH_TOKEN=${GH_TOKEN}" .
```

Override branches and image tag:

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions="_GH_TOKEN=${GH_TOKEN},_BACKEND_BRANCH=feature-xyz,_FRONTEND_BRANCH=demo,_IMAGE_TAG=$(date +%Y%m%d-%H%M%S)" .
```

Image: **`{REGION}-docker.pkg.dev/<PROJECT_ID>/fabriq/fabriq:{tag}`** (Artifact Registry; see `cloudbuild.yaml` substitutions `_REGION`, `_AR_REPO`, `_IMAGE_TAG`).

**GCP setup (IAM, Artifact Registry, Cloud Run, impersonation, ADC):** [GCP_CLOUD_BUILD_AND_RUN.md](./GCP_CLOUD_BUILD_AND_RUN.md).

### 3.4 Railway

**Build on Railway from Git** (same Dockerfile as Cloud Build):

1. Connect the root repo in Railway.
2. In the service's **Settings → Build**, add build-time variables:
   - `GH_TOKEN` = your GitHub token
   - `BACKEND_BRANCH` = `demo` (or whichever branch)
   - `FRONTEND_BRANCH` = `demo`
3. Railway will run `docker build --build-arg GH_TOKEN=... --build-arg BACKEND_BRANCH=... ...` automatically.

**Run a pre-built image from Google Artifact Registry + Vertex (Gemini):**  
[RAILWAY_ARTIFACT_REGISTRY_VERTEX.md](./RAILWAY_ARTIFACT_REGISTRY_VERTEX.md)

---

## 4. Run locally (embedded PostgreSQL)

```bash
export GH_TOKEN="your_github_token"

docker compose build
docker compose up -d
```

- `USE_EMBEDDED_PG=true` is set by compose, so the container runs in-container Postgres.
- App: **http://localhost:8080**. From your Mac: use the VM's external IP or Cursor port forwarding.
- Login: `admin@example.com` / `admin123`.
- Stop: `docker compose down`. Data persists in volume `fabriq_pgdata`.

### Rebuild after changes

```bash
docker compose build --no-cache
docker compose up -d
```

---

## 5. Run locally (external PostgreSQL)

For when you have a Postgres instance elsewhere (Cloud SQL, RDS, Railway Postgres, etc.).

### 5.1 Setup

Create `.env` in the repo root:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"
JWT_SECRET="your-secret"
```

Prepare the database once (empty DB only):

```bash
cd backend
DATABASE_URL="postgresql://..." npx prisma db push
DATABASE_URL="postgresql://..." node setup-db.js --demo-data=indian-demo --skip-tests
```

### 5.2 Build and run

```bash
export GH_TOKEN="your_github_token"

docker compose -f docker-compose.external-pg.yml build
docker compose -f docker-compose.external-pg.yml up -d
```

App: **http://localhost:8080**.

---

## 6. Deploy to Cloud Run

### 6.1 Build (see §3.3)

```bash
gcloud builds submit --config=cloudbuild.yaml --substitutions="_GH_TOKEN=${GH_TOKEN}" .
```

### 6.2 Deploy

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-southeast1"

gcloud run deploy fabriq \
  --image gcr.io/${PROJECT_ID}/fabriq:latest \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=postgresql://...,JWT_SECRET=...,NODE_ENV=production"
```

Or use `--env-vars-file .env` (one `KEY=VALUE` per line, no comments or quotes).

---

## 7. Deploy to Railway

1. **Add Postgres**: Add a Postgres plugin in the Railway dashboard. It provides `DATABASE_URL` automatically.
2. **Connect repo**: Connect the root repo. Set `Dockerfile` as the builder.
3. **Build-time variables**: `GH_TOKEN`, `BACKEND_BRANCH`, `FRONTEND_BRANCH`.
4. **Runtime variables**: `DATABASE_URL` (from Postgres plugin), `JWT_SECRET`, `NODE_ENV=production`, plus any optional ones from §8.
5. **Health check**: Set path to `/health`.
6. **Database setup**: Run Prisma push + seed once against the Railway Postgres URL (see §5.1).

The container uses `PORT` from Railway (`start-external.sh` reads `PORT` env var for nginx).

---

## 8. Environment variables

### Frontend (build-time only)

Set in Dockerfile: `VITE_API_BASE_URL=""`, `VITE_ENABLE_AI="true"`. No runtime env needed.

### Backend (runtime)

Set in Cloud Run / Railway / docker run / docker-compose:

| Variable | Required | Example / default |
|----------|----------|--------------------|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/fabriq_db` |
| `JWT_SECRET` | Yes | Any long secret string |
| `NODE_ENV` | No | `production` or `development` |
| `AUTH_PROVIDER` | No | `local` (default) |
| `GOOGLE_CLOUD_PROJECT_ID` | For AI | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64` | For AI | Base64 service-account JSON |
| `LLM_MODEL` | For AI | e.g. `gemini-2.0-flash-001` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | For AI | Gemini API key |
| `STORAGE_TYPE`, `BUCKET_NAME`, `STORAGE_FOLDER_PATH` | For GCS | GCS config |
| `ERP_CONFIG_ENCRYPTION_KEY` | For ERP | Encryption key |
| `SMTP2GO_*` | For email | SMTP2GO credentials |
| Others | Optional | See `.env` for full list |

### Build-time args

| Arg | Default | Purpose |
|-----|---------|---------|
| `GH_TOKEN` | (required) | GitHub token to clone private repos |
| `BACKEND_BRANCH` | `demo` | Backend repo branch |
| `FRONTEND_BRANCH` | `demo` | Frontend repo branch |

---

## 9. Quick reference

```bash
# Persist GH_TOKEN (optional)
echo 'export GH_TOKEN="your_github_token"' >> ~/.fabriq-env
chmod 600 ~/.fabriq-env
source ~/.fabriq-env

# Local dev (embedded PG)
docker compose build && docker compose up -d

# Local prod (external PG)
docker compose -f docker-compose.external-pg.yml build
docker compose -f docker-compose.external-pg.yml up -d

# Cloud Build
gcloud builds submit --config=cloudbuild.yaml --substitutions="_GH_TOKEN=${GH_TOKEN}" .

# Deploy to Cloud Run
gcloud run deploy fabriq-demo \
  --image gcr.io/kickoff19-237210/fabriq:latest \
  --platform managed --region asia-southeast1 \
  --allow-unauthenticated --env-vars-file .env
```
