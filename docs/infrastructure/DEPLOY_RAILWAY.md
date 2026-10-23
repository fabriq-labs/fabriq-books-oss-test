# Deploy on Railway

Use this file when the human asks for **Railway** (CLI bring-up, project token, GHCR + GitHub Actions, or forking this repo onto Railway). Shared image layout and build-args: [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md). Operator onboarding story: [../operations/deploy.md](../operations/deploy.md).

**Do not** follow [DEPLOY_FLY.md](./DEPLOY_FLY.md) unless they asked for Fly.

**If the human is new to Railway:** do not assume they already have a project or `RAILWAY_TOKEN`. Guide them briefly — create/sign in at railway.app, create a project, open **Project → Settings → Tokens**, create a **project token**, put it in gitignored `.env` as `RAILWAY_TOKEN` (never commit or echo it). Then continue Path A or Path B below. Figure out dashboard UI changes from Railway’s current docs if labels move.

## Prerequisites

- A Railway **project** (dashboard or already created) — or create one with the human as above.
- A Railway **project token** for that project + environment (Project → Settings → Tokens).
- Repo checkout at the **repository root** (must contain `Dockerfile`).

Put the token in the repo-root `.env` or `backend/.env` as `RAILWAY_TOKEN`. Both files are gitignored. Load it into the shell. Never print it, and never commit it.

```bash
if [ -f .env ]; then
  RAILWAY_TOKEN="$(grep -E '^RAILWAY_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
if [ -z "${RAILWAY_TOKEN:-}" ] && [ -f backend/.env ]; then
  RAILWAY_TOKEN="$(grep -E '^RAILWAY_TOKEN=' backend/.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
export RAILWAY_TOKEN
test -n "$RAILWAY_TOKEN"
```

A project token acts inside one project and one environment. `railway service list` shows that project. `railway up --new` creates a different project and needs an account token — do not use it for the steps below.

CLI is `npx -y @railway/cli@latest`. Commands below use that as `railway`.

`railway variable list --json` and `--kv` print secret values. Do not write that output into logs, docs, or the repo.

---

## Path A — CLI: new service in an existing project

Quick bring-up that builds on Railway from source (`railway up`). `/build-info.json` commit fields will be `unknown` unless you later switch to Path B (GitHub Actions + GHCR).

1. Pick a short service name from the spec, lowercase, no spaces. Confirm it is absent:

```bash
railway service list --json
```

2. Create the app service and a Postgres service. Read `name` from each JSON object. The database service deploys on its own.

```bash
railway add --service "$APP" --json
railway add --database postgres --json
```

3. Before the first upload, in the Railway dashboard for `$APP`: set the build to the **Dockerfile at the repo root**, and set the deploy health check to `GET /health` with a start period long enough for cold `AUTO_SETUP` (schema + view seeds), not only a short default.

4. Point the app at that database. Set `APP` and `DB` to the `name` fields from the JSON above. The backslash leaves `${{` for Railway to resolve. `--skip-deploys` waits until the source upload.

```bash
APP=my-app
DB=Postgres
railway variable set \
  "DATABASE_URL=\${{${DB}.DATABASE_URL}}" \
  "AUTH_PROVIDER=local" \
  "NODE_ENV=production" \
  "AUTO_SETUP=true" \
  "ENABLE_SYNC_SERVICE=false" \
  --service "$APP" \
  --skip-deploys \
  --json
```

Set `JWT_SECRET` from stdin:

```bash
openssl rand -base64 32 | railway variable set JWT_SECRET --stdin --service "$APP" --skip-deploys --json
```

Prefer a dedicated application database name (not the maintenance database `postgres`) when Railway / Postgres lets you choose.

5. From the repo root, upload and build on Railway:

```bash
railway up --service "$APP" --detach --yes
```

6. Poll until the newest deployment finishes:

```bash
railway deployment list --service "$APP" --limit 5 --json
```

While it is building or deploying, wait and list again. On failure:

```bash
railway logs --service "$APP" --build -n 200
railway logs --service "$APP" -n 200
```

7. With `AUTO_SETUP=true`, first boot applies schema when `organizations` is missing and seeds Super Admin plus Books views. Watch logs for `AUTO_SETUP complete`, then open the public URL and finish the in-app wizard. If you left `AUTO_SETUP` off, apply the schema once after the deployment is up:

```bash
railway ssh --service "$APP" -- sh -c 'cd /app/backend && npm run setup:kernel'
```

`setup:kernel` creates the application database when needed, applies SQL from `prisma/schema` when `organizations` is missing, and seeds `org_system`, the kernel tenant, Super Admin, USD, and the shell views. It does not use `prisma db push`. If `organizations` already exists, it leaves the schema alone. Later tables use the SQL diff in [../kernel/adding-a-model.md](../kernel/adding-a-model.md).

8. Give the service a public URL. `railway up` does not create one.

```bash
railway domain --service "$APP" --json
```

Open `https://<that-host>/health`, then the same host in a browser. Login is `admin@example.com` / `admin123` (change password in the onboarding wizard when `AUTO_SETUP` seeded the user).

Changing a variable redeploys the service. Pass `--skip-deploys` when you are setting several, then `railway up` or `railway redeploy --service "$APP" --yes` once.

To debug a service that is already deployed, read its name from `railway service list` and follow the log commands in [../../AGENTS.md](../../AGENTS.md). Leave service ids out of docs.

---

## Path B — GitHub Actions → GHCR → Railway (fork-friendly)

`.github/workflows/deploy-railway.yml` builds the root Dockerfile **with `SOURCE_*` build-args**, pushes to GitHub Container Registry, then asks Railway to redeploy a service that already pulls that image tag. Use this when you care about `/build-info.json` metadata, or when you want CI-driven deploys after a fork.

The workflow:

- Triggers only via **workflow_dispatch** (Actions → **Deploy (Railway)** → Run workflow).
- **Refuses to run unless the branch name is `prod`.**
- Pushes `ghcr.io/<owner>/<repo>:<branch>-<timestamp>` and `ghcr.io/<owner>/<repo>:prod-latest` (when run from `prod`).
- Redeploys with `railway redeploy --service "$RAILWAY_SERVICE_ID" --from-source --yes`.

Repository secrets the workflow expects:

| Secret | Value |
|---|---|
| `RAILWAY_TOKEN` | Railway **project** token for the target project |
| `RAILWAY_SERVICE_ID` | Railway service id (or name the CLI accepts) of the **app** service to redeploy |

### B1. Fork and prepare the GitHub repo

1. Fork this repository on GitHub (or push a copy under your org).
2. Clone **your** fork locally.
3. Create and push a `prod` branch from the line you want to deploy (often `fabriq-books` or `main` on your fork):

```bash
git checkout -b prod <source-branch>
git push -u origin prod
```

4. In the fork: **Settings → Actions → General** — allow Actions (default for most forks). The workflow needs `packages: write` (declared in the YAML) so `GITHUB_TOKEN` can push to GHCR.
5. Confirm `.github/workflows/deploy-railway.yml` exists on `prod` (it ships with this repo).

### B2. Create Railway project, Postgres, and an image-based app service

You need a Railway project that will **pull** the GHCR image (not build from git on every Action). Path A’s `railway up` is optional for a first smoke test; for Path B the durable setup is:

1. Create a Railway project (dashboard) if you do not have one. Create a **project token** (Project → Settings → Tokens). Store it only as a GitHub secret / local `.env` — never in git.
2. Add Postgres: `railway add --database postgres` (or dashboard). Note the database service name (often `Postgres`).
3. Add an empty app service: `railway add --service "$APP"` (or dashboard **New Service**).
4. In the Railway dashboard for that app service:
   - **Source:** Docker Image (not GitHub repo / Railpack).
   - **Image:** `ghcr.io/<your-github-owner>/<your-repo>:prod-latest`  
     Owner and repo must be **lowercase** (GHCR requirement). Example: `ghcr.io/acme/fabriq-kernel:prod-latest`.
   - **Registry credentials** (if the GHCR package is private): add a credential Railway can use to pull — typically a GitHub PAT with `read:packages` (and SSO authorized if the org requires it), username = your GitHub username. If you make the package **public** after the first push, Railway can pull without a credential.
   - Health check: `GET /health`, with a generous start period for cold `AUTO_SETUP`.
5. Set variables on the app service (same contract as Path A), with `--skip-deploys` until the first image exists:

```bash
railway variable set \
  "DATABASE_URL=\${{${DB}.DATABASE_URL}}" \
  "AUTH_PROVIDER=local" \
  "NODE_ENV=production" \
  "AUTO_SETUP=true" \
  "ENABLE_SYNC_SERVICE=false" \
  --service "$APP" \
  --skip-deploys \
  --json
openssl rand -base64 32 | railway variable set JWT_SECRET --stdin --service "$APP" --skip-deploys --json
```

6. Copy the **service id** from the dashboard (or `railway service list --json`) into the GitHub secret `RAILWAY_SERVICE_ID`. Do not commit the id into docs.

### B3. GitHub repository secrets

In the **fork** (or your deploy repo): **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `RAILWAY_TOKEN` | Same project token as above |
| `RAILWAY_SERVICE_ID` | App service id from Railway |

Do not put these in `.env` committed to the fork. Local CLI work can still use a gitignored `.env`.

### B4. First image push and redeploy

1. On GitHub: open the fork → **Actions** → **Deploy (Railway)**.
2. Open the workflow → **Run workflow** → branch **`prod`** → Run.
3. Wait for **build-push** to finish. Confirm the package appears under the user’s or org’s **Packages** (`ghcr.io/...`). Optionally set package visibility to Public if you want Railway to pull without registry credentials.
4. Confirm Railway’s image field still matches `ghcr.io/<owner>/<repo>:prod-latest` for **your** fork owner/name (not the upstream `fabriq-labs/...` unless that is intentional).
5. The **deploy** job runs `railway redeploy --from-source`, which pulls the new digest for that tag. If redeploy fails, check that `RAILWAY_SERVICE_ID` is in the project bound to `RAILWAY_TOKEN`, and that the service source is that GHCR tag.
6. `railway domain --service "$APP"` if needed. Open `/health`, then sign in and finish the onboarding wizard.

Later deploys: merge or push to `prod`, then run **Deploy (Railway)** again from `prod`. The workflow does not auto-run on push.

### B5. Fork checklist (common failures)

| Symptom | Likely cause |
|---|---|
| Workflow exits: must run from `prod` | You dispatched from another branch. Use `prod`. |
| GHCR push denied | Actions disabled, or `packages: write` blocked by org policy. |
| Railway redeploy / pull fails auth | Private GHCR package without registry credentials on the service; or image path still points at upstream owner. |
| Missing `RAILWAY_TOKEN` / `RAILWAY_SERVICE_ID` | Secrets not set on the **fork** (upstream secrets are not copied). |
| `/build-info.json` still unknown | You used Path A `railway up` instead of this workflow (or a build without `SOURCE_*` args). |
| Health check fails on first boot | Start period too short for `AUTO_SETUP`; watch logs for `AUTO_SETUP complete`. |

### B6. Optional: local image with the same metadata

```bash
npm run docker:build
# push to ghcr.io/<owner>/<repo>:prod-latest with your registry login, then
railway redeploy --service "$APP" --from-source --yes
```

Prefer the workflow for day-to-day so tags and build-args stay consistent.

---

## After it is up

Confirm `/health` returns success. Sign in, finish password / org / chart onboarding when the wizard appears. Do not redeploy or restart an existing production service unless the human explicitly asks.
