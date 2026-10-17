---
name: railway-debug
description: Connect to Railway-deployed Fabriq services to fetch logs, inspect deployments, and debug runtime issues. Use when investigating production/dev crashes, failed deploys, sync-service errors, or when the user asks to check Railway logs.
license: Project-specific skill for Fabriq Books application
---

# Railway service debug (logs + runtime)

This skill debugs a service already deployed from the root `Dockerfile`. Creating a new service is [docs/infrastructure/BUILD_AND_DEPLOY.md](../../docs/infrastructure/BUILD_AND_DEPLOY.md).

## Prerequisites

1. `RAILWAY_TOKEN` must be present in the environment (Cursor Cloud Agents → Secrets, or local shell export).
   - Create at: Railway → Project → Settings → Tokens → **Project Token**
   - Same secret used by GitHub Actions (`RAILWAY_TOKEN`)
2. Do **not** commit the token. Never write it into repo files.
3. Prefer non-streaming log fetches (`-n` / `--lines`) so commands finish.

Verify auth:

```bash
test -n "${RAILWAY_TOKEN:-}" && echo "RAILWAY_TOKEN set" || echo "RAILWAY_TOKEN missing"
npx -y @railway/cli@latest whoami
npx -y @railway/cli@latest service list
```

## Which service

`railway service list` is the list for this token's project. A new app is created with [docs/infrastructure/BUILD_AND_DEPLOY.md](../../docs/infrastructure/BUILD_AND_DEPLOY.md). Do not copy service ids into this skill. When the user names an existing production service, read logs first and avoid redeploy or restart unless they ask.

The image is the root `Dockerfile`: nginx serves `frontend-0` and proxies `/api` to Node. Health: `GET /health`. Python sync listens on **8081** only when `INTEGRATION_SYNC_ENABLED` is not `false`.

## Standard debug workflow

### 1. Recent deploy / runtime logs

```bash
# Set SERVICE_ID from `railway service list`.
# Last N deploy/runtime lines (recommended for agents)
npx -y @railway/cli@latest logs \
  --service "$SERVICE_ID" \
  -n 200

# Build logs for latest deployment
npx -y @railway/cli@latest logs \
  --service "$SERVICE_ID" \
  --build -n 200

# JSON (easier to parse)
npx -y @railway/cli@latest logs \
  --service "$SERVICE_ID" \
  -n 100 --json
```

### 2. Deployment status

```bash
npx -y @railway/cli@latest deployment list \
  --service "$SERVICE_ID" \
  --json
npx -y @railway/cli@latest status
npx -y @railway/cli@latest metrics \
  --service "$SERVICE_ID"
```

### 3. In-container checks (non-interactive)

```bash
# One-shot remote command (prefer this over interactive ssh)
# Hit the nginx health endpoint on the app port and the sync-service /health on 8081.
npx -y @railway/cli@latest ssh \
  --service "$SERVICE_ID" \
  -- sh -c 'wget -qO- "http://127.0.0.1:${NGINX_PORT:-8080}/health"'

npx -y @railway/cli@latest ssh \
  --service "$SERVICE_ID" \
  -- sh -c 'wget -qO- "http://127.0.0.1:8081/health"'
```

Avoid long interactive `railway ssh` / streaming `railway logs` sessions unless the user is watching.

### 4. What to look for in this app

| Symptom | Where to look |
|---------|----------------|
| Container crash / OOM | deploy logs, `railway metrics` |
| App boot / Prisma / nginx | deploy logs around Node start; `/app/build-info.json` via ssh |
| Sync process on 8081 | logs mentioning `INTEGRATION_SYNC_URL` or uvicorn. Kernel deploys set `INTEGRATION_SYNC_ENABLED=false`. |
| Wrong build | `railway ssh` and `cat /app/build-info.json` |

## Safety rules

- **Read-only by default**: logs, status, metrics, healthchecks, diagnose scripts.
- Do **not** `redeploy`, `restart`, `down`, or change variables unless the user explicitly asks.
- Never print or commit `RAILWAY_TOKEN` or other secrets from `railway variable list`.

## MCP alternative

If the Railway MCP server is configured (see `.cursor/mcp.json`), use its `get-logs` / status tools. For Cursor Cloud Agents, shell + `RAILWAY_TOKEN` secret is the reliable path because Railway's remote MCP (`https://mcp.railway.com`) requires OAuth and does **not** accept project tokens.
