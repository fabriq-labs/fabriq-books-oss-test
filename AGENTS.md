# Kernel

Metadata-driven CRUD, workflows, and the agent runtime. The app UI is `frontend-0`.

On this branch [docs/README.md](./docs/README.md) is the Books guide. The engine index is [docs/kernel/README.md](./docs/kernel/README.md). A new model, its table, its view, and its form are in [docs/kernel/adding-a-model.md](./docs/kernel/adding-a-model.md). Where those files go is [docs/kernel/BUILDING_A_DOMAIN.md](./docs/kernel/BUILDING_A_DOMAIN.md).

`view.data_graph` is required. It is both the Prisma `select` and the list columns (`displayName` plus `isColumnShow`). A relation key needs `type: "table"` and `select`. The kernel seed writes these graphs in TypeScript. Restart the backend after adding a model. Routes are registered only at process start.

| | |
|---|---|
| Backend | `backend/`, port 4000 |
| Frontend | `frontend-0/`, port 5174 |
| Database setup | `cd backend && npm run setup:kernel` |
| Dev Books data (agents) | After kernel setup: `cd backend && npm run seed:dev` — not the tenant wizard |
| Login | `admin@example.com` / `admin123` |

Do not run `prisma db push`, `prisma migrate`, or other DDL. New databases are created by `npm run setup:kernel`, which applies generated schema SQL and seeds `org_system`. After `organizations` exists, apply later tables with the SQL diff in `docs/kernel/adding-a-model.md`.

Read [docs/domain/AGENTS.md](./docs/domain/AGENTS.md). That file is the product (including **tenant onboarding vs `seed:dev`**). Do not add product instructions to this file.

When moving a prod feature onto the shell, follow [docs/kernel/PORTING_A_DOMAIN.md](./docs/kernel/PORTING_A_DOMAIN.md).

Tool-specific folders (`.cursor/`, `.claude/`) stay on the machine that uses them. They are gitignored. Instructions for every coding agent live in this file.

## Kernel changes

Do not change kernel code without checking with the human first. Ask, explain why, and wait for approval before editing.

Kernel here means the shared engine — not Books/domain product code. That includes (non-exhaustive): `backend/src/services/dal/`, `backend/src/services/core/`, `backend/src/services/permissions/`, `backend/src/rest/` (generic routes), `backend/src/auth/`, `backend/src/agent/` (runtime), kernel Prisma (`metadata.prisma`, `platform.prisma`), and kernel seeds/setup under `backend/src/utils/setup/` that are not Books-only. Prefer fixing or extending the domain (`backend/lib/`, domain prisma, `frontend-0/src/domain/`, `docs/domain/`) instead.

## Database

Investigate with `SELECT` only. Read `DATABASE_URL` from `backend/.env` and pass it to `psql`. Do not print the URL, and do not commit `.env`.

Quote `"user"`. Filter private rows by `org_id`. Shareable rows (`role`, `workflow_flow`, `workflow_state`, `workflow_action`, `view`, `permission`, `role_view`, `prompt_template`, `currency`) are visible for the caller org or `org_system`. `org` has no `org_id`. The contract is [docs/kernel/tenancy.md](./docs/kernel/tenancy.md).

## Deploy

Given a spec, add the domain with [docs/kernel/adding-a-model.md](./docs/kernel/adding-a-model.md) and [docs/kernel/BUILDING_A_DOMAIN.md](./docs/kernel/BUILDING_A_DOMAIN.md).

Deploy that app as a new Railway service with [docs/infrastructure/BUILD_AND_DEPLOY.md](./docs/infrastructure/BUILD_AND_DEPLOY.md). `RAILWAY_TOKEN` in the repo-root `.env` or `backend/.env` is a project token. Load it into the environment. Never print it or commit it. `railway add` creates the service in that token's project. `railway up` builds the root `Dockerfile` without `SOURCE_*` args (build-info stays unknown). For real `/build-info.json`, build with GitHub Actions or `./docker-build.sh` / `npm run docker:build`, push the image, and point the runtime at it.

To inspect a service that is already deployed, list services, then pass the name or id from that list:

```bash
npx -y @railway/cli@latest service list
npx -y @railway/cli@latest logs --service <service-id> -n 200
```

Leave service ids out of this file. Do not redeploy or restart an existing production service unless the user explicitly asks. `railway variable list` prints secret values. Do not write that output into logs, docs, or the repo.
