# Code agent prompt – Fabriq on cloud VM

**Use this when working in Cursor (or any code agent) on the cloud VM.** Copy or reference this so the agent has correct context.

---

## Quick paste for Cursor chat

When you connect to the VM (workspace at `~/repos/fabriq`), paste this into the agent chat:

```
I'm on the Fabriq cloud VM. Workspace is ~/repos/fabriq (full monorepo: backend/, frontend-1/, Dockerfile, docs). Read docs/AGENT_PROMPT_CLOUD_VM.md and docs/BUILD_AND_DEPLOY.md. Use docker compose for the all-in-one stack (port 8080). CI builds the same Dockerfile and pushes to GHCR via GitHub Actions — no gcloud Cloud Build.
```

---

## Context for the agent

You are on a **GCP cloud VM** (Singapore). The workspace is **~/repos/fabriq** — the **monorepo** (single Git checkout). It must include **`backend/`** and **`frontend-1/`**; the **Dockerfile** copies them at build time.

**Your responsibilities:**
- If `backend/` or `frontend-1/` is missing, the tree is incomplete — **clone or pull the full monorepo** (do not clone legacy separate repos).
- When the user asks to build or run: from `~/repos/fabriq`, use **`docker compose`** or **`docker build`** as in [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md).

**Build / run:**
- **Local on VM:** `docker compose build && docker compose up -d` (embedded Postgres, port **8080**). Health: `http://localhost:8080/health`. Login: `admin@example.com` / `admin123`. External DB: `docker compose -f docker-compose.external-pg.yml` with `DATABASE_URL` in `.env`.
- **Image only:** `docker build -t fabriq:latest .` (no `GH_TOKEN`).
- **CI:** GitHub Actions workflow **Docker build and push (GHCR)** — see `.github/workflows/docker-ghcr.yml`.

**Reference:** [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md), [VM_REMOTE_DEV.md](./VM_REMOTE_DEV.md).
