# Kernel

Metadata-driven CRUD, workflows, and the agent runtime. The app UI is `frontend-0`.

Start at [docs/README.md](./docs/README.md). A new model, its table, its view, and its form are in [docs/kernel/adding-a-model.md](./docs/kernel/adding-a-model.md). Where those files go is [docs/kernel/BUILDING_A_DOMAIN.md](./docs/kernel/BUILDING_A_DOMAIN.md).

`view.data_graph` is required. It is both the Prisma `select` and the list columns (`displayName` plus `isColumnShow`). A relation key needs `type: "table"` and `select`. The kernel seed writes these graphs in TypeScript. Restart the backend after adding a model. Routes are registered only at process start.

| | |
|---|---|
| Backend | `backend/`, port 4000 |
| Frontend | `frontend-0/`, port 5174 |
| Database setup | `cd backend && npm run setup:kernel` |
| Login | `admin@example.com` / `admin123` |

Do not run `prisma db push`, `prisma migrate`, or other DDL. New databases are created by `npm run setup:kernel`, which applies generated schema SQL and seeds `org_system`. After `organizations` exists, apply later tables with the SQL diff in `docs/kernel/adding-a-model.md`.

## Porting from prod

Kernel files do not import a product folder. They call the hooks in `backend/lib/domain.ts` and `frontend-0/src/domain/`. A feature that still works with no product installed stays in the kernel. Import discard is one. A feature that names product fields or a vendor stays in `backend/lib/<product>/` or `frontend-0/src/domain/<product>/` and is registered from those hooks. A todo app and the ledger use the same hook names.

Follow [docs/kernel/PORTING_A_DOMAIN.md](./docs/kernel/PORTING_A_DOMAIN.md) for every later migration from prod. The books lessons are [docs/book-keeping/KERNEL_PORT.md](./docs/book-keeping/KERNEL_PORT.md). The task-sized plan is [docs/book-keeping/AGENT_PLAN.md](./docs/book-keeping/AGENT_PLAN.md). Run one module from that plan, then stop.

Tool-specific folders (`.cursor/`, `.claude/`) stay on the machine that uses them. They are gitignored. Instructions for every coding agent live in this file.

## Database

Investigate with `SELECT` only. Read `DATABASE_URL` from `backend/.env` and pass it to `psql`. Do not print the URL, and do not commit `.env`.

Quote `"user"`. Filter private rows by `org_id`. Shareable rows (`role`, `workflow_flow`, `workflow_state`, `workflow_action`, `view`, `permission`, `role_view`, `prompt_template`, `currency`) are visible for the caller org or `org_system`. `org` has no `org_id`. The contract is [docs/kernel/tenancy.md](./docs/kernel/tenancy.md).

## Deploy

Given a spec, add the domain with [docs/kernel/adding-a-model.md](./docs/kernel/adding-a-model.md) and [docs/kernel/BUILDING_A_DOMAIN.md](./docs/kernel/BUILDING_A_DOMAIN.md).

Deploy that app as a new Railway service with [docs/infrastructure/BUILD_AND_DEPLOY.md](./docs/infrastructure/BUILD_AND_DEPLOY.md). `RAILWAY_TOKEN` in the repo-root `.env` or `backend/.env` is a project token. Load it into the environment. Never print it or commit it. `railway add` creates the service in that token's project. `railway up` builds the root `Dockerfile`.

To inspect a service that is already deployed, list services, then pass the name or id from that list:

```bash
npx -y @railway/cli@latest service list
npx -y @railway/cli@latest logs --service <service-id> -n 200
```

Leave service ids out of this file. Do not redeploy or restart an existing production service unless the user explicitly asks. `railway variable list` prints secret values. Do not write that output into logs, docs, or the repo.
