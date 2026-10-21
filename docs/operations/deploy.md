# Deploy

Books ships as one container image. The image serves the web app and the API, and it can run the import service on a private port inside the same container. PostgreSQL stays outside the image. You can run that image on any host that has Docker, or you can build it on Railway. Railway is a convenient host for this Dockerfile. It is not required.

The command-level notes this page is written from, including the exact Railway CLI invocations, are in [Build and deploy](../infrastructure/BUILD_AND_DEPLOY.md). Read that file when you want every flag. This page is the path, and the reasons for it.

## What the image contains

The root `Dockerfile` is the build. Its context is the repository root. An upload or a build context that starts inside `backend/` does not contain the Dockerfile.

The image is Debian bookworm. It includes nginx, the built web app, the Node API, the Prisma query engine for Debian, and a Python virtualenv with the sync service and dbt. `uv` is used only while the image is built. Nginx listens on `PORT`, which defaults to `8080`:

- `/api/` and `/graphql` are proxied to the API on port 4000 inside the container
- `/health` is proxied to the API health check
- every other path is the web app

The process starts only when `DATABASE_URL` and `JWT_SECRET` are set. There is no database inside the image. The URL has to be reachable from the container. `localhost` inside the container is the container, not your laptop.

The import service listens on `127.0.0.1` and `SYNC_PORT` (default `8090`) when `ENABLE_SYNC_SERVICE` is true, which is the default. The API calls it at `SYNC_SERVICE_URL` (default `http://127.0.0.1:8090`). Nothing outside the container needs to reach that port.

The frontend build in the Dockerfile does not set a brand, so the shell label in the image is the kernel brand. The screens are the Books screens either way. Applying the Fabriq Books name locally is described in [Getting started](../getting-started.md).

## Run the image locally

Build from the repository root:

```bash
docker build -t fabriq-books:local .
```

Start it with an external database. Replace the URL with one the container can open. If Postgres is on the host, that is often `host.docker.internal` rather than `localhost`, depending on your Docker engine.

```bash
docker run --name fabriq-books --rm -p 8080:8080 \
  -e DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/kernel_app' \
  -e JWT_SECRET='replace-with-a-long-random-string' \
  -e AUTH_PROVIDER=local \
  -e PORT=8080 \
  fabriq-books:local
```

**First-boot setup.** Set `AUTO_SETUP=true` on the container to apply schema and the minimum seed when `public.organizations` is missing (see [Onboarding requirements](../domain/ONBOARDING_REQUIREMENTS.md)). The Compose example at the repo root sets this for you:

```bash
docker compose up --build
```

With `AUTO_SETUP` unset or false, the container does not apply the schema on boot. After it is up, run setup inside it. The image includes `psql`.

```bash
docker exec fabriq-books sh -c 'cd /app/backend && npm run setup:kernel'
```

Then apply the `datalake` schema and, if you want the rule enforced, the headquarters index. Both are in [Database](./database.md). Domain seeds are the same npm scripts, also from `/app/backend`:

```bash
docker exec fabriq-books sh -c 'cd /app/backend && npm run seed:gl && npm run seed:entities && npm run seed:sales && npm run seed:ar-settlement && npm run seed:connections'
```

Open `http://localhost:8080/health`, then `http://localhost:8080`. Sign in as `admin@example.com` / `admin123` and change the password. For a connection you will also set `ERP_CONFIG_ENCRYPTION_KEY` and the sync variables from [Connections setup](./connections-setup.md). Put them in the `docker run` environment. Changing them means recreating the container.

## Railway

Railway is one place to run the same image. The steps below create a new service in the project your token already belongs to. They do not create a new Railway project. `railway up --new` is a different command and wants an account token; do not use it for this.

Put a project token in the repo-root `.env` or in `backend/.env` as `RAILWAY_TOKEN`. Both files are gitignored. Load the variable into your shell without printing it. `railway variable list` prints secret values. Do not redirect that output into a log, a doc, or the repository.

The CLI used here is `npx -y @railway/cli@latest`. The instructions call it `railway`.

1. This repository has no Railway config file, so a brand-new service will try to build with Railpack. Before the first upload, set the service build to the Dockerfile at the repository root, and set the health check to `GET /health`. The upload has to be the repository root.
2. Pick a short lowercase service name and confirm it is absent with `railway service list --json`.
3. Create the app service and a Postgres service: `railway add --service "$APP" --json` and `railway add --database postgres --json`. Read the `name` field from each JSON object. The database deploys on its own.
4. Point the app at that database. The backslash keeps the `${{` reference for Railway to resolve at runtime. `APP` and `DB` are the names from the previous step.

```bash
railway variable set \
  "DATABASE_URL=\${{${DB}.DATABASE_URL}}" \
  "AUTH_PROVIDER=local" \
  "NODE_ENV=production" \
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

`railway up` follows `.gitignore`. Poll `railway deployment list --service "$APP" --limit 5 --json` until the newest deployment finishes. On failure, `railway logs --service "$APP" --build -n 200` and `railway logs --service "$APP" -n 200` show the build and the runtime. Leave service ids out of committed docs.

7. Apply the schema once the deployment is up:

```bash
railway ssh --service "$APP" -- sh -c 'cd /app/backend && npm run setup:kernel'
```

If this database is new, follow up with the `datalake` bootstrap and the Books seeds, using the same `railway ssh` form and the commands in [Database](./database.md) and [Getting started](../getting-started.md). If `organizations` already exists, setup will not alter tables.

8. `railway up` does not publish a hostname. `railway domain --service "$APP" --json` does. Open `https://<that-host>/health`, then the same host in a browser.

`--skip-deploys` on `variable set` matters when you are setting several variables. Each change would otherwise redeploy. Set them, then upload or redeploy once.

Connector variables (`ERP_CONFIG_ENCRYPTION_KEY`, and the Airbyte values if you use them) are set the same way, from stdin or from a file you do not commit. They are listed in [Connections setup](./connections-setup.md).

## GitHub Actions

`.github/workflows/deploy-railway.yml` is a manually dispatched workflow. It builds this Dockerfile, pushes `ghcr.io/<owner>/<repo>:prod-latest`, and redeploys a Railway service that is already configured as a Docker image source for that tag. The workflow refuses to run unless the branch name is `prod`, and it expects repository secrets `RAILWAY_TOKEN` and `RAILWAY_SERVICE_ID`. Use it when you already operate that branch and that service. A first deploy is the `railway up` path above, or the local `docker run`.

## After it is up

Sign in, change the demo password, and confirm `/health` returns success. Then seed any Books views the database does not have yet. A container restart does not re-seed. Schema and seeds are the commands above, run when you mean to run them.
