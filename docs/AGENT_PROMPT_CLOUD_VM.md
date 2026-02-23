# Code agent prompt – Fabriq on cloud VM

**Use this when working in Cursor (or any code agent) on the cloud VM.** Copy or reference this so the agent has correct context.

---

## Quick paste for Cursor chat

When you connect to the VM (workspace at `~/repos/fabriq`), paste this into the agent chat:

```
I'm on the Fabriq cloud VM. Workspace is ~/repos/fabriq (root repo only). Read docs/AGENT_PROMPT_CLOUD_VM.md and docs/BUILD_AND_DEPLOY.md. You must clone backend and frontend (demo branch) into this tree if missing; I only cloned the root repo. Use docker compose for local dev (port 8080). For Cloud Build use gcloud builds submit with GH_TOKEN.
```

---

## Context for the agent

You are on a **GCP cloud VM** (Singapore). The workspace is **~/repos/fabriq** — the **root repo only**. The user does **not** clone backend or frontend; that is your job.

**Your responsibilities:**
- **Clone backend and frontend** into this workspace if they are missing:
  - `backend/` ← `https://github.com/fabriq-labs/fabriq-base` (branch **demo**)
  - `frontend-1/` ← `https://github.com/fabriq-labs/zeiv-v2` (branch **demo**)
- Use a GitHub token for private repos: clone with `https://${GH_TOKEN}@github.com/...` (user must set `GH_TOKEN` or provide token; ask if missing).
- Do **not** commit from `backend/` or `frontend-1/` when working in the root-repo workspace. Only the root repo at `~/repos/fabriq` is committed from the VM.
- When the user asks to build or run: ensure `backend/` and `frontend-1/` exist (clone on **demo** branch if needed), then run `docker compose` or the relevant build/deploy command.

**Root repo (what the user cloned):** Deployment only — Dockerfile(s), nginx, start scripts, docker-compose, Cloud Build configs, docs. Path: **~/repos/fabriq**.

**Build strategy:**
- **Local dev:** From `~/repos/fabriq`, run `docker compose up` (uses `Dockerfile.dev`: frontend + backend + nginx + PostgreSQL). Port **8080**. Health: `http://localhost:8080/health`. Login: `admin@example.com` / `admin123`.
- **Production image:** `Dockerfile` (no DB). For Cloud Run/Railway with external PostgreSQL.
- **Cloud Build:** From repo root, `gcloud builds submit --config=cloudbuild.yaml` (prod) or `cloudbuild-dev.yaml` (dev). Pass `_GH_TOKEN` in substitutions; Cloud Build clones backend/frontend from GitHub.

**When the user asks to build, run, or deploy:**
1. **Local dev:** If `backend/` or `frontend-1/` are missing, clone them (demo branch) using `GH_TOKEN`; then `docker compose build` and `docker compose up -d` (or `docker compose up` for logs).
2. **Production image locally:** `docker build -t fabriq:latest .` and run with `DATABASE_URL` and `JWT_SECRET`.
3. **Cloud Build:** `gcloud builds submit --config=cloudbuild.yaml --substitutions="_GH_TOKEN=${GH_TOKEN}" .` (or `cloudbuild-dev.yaml`). Ensure `GH_TOKEN` is set or ask the user.

**Reference:** Full steps and env vars: `docs/BUILD_AND_DEPLOY.md`. VM and SSH: `docs/VM_REMOTE_DEV.md`.
