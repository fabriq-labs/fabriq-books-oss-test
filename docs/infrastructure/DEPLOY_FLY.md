# Deploy on Fly.io

Use this file when the human asks for **Fly.io** (apps, Managed Postgres, `fly.toml`, `fly deploy`). Shared image layout and build-args: [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md). Operator onboarding story: [../operations/deploy.md](../operations/deploy.md).

**Do not** follow [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md) unless they asked for Railway.

## Prerequisites

- Fly CLI (`fly` / `flyctl`) — [fly.io/docs/flyctl](https://fly.io/docs/flyctl/).
- Org or personal access token as `FLY_API_TOKEN` (environment or `fly auth`). Never print it or commit it.
- Repo checkout at the **repository root** (must contain `Dockerfile`).

Do not write `fly secrets` or connection strings into docs or the repository.

## New app

1. Create the app:

```bash
fly apps create <name> --org <org>
```

2. Create Managed Postgres and attach it so `DATABASE_URL` is set on the app:

```bash
fly mpg create
# note the cluster id from the output / fly mpg list
fly mpg attach <cluster-id> --app <name> --database <db>
```

Create an application database name (for example `kernel_app` or `kernel_onboard`), not only a cluster default named `postgres`, when attach lets you choose.

3. Set the same env contract as Compose / Railway (non-secrets and secrets):

```bash
fly secrets set \
  AUTH_PROVIDER=local \
  NODE_ENV=production \
  AUTO_SETUP=true \
  ENABLE_SYNC_SERVICE=false \
  --app <name>
openssl rand -base64 32 | fly secrets set JWT_SECRET=- --app <name>
```

`DATABASE_URL` should already be present from attach. Do not print `fly secrets list` output into docs or logs.

4. Add a `fly.toml` next to the Dockerfile (repo root). Minimal shape: `dockerfile = "Dockerfile"`, `internal_port = 8080`, HTTP service with `GET /health`, enough memory for cold `AUTO_SETUP` (2 GB is a safe starting point). Example:

```toml
app = "your-app-name"
primary_region = "iad"

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
    grace_period = "120s"
    method = "GET"
    path = "/health"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2048mb"
```

A fuller operator narrative and Compose comparison live in [../operations/deploy.md](../operations/deploy.md).

5. From the repo root:

```bash
fly deploy --app <name> --ha=false --yes --wait-timeout 600
```

`fly deploy` does not pass `SOURCE_*` build-args unless you wire them; `/build-info.json` commit fields may be `unknown`. For real metadata, build with `./docker-build.sh` or GitHub Actions, push to a registry, and point Fly at that image (advanced). Day-to-day Fly evals often accept unknown build-info.

Cold `AUTO_SETUP` can take longer than a short health grace. If the first deploy times out waiting for checks while logs still show setup running, wait for `AUTO_SETUP complete` in `fly logs`, then confirm `https://<name>.fly.dev/health`.

6. Open `https://<name>.fly.dev/health`, sign in as `admin@example.com` / `admin123`, and complete the onboarding wizard.

## Tear down

Destroy the app, then the Managed Postgres cluster, so you are not billed for idle machines:

```bash
fly apps destroy <name> -y
fly mpg destroy <cluster-id> -y
```

Remove a committed `fly.toml` only if the human wants the repo cleaned after teardown.

## After it is up

Confirm `/health` returns success. A restart against the same Postgres should log that `organizations` exists and skip identity and view seeds that are already present. Do not redeploy or destroy production apps unless the human explicitly asks.
