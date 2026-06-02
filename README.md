# Fabriq Books (monorepo)

Fabriq is a **metadata-driven financial management platform**: define Prisma models and views, and you get permission-controlled REST APIs, workflow-backed approvals, and a dynamic React UI—without hand-writing CRUD for each entity. Modules cover **procurement**, **sales**, **accounting / bookkeeping**, and **investments**, with an **AI agent** for reconciliation, categorization, imports, and in-app chat.

This repository ships the full stack in one place:

| Package | Path | Role |
|---------|------|------|
| **API server** | [`backend/`](backend/) | Express, Prisma, workflows, agent, MCP |
| **Web app** | [`frontend-1/`](frontend-1/) | React/Vite UI (multi-brand) |
| **Docs & deploy** | [`docs/`](docs/), Dockerfile, compose | Architecture, setup, CI/CD |

**Agentic FinOps** (reconciliation, AR, demo roadmap): see [docs/positioning/](docs/positioning/). **Product domain:** [docs/BUSINESS_DOMAIN.md](docs/BUSINESS_DOMAIN.md). **Roadmap:** [docs/roadmap.md](docs/roadmap.md).

---

## Getting started

1. **Clone** (use your org’s URL if different):

   ```bash
   git clone https://github.com/fabriq-labs/fabriq-ws-setup fabriq
   cd fabriq
   ```

   Prefer the **`main`** branch (or the branch your team uses).

2. **Install dependencies**

   ```bash
   npm install
   npm run install:all
   ```

   Or per package: `cd backend && npm install`, `cd ../frontend-1 && npm install`.

3. **Database & demo data** (first time, from `backend/`):

   ```bash
   cd backend
   # Configure .env — see docs/DEPLOYMENT.md
   node setup-db.js --demo-data=indian-demo --skip-tests
   ```

4. **Run API + UI** (from repo root):

   ```bash
   npm run dev
   ```

   API: http://localhost:4000 · UI: http://localhost:5173 · Default login: `admin@example.com` / `admin123`

5. **Open the editor workspace** (optional): double-click `fabriq.code-workspace` or *File → Open Workspace from File…*.

6. **Container image / CI**: [docs/BUILD_AND_DEPLOY.md](docs/BUILD_AND_DEPLOY.md).

7. **Onboarding workbook**: [docs/onboarding/ONBOARDING_SESSION1_WORKBOOK.md](docs/onboarding/ONBOARDING_SESSION1_WORKBOOK.md).

---

## Layout

```
fabriq/
├── fabriq.code-workspace
├── package.json          # Root scripts (concurrently: backend + frontend dev)
├── Dockerfile
├── docker-compose.yml
├── docker-compose.external-pg.yml
├── backend/              # → backend/README.md
├── frontend-1/
└── docs/                 # → docs/CLAUDE.md (documentation router)
```

---

## Documentation

| Audience | Start here |
|----------|------------|
| Anyone | [docs/CLAUDE.md](docs/CLAUDE.md) — index and reading order |
| Backend | [backend/README.md](backend/README.md) → [docs/BACKEND.md](docs/BACKEND.md) |
| Frontend | [docs/FRONTEND.md](docs/FRONTEND.md) |
| Deploy / ops | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/BUILD_AND_DEPLOY.md](docs/BUILD_AND_DEPLOY.md) |
