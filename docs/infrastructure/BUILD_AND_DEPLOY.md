# Build and deploy

One image serves the UI and the API. Build it in this repo, then run it anywhere Docker runs — local Compose, Railway, or Fly.io. The operator path and onboarding env contract are in [../operations/deploy.md](../operations/deploy.md).

**Coding agents:** pick the host the human named. Do not invent a platform. Read that host file and execute (or guide) from it. If they lack a project or token, help them create one in the host’s dashboard, then continue — do not stop at “you need a token.”

| Human asks about… | Read |
|---|---|
| Railway (CLI, new service, GitHub Actions, fork → deploy) | [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md) |
| Fly.io (app, Managed Postgres, `fly.toml`, deploy) | [DEPLOY_FLY.md](./DEPLOY_FLY.md) |
| Local Docker / Compose / image layout | This page + [../operations/deploy.md](../operations/deploy.md) |

Build the domain first. A model, its table, its view, and its form: [../kernel/adding-a-model.md](../kernel/adding-a-model.md). Where domain files go: [../kernel/BUILDING_A_DOMAIN.md](../kernel/BUILDING_A_DOMAIN.md).

## The image

The root `Dockerfile` is the build. Context is the repo root. It copies `backend/` and `frontend-0/`.

| Stage | What it does |
|---|---|
| `frontend-builder` | `npm ci` and `npm run build` in `frontend-0` on `node:*-bookworm-slim`. `VITE_API_BASE_URL=""` so the browser calls `/api` on the same host. |
| `backend-builder` | `npm ci`, `npm run build`, and `prisma generate` for Debian (`debian-openssl-3.0.x`). Dependencies stay in the image. |
| `integrations-builder` | `uv sync` on `python:3.12-slim-bookworm` → baked `.venv` (dbt + sync_service). `uv` is not copied to runtime. |
| final | `debian:bookworm-slim` with apt `nginx` + `postgresql-client`, Node and Python from matching bookworm images, backend + frontend + integrations venv. `/app/build-info.json` (also served at `/build-info.json`) records commit metadata from `SOURCE_*` / `IMAGE_TAG` / `BUILD_TIME` build-args only. |

`nginx.conf` listens on `PORT` (default `8080`):

- `/api/` and `/graphql` proxy to `127.0.0.1:4000`
- `/health` proxies to `127.0.0.1:4000/api/health`
- every other path is the SPA

`/start.sh` is the only entrypoint. It requires `DATABASE_URL` and `JWT_SECRET` for an external Postgres. Nginx uses `PORT` (default `8080`). The API listens on `4000` inside the container. When `AUTO_SETUP` is `true` or `1`, start runs first-boot schema and minimum seed before the API (see [../operations/deploy.md](../operations/deploy.md)). The runtime image includes `npm` / `npx` so that path can invoke Prisma and the seed scripts.

The image listens on `8080` only.

This repo has no Railway config file at the root. A new Railway service defaults to Railpack until you set the Dockerfile — details in [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md). Fly uses the same Dockerfile via `fly.toml` — see [DEPLOY_FLY.md](./DEPLOY_FLY.md).

`.git` is not in the Docker build context (see `.dockerignore`). `/build-info.json` is filled only when the **builder** passes `SOURCE_*` (and related) build-args — the same contract in GitHub Actions and locally. The runtime host (Railway, Fly, GCP, AWS, Compose) just runs the image; it does not supply this metadata.

| Builder | How args are passed |
|---|---|
| GitHub Actions | `.github/workflows/deploy-railway.yml` `docker/build-push-action` `build-args` |
| Local Docker / Compose | `./docker-build.sh` or `npm run docker:build` / `npm run docker:compose` |

```bash
npm run docker:build          # ./docker-build.sh → kernel:local with SOURCE_* args
npm run docker:compose        # same args via compose build.args, then up --build
```

A plain `docker build .` or `railway up` without those args leaves branch/commit/tag as `unknown` (build time may still be set inside the Dockerfile). For a deployable image with real metadata, build in CI (or with `./docker-build.sh`), push to a registry, then point the runtime at that image.
