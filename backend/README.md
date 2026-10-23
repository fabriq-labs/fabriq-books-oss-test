# Fabriq API

Express and Prisma backend for the metadata framework. A Prisma model gets one set of view-scoped routes. A view's `data_graph` is the Prisma `select` and the list columns. Permissions and `role_view` decide who can read or write.

The guide for adding a model is [docs/kernel/adding-a-model.md](../docs/kernel/adding-a-model.md). Where domain files go is [docs/kernel/BUILDING_A_DOMAIN.md](../docs/kernel/BUILDING_A_DOMAIN.md). How a graph becomes a select is [docs/kernel/metadata.md](../docs/kernel/metadata.md).

| | |
|---|---|
| API | this package, port 4000 |
| UI | `frontend-0/`, port 5174 |
| Setup | `npm run setup:kernel` |
| Login | `admin@example.com` / `admin123` |

From the repo root, `npm run dev` starts the API and `frontend-0`.

```bash
cd backend
npm install
# DATABASE_URL and JWT_SECRET in backend/.env
npm run setup:kernel
npm run dev
```

`setup:kernel` applies schema SQL when `organizations` is missing, then seeds `org_system` and the shell views. Each view has a `data_graph`. It does not use `prisma db push`. When `organizations` already exists it only re-seeds. A new table uses the SQL diff in [docs/kernel/adding-a-model.md](../docs/kernel/adding-a-model.md). Restart this process after `prisma generate`. Routes are registered only at startup.

A product seed is a second command, run from `backend/` after `setup:kernel`. `setup:kernel` does not run it. On the Books line those commands, and the local login, are in [Getting started](../docs/getting-started.md).

`setup:kernel` writes view graphs from `src/utils/setup/seedKernel.ts`. It does not load a JSON view catalog.

## Request path

```
HTTP /api/{model}/view/{viewId}
  → auth
  → RestService
  → PermissionService
  → ModelService (data_graph → Prisma select)
  → DataAccessLayer (org scope)
  → Prisma
```

There is no `/api/{model}` route without a view. Search is `POST /api/{model}/view/{viewId}/search`.

| Area | Entry | Document |
|---|---|---|
| CRUD | `/api/{model}/view/{viewId}` | [docs/kernel/metadata.md](../docs/kernel/metadata.md) |
| Add a model | domain schema, seed, form | [docs/kernel/adding-a-model.md](../docs/kernel/adding-a-model.md) |
| Workflows | `/api/workflow/*` | [docs/kernel/workflows.md](../docs/kernel/workflows.md) |
| Agent | `/api/agent/*` | [docs/kernel/agent/](../docs/kernel/agent/) |
| Auth | `/api/auth/*` | [docs/kernel/auth.md](../docs/kernel/auth.md) |
| Deploy | root `Dockerfile` | [BUILD_AND_DEPLOY.md](../docs/infrastructure/BUILD_AND_DEPLOY.md), [DEPLOY_RAILWAY.md](../docs/infrastructure/DEPLOY_RAILWAY.md), [DEPLOY_FLY.md](../docs/infrastructure/DEPLOY_FLY.md) |
