# Build and deploy

One image serves the UI and the API. Build the app in this repo, then deploy that image as a new service in the Railway project your token already belongs to.

Build the domain first. A model, its table, its view, and its form are in [../kernel/adding-a-model.md](../kernel/adding-a-model.md). Where domain files go is in [../kernel/BUILDING_A_DOMAIN.md](../kernel/BUILDING_A_DOMAIN.md).

## The image

The root `Dockerfile` is the build. Context is the repo root. It copies `backend/` and `frontend-0/`.

| Stage | What it does |
|---|---|
| `frontend-builder` | `npm ci` and `npm run build` in `frontend-0` on `node:*-bookworm-slim`. `VITE_API_BASE_URL=""` so the browser calls `/api` on the same host. |
| `backend-builder` | `npm ci`, `npm run build`, and `prisma generate` for Debian (`debian-openssl-3.0.x`). Dependencies stay in the image. |
| `integrations-builder` | `uv sync` on `python:3.12-slim-bookworm` → baked `.venv` (dbt + sync_service). `uv` is not copied to runtime. |
| final | `debian:bookworm-slim` with apt `nginx` + `postgresql-client`, Node and Python from matching bookworm images, backend + frontend + integrations venv. `/app/build-info.json` records the commit when build-args are passed. |

`nginx.conf` listens on `PORT` (default `8080`):

- `/api/` and `/graphql` proxy to `127.0.0.1:4000`
- `/health` proxies to `127.0.0.1:4000/api/health`
- every other path is the SPA

`/start.sh` is the only entrypoint. It requires `DATABASE_URL` and `JWT_SECRET` for an external Postgres. Nginx uses `PORT` (default `8080`). The API listens on `4000` inside the container.

The image listens on `8080` only.

This repo has no Railway config file. A new service defaults to Railpack. Before the first upload, set the service build to the Dockerfile at the repo root and set the deploy health check to `GET /health`. The upload has to be the repo root. An upload rooted at `backend/` does not contain `Dockerfile`.

Local image:

```bash
docker build -t kernel:local .
```

## Railway: new service

The token is a Railway **project token**. Put it in the repo-root `.env` or `backend/.env` as `RAILWAY_TOKEN`. Both files are gitignored. Load it into the shell. Never print it, and never commit it.

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

A project token acts inside one project and one environment. `railway service list` shows that project. `railway up --new` creates a different project and needs an account token. Add a service here, then upload this repo to it.

CLI is `npx -y @railway/cli@latest`. Commands below use that as `railway`.

1. Pick a short service name from the spec, lowercase, no spaces. Confirm it is absent:

```bash
railway service list --json
```

2. Create the app service and a Postgres service. Read `name` from each JSON object. The database service deploys on its own.

```bash
railway add --service "$APP" --json
railway add --database postgres --json
```

3. Point the app at that database. Set `APP` and `DB` to the `name` fields from the JSON above. The backslash leaves `${{` for Railway to resolve. `--skip-deploys` waits until the source upload.

```bash
APP=my-app
DB=Postgres
railway variable set \
  "DATABASE_URL=\${{${DB}.DATABASE_URL}}" \
  "AUTH_PROVIDER=local" \
  "NODE_ENV=production" \
  --service "$APP" \
  --skip-deploys \
  --json
```

Set `JWT_SECRET` from stdin:

```bash
openssl rand -base64 32 | railway variable set JWT_SECRET --stdin --service "$APP" --skip-deploys --json
```

`railway variable list --json` and `--kv` print secret values. Do not write that output into logs, docs, or the repo.

4. From the repo root, upload this tree and build the Dockerfile on Railway. `railway up` follows `.gitignore`.

```bash
railway up --service "$APP" --detach --yes
```

5. Poll until the newest deployment finishes:

```bash
railway deployment list --service "$APP" --limit 5 --json
```

While it is building or deploying, wait and list again. On failure:

```bash
railway logs --service "$APP" --build -n 200
railway logs --service "$APP" -n 200
```

6. Apply the schema once, after the deployment is up. `npm run setup:kernel` creates the application database when needed, applies SQL from `prisma/schema` when `organizations` is missing, and seeds `org_system`, the kernel tenant, Super Admin, USD, and the shell views. Each of those views has a `data_graph`. It does not use `prisma db push`. If `organizations` already exists, it leaves the schema alone and re-runs that seed. Later tables use the SQL diff in [../kernel/adding-a-model.md](../kernel/adding-a-model.md). A domain seed is a second command from `/app/backend`, after that domain's tables exist. This branch does not include one.

```bash
railway ssh --service "$APP" -- sh -c 'cd /app/backend && npm run setup:kernel'
```

7. Give the service a public URL. `railway up` does not create one.

```bash
railway domain --service "$APP" --json
```

Open `https://<that-host>/health`, then the same host in a browser. Login is `admin@example.com` / `admin123`.

Changing a variable redeploys the service. Pass `--skip-deploys` when you are setting several, then `railway up` or `railway redeploy --service "$APP" --yes` once.

To debug a service that is already deployed, read its name from `railway service list` and follow the log commands in [../../AGENTS.md](../../AGENTS.md). Leave service ids out of docs.

## GitHub Actions

`.github/workflows/deploy-railway.yml` is the only workflow. Run it from the `prod` branch: Actions → **Deploy (Railway)**.

It builds this Dockerfile, pushes `ghcr.io/<owner>/<repo>:prod-latest` (and a timestamp tag), then runs `railway redeploy --from-source`. The Railway service is already a Docker Image source pointed at that tag, with registry credentials that can read packages.

Repository secrets:

| Secret | Value |
|---|---|
| `RAILWAY_TOKEN` | Railway project token |
| `RAILWAY_SERVICE_ID` | Service to redeploy |
