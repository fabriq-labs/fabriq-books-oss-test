# GCP: Cloud Build, Artifact Registry, Cloud Run & Cloud SQL

This guide covers **one-time Google Cloud setup** and **day-to-day commands** for the Fabriq **root** deployment repo: build with `cloudbuild.yaml`, push to **Artifact Registry**, deploy to **Cloud Run**, connect **Cloud SQL (PostgreSQL)**, and use **service accounts** + **ADC** on developer machines.

**Alternative CI:** you can build the **same Dockerfile** with **GitHub Actions** and push to **GitHub Container Registry (GHCR)** — see [BUILD_AND_DEPLOY.md §3.4](./BUILD_AND_DEPLOY.md#34-github-actions--github-container-registry-ghcr) and [`.github/workflows/docker-ghcr.yml`](../.github/workflows/docker-ghcr.yml). GCP setup in *this* doc still applies if you deploy that image to Cloud Run (you will wire `gcloud run deploy --image` to `ghcr.io/...` and ensure the runtime can pull from GHCR, or mirror to Artifact Registry).

For the overall Docker/build story (Dockerfile clones `fabriq-base` + `zeiv-v2`), see [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md).

**Sections:** [APIs](#one-time-enable-apis) · [Artifact Registry](#one-time-artifact-registry-docker) · [IAM](#service-accounts-and-iam) · [Cloud Build YAML](#cloudbuildyaml-reference-root-repo) · [GitHub Actions + GHCR](#github-actions--github-container-registry-alternative) · [Cloud Run deploy](#cloud-run-first-deploy-and-environment-variables) · [Cloud SQL + Run](#cloud-sql-postgresql--configuration) · [ADC](#application-default-credentials-adc) · [Cheat sheet](#copy-paste-full-developer-cheat-sheet)

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **GCP project** | e.g. `fbooks-490716` |
| **Billing** | Enabled on the project |
| **gcloud CLI** | Installed and logged in (`gcloud auth login`) |
| **GitHub token** | `GH_TOKEN` with access to clone private repos used in the Dockerfile (`fabriq-base`, `zeiv-v2`). Prefer **fine-grained PAT** or classic **repo** scope. **Never commit tokens**; prefer Secret Manager for CI later. |

---

## One-time: enable APIs

```bash
export PROJECT_ID="YOUR_PROJECT_ID"

gcloud config set project "${PROJECT_ID}"

gcloud services enable \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  iamcredentials.googleapis.com \
  sqladmin.googleapis.com
```

`sqladmin.googleapis.com` is required for **Cloud SQL Admin** (create instances, users, authorized networks).

---

## One-time: Artifact Registry (Docker)

Pick a **region** for the registry (e.g. `us-central1`). This can differ from the Cloud Run region; see [Cross-region image](#cross-region-image) below.

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export AR_REGION="us-central1"    # must match cloudbuild.yaml _REGION for image URL
export AR_REPO="fabriq"           # must match cloudbuild.yaml _AR_REPO

gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker \
  --location="${AR_REGION}" \
  --description="Fabriq application images"
```

Image URL shape:

`{AR_REGION}-docker.pkg.dev/{PROJECT_ID}/{AR_REPO}/fabriq:{tag}`

---

## Service accounts and IAM

### Two different identities

| Identity | When it runs | Typical roles |
|----------|----------------|---------------|
| **Cloud Build service account** | During `gcloud builds submit` steps (docker build, push, optional `gcloud run deploy` in YAML) | Push images, deploy Run, act as runtime SA when deploying |
| **Cloud Run runtime service account** | When your **container** calls Google APIs (GCS, Vertex, etc.) | `roles/storage.objectAdmin` (or narrower), Vertex AI user, etc. |

Default Cloud Build SA:

`{PROJECT_NUMBER}@cloudbuild.gserviceaccount.com`

Get project number:

```bash
gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)'
```

### Cloud Build SA — required for this repo’s `cloudbuild.yaml`

Grant on **project** `YOUR_PROJECT_ID` (adjust if you use resource-level IAM):

- **Artifact Registry**: `roles/artifactregistry.writer` — push images  
- **Cloud Run** (if the YAML includes deploy step): `roles/run.admin`  
- **Impersonation** (deploy must attach runtime SA): `roles/iam.serviceAccountUser` on the **runtime** service account (or project-wide if your org allows)

Example bindings:

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
export CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser"
```

If deploy fails with permission to use the **runtime** SA, grant `CB_SA` **Service Account User** on that runtime SA:

```bash
export RUNTIME_SA="fabriq-runtime-sa@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="${PROJECT_ID}"
```

### Cloud Run runtime service account

Create a dedicated SA for the app (recommended):

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export RUNTIME_SA_NAME="fabriq-runtime-sa"

gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
  --project="${PROJECT_ID}" \
  --display-name="Fabriq Cloud Run runtime"
```

Grant only what the app needs, e.g.:

- GCS: `roles/storage.objectAdmin` on the bucket(s), or `roles/storage.objectUser`  
- Vertex AI: `roles/aiplatform.user` (plus any model access your org requires)  
- Cloud SQL (if used): client + connect roles as per Cloud SQL docs  

**Important:** On Cloud Run you do **not** need `GOOGLE_APPLICATION_CREDENTIALS` if the runtime SA has the right roles — the platform provides credentials via the **metadata server** ([ADC in Cloud Run](#application-default-credentials-adc)).

### Impersonation (developers or automation)

If humans or CI use a **user-managed service account** instead of their user for `gcloud` / API calls:

1. Create or choose a SA (e.g. `deployer@...`).
2. Grant that SA the roles it needs (`cloudbuild.builds.editor`, `run.admin`, `artifactregistry.reader`, etc.).
3. Grant **your user** (or CI) permission to impersonate it:

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export DEPLOYER_SA="deployer@${PROJECT_ID}.iam.gserviceaccount.com"
export YOUR_USER_EMAIL="you@example.com"

gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_SA}" \
  --member="user:${YOUR_USER_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="${PROJECT_ID}"
```

Then:

```bash
gcloud config set auth/impersonate_service_account "${DEPLOYER_SA}"
```

To stop impersonating:

```bash
gcloud config unset auth/impersonate_service_account
```

---

## `cloudbuild.yaml` reference (root repo)

File: **`cloudbuild.yaml`** (repository root).

| Substitution | Purpose | Example |
|--------------|---------|---------|
| `_GH_TOKEN` | GitHub PAT for Dockerfile `git clone` | (pass at submit time; empty default in file) |
| `_BACKEND_BRANCH` | Branch name for **fabriq-base** (`git clone --branch`) | `demo` or `feature/foo` — **not** `origin/feature/foo` |
| `_FRONTEND_BRANCH` | Branch name for **zeiv-v2** | `demo` |
| `_SERVICE_NAME` | Cloud Run service name | `fabriq-us-demo` |
| `_REGION` | Artifact Registry **and** Cloud Run deploy region in this config | `us-central1` |
| `_AR_REPO` | Artifact Registry repository id | `fabriq` |
| `_IMAGE_TAG` | Second image tag + deploy tag | `latest` or `20250319-143022` |

Steps (high level):

1. `docker build` with `GH_TOKEN`, branch args; tag `.../fabriq:latest` and `.../fabriq:${_IMAGE_TAG}`  
2. `docker push` both tags  
3. `gcloud run deploy` with `--image=...:${_IMAGE_TAG}`  

**Env vars for the app** (`DATABASE_URL`, `JWT_SECRET`, etc.) are **not** set in this YAML by default — set them on Cloud Run (console, `--env-vars-file`, or Secret Manager).

---

## GitHub Actions + GitHub Container Registry (alternative)

Use this when you prefer **GitHub-hosted CI** instead of Cloud Build for the **build + registry push** step.

| Item | Location / notes |
|------|------------------|
| Workflow | [`.github/workflows/docker-ghcr.yml`](../.github/workflows/docker-ghcr.yml) |
| Registry | **GHCR** — `ghcr.io/<owner>/<repo>` (lowercase) |
| Clone token | Repository Actions secret **`GH_TOKEN`** (same role as `_GH_TOKEN` in Cloud Build) |
| Deploy | Not in this workflow; use **`gcloud run deploy --image=...`** (this doc) or another pipeline |

Full walkthrough: [BUILD_AND_DEPLOY.md §3.4](./BUILD_AND_DEPLOY.md#34-github-actions--github-container-registry-ghcr).

---

## Cloud Run: first deploy and environment variables

`gcloud run deploy SERVICE` **creates** the service if it does not exist.

### Using a `.env`-style or YAML file

```bash
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${RUN_REGION}" \
  --platform=managed \
  --image="${IMAGE}" \
  --service-account="${RUNTIME_SA}" \
  --allow-unauthenticated \
  --env-vars-file=PATH_TO_ENV_FILE
```

- Use a **production-trimmed** file: set `NODE_ENV=production`, avoid dev-only flags like `SKIP_PERMISSION_CHECKS=true` unless intentional.
- Prefer **Secret Manager** for database URLs and API keys in production.

### First deploy with Cloud SQL (same region)

Use this when the Cloud SQL instance already exists and you have **`CONN_NAME`** = `PROJECT_ID:REGION:INSTANCE` (see [Cloud Run + Cloud SQL (Unix socket)](#cloud-run--cloud-sql-unix-socket)).

1. Runtime SA has **`roles/cloudsql.client`** (see [IAM: Cloud SQL client on runtime service account](#iam-cloud-sql-client-on-runtime-service-account)).
2. Deploy with **`--add-cloudsql-instances`** and set **`DATABASE_URL`** to the [Unix socket DATABASE_URL format](#database-url-on-cloud-run-for-prisma-and-node).

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export RUN_REGION="us-central1"
export SERVICE_NAME="fabriq-us-demo"
export IMAGE="${RUN_REGION}-docker.pkg.dev/${PROJECT_ID}/fabriq/fabriq:latest"
export RUNTIME_SA="fabriq-runtime-sa@${PROJECT_ID}.iam.gserviceaccount.com"
export CONN_NAME="${PROJECT_ID}:${RUN_REGION}:fabriq-pg-dev"
# DATABASE_URL must use URL-encoded password; example uses a file to avoid shell issues:
# echo 'postgresql://USER:ENCODED_PASS@localhost/DBNAME?host=/cloudsql/'"${CONN_NAME}" > /tmp/run.env
# plus other vars: JWT_SECRET, GOOGLE_CLOUD_PROJECT_ID, ...

gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${RUN_REGION}" \
  --platform=managed \
  --image="${IMAGE}" \
  --service-account="${RUNTIME_SA}" \
  --add-cloudsql-instances="${CONN_NAME}" \
  --allow-unauthenticated \
  --env-vars-file=PATH_TO_ENV_FILE_WITH_DATABASE_URL
```

Updating an **existing** service to add Cloud SQL only:

```bash
gcloud run services update "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${RUN_REGION}" \
  --add-cloudsql-instances="${CONN_NAME}"
```

Then set or update `DATABASE_URL` (console, `--set-env-vars`, or `gcloud run services update` with env flags).

### Cross-region image

You may deploy to Cloud Run in **`asia-southeast1`** while the image stays in **`us-central1-docker.pkg.dev/...`**. That is supported. Grant the **runtime** SA **`roles/artifactregistry.reader`** (project or repo) so Cloud Run can pull the image. Cold-start pull latency may be slightly higher than same-region.

---

## Application Default Credentials (ADC)

### On your development machine

ADC is how client libraries (Node, `gcloud` auth for apps) pick up credentials **without** embedding keys in code.

**Recommended (user credentials for local dev):**

```bash
gcloud auth application-default login
```

This stores user refresh credentials for local tools (Vertex, GCS client libraries, etc.). It is for **development**, not for production servers.

**Optional: ADC as a service account (local)**

```bash
gcloud auth application-default login --impersonate-service-account=SA_EMAIL
```

Or set:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa-key.json"
```

Use key files sparingly; rotate and never commit them.

### On Cloud Run

The **runtime service account** you set with `--service-account` is attached to the revision. Google’s client libraries use **ADC** automatically via the instance metadata — **no JSON key file** in the container unless you explicitly add one (usually unnecessary).

Ensure `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT_ID` match your project if your code reads them.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Docker step **128** in Cloud Build | `git clone` failed: bad `_GH_TOKEN`, wrong `_BACKEND_BRANCH` / `_FRONTEND_BRANCH` (must be remote branch name, not `origin/...`), or branch missing |
| Push denied | Cloud Build SA missing `artifactregistry.writer` |
| Run deploy denied | Cloud Build SA missing `run.admin` or `iam.serviceAccountUser` on runtime SA |
| Run fails pulling image | Runtime SA missing `artifactregistry.reader` on the Artifact Registry repo/project |
| Cloud Run: DB connection refused / timeout | Missing `--add-cloudsql-instances`, wrong `CONN_NAME`, or `DATABASE_URL` not using `/cloudsql/PROJECT:REGION:INSTANCE` host |
| Cloud Run: permission denied for Cloud SQL | Runtime SA missing `roles/cloudsql.client` |
| Local `psql` / Prisma: auth fails | Wrong password; **`$` in password** must be URL-encoded (`%24`) in URIs or use `PGPASSWORD='...'` with `psql` flags |

Build logs:

```bash
gcloud builds log --stream BUILD_ID
```

---

## Copy-paste: full developer cheat sheet

Replace placeholders once at the top, then run sections as needed.

```bash
# =============================================================================
# PLACEHOLDERS — edit these
# =============================================================================
export PROJECT_ID="YOUR_PROJECT_ID"
export AR_REGION="us-central1"              # Artifact Registry + build _REGION
export AR_REPO="fabriq"
export RUN_REGION="us-central1"             # Cloud Run region (can differ, e.g. asia-southeast1)
export SERVICE_NAME="fabriq-demo"
export RUNTIME_SA_NAME="fabriq-runtime-sa"
export RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export GH_TOKEN="YOUR_GITHUB_PAT"           # export GH_TOKEN in shell, do not commit

# =============================================================================
# One-time: project + APIs
# =============================================================================
gcloud config set project "${PROJECT_ID}"

gcloud services enable \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  iamcredentials.googleapis.com \
  sqladmin.googleapis.com

# =============================================================================
# One-time: Artifact Registry repository
# =============================================================================
gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker \
  --location="${AR_REGION}" \
  --description="Fabriq docker images" \
  2>/dev/null || true

# =============================================================================
# One-time: runtime service account + pull image (if Run region != registry, still OK)
# =============================================================================
gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
  --project="${PROJECT_ID}" \
  --display-name="Fabriq Cloud Run runtime" \
  2>/dev/null || true

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/artifactregistry.reader"

# Cloud SQL (if using Postgres on GCP): grant client role + attach instance on deploy
# gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
#   --member="serviceAccount:${RUNTIME_SA}" \
#   --role="roles/cloudsql.client"
# export SQL_INSTANCE="fabriq-pg-dev"
# export CONN_NAME="${PROJECT_ID}:${RUN_REGION}:${SQL_INSTANCE}"
# gcloud run services update "${SERVICE_NAME}" --project="${PROJECT_ID}" --region="${RUN_REGION}" \
#   --add-cloudsql-instances="${CONN_NAME}"

# Add more roles for the app, e.g. GCS / Vertex:
# gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
#   --member="serviceAccount:${RUNTIME_SA}" \
#   --role="roles/storage.objectAdmin"

# =============================================================================
# One-time: Cloud Build SA permissions
# =============================================================================
export PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
export CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser"

gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="${PROJECT_ID}"

# =============================================================================
# Build + push + deploy (from repo root that contains cloudbuild.yaml + Dockerfile)
# =============================================================================
export IMAGE_TAG="$(date +%Y%m%d-%H%M%S)"

gcloud builds submit --config=cloudbuild.yaml \
  --substitutions="_GH_TOKEN=${GH_TOKEN},_IMAGE_TAG=${IMAGE_TAG},_SERVICE_NAME=${SERVICE_NAME},_REGION=${AR_REGION}" \
  .

# If cloudbuild _REGION and Cloud Run RUN_REGION differ: deploy manually with same image:
# export IMAGE="${AR_REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/fabriq:${IMAGE_TAG}"
# gcloud run deploy "${SERVICE_NAME}" \
#   --project="${PROJECT_ID}" \
#   --region="${RUN_REGION}" \
#   --platform=managed \
#   --image="${IMAGE}" \
#   --service-account="${RUNTIME_SA}" \
#   --allow-unauthenticated \
#   --env-vars-file=PATH_TO_YOUR_CLOUD_RUN_ENV_FILE

# =============================================================================
# First-time or update Cloud Run env only (create service if missing)
# =============================================================================
export IMAGE="${AR_REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/fabriq:latest"

gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${RUN_REGION}" \
  --platform=managed \
  --image="${IMAGE}" \
  --service-account="${RUNTIME_SA}" \
  --allow-unauthenticated \
  --env-vars-file=PATH_TO_YOUR_CLOUD_RUN_ENV_FILE

# =============================================================================
# Local machine ADC (Vertex / GCS client libraries on laptop)
# =============================================================================
gcloud auth application-default login
```

---

## Cloud SQL (PostgreSQL) — configuration

Use **Cloud SQL** for the Postgres backing Fabriq in GCP. Align **instance region** with **Cloud Run** (e.g. `us-central1`) to use the **Unix socket** connector below; cross-region is possible but adds latency and complexity.

### Concepts

| Item | Meaning |
|------|--------|
| **Connection name** | `PROJECT_ID:REGION:INSTANCE_NAME` — used in `gcloud` and in `DATABASE_URL` as `/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME` |
| **Public IP + authorized networks** | For **laptop / CI** tools (`psql`, Prisma from your Mac, etc.) over the internet — requires TLS (`sslmode=require`) |
| **Unix socket on Cloud Run** | Cloud Run mounts the socket when you pass **`--add-cloudsql-instances`**; app connects via `host=/cloudsql/...` in `DATABASE_URL` — **no** public IP required for the app |

**Security warning:** **`0.0.0.0/0`** authorized networks exposes the instance to the **entire internet**. Use only for **short dev windows**, **strong passwords**, and prefer **[Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy)** for local access. Narrow to **`YOUR_IP/32`** when possible.

### Enable Cloud SQL Admin API

Already included in [One-time: enable APIs](#one-time-enable-apis) (`sqladmin.googleapis.com`). If skipped:

```bash
gcloud services enable sqladmin.googleapis.com --project="${PROJECT_ID}"
```

### Variables (used in commands below)

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export REGION="us-central1"              # same as Cloud Run region for socket connector
export INSTANCE_NAME="fabriq-pg-dev"
export ROOT_PASSWORD='STRONG_RANDOM_PASSWORD_HERE'   # postgres superuser
export APP_DB="fabriq"
export APP_USER="fabriq_app"
export APP_PASSWORD='STRONG_RANDOM_PASSWORD_HERE'
export CONN_NAME="${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"
```

### Create instance (smallest / dev-friendly profile)

Zonal (non-HA), shared-core `db-f1-micro`, small SSD:

```bash
gcloud config set project "${PROJECT_ID}"

gcloud sql instances create "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region="${REGION}" \
  --availability-type=zonal \
  --edition=ENTERPRISE \
  --storage-type=SSD \
  --storage-size=10 \
  --storage-auto-increase \
  --root-password="${ROOT_PASSWORD}"
```

Use **`POSTGRES_16`** if you prefer and it is available in your project.

### Networking: authorized networks (optional, dev)

**Open to all IPs (dev only):**

```bash
gcloud sql instances patch "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --authorized-networks=0.0.0.0/0
```

**Restrict to your current public IP** (safer for dev):

```bash
MY_IP="$(curl -sSf https://ifconfig.me/ip)"
gcloud sql instances patch "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --authorized-networks="${MY_IP}/32"
```

**Public IP** (for direct laptop access) is assigned by default on create. Fetch it:

```bash
gcloud sql instances describe "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --format='value(ipAddresses[0].ipAddress)'
```

### Databases and users

```bash
gcloud sql databases create "${APP_DB}" \
  --instance="${INSTANCE_NAME}" \
  --project="${PROJECT_ID}"

gcloud sql users create "${APP_USER}" \
  --instance="${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --password="${APP_PASSWORD}"
```

**Change a user password:**

```bash
gcloud sql users set-password "${APP_USER}" \
  --instance="${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --password='NEW_STRONG_PASSWORD'
```

### Local machine: `DATABASE_URL` and `psql`

Use **TLS** when connecting over the public IP:

```text
postgresql://USER:PASSWORD@PUBLIC_IP:5432/DBNAME?sslmode=require
```

- **URL-encode** the password in the URI (e.g. **`$` → `%24`**, **`@` → `%40`**), or use:

```bash
PGPASSWORD='your-password-here' psql \
  -h PUBLIC_IP -p 5432 -U "${APP_USER}" -d "${APP_DB}" "sslmode=require"
```

**Prisma / backend** from your laptop: point `DATABASE_URL` at the same URI (encoded password).

---

## Cloud Run + Cloud SQL (Unix socket)

Cloud Run does **not** use the instance’s public IP for the app container when you use the **Cloud SQL connector**. You attach the instance to the revision and use a **`DATABASE_URL`** that references the Unix socket path.

### IAM: Cloud SQL client on runtime service account

The **Cloud Run runtime** service account must be able to open connections to the instance:

```bash
export RUNTIME_SA="fabriq-runtime-sa@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudsql.client"
```

### Attach Cloud SQL to the Cloud Run service

**New deploy** (see also [First deploy with Cloud SQL (same region)](#first-deploy-with-cloud-sql-same-region)):

```bash
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --service-account="${RUNTIME_SA}" \
  --add-cloudsql-instances="${CONN_NAME}" \
  ... other flags ...
```

**Existing service:**

```bash
gcloud run services update "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --add-cloudsql-instances="${CONN_NAME}"
```

`CONN_NAME` must be exactly: **`project:region:instance`**.

### `DATABASE_URL` for Cloud Run (Prisma / Node)

Password must be **URL-encoded** in the URI:

```text
postgresql://APP_USER:URL_ENCODED_PASSWORD@localhost/APP_DB?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
```

Example pattern (do not commit real passwords):

```text
postgresql://fabriq_app:MyPass%24123@localhost/fabriq?host=/cloudsql/fbooks-490716:us-central1:fabriq-pg-dev
```

Set on the service via **`--env-vars-file`**, **`--set-env-vars`**, or **Secret Manager** (recommended for production).

### Schema and seed from your laptop

Run Prisma and `setup-db` **against Cloud SQL** using either:

- **Public IP** + `DATABASE_URL` + `sslmode=require`, or  
- **[Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy)** (no need for `0.0.0.0/0` if you use the proxy).

Example (from `backend/` with env set):

```bash
cd backend
export DATABASE_URL="postgresql://..."
npx prisma db push
node setup-db.js --demo-data=indian-demo --skip-tests
```

---

## Related files

- [cloudbuild.yaml](../cloudbuild.yaml) — Cloud Build: build, push (Artifact Registry), deploy to Run  
- [`.github/workflows/docker-ghcr.yml`](../.github/workflows/docker-ghcr.yml) — GitHub Actions: same build, push to GHCR  
- [Dockerfile](../Dockerfile) — clone branches, build image  
- [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md) — multi-platform build overview  
