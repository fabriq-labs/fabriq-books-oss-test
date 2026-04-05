# Fabriq (monorepo)

Single Git repository: **backend** (`backend/`), **frontend** (`frontend-1/`), deployment assets (Dockerfile, nginx, compose samples), and **docs/**.


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

   Or install per package: `cd backend && npm install`, `cd ../frontend-1 && npm install`.

3. **Run API + UI together** (from repo root):

   ```bash
   npm run dev
   ```

4. **Open the editor workspace** (optional): double-click `fabriq.code-workspace` or *File → Open Workspace from File…*.

5. **Container image / CI**: see [docs/BUILD_AND_DEPLOY.md](./docs/BUILD_AND_DEPLOY.md) (Dockerfile, GHCR workflow, sample compose).

6. **Deeper onboarding**: [docs/onboarding/ONBOARDING_SESSION1_WORKBOOK.md](./docs/onboarding/ONBOARDING_SESSION1_WORKBOOK.md).

## Layout

```
fabriq/
├── fabriq.code-workspace
├── package.json          # Root scripts (concurrently: backend + frontend dev)
├── Dockerfile
├── docker-compose.yml
├── docker-compose.external-pg.yml
├── backend/
├── frontend-1/
└── docs/
```

## Docs

[Index: CLAUDE.md](./CLAUDE.md) and everything under [docs/](./docs/).
