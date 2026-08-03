---
name: railway-debug
description: Connect to Railway-deployed Fabriq services to fetch logs, inspect deployments, and debug runtime issues. Use when investigating production/dev crashes, failed deploys, sync-service errors, or when the user asks to check Railway logs.
license: Project-specific skill for Fabriq Books application
---

# Railway service debug (logs + runtime)

This skill lets the agent debug the **already-deployed** Fabriq Docker image on Railway (root `Dockerfile` → GHCR → Railway Docker Image services).

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

## Known services

| Env | Branch / image tag | Service UUID | Workflow |
|-----|--------------------|--------------|----------|
| **dev** | `dev` / `:dev-latest` | `b82e07e5-9532-43f3-b15a-797403b7fc92` | `.github/workflows/deploy-dev.yml` |
| **prod** | `prod` / `:prod-latest` | `36f474f5-fc9f-4ab7-866b-61800eb3c318` | `.github/workflows/deploy-prod.yml` |

Default to **dev** unless the user asks for prod. Be extra careful with prod (read logs first; avoid redeploy/restart unless explicitly requested).

Image: `ghcr.io/fabriq-labs/fabriq-ws-setup:<branch>-latest`  
Container exposes **8080** (nginx/app) and **8081** (Python integration sync). Health: `GET /health`.

## Standard debug workflow

### 1. Recent deploy / runtime logs

```bash
# Last N deploy/runtime lines (recommended for agents)
npx -y @railway/cli@latest logs \
  --service b82e07e5-9532-43f3-b15a-797403b7fc92 \
  -n 200

# Build logs for latest deployment
npx -y @railway/cli@latest logs \
  --service b82e07e5-9532-43f3-b15a-797403b7fc92 \
  --build -n 200

# JSON (easier to parse)
npx -y @railway/cli@latest logs \
  --service b82e07e5-9532-43f3-b15a-797403b7fc92 \
  -n 100 --json
```

Replace the service UUID with prod when needed.

### 2. Deployment status

```bash
npx -y @railway/cli@latest deployment list \
  --service b82e07e5-9532-43f3-b15a-797403b7fc92 \
  --json
npx -y @railway/cli@latest status
npx -y @railway/cli@latest metrics \
  --service b82e07e5-9532-43f3-b15a-797403b7fc92
```

### 3. In-container checks (non-interactive)

```bash
# One-shot remote command (prefer this over interactive ssh)
# Hit the nginx health endpoint on the app port and the sync-service /health on 8081.
npx -y @railway/cli@latest ssh \
  --service b82e07e5-9532-43f3-b15a-797403b7fc92 \
  -- sh -c 'wget -qO- "http://127.0.0.1:${NGINX_PORT:-8080}/health"'

npx -y @railway/cli@latest ssh \
  --service b82e07e5-9532-43f3-b15a-797403b7fc92 \
  -- sh -c 'wget -qO- "http://127.0.0.1:8081/health"'

# GCS / Vertex diagnostics already in the image
npx -y @railway/cli@latest ssh \
  --service b82e07e5-9532-43f3-b15a-797403b7fc92 \
  -- sh /app/backend/scripts/railway-gcs-diagnose.sh
```

Avoid long interactive `railway ssh` / streaming `railway logs` sessions unless the user is watching.

### 4. What to look for in this app

| Symptom | Where to look |
|---------|----------------|
| Container crash / OOM | deploy logs, `railway metrics` |
| App boot / Prisma / nginx | deploy logs around Node start; `/app/build-info.json` via ssh |
| Sync button / Zoho / Xero failures | logs mentioning port **8081**, `INTEGRATION_SYNC_URL`, uvicorn |
| Gemini / Vertex / GCS auth | run `railway-gcs-diagnose.sh`; see `docs/RAILWAY_ARTIFACT_REGISTRY_VERTEX.md` |
| Wrong image / stale code | compare `SOURCE_COMMIT` / `build-info.json` vs expected GHCR tag |

## Safety rules

- **Read-only by default**: logs, status, metrics, healthchecks, diagnose scripts.
- Do **not** `redeploy`, `restart`, `down`, or change variables unless the user explicitly asks.
- Prefer **dev** service for experiments.
- Never print or commit `RAILWAY_TOKEN` / other secrets from `railway variable list`.

## MCP alternative

If the Railway MCP server is configured (see `.cursor/mcp.json`), use its `get-logs` / status tools. For Cursor Cloud Agents, shell + `RAILWAY_TOKEN` secret is the reliable path because Railway's remote MCP (`https://mcp.railway.com`) requires OAuth and does **not** accept project tokens.
