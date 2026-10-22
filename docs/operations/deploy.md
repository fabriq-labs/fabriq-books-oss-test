# Deploy

Books ships as one container image. The image serves the web app and the API, and it can run the import service on a private port inside the same container. PostgreSQL stays outside the image. You can run that image on any host that has Docker — locally, on Railway, or on Fly.io. The host is packaging. The image and the env contract are the same.

The command-level notes this page is written from are in [Build and deploy](../infrastructure/BUILD_AND_DEPLOY.md). Read that file when you want every flag. This page is the path, and the reasons for it. First-boot schema and the in-app wizard are specified in [Onboarding requirements](../domain/ONBOARDING_REQUIREMENTS.md).

## What the image contains

The root `Dockerfile` is the build. Its context is the repository root. An upload or a build context that starts inside `backend/` does not contain the Dockerfile.

The image is Debian bookworm. It includes nginx, the built web app, the Node API (with `npm` / `npx` for first-boot setup), the Prisma query engine for Debian, and a Python virtualenv with the sync service and dbt. `uv` is used only while the image is built. Nginx listens on `PORT`, which defaults to `8080`:

- `/api/` and `/graphql` are proxied to the API on port 4000 inside the container
- `/health` is proxied to the API health check
- every other path is the web app

The process starts only when `DATABASE_URL` and `JWT_SECRET` are set. There is no database inside the image. The URL has to be reachable from the container. `localhost` inside the container is the container, not your laptop.

The import service listens on `127.0.0.1` and `SYNC_PORT` (default `8090`) when `ENABLE_SYNC_SERVICE` is true, which is the default. The API calls it at `SYNC_SERVICE_URL` (default `http://127.0.0.1:8090`). Nothing outside the container needs to reach that port. For a first onboarding deploy, set `ENABLE_SYNC_SERVICE=false` until you follow [Connections setup](./connections-setup.md).

The frontend build in the Dockerfile does not set a brand, so the shell label in the image is the kernel brand. The screens are the Books screens either way. Applying the Fabriq Books name locally is described in [Getting started](../getting-started.md).

## First-boot setup and onboarding

Two layers get a new database to a usable Books tenant:

1. **`AUTO_SETUP`** (process env on the container). When `true` or `1`, `/start.sh` runs before the API. If `public.organizations` is missing, it applies schema from the Prisma model and seeds Super Admin plus Books view metadata. If the schema already exists, it leaves tables alone, skips identity when the admin user is present, and skips view seeds that are already there. Unset / `false` / `0` leave today's no-migrate boot (you run `setup:kernel` by hand).
2. **In-app wizard** after sign-in. Change the seeded password, name the organization, then choose a chart geography (`us-ca` or `india`) or skip the chart. Chart load uses the same trees as `npm run seed:coa`.

Unset `AUTO_SETUP` stays off on purpose so an existing production container that pulls a newer image does not suddenly migrate. Compose and the deploy examples below turn it on explicitly.

| Variable | Role |
|---|---|
| `DATABASE_URL` | Application Postgres URL. Database name must not be `postgres`. |
| `JWT_SECRET` | Signs the local login token. |
| `AUTH_PROVIDER` | `local` for the seeded login. |
| `AUTO_SETUP` | Opt-in first-boot schema + minimum seed. |
| `ENABLE_SYNC_SERVICE` | Prefer `false` until connections are configured. |
| `PORT` | Nginx listen port (default `8080`). |

After a successful auto-setup, open `/health`, then the app host. Sign in as `admin@example.com` / `admin123`. The shell requires a password change before the rest of onboarding. A second boot against the same database does not reset that password or the org name.

## Run the image locally

Build from the repository root. Pass the same `SOURCE_*` build-args CI uses (`.git` is not in the Docker context):

```bash
npm run docker:build
# or: ./docker-build.sh fabriq-books:local
```

**Compose (recommended for a first look).** The checked-in `docker-compose.yml` starts Postgres and the app with `AUTO_SETUP=true`:

```bash
npm run docker:compose
```

Open `http://localhost:8080/health`, then `http://localhost:8080`. Complete the onboarding wizard. Chart of accounts appears after you pick a geography (or stays empty if you skip).

**`docker run` with an external database.** Replace the URL with one the container can open. If Postgres is on the host, that is often `host.docker.internal` rather than `localhost`, depending on your Docker engine.

```bash
docker run --name fabriq-books --rm -p 8080:8080 \
  -e DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/kernel_app' \
  -e JWT_SECRET='replace-with-a-long-random-string' \
  -e AUTH_PROVIDER=local \
  -e AUTO_SETUP=true \
  -e ENABLE_SYNC_SERVICE=false \
  -e PORT=8080 \
  fabriq-books:local
```

With `AUTO_SETUP` unset or false, the container does not apply the schema on boot. After it is up, run setup inside it. The image includes `psql` and `npm`:

```bash
docker exec fabriq-books sh -c 'cd /app/backend && npm run setup:kernel'
docker exec fabriq-books sh -c 'cd /app/backend && npm run seed:gl && npm run seed:entities && npm run seed:sales && npm run seed:ar-settlement && npm run seed:connections'
```

Then apply the `datalake` schema and, if you want the rule enforced, the headquarters index. Both are in [Database](./database.md). For a connection you will also set `ERP_CONFIG_ENCRYPTION_KEY` and the sync variables from [Connections setup](./connections-setup.md).

## Railway

Railway is one place to run the same image. The steps below create a new service in the project your token already belongs to. They do not create a new Railway project. `railway up --new` is a different command and wants an account token; do not use it for this.

Put a project token in the repo-root `.env` or in `backend/.env` as `RAILWAY_TOKEN`. Both files are gitignored. Load the variable into your shell without printing it. `railway variable list` prints secret values. Do not redirect that output into a log, a doc, or the repository.

The CLI used here is `npx -y @railway/cli@latest`. The instructions call it `railway`.

1. This repository has no Railway config file, so a brand-new service will try to build with Railpack. Before the first upload, set the service build to the Dockerfile at the repository root, and set the health check to `GET /health`. Give the health check a start period long enough for cold `AUTO_SETUP` (schema + view seeds), not only the image's default 90s. The upload has to be the repository root.
2. Pick a short lowercase service name and confirm it is absent with `railway service list --json`.
3. Create the app service and a Postgres service: `railway add --service "$APP" --json` and `railway add --database postgres --json`. Read the `name` field from each JSON object. The database deploys on its own. Prefer a dedicated application database name (not the maintenance database `postgres`).
4. Point the app at that database and turn on first-boot setup. The backslash keeps the `${{` reference for Railway to resolve at runtime. `APP` and `DB` are the names from the previous step.

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
```

5. Set `JWT_SECRET` from stdin so it does not appear in your shell history:

```bash
openssl rand -base64 32 | railway variable set JWT_SECRET --stdin --service "$APP" --skip-deploys --json
```

6. From the repository root, upload and build:

```bash
railway up --service "$APP" --detach --yes
```

`railway up` follows `.gitignore` and does not pass `SOURCE_*` build-args, so `/build-info.json` commit fields will be `unknown`. Prefer building the image in GitHub Actions (or `./docker-build.sh` + a registry) and deploying that image when you care about build metadata. Poll `railway deployment list --service "$APP" --limit 5 --json` until the newest deployment finishes. On failure, `railway logs --service "$APP" --build -n 200` and `railway logs --service "$APP" -n 200` show the build and the runtime. Leave service ids out of committed docs.

7. With `AUTO_SETUP=true`, you do not need `railway ssh` + `setup:kernel` for an empty database. Watch the deploy logs for `AUTO_SETUP complete`, then open the public URL. If you left `AUTO_SETUP` off, apply schema once the deployment is up:

```bash
railway ssh --service "$APP" -- sh -c 'cd /app/backend && npm run setup:kernel'
```

If this database is new and you skipped auto-setup, follow up with the `datalake` bootstrap and the Books seeds, using the same `railway ssh` form and the commands in [Database](./database.md) and [Getting started](../getting-started.md). If `organizations` already exists, auto-setup and `setup:kernel` will not alter tables.

8. `railway up` does not publish a hostname. `railway domain --service "$APP" --json` does. Open `https://<that-host>/health`, then the same host in a browser. Complete the onboarding wizard.

`--skip-deploys` on `variable set` matters when you are setting several variables. Each change would otherwise redeploy. Set them, then upload or redeploy once.

Connector variables (`ERP_CONFIG_ENCRYPTION_KEY`, and the Airbyte values if you use them) are set the same way, from stdin or from a file you do not commit. They are listed in [Connections setup](./connections-setup.md).

## Fly.io

Fly.io is another host for the same root Dockerfile and the same env contract. Use an org or personal access token as `FLY_API_TOKEN` (do not commit it). Install the CLI from [fly.io/docs/flyctl](https://fly.io/docs/flyctl/).

1. Create an app and a Postgres database the app can reach. Managed Postgres (`fly mpg create`) is the supported Fly path; attach it so `DATABASE_URL` is set as an app secret. Create an application database name (for example `kernel_app` or `kernel_onboard`), not only the cluster default, if your attach step allows choosing the database name.
2. Set the same non-secret and secret values used on Railway / Compose:

```bash
fly secrets set \
  AUTH_PROVIDER=local \
  NODE_ENV=production \
  AUTO_SETUP=true \
  ENABLE_SYNC_SERVICE=false \
  --app "$APP"
openssl rand -base64 32 | fly secrets set JWT_SECRET=- --app "$APP"
```

`DATABASE_URL` should already be present from attach. Do not print `fly secrets list` output into docs or logs.

3. Deploy from the repository root. A minimal `fly.toml` next to the Dockerfile is enough: `internal_port = 8080`, HTTP service with `GET /health`, and enough memory for cold setup (2 GB is a safe starting point). Example:

```toml
app = "your-app-name"
primary_region = "yyz"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"
  AUTH_PROVIDER = "local"
  NODE_ENV = "production"
  AUTO_SETUP = "true"
  ENABLE_SYNC_SERVICE = "false"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [[http_service.checks]]
    interval = "15s"
    timeout = "5s"
    grace_period = "60s"
    method = "GET"
    path = "/health"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2048mb"
```

```bash
fly deploy --app "$APP" --ha=false --yes --wait-timeout 600
```

Cold `AUTO_SETUP` can take longer than a short health grace. If the first deploy times out waiting for checks while logs still show setup running, wait for `AUTO_SETUP complete` in `fly logs`, then confirm `https://<app>.fly.dev/health`.

4. Sign in and complete the onboarding wizard the same way as local Docker. A restart against the same Postgres should log that `organizations` exists and skip identity and view seeds that are already present.

Tear down when you are done exploring: destroy the app, then the Postgres cluster, so you are not billed for idle machines.

## GitHub Actions

`.github/workflows/deploy-railway.yml` is a manually dispatched workflow. It builds this Dockerfile **with `SOURCE_*` build-args**, pushes `ghcr.io/<owner>/<repo>:prod-latest`, and redeploys a Railway service that is already configured as a Docker image source for that tag. That is the supported path for `/build-info.json` with real commit metadata: the builder supplies the args; Railway (or Fly / GCP / AWS) only runs the image. The workflow refuses to run unless the branch name is `prod`, and it expects repository secrets `RAILWAY_TOKEN` and `RAILWAY_SERVICE_ID`. A first bring-up can still use `railway up`, Fly `fly deploy`, or local Compose / `docker run`; use the Actions (or `./docker-build.sh` + registry) path when build metadata matters.

## After it is up

Confirm `/health` returns success. Sign in, finish the password and org/chart steps if the wizard appears, and change the demo password if you used the manual seed path without the wizard. Domain seeds that auto-setup already ran do not need to be repeated. Optional chart and demo numbers remain `npm run seed:coa` / `seed:books-demo` from [Getting started](../getting-started.md) when you are not using the wizard chart step.
