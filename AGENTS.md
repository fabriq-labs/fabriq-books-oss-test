# Fabriq Books

Accounting app on this repo’s metadata-driven kernel: general ledger, sales/AR, and connectors (QuickBooks Online today). UI is `frontend-0`. Domain code lives under `backend/lib/`, Books Prisma schemas, and `frontend-0/src/domain/`.

This file is the **coding-agent entry** on the `fabriq-books` line. Humans start at [docs/README.md](./docs/README.md). Deeper product plans and OSS notes stay in [docs/domain/AGENTS.md](./docs/domain/AGENTS.md).

| | |
|---|---|
| Backend | `backend/`, port 4000 |
| Frontend | `frontend-0/`, port 5174 |
| Empty DB / schema | `cd backend && npm run setup:kernel` |
| Dev data (agents) | Then `cd backend && npm run seed:dev` |
| Login | `admin@example.com` / `admin123` |

Do not run `prisma db push`, `prisma migrate`, or other DDL. New databases use `setup:kernel` (generated schema SQL + `org_system`). Later tables: SQL diff in [docs/kernel/adding-a-model.md](./docs/kernel/adding-a-model.md).

Tool-specific folders (`.cursor/`, `.claude/`) are gitignored. Shared agent instructions live here and in `docs/domain/AGENTS.md`.

## Two setup paths (do not mix)

| Intent | Path |
|---|---|
| **Dev / agent bootstrap** | `setup:kernel` → **`npm run seed:dev`**. Chart, demo, catalog, and onboarding flags in one shot. |
| **New tenant / operator** | Empty DB + `AUTO_SETUP=true` (or `setup:kernel` only) → **in-app wizard** (password → org name → geo or skip). Do not pre-run `seed:coa` / `seed:books-demo`. |

Hand-running chart/demo seeds without the wizard or `seed:mark-onboarding-complete` causes **R-ONBOARD-ERR** (“Setup can't continue on this database”). After `seed:dev`, a **password-only** gate is expected; that is not the error page. Unset a shell `DATABASE_URL` before `npm run dev` so `backend/.env` wins.

Details: [docs/domain/AGENTS.md](./docs/domain/AGENTS.md), [docs/domain/ONBOARDING_REQUIREMENTS.md](./docs/domain/ONBOARDING_REQUIREMENTS.md), [docs/getting-started.md](./docs/getting-started.md).

## Teammate / agent environments

When a human asks you to set up this repo for **development, testing, or their agent environment**, figure it out from this file, [docs/domain/AGENTS.md](./docs/domain/AGENTS.md), and [docs/getting-started.md](./docs/getting-started.md). Prefer `setup:kernel` then **`npm run seed:dev`** for a local Books DB — not the tenant wizard. Install deps, start `npm run dev`, and smoke-check login yourself when you can.

When they ask to **build or deploy**, open [docs/infrastructure/BUILD_AND_DEPLOY.md](./docs/infrastructure/BUILD_AND_DEPLOY.md) and the host file that matches their ask (Railway or Fly). Use secrets from their gitignored `.env` or from them in chat — never print or commit tokens. If they are new to the host (no project, no token yet), **guide them**: walk them through creating the project / app in the dashboard, minting the token, and where to paste it; then continue the documented deploy steps. Do not dump a long tutorial into the repo — teach just enough for this run.

## What to build next

Follow [docs/domain/AGENT_PLAN.md](./docs/domain/AGENT_PLAN.md) **one module at a time**, then stop. Porting from prod: [docs/kernel/PORTING_A_DOMAIN.md](./docs/kernel/PORTING_A_DOMAIN.md) and Books notes in [docs/domain/KERNEL_PORT.md](./docs/domain/KERNEL_PORT.md). Invoice UI notes: [docs/domain/INVOICE_DOCUMENT_UI.md](./docs/domain/INVOICE_DOCUMENT_UI.md).

**Next on this branch:** after Module 3B (invoice/payment/credit create) — see AGENT_PLAN “After Module 3B”. Purchases, quote/SO, investing, and AR WP6–7 (poster / sync-wire) stay parked unless a task names them. **No QBO write-back.**

Prefer domain changes (`backend/lib/`, domain prisma, `frontend-0/src/domain/`, `docs/domain/`) over the shared engine.

## Metadata-driven screens first

For a Prisma model (including `source_system`):

1. Seed `{model}_view` with `view.data_graph` (Prisma `select` + list columns: `displayName`, `isColumnShow`). Relation keys need `type: "table"` and `select`.
2. List with frontend `Master` (`type` + `view`).
3. Forms use the same view API.

Do not invent parallel list/CRUD REST for ordinary Master screens. Custom routes only for actions the view API cannot do (e.g. connection test/sync/OAuth). Restart the backend after adding a model — routes register at process start. Seed graphs in TypeScript under setup seeds.

## Kernel (shared engine)

Do **not** change kernel code without checking with the human first. Ask, explain why, wait for approval.

Kernel means the shared engine, not Books product code: e.g. `backend/src/services/dal/`, `core/`, `permissions/`, generic `backend/src/rest/`, `auth/`, agent runtime, kernel Prisma (`metadata.prisma`, `platform.prisma`), and non–Books-only setup seeds. Engine docs: [docs/kernel/README.md](./docs/kernel/README.md), [adding-a-model.md](./docs/kernel/adding-a-model.md), [BUILDING_A_DOMAIN.md](./docs/kernel/BUILDING_A_DOMAIN.md).

## Database

Investigate with `SELECT` only. Read `DATABASE_URL` from `backend/.env` and pass it to `psql`. Do not print the URL; do not commit `.env`.

Quote `"user"`. Filter private rows by `org_id`. Shareable rows (`role`, `workflow_flow`, `workflow_state`, `workflow_action`, `view`, `permission`, `role_view`, `prompt_template`, `currency`) are visible for the caller org or `org_system`. `org` has no `org_id`. Contract: [docs/kernel/tenancy.md](./docs/kernel/tenancy.md).

## Deploy

Image layout: [docs/infrastructure/BUILD_AND_DEPLOY.md](./docs/infrastructure/BUILD_AND_DEPLOY.md). **Pick the host file from the human’s ask** — do not invent a platform:

| Ask | File |
|---|---|
| Railway | [docs/infrastructure/DEPLOY_RAILWAY.md](./docs/infrastructure/DEPLOY_RAILWAY.md) |
| Fly.io | [docs/infrastructure/DEPLOY_FLY.md](./docs/infrastructure/DEPLOY_FLY.md) |

Operator overview (Compose + both hosts): [docs/operations/deploy.md](./docs/operations/deploy.md).

`RAILWAY_TOKEN` / `FLY_API_TOKEN` in repo-root `.env` or `backend/.env` stay gitignored. Load into the environment; never print or commit. Do not redeploy or restart an existing production service unless the user explicitly asks. `railway variable list` / `fly secrets list` print secrets — do not write that output into logs, docs, or the repo.

```bash
npx -y @railway/cli@latest service list
npx -y @railway/cli@latest logs --service <service-id> -n 200
```

Leave service ids out of this file.
