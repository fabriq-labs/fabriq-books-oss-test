# Open-source onboarding requirements

Status: Phase 1 implemented on the Books branch (local Compose / Docker `AUTO_SETUP`, onboarding APIs and wizard). Phase 2 Railway template / README button is still outstanding. Operator deploy steps for Docker, Railway, and Fly.io are in [../operations/deploy.md](../operations/deploy.md).

This document specifies how an open-source operator gets from this repository to a usable Fabriq Books instance: the container creates schema and minimum seed when pointed at an empty database, the seeded Super Admin signs in, and a short in-app wizard names the tenant and loads a chart of accounts.

**One product path, multiple hosts.** Railway one-click is a target packaging of that path. The same image, the same `AUTO_SETUP` behavior, and the same in-app onboarding must work when the operator runs Docker locally against a local or remote Postgres. Individual pieces are not Railway-only.

**Delivery order.** Phase 1 builds and tests the local Docker + database path end to end. Phase 2 adds the Railway template and README button once this branch (or its successor) is on a public repo suitable for a public template. Do not block Phase 1 on Railway publish.

The audience of the product is a person who can run Docker (or click a deploy button later) and sign in, and who knows enough bookkeeping to recognize a chart of accounts. They are not expected to run `psql` or the seed scripts by hand when `AUTO_SETUP` is on.

## 1. Goal / audience

A new operator should be able to:

1. Run the root `Dockerfile` image locally with `DATABASE_URL` pointing at a **new or existing** Postgres, and get a healthy app without hand-running `setup:kernel` when auto-setup is enabled.
2. Have the container create the schema and the minimum seed on first boot when the database is empty, and leave an existing database's tables alone.
3. Sign in as the seeded Super Admin (`admin@example.com` / `admin123`, the login `backend/src/utils/setup/seedKernel.ts` already prints) and be required to change that password.
4. Enter the tenant organization name and choose a geography in the same onboarding flow, regardless of whether the host is local Docker or Railway.
5. Land in Books with that organization's chart of accounts loaded (the same 53-account trees as `npm run seed:coa -- us-ca` or `india`).
6. **Later (Phase 2):** Deploy from a Railway template / README button that provisions Postgres and the same app service, with the same env contract.

Operators who already deploy with the CLI in [docs/operations/deploy.md](../operations/deploy.md) keep that path. The image must not apply schema on boot unless they opt in via `AUTO_SETUP`.

## 2. Out of scope

### Phase 1 (local Docker) — out of scope

Phase 1 gets a named organization and a chart onto the seeded tenant from a local container. It does not configure the rest of the books, and it does not ship the Railway template.

- Railway template publish, README Deploy button, and template composer variables beyond documenting the same env contract the local path uses.
- Legal entities, headquarters, addresses, and ledger default accounts. The entity form already exists; the wizard does not collect them.
- Tax rates, tax groups, tax regions beyond what `seed:sales` already inserts, and entity tax settings.
- Opening balances, journals, exchange rates, and `npm run seed:books-demo`.
- A second organization, extra users, roles, or an invitation flow.
- QuickBooks, Airbyte, `datalake` bootstrap, and `ERP_CONFIG_ENCRYPTION_KEY`. The connections screen can stay in the sidebar and remain empty.
- The partial unique index for one headquarters entity, and the other hand-written SQL files under `backend/prisma/migration/`. A database created by `setup:kernel` already has the Prisma tables. Those files are upgrades or extras, as [docs/operations/database.md](../operations/database.md) describes.
- Changing `prisma db push` / `prisma migrate` policy. Setup continues to apply generated SQL. It does not introduce a migrate history.
- Billing, subscriptions, logo upload, and `erp_system_type`.
- Multi-tenant SaaS provisioning. `POST /api/admin/onboard-tenant` creates another org and is not the wizard (see R-ORG-3).
- Publishing a license. This repository has no `LICENSE` file. That decision stays with maintainers (see open questions).
- The GitHub Actions workflow `.github/workflows/deploy-railway.yml`. That workflow redeploys an existing service from the `prod` branch. It is a maintainer path, not the open-source button.

### Phase 2 — in scope only then

- Public Railway template (Postgres + root Dockerfile app).
- README Deploy on Railway button.
- Template-specific defaults (`JWT_SECRET` via `${{secret()}}`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, health check timing on Railway).

## 3. User journeys

### 3.1 Phase 1 — local Docker (primary)

Happy path from a checkout to a chart the user can open.

1. The operator has Postgres reachable from Docker (Postgres on the host, in Compose, or any URL the container can open). They build the root image: `docker build -t fabriq-books:local .`
2. They start the container with at least `DATABASE_URL`, `JWT_SECRET`, `AUTH_PROVIDER=local`, and **`AUTO_SETUP=true`** (see R-ENV-1). Example shape:

```bash
docker run --name fabriq-books --rm -p 8080:8080 \
  -e DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/kernel_app' \
  -e JWT_SECRET='replace-with-a-long-random-string' \
  -e AUTH_PROVIDER=local \
  -e AUTO_SETUP=true \
  -e ENABLE_SYNC_SERVICE=false \
  -e PORT=8080 \
  fabriq-books:local
```

   For Postgres on the Docker host, `HOST` is often `host.docker.internal` (engine-dependent), not `localhost` inside the container.

3. `/start.sh` waits until Postgres accepts connections. If `public.organizations` is missing, it applies schema and seeds kernel identity plus Books view metadata. If the schema already exists, it does not alter tables. It does not load the chart and does not load demo journals.
4. Nginx starts after that setup succeeds. `http://localhost:8080/health` returns 200. The browser shows the sign-in page.
5. The user signs in as `admin@example.com` / `admin123`. The shell then blocks on the **same** first-run flow used on any host:
   1. Change the password (`POST /api/auth/change-password` rules).
   2. Enter the organization name (updates `org_kernel`; id and slug stay `org_kernel` / `kernel`).
   3. Choose geography: United States / Canada (`us-ca`) or India (`india`) — the server loads that chart and sets base currency to USD or INR — **or Skip** and add accounts later.
6. The user arrives on the home page. If they chose a geo, Accounting → Chart of Accounts lists the seeded accounts; if they skipped, that list is empty. Other lists are empty and usable later.

**New database:** auto-setup creates schema + minimum seed, then the wizard.

**Existing database** that already has `organizations`: auto-setup does not alter tables. If onboarding flags say the wizard is incomplete (and the DB is not inconsistent), the user resumes the remaining steps. If onboarding is already complete, they go straight to the app. If the DB shows real use without onboarding flags, they get the **error page** (R-ONBOARD-ERR), not a guessed completion or a forced wizard.

A restart must not drop tables, rewrite the password, or rename the organization back to "Kernel".

When `AUTO_SETUP` is off, behavior matches today: the container starts without migrating; the operator runs `npm run setup:kernel` (and view seeds) by hand as in [docs/operations/deploy.md](../operations/deploy.md).

### 3.2 Phase 2 — Railway one-click (same app path)

1. The reader clicks **Deploy on Railway** on the README. Railway creates Postgres named `Postgres` and the app service from the root `Dockerfile`.
2. The template sets the **same** variables as the local path, plus platform wiring: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `JWT_SECRET=${{secret()}}`, `AUTH_PROVIDER=local`, `NODE_ENV=production`, `AUTO_SETUP=true`, `ENABLE_SYNC_SERVICE=false`.
3. From first healthy boot onward, the journey is identical to §3.1 steps 3–6 (auto-setup → sign-in → password → org name → geo/chart → home).

## 4. Requirements by area

Priorities: **P0** is required to finish the **current phase** happy path. **P1** is part of that phase but not required to finish the path. Phase 2 items are labeled **Phase 2**; they are not P0 for Phase 1 implementation.

### 4.0 Environment contract (`AUTO_SETUP` and friends)

#### R-ENV-1. Where settings live (P0)

All of the following are **process environment variables** on the app container. They are not build-args, not baked into the image as secrets, and not read from a Railway-only API.

| Variable | Role |
|---|---|
| `DATABASE_URL` | Required. Postgres the container can reach. |
| `JWT_SECRET` | Required. |
| `AUTH_PROVIDER` | `local` for this path. |
| `AUTO_SETUP` | Opt-in schema/seed on boot (R-START-1). Values `true` / `1` enable; unset / empty / `false` / `0` leave today's no-migrate boot. |
| `ENABLE_SYNC_SERVICE` | Prefer `false` for this onboarding path until connections setup is done. |
| `PORT` | Nginx listen port (default `8080`). |

**How operators set them**

| Host | How `AUTO_SETUP` (and the rest) are set |
|---|---|
| Local `docker run` | `-e AUTO_SETUP=true` (and other `-e` flags), or `--env-file`. |
| Docker Compose (Phase 1 example) | `environment:` / `env_file:` on the app service. The checked-in Compose example sets `AUTO_SETUP=true` (R-ENV-2). |
| Railway (Phase 2) | Service variables in the template / dashboard. Template default `AUTO_SETUP=true`. |
| Manual CLI deploy | `railway variable set AUTO_SETUP=true --service …` (same as any other var). |

Document the variables in:

- Root or `docs/operations/deploy.md` for Docker.
- A Compose example (and `.env.example` / Docker-focused env sample) with placeholders only — never a real URL or JWT.
- Phase 2 template variable descriptions.

**Image default:** `AUTO_SETUP` remains **off** when unset, so existing deploys that pull a new image do not suddenly migrate. The Compose example, local happy-path docs, and the Phase 2 template **set it on explicitly**.

**Acceptance**

- `docker run` without `AUTO_SETUP` does not create `organizations` on an empty database.
- `docker run -e AUTO_SETUP=true` against an empty database does create schema and seed so login works.
- The same flag name and values work on Railway later; no second “Railway-only” setup switch.

#### R-ENV-2. Docs and Compose example for local Docker (P0, Phase 1)

[docs/operations/deploy.md](../operations/deploy.md) (and getting-started as needed) document:

1. Build the root image (or `docker compose up --build`).
2. Point `DATABASE_URL` at new or existing Postgres.
3. Pass `AUTO_SETUP=true` for first-boot setup.
4. Open `/health`, sign in, complete onboarding.

Ship a **Compose example** (e.g. `docker-compose.yml` or `docker-compose.example.yml` at the repo root, plus a gitignored `.env` pattern) where the app service has `AUTO_SETUP=true` so copy-paste local runs get setup without an extra flag. Postgres may be a Compose service or an external URL. Secrets stay placeholders / env files, not committed values.

No `railway ssh` is required for that path.

**Acceptance**

- A reader can follow the local Docker section without opening Railway docs.
- `docker compose` (or documented equivalent) starts with `AUTO_SETUP=true` without the operator inventing the variable name.
- Example commands and Compose files use placeholders, not live secrets.

### 4.1 Local Docker runtime (Phase 1 P0)

#### R-LOCAL-1. Same image as production (P0)

Phase 1 uses the root `Dockerfile` and `/start.sh`. It does not invent a second “dev onboarding” image. `backend/railway.toml` (Nixpacks / `npm start`) is not this path.

**Acceptance**

- `docker build` from the repo root produces the image under test.
- The running process is nginx + API as today, after optional auto-setup.

#### R-LOCAL-2. New and existing database (P0)

- **New / empty:** `AUTO_SETUP=true` applies schema when `public.organizations` is missing, then seeds per R-START-*.
- **Existing, onboarding complete** (`settings.onboarding` shows profile + chart complete, or chart skipped): no DDL; go to the app (password gate only if seed password still set — see R-SEED-3).
- **Existing, onboarding in progress** (flags present but incomplete, and no inconsistent-state signals): resume the wizard at the first incomplete step.
- **Inconsistent state** (R-ONBOARD-ERR): do not infer completion and do not show the wizard.
- Database name must not be `postgres` (existing `setup:kernel` rule). Document a dedicated app database name in examples (`kernel_app` or similar).

**Acceptance**

- Empty DB + `AUTO_SETUP=true` → login works after boot.
- DB that already has `organizations` + `AUTO_SETUP=true` → no `CREATE`/`ALTER`/`DROP` on application tables; restart does not reset password or org name after onboarding.
- Pointing at an already-onboarded DB does not force the wizard again.

#### Dev bootstrap vs tenant onboarding

**Tenant / operator path:** empty DB + `AUTO_SETUP` (or `setup:kernel` alone) → sign-in → password → org name → chart geo or skip. The wizard owns `settings.onboarding`. Do not pre-run `seed:coa` / `seed:books-demo` on this path.

**Dev / coding-agent path:** after `setup:kernel`, run `npm run seed:dev` (views + chart + demo + mark complete). That deliberately sets `settings.onboarding` so agents can code without the wizard. Details for agents: [AGENTS.md](./AGENTS.md) “Two setup paths”.

Hand-running `seed:coa` (or other business seeds) without the wizard or `seed:mark-onboarding-complete` is what creates R-ONBOARD-ERR below.

#### R-ONBOARD-ERR. Inconsistent database → error page, not a guess (P0)

Treat as **inconsistent** when `org_kernel` (or the caller's org) shows signs of real use **and** `settings.onboarding` is missing or incomplete. Signs of real use include any of:

- `org.name` is not the seed default `Kernel`
- the seeded admin password no longer matches `admin123`
- chart-seeded or hand-entered accounts exist
- other business rows exist (entities, postings, parties, invoices, etc.)

**Do not** infer “onboarding complete.” **Do not** open the wizard and overwrite or “fix” the data. Show a dedicated **error page** (authenticated shell is fine) with a short operator-facing message: this database was modified outside the onboarding flow (or before onboarding flags existed); refuse to continue automatically; point at docs / support for recovery.

Log clearly on the server (level error): org id, which signals fired, whether `settings.onboarding` was absent or partial. Do **not** log `DATABASE_URL`, JWT, or password material.

The same rule applies to **manual** `npm run setup:kernel` / `seedKernel.ts` (R-START-3): if identity rows already exist and the database is inconsistent (or a re-run would reset password / org name on a customized org), **fail with a clear error and the same class of log lines**. Do not silently upsert the seed password or rename the org back to `Kernel`.

**Acceptance**

- A DB with renamed org (or changed password, or accounts) and no `settings.onboarding` shows the error page after sign-in; wizard steps are not offered.
- Server logs name the inconsistency signals without secrets.
- `npm run setup:kernel` against that DB exits non-zero with an explicit message; password and org name are unchanged.
- A pristine post–auto-setup DB (name still `Kernel`, seed password, no business rows, no flags) still enters the wizard normally.

#### R-LOCAL-3. Phase 1 verification (P0)

Before Phase 2 work starts, the implementer demonstrates on a machine:

1. Build image; run against empty Postgres with `AUTO_SETUP=true` (Compose example or `docker run`).
2. `/health` 200; sign-in; password change; org name; geo → chart **or skip chart**; land on home.
3. Restart container; still signs in with new password; org name unchanged; wizard does not return.
4. Second run against that same DB with `AUTO_SETUP=true` still healthy and non-destructive.
5. (Optional) Point at a hand-renamed org without onboarding flags → error page + log line, not wizard.

Record the commands and results in the PR / walkthrough for Phase 1. Screen recording or screenshots of the wizard are preferred.

### 4.2 Railway template and README button (Phase 2)

Today there is no Railway template and no deploy button. The supported Railway path is the CLI in [docs/infrastructure/BUILD_AND_DEPLOY.md](../infrastructure/BUILD_AND_DEPLOY.md) and [docs/operations/deploy.md](../operations/deploy.md). The root of the repo has a `Dockerfile` and no `railway.toml`. `backend/railway.toml` describes a backend-only Nixpacks process. It is not the full-image deploy path.

Phase 2 starts after Phase 1 is proven and the branch is available on a **public** GitHub repo the template can reference.

#### R-DEPLOY-1. Two-service public template (Phase 2)

Publish a Railway template:

- Postgres service named exactly `Postgres`, private networking only.
- App service: this Git repository, root directory `/`, builder `DOCKERFILE`, `CMD` `/start.sh`. Do not use root directory `backend/` or `backend/railway.toml`.

**Acceptance**

- Deploying the template creates both services and builds from the root `Dockerfile`.
- The running process is nginx in front of the API.
- No maintainer project token is required for the clicker.

#### R-DEPLOY-2. Variables (Phase 2)

Same contract as R-ENV-1, with platform references:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | `${{secret()}}` |
| `AUTH_PROVIDER` | `local` |
| `NODE_ENV` | `production` |
| `AUTO_SETUP` | `true` |
| `ENABLE_SYNC_SERVICE` | `false` (R-DEPLOY-5) |

**Acceptance**

- After deploy, `DATABASE_URL` resolves through the `Postgres` service.
- Sign-in works after auto-setup with the same seeded user as local Docker.

#### R-DEPLOY-3. Health check and public URL (Phase 2)

App health check `GET /health`, public HTTP domain. Start period / timeout sized above a measured cold setup (schema + view seeds), not copied blindly from today's 90s image `HEALTHCHECK`.

**Acceptance**

- Fresh template deploy becomes healthy without `railway ssh`.
- Failed setup exits non-zero and does not serve sign-in against an empty database.

#### R-DEPLOY-4. README button (Phase 2)

Root `README.md` gets Railway's deploy button once a template code exists. Short copy: provisions Postgres + app, first login `admin@example.com` / `admin123`, change password immediately. Link local Docker / getting-started as the path that does not need Railway.

**Acceptance**

- Button opens this template from the default branch of the public repo.
- No secrets in the README.

#### R-DEPLOY-5. Template defaults (Phase 2, P1)

- `ENABLE_SYNC_SERVICE=false`.
- Prefer baking Fabriq Books brand in the image build for hosted users (open question on local `npm run dev` still showing Kernel).
- Template tracks the public default branch, root `/`.

### 4.3 Container auto-setup / `start.sh` (Phase 1 P0)

Today `/start.sh` exits if `DATABASE_URL` or `JWT_SECRET` is missing, starts the API, optionally starts the sync service, waits up to 30 seconds for health, and then starts nginx even if the API never answered. It does not inspect the database.

`backend/scripts/setup-kernel-db.js` (`npm run setup:kernel`) is the schema contract: refuse database name `postgres`; `CREATE DATABASE` when missing; apply generated Prisma SQL only when `public.organizations` is absent; always run `seedKernel.ts` today (destructive upserts — auto-setup must not always re-run those; see R-START-3).

The runtime image has `psql` and `node` but no global `npx`. Auto-setup must use binaries that exist in the image.

#### R-START-1. `AUTO_SETUP` gate (P0)

`start.sh` reads `AUTO_SETUP` from the environment (R-ENV-1). When on, setup runs before the API and nginx. Failed setup aborts the container. The "start nginx anyway" path must not run after failed setup.

Host-agnostic: local Docker and Railway both enter `/start.sh`.

**Acceptance**

- Unset: matches current entrypoint; empty DB has no `organizations` until manual setup.
- `true` on empty DB: after healthy, `organizations` exists and seeded user can log in.
- `false`: no SQL apply.

#### R-START-2. Empty-database detection and schema rule (P0)

Same predicate as `setup-kernel-db.js`: `organizations` missing → apply generated schema in **one transaction**; present → no DDL. No `prisma db push`, no `migrate deploy`, no dated files under `backend/prisma/migration/`.

If `organizations` exists but kernel/Books metadata is missing, may run idempotent seeds (R-START-3, R-START-4) without altering tables.

**Acceptance**

- First boot on empty DB creates Prisma schema including ledger and sales tables.
- Boot on DB with `organizations` issues no table DDL.
- Kill during apply leaves `organizations` absent so the next boot retries.
- Database name `postgres` still fails fast.

#### R-START-3. Kernel seed only when the seeded user is absent (P0)

Create `org_system`, `org_kernel`, USD, Super Admin, `user_kernel_admin` / `admin@example.com`, shell views — only when that user row is absent. When present, do not update password, email, org name, slug, or `basecurrency_id`.

**Manual `npm run setup:kernel` / `seedKernel.ts` follow the same non-clobber rule.** When identity rows already exist, do not reset password or org name. If the database is in an inconsistent state (R-ONBOARD-ERR), exit non-zero with a clear error and server/CLI logging — same class of failure as the in-app error page, not a silent re-seed.

**Acceptance**

- First boot: seed login works with `admin123`.
- After password + org name change, restart with `AUTO_SETUP=true` keeps both.
- Schema without admin user gets identity seed on next boot without second schema apply.
- Second `npm run setup:kernel` on an onboarded or customized DB does not restore `admin123` or the name `Kernel`; it either no-ops identity safely or fails per R-ONBOARD-ERR.

#### R-START-4. Books view seeds on first boot (P0)

Run when views are missing: `seed:gl`, `seed:entities`, `seed:sales`, `seed:ar-settlement`, `seed:connections`. Do not run `seed:coa` or `seed:books-demo` here (chart is the wizard).

**Acceptance**

- After first boot, Super Admin can open Books lists without a "no columns" failure; business rows empty.
- Restart does not rewrite an edited view.
- Deleting `account_view` and restarting with `AUTO_SETUP=true` restores it without resetting the admin password.

#### R-START-5. Reachability, image binaries, and log hygiene (P0)

- Retry Postgres connection with backoff; exit non-zero if never ready.
- Do not fail solely because maintenance-DB `CREATE DATABASE` is unnecessary when the DB already exists.
- Invoke Prisma/seeds via `/app/backend/node_modules` (or install npm in the image).
- Logs must not include `DATABASE_URL`, `JWT_SECRET`, or passwords.

#### R-START-6. Health check ordering (P0)

When `AUTO_SETUP` is on, start the API only after R-START-2–4 succeed. Public `/health` is not 200 during setup. Docker `HEALTHCHECK` start period must cover measured local cold setup.

### 4.4 Minimal seed and Super Admin login (Phase 1 P0)

`seedKernel.ts` remains the source of the login (`admin@example.com` / `admin123` on `org_kernel`, Super Admin). Password change already exists via `POST /api/auth/change-password`. There is no first-run screen today.

#### R-SEED-1. Keep the existing seeded login (P0)

No new default credential. Docs name the pair and require changing it.

#### R-SEED-2. Do not clobber identity on later boots (P0)

Restarts / second containers must leave password hash and `org_kernel` name / slug / currency as the user left them.

#### R-SEED-3. Password change is a hard gate (P0)

Until `user_kernel_admin`'s password no longer matches `admin123` (server-side bcrypt check; seed password not in the browser bundle), the shell shows only the password step. Uses existing change-password API; additionally reject new password `admin123`.

**Acceptance**

- Seed login → password step; deep links redirect there.
- After change, reload does not show the password step again.

### 4.5 Onboarding UI and API (Phase 1 P0)

Host-agnostic. Local Docker and Railway both hit the same routes and wizard.

`POST /api/admin/onboard-tenant` creates a **new** org and expects an `Admin` role this seed does not create. **Do not** use it for this wizard. Leftover title for `/settings/tenant-onboarding` in `AppLayout.tsx` is not an implementation.

#### R-ORG-1. First-run wizard (P0)

After the password gate: organization profile, then geography/chart **or skip chart** (R-COA-4). Resume incomplete step on re-login. When complete, home page; wizard does not return.

If R-ONBOARD-ERR applies, show the error page instead of any wizard step.

#### R-ORG-2. Profile step (P0)

Required: organization name → `org.name` for caller's org (`org_kernel`). Id and slug unchanged. Optional P1: timezone → `customer_timezone`. Reload `GET /api/metadata/user/me` after save.

Completion flags in `org.settings` JSON, e.g.:

```json
{
  "onboarding": {
    "profileCompleted": true,
    "geo": "us-ca",
    "chartCompleted": true,
    "chartSkipped": false
  }
}
```

Do not treat "name is not Kernel" alone as complete (that signal contributes to R-ONBOARD-ERR when flags are missing).

#### R-ORG-3. Net-new onboarding API (P0)

Super Admin only; act only on caller's `org_id`:

- `GET /api/admin/onboarding` — status (seed password still set?, profile/chart complete?, chart skipped?, inconsistent?, org fields, stored geo). No password material. When inconsistent, the payload (or a sibling error code) must be enough for the client to render the error page.
- `PATCH /api/admin/onboarding/organization` — `{ "name", "timezone"? }`.
- `POST /api/admin/onboarding/chart` — `{ "geo": "us-ca" | "india" }` or `{ "skip": true }` (R-COA-2, R-COA-4).

Do not call `onboard-tenant`.

### 4.6 Geography to chart of accounts (Phase 1 P0)

Use `seedChartOfAccounts` in `backend/lib/gl/seedChart.ts` (same as `npm run seed:coa`). Geos: `us-ca`, `india`. Do not use the 501 `setup-chart-of-accounts` / prod `COA_TEMPLATE_MAP`.

#### R-COA-1. Wizard geography (P0)

Two choices: United States / Canada (`us-ca`, USD); India (`india`, INR). Confirming calls the chart endpoint once and completes the wizard.

#### R-COA-2. Server uses `seedChartOfAccounts` (P0)

`POST /api/admin/onboarding/chart` calls `seedChartOfAccounts(geo, caller.orgId)`, sets org base currency to match, writes `settings.onboarding.geo` and `chartCompleted`. Client currency display must read `org.currency.code` or `org.base_currency` (today's `currency_master` fallback prints USD incorrectly).

#### R-COA-3. Idempotent chart, no silent currency flip (P0)

Same geo again: upsert, no duplicates. Different geo when `chart_seed` rows exist: **409**. CLI `seed:coa` unchanged for intentional retargeting.

#### R-COA-4. Skip the chart (P0)

The chart step offers **Skip** as a first-class exit (same priority as choosing a geo). Skip sets `chartCompleted: true` and `chartSkipped: true`, inserts no accounts, and does not change `base_currency`. The user can open Chart of Accounts and add rows by hand later (CLI `seed:coa` or the UI). Skip does not re-open the wizard on the next login.

**Acceptance**

- Skip finishes the wizard and leaves `account` empty for that org.
- `GET /api/admin/onboarding` reports chart complete with skipped true.
- A later visit does not trap the user in the wizard.

## 5. Non-functional requirements

### Security

- `JWT_SECRET` and `DATABASE_URL` come from the environment (local flags/files or Railway variables). Never commit them.
- Seed password stays the known public demo login; mitigation is the in-app password gate plus docs.
- Onboarding routes authenticated, Super Admin only, not on `publicPaths`.
- Auto-setup logs omit connection strings and secrets.
- Phase 2: Postgres private; only the app domain is public.

### Idempotency

- Schema once, transactionally, while `organizations` missing.
- Identity seed while `user_kernel_admin` missing.
- View seeds while those views missing.
- Chart upsert on `(org_id, code)`; profile save updates name and keeps flags.

### Multi-instance race

Advisory lock around auto-setup so overlapping containers against one empty DB do not corrupt schema or reset the password. Local Phase 1 often runs one container; the lock still matters for restart overlap and for Phase 2 replica bumps.

### Health check timing

Public `/health` succeeds only after setup when `AUTO_SETUP` is on. Size Docker start period from a measured Phase 1 cold boot.

### Open-source constraints

- Phase 1 works from any clone with Docker + Postgres.
- Phase 2 template source must be a **public** GitHub repo (operator will publish / push this work there before template work).
- No real secrets in example env files.
- License decision remains with maintainers.

## 6. Proposed phases

### Phase 1 — local Docker + onboarding (implement next)

Build and test:

1. `AUTO_SETUP` in `start.sh` (R-ENV-*, R-START-*).
2. Password gate + org + geo/chart-or-skip wizard and APIs (R-SEED-*, R-ORG-*, R-COA-*, R-ONBOARD-ERR).
3. Compose example with `AUTO_SETUP=true` plus docs for `docker build` / `docker run` / Compose (R-LOCAL-*, R-ENV-2).
4. Non-destructive `setup:kernel` / `seedKernel` aligned with R-START-3 and R-ONBOARD-ERR.
5. Verification checklist R-LOCAL-3.

**Exit criteria:** An operator following the local Docker / Compose docs gets from empty Postgres to a named org with a chart **or** a deliberate chart skip, without Railway and without hand-running seed scripts when `AUTO_SETUP=true`. Inconsistent DBs show the error page (and CLI fails clearly) instead of guessing.

### Phase 2 — Railway template (after public repo)

Template + README button + health timing on Railway (R-DEPLOY-*). Reuses Phase 1 image and onboarding unchanged.

### Later — still "getting the books ready"

Not designed here beyond the boundary:

- Legal entity + ledger defaults (+ optional `ledger:prefill-entity-defaults`).
- Headquarters partial unique index.
- Opening balances; tax geography beyond five US states; fiscal year.
- Connections / datalake / sync secrets.
- Extra users / non–Super Admin roles; repaired `onboard-tenant` if needed.
- Changing geo after postings exist; multi-currency reporting vs chart currency.

### Explicitly untouched

Kernel tenancy, view/`data_graph` mechanics, generic CRUD, and “schema after `organizations` exists is reviewed SQL.”

## 7. Decisions and remaining open questions

### Decided (Phase 1)

| Topic | Decision |
|---|---|
| Existing DB with real use and no/partial `settings.onboarding` | **Inconsistent state** → error page + clear logging; do not infer complete; do not run the wizard (R-ONBOARD-ERR). |
| Chart skip | **P0** (R-COA-4). |
| Compose example | Ship with **`AUTO_SETUP=true`** (R-ENV-2). Image default when unset remains off. |
| Manual `setup:kernel` / `seedKernel` | **Same as inconsistent-state rule:** no silent password/org reset; fail with clear error + logging when a re-seed would clobber or the DB is inconsistent (R-START-3, R-ONBOARD-ERR). |
| India / US-CA base currency | Wizard sets org base currency to **INR** or **USD** to match the chosen chart (R-COA-2). Still the working assumption unless product reverses it before implement. |

### Still open (mostly Phase 2)

1. **License before the button.** Wait for a `LICENSE` file?
2. **Who publishes the template** and owns the button’s template code?
3. **Fabriq brand in the image** vs Kernel default for local `npm run dev`.
4. **Sync off in the template** until connections setup — confirm.
5. **Slug** stays `kernel` with no UI to change it — confirm.

## 8. References

Behavior this document relies on, as it exists in the tree today.

| Path | What it establishes |
|---|---|
| `Dockerfile` | Root image. Debian runtime, nginx, `postgresql-client`, Node without global npm, `CMD ["/start.sh"]`, health on `/health`. |
| `start.sh` | Requires `DATABASE_URL` and `JWT_SECRET`. Does not migrate today. |
| `nginx.conf` | `/health` → API health; `/api/` → API; else SPA. |
| `backend/railway.toml` | Nixpacks backend-only. Not the full-image path. |
| `backend/scripts/setup-kernel-db.js` | `setup:kernel` schema gate on `organizations`. |
| `backend/src/utils/setup/seedKernel.ts` | Seeded Super Admin login; upserts reset name/slug/password today. |
| `backend/lib/gl/seedChart.ts` | `us-ca` / `india` charts. |
| `backend/src/rest/adminRouter.ts` | `onboard-tenant` and 501 chart route — not the wizard contract. |
| `docs/operations/deploy.md` | Manual setup after boot today; update for `AUTO_SETUP` in Phase 1. |
| `docs/operations/database.md` | Schema freeze once `organizations` exists. |
| `SECURITY.md` | Change seeded password; do not commit secrets. |

Railway product behavior for Phase 2 (from Railway’s public docs): templates can provision Postgres + app; `${{Postgres.DATABASE_URL}}` and `${{secret()}}`; deploy button under “Publish and Share Templates.” Config-as-code `railway.toml` is not how the multi-service template is defined.
