# Open-source onboarding requirements

Status: requirements only. Merging this page does not implement deploy, startup, or UI behavior.

This document specifies the first path an open-source user takes from this public repository to a running Fabriq Books instance: a Railway template, an empty Postgres database brought up by the existing kernel setup contract, the seeded Super Admin login, and a short in-app setup that names the tenant and loads a chart of accounts. It is written for the people who will implement that path and for the maintainer who publishes the template.

The audience of the product is a person who can click a deploy button and sign in, and who knows enough bookkeeping to recognize a chart of accounts. They are not expected to run `psql`, `railway ssh`, or the seed scripts by hand.

## 1. Goal / audience

A new operator should be able to:

1. Deploy this repository to their own Railway project from a button on the root README.
2. Receive a private Postgres service and one app service built from the root `Dockerfile`, with `DATABASE_URL` wired to that database.
3. Have the container create the schema and the minimum seed on first boot when the database is empty, and leave an existing database's tables alone.
4. Sign in as the seeded Super Admin (`admin@example.com` / `admin123`, the login `backend/src/utils/setup/seedKernel.ts` already prints) and be required to change that password.
5. Enter the tenant organization name and choose a geography.
6. Land in Books with that organization's chart of accounts loaded (the same 53-account trees as `npm run seed:coa -- us-ca` or `india`).

Operators who already deploy with the CLI in [docs/operations/deploy.md](../operations/deploy.md) keep that path. The image must not start applying schema on boot unless they opt in.

## 2. Out of scope (v1)

v1 gets a named organization and a chart onto the seeded tenant. It does not configure the rest of the books.

- Legal entities, headquarters, addresses, and ledger default accounts. The entity form already exists; the wizard does not collect them.
- Tax rates, tax groups, tax regions beyond what `seed:sales` already inserts, and entity tax settings.
- Opening balances, journals, exchange rates, and `npm run seed:books-demo`.
- A second organization, extra users, roles, or an invitation flow.
- QuickBooks, Airbyte, `datalake` bootstrap, and `ERP_CONFIG_ENCRYPTION_KEY`. The connections screen can stay in the sidebar and remain empty.
- The partial unique index for one headquarters entity, and the other hand-written SQL files under `backend/prisma/migration/`. A database created by `setup:kernel` already has the Prisma tables. Those files are upgrades or extras, as [docs/operations/database.md](../operations/database.md) describes.
- Changing `prisma db push` / `prisma migrate` policy. Setup continues to apply generated SQL. It does not introduce a migrate history.
- Billing, subscriptions, logo upload, and `erp_system_type`.
- Multi-tenant SaaS provisioning. `POST /api/admin/onboard-tenant` creates another org and is not the v1 wizard (see R-ORG-3).
- Publishing a license. This repository has no `LICENSE` file. That decision stays with maintainers (see open questions). This document does not choose one.
- The GitHub Actions workflow `.github/workflows/deploy-railway.yml`. That workflow redeploys an existing service from the `prod` branch. It is a maintainer path, not the open-source button.

## 3. User journey

Happy path, from the public README to a chart the user can open.

1. The reader opens the repository README and clicks **Deploy on Railway**. Railway asks them to confirm the template in their own account. They do not need a token from this repo.
2. The template creates two services: a Postgres service named `Postgres`, and the app service. The app builds the root `Dockerfile` with the repository root as the build context. Railway assigns a public HTTPS domain to the app service only. Postgres stays on the private network.
3. The app service receives `DATABASE_URL=${{Postgres.DATABASE_URL}}`, a generated `JWT_SECRET`, `AUTH_PROVIDER=local`, `NODE_ENV=production`, and `AUTO_SETUP=true`.
4. The container starts `/start.sh`. Postgres may still be starting. The entrypoint waits until the database accepts connections, sees that `public.organizations` is missing, applies the schema in one transaction, and seeds the kernel identity plus the Books view metadata. It does not load the chart and it does not load demo journals.
5. Nginx starts only after that setup succeeds. `https://<app-domain>/health` returns 200. The browser shows the sign-in page.
6. The user signs in as `admin@example.com` / `admin123`. The shell then blocks on a first-run flow:
   1. Change the password. The new password must satisfy the rules already enforced by `POST /api/auth/change-password`.
   2. Enter the organization name. This updates `org_kernel`. The internal id and slug stay `org_kernel` and `kernel`.
   3. Choose a geography: United States / Canada (`us-ca`) or India (`india`). The server loads that chart onto `org_kernel` and sets the organization's base currency to USD or INR to match.
7. The user arrives on the home page. The sidebar and the avatar menu show the organization name they entered, and the menu shows the chart currency. Accounting → Chart of Accounts lists the seeded accounts (code, name, classification, currency). Transactions, entities, sales lists, and connections are empty and usable later. No entity, tax registration, or connector is required to finish this path.

A second deploy, a restart, or a second replica must not drop tables, must not rewrite the password, and must not rename the organization back to "Kernel".

Manual operation remains available when `AUTO_SETUP` is off: the container starts, refuses to serve a useful login until someone runs `npm run setup:kernel` inside it, and the operator follows [docs/operations/deploy.md](../operations/deploy.md). That manual command, as implemented today, re-runs `seedKernel.ts` and overwrites the seeded user's password and the `org_kernel` name. Operators who have finished onboarding must not re-run it expecting it to be a no-op (see R-SEED-2 and open questions).

## 4. Requirements by area

Priorities: **P0** is required for the happy path above. **P1** is part of this same effort and is not required to finish that path. Later work is in section 6, not here.

### 4.1 Railway template and README button

Today there is no Railway template and no deploy button. The supported Railway path is the CLI in [docs/infrastructure/BUILD_AND_DEPLOY.md](../infrastructure/BUILD_AND_DEPLOY.md) and [docs/operations/deploy.md](../operations/deploy.md): `railway add`, a project `RAILWAY_TOKEN`, and a one-off `railway ssh` to run `setup:kernel`. The root of the repo has a `Dockerfile` and no `railway.toml`. `backend/railway.toml` sets `builder = "nixpacks"`, `buildCommand = "npm install && npm run build"`, and `startCommand = "npm start"`. That file describes a backend-only process. It is not the deploy path for the image that serves the web app and the API.

#### R-DEPLOY-1. Two-service public template (P0)

Publish a Railway template the README can link to. The template contains:

- A Postgres service whose name is exactly `Postgres`, using Railway's Postgres template. Private networking only. No public TCP proxy.
- One app service whose source is this Git repository, whose root directory is the repository root, and whose builder is `DOCKERFILE` with the root `Dockerfile`. The start command stays the image `CMD` (`/start.sh`). The template does not set a Railpack build, does not set root directory `backend/`, and does not apply `backend/railway.toml`.

Railway's docs say a new service defaults to Railpack unless the builder is set, and this repo's deploy guide records the same fact. The template sets the builder explicitly so a click does not depend on auto-detection. Railway also says it will build with a Dockerfile when it finds one; the explicit setting is still required so a future config file cannot silently select Nixpacks.

**Acceptance**

- Deploying the template creates both services in the clicker's project and builds an image from the root `Dockerfile`.
- The running process is nginx in front of the API, as the Dockerfile and `nginx.conf` define. It is not `npm start` from `backend/railway.toml`.
- The app can open the private `DATABASE_URL`. The database is not reachable from the public internet through the template.
- A maintainer project token is not required to click the button, and the template contains no token.

#### R-DEPLOY-2. Variables (P0)

The app service variables are:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | `${{secret()}}` (Railway template function; generated once per template deploy, not stored in git) |
| `AUTH_PROVIDER` | `local` |
| `NODE_ENV` | `production` |
| `AUTO_SETUP` | `true` |
| `ENABLE_SYNC_SERVICE` | `false` for this template (P1, R-DEPLOY-5) |

`PORT` is the platform variable Railway already injects. `start.sh` maps it to nginx. The API keeps listening on `BACKEND_PORT` 4000 inside the container. The template must not unset that split.

Variable descriptions in the template composer tell the operator what each one does. `AUTO_SETUP` describes the empty-database behavior in R-START-1. No variable's committed or default value is a database URL, a JWT, a project token, or a password other than the already-public seed login, and the seed password is not a template variable.

**Acceptance**

- After deploy, the app's `DATABASE_URL` resolves through the `Postgres` service reference. Renaming that service is a template change: the reference uses the service name.
- `JWT_SECRET` differs across two deploys of the template and is not a string checked into the repository.
- The sign-in adapter is local. The seeded user can log in after setup.

#### R-DEPLOY-3. Health check and public URL (P0)

The app service has a Railway health check of `GET /health` and public HTTP networking with a generated domain. `/health` is the nginx location that proxies to `127.0.0.1:4000/api/health` (`nginx.conf`). The image `HEALTHCHECK` hits the same URL.

The health check window must cover a cold start that includes schema setup (R-START-6). The image today uses `--start-period=90s`, and `start.sh` gives the API 30 seconds before it starts nginx anyway. Those limits are for a process that does not migrate. v1 raises the Docker start period and the Railway health check timeout to sit above a measured cold setup on this schema. The document does not fix a number of seconds; the implementer measures one empty-database boot and sets both windows above that measurement.

**Acceptance**

- A fresh template deploy becomes healthy without `railway ssh`.
- `/health` returns 200 only after R-START setup has succeeded when `AUTO_SETUP` is true. A failed setup exits the container non-zero and does not serve the sign-in page against an empty database.
- Opening the generated domain in a browser shows the sign-in page.

#### R-DEPLOY-4. README button (P0)

The root `README.md` includes Railway's deploy button, using the markdown Railway documents for a published template (`https://railway.com/button.svg` linking to `https://railway.com/new/template/<template-code>`). The template code is the one Railway assigns at publish time. This requirements page does not invent that code.

The README section states, in a few sentences, that the button provisions Postgres and the app, that the first sign-in is `admin@example.com` / `admin123`, and that the password must be changed immediately. It links to [docs/getting-started.md](../getting-started.md) for a local checkout and to [docs/operations/deploy.md](../operations/deploy.md) for the CLI path. It does not paste a database URL or a `RAILWAY_TOKEN`.

[docs/operations/deploy.md](../operations/deploy.md) gains a short pointer to the template so the two paths are visible together. The CLI steps stay.

**Acceptance**

- The button on the default branch opens this template.
- The README still tells a local reader how to run `setup:kernel` and `npm run dev`.
- No secret is added to the README.

#### R-DEPLOY-5. Template defaults that match v1 scope (P1)

- `ENABLE_SYNC_SERVICE=false`. The image defaults this to true and starts the Python sync service on loopback. v1 onboarding does not configure Airbyte or the datalake schema. Leaving the sync process on produces a service that cannot import and that expects secrets the template does not have.
- The frontend build in the image applies the Fabriq Books brand (`frontend-0/config/scripts/select-brand.js fabriq`, as [docs/getting-started.md](../getting-started.md) describes for local dev) so the shell label is Fabriq Books. The Dockerfile today does not run that script, and the deploy guide notes that the image label stays "Kernel". Routes and data stay the same.
- The template tracks the repository default branch once this work is merged, with root directory `/`.

**Acceptance**

- A template deploy does not require `ERP_CONFIG_ENCRYPTION_KEY` to become healthy.
- The signed-in shell shows the Fabriq Books name without a manual brand command inside the container.

### 4.2 Container auto-setup / `start.sh`

Today `/start.sh` exits if `DATABASE_URL` or `JWT_SECRET` is missing, starts the API, optionally starts the sync service, waits up to 30 seconds for `http://127.0.0.1:4000/api/health`, and then starts nginx even if the API never answered. It does not inspect the database. [docs/operations/deploy.md](../operations/deploy.md) says the container does not apply the schema on boot.

`backend/scripts/setup-kernel-db.js` (`npm run setup:kernel`) is the schema contract:

- It refuses a `DATABASE_URL` whose database name is `postgres`.
- It connects to the maintenance database to `CREATE DATABASE` when the target name is absent.
- It checks `SELECT to_regclass('public.organizations') IS NOT NULL`. When that is not true, it generates SQL with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema --script` and applies it with `psql`. When the table exists, it logs that it is leaving the schema in place.
- It always runs `npx prisma generate` and `npx ts-node --transpile-only src/utils/setup/seedKernel.ts` afterwards.

The runtime image installs `postgresql-client` and copies the `node` binary. It does not copy a global `npm` or `npx` (`Dockerfile` copies `/usr/local/bin/node` only). `setup-kernel-db.js` invokes `npx`. The backend tree in the image includes `node_modules` (the builder runs `npm ci`, and `prisma` is a production dependency). An auto-setup path has to call the existing script with binaries that exist in the image.

`GET /api/health` returns `{ status: 'healthy' }` and does not query Postgres (`backend/src/rest/routes.ts`).

#### R-START-1. `AUTO_SETUP` gate (P0)

`start.sh` reads `AUTO_SETUP`. The values `true` and `1` turn setup on. Unset, empty, `false`, and `0` leave today's behavior: no schema work, then start the processes. The image default stays off so existing deploys do not change. The Railway template sets `true` (R-DEPLOY-2).

When the flag is on, setup runs before the API process and before nginx. A non-zero setup status aborts the container (`set -e` already wraps the script). The "start nginx anyway" branch must not run after a failed setup.

The same flag works for `docker run` and for Railway, because both enter through `/start.sh`.

**Acceptance**

- `AUTO_SETUP` unset: container behavior matches the current entrypoint, and an empty database still has no `organizations` table until someone runs setup.
- `AUTO_SETUP=true` on an empty database: after the process is healthy, `public.organizations` exists and the seeded user can log in.
- `AUTO_SETUP=false` on a template-sized deploy does not apply SQL.

#### R-START-2. Empty-database detection and schema rule (P0)

When `AUTO_SETUP` is on, the entrypoint uses the same predicate as `setup-kernel-db.js`: `public.organizations` missing means apply the generated schema; present means do not alter tables. No other DDL runs on this path. In particular the entrypoint does not run `prisma db push`, `prisma migrate deploy`, or the dated files in `backend/prisma/migration/`.

Apply the generated script in a single database transaction. The current script runs `psql -f` statement by statement. A failure halfway can leave `organizations` in place, and the next boot would then skip the rest of the tables. A rolled-back failure leaves the predicate false so the next boot can retry.

If `organizations` exists and required kernel or Books metadata is still missing, the entrypoint may run the idempotent seeds in R-START-3 and R-START-4. It still must not alter tables.

**Acceptance**

- First boot against an empty database creates the Prisma schema, including ledger and sales tables.
- A boot against a database that already has `organizations` issues no `CREATE`/`ALTER`/`DROP` on application tables.
- Killing the process during schema apply leaves `organizations` absent, and the following boot can apply the schema.
- A database whose name is `postgres` still fails fast with the existing error. Railway's plugin database name is not `postgres`; the template URL passes this check.

#### R-START-3. Kernel seed only when the seeded user is absent (P0)

The first successful setup creates the rows `seedKernel.ts` already creates: `org_system`, `org_kernel`, the US dollar (`curr_kernel_usd`), the Super Admin role, the user `user_kernel_admin` (`admin@example.com`), and the shell views.

`seedKernel.ts` upserts overwrite `org_kernel.name` back to `Kernel`, `slug` back to `kernel`, and the user's `password` back to the bcrypt hash of `admin123` on every run. Calling that function on every container start would undo onboarding and the password change.

Auto-setup runs that identity seed only when the seeded user row is absent. When the user row exists, auto-setup does not update the password, the email, the org name, the slug, or `basecurrency_id`.

The manual `npm run setup:kernel` command can keep its current always-reseed behavior until the open question in section 7 is decided. Auto-setup must not depend on that behavior changing.

**Acceptance**

- After the first boot, `admin@example.com` can sign in with `admin123`.
- After the user changes the password and the organization name, a restart with `AUTO_SETUP=true` still authenticates with the new password, and `org_kernel.name` is still the name they saved.
- A database that has `organizations` but is missing `user_kernel_admin` (seed failed after the schema commit) gets the identity seed on the next boot and does not get a second schema apply.

#### R-START-4. Books view seeds on first boot (P0)

Kernel views are enough to sign in and open the shell admin screens. The Books sidebar reads product views that `setup:kernel` does not create. [docs/getting-started.md](../getting-started.md) runs these after setup, and each script refuses to run until the Super Admin role exists:

| Script | Views the lists need |
|---|---|
| `npm run seed:gl` | `account_view`, `posting_view` |
| `npm run seed:entities` | `entity_view`, `exchange_rate_view` |
| `npm run seed:sales` | `customer_view`, `invoice_view`, `item_master_view`, `supplier_view`, `tax_master_view`, `tax_group_view`, `tax_region_view` |
| `npm run seed:ar-settlement` | `payment_receipt_view`, `credit_note_view` |
| `npm run seed:connections` | `source_system_view` |

Auto-setup runs a script when any of its views is missing, from `/app/backend`, with `DATABASE_URL` already in the environment (`seed:gl` and `seed:entities` do not load `backend/.env` themselves). It does not run them on a later boot once those views exist, so a restart does not rewrite a view an operator has edited.

`seed:sales` also inserts five US state tax regions (California, New York, Texas, Washington, Florida). That stays a side effect of making the tax-region list non-empty, including for an India chart. v1 does not make those rows geography-specific.

Auto-setup does not run `seed:coa` or `seed:books-demo`. The chart is the in-app step (R-COA-1). Demo journals are out of scope.

**Acceptance**

- After first boot, a Super Admin session can open Chart of Accounts, Transactions, Entities, the sales lists, and Connections without a "no columns" failure. The lists are empty of business rows.
- A restart does not change an account view that was edited after boot.
- Deleting `account_view` and restarting with `AUTO_SETUP=true` restores it without altering tables and without resetting the admin password.

#### R-START-5. Reachability, image binaries, and log hygiene (P0)

- Retry connection failures with backoff while Postgres is still starting, then exit non-zero if it never accepts connections. A missing `organizations` table is not a connection failure.
- When the database named in `DATABASE_URL` already exists, setup succeeds even if connecting to the `postgres` maintenance database is unnecessary. Railway's plugin creates the database before the app boots. The current script always opens that maintenance database first; the auto-setup path must not fail a healthy Railway URL on that step.
- Invoke Prisma and the seed runner through the copies in `/app/backend/node_modules`, or install `npm`/`npx` in the runtime image. Do not assume a global `npx`.
- Setup logs may include the database name and the step that ran. They must not include `DATABASE_URL`, `JWT_SECRET`, or the password. The current script puts the URL in the `psql` argument list; the auto-setup path needs a form that does not echo it (for example `PGPASSWORD` and a connection without the secret in the logged command). Do not write the URL into `/app/backend/logs`.

**Acceptance**

- Starting the app and Postgres together still reaches a healthy deploy once Postgres accepts connections.
- A boot log from a template deploy can be pasted into a public issue without revealing the database URL or the JWT.
- Setup runs in the stock runtime image, which has `psql` and `node` and does not have a global `npx` unless this work adds one.

#### R-START-6. Health check ordering (P0)

When `AUTO_SETUP` is on, the API process starts only after R-START-2 through R-START-4 have succeeded. `/api/health` may stay a liveness response with no schema query. Liveness is meaningful because the process is not listening yet during setup.

The Docker `HEALTHCHECK` start period and the Railway health check timeout follow R-DEPLOY-3.

**Acceptance**

- During schema apply, the public `/health` endpoint is not yet 200.
- After success, `/health` is 200 and login works.
- A seed failure produces a non-zero container exit and a Railway deployment that is not marked successful.

### 4.3 Minimal seed and Super Admin login

`seedKernel.ts` is the source of the login. It upserts:

- `org_system` (name System, slug `system`) for shared defaults.
- `org_kernel` (name Kernel, slug `kernel`, base currency USD pointing at `curr_kernel_usd`).
- Role `Super Admin` on `org_system` (`role_kernel_super_admin`).
- User `user_kernel_admin`, email `admin@example.com`, name Kernel Admin, `auth_provider` local, `org_id` `org_kernel`, password `bcrypt.hash('admin123', 10)`.
- `role_user` `rous_kernel_admin` tying that user to Super Admin on `org_kernel`.

`isSuperAdmin` is true when any of the user's roles has a name containing `super admin` (`backend/src/auth/platformAdmin.ts`). This user qualifies. Platform admin is what guards workflow-definition writes and `/api/agent/admin/*`. The seeded user is the only user v1 creates.

Password change already exists: My Profile calls `POST /api/auth/change-password` (`frontend-0/src/api/metadataApi.ts`, `frontend-0/src/components/layout/MyProfileModal.tsx`). The handler requires the current password and a new password of at least 8 characters, with at least one digit and one non-alphanumeric character (`backend/src/auth/routes.ts`). `admin123` does not meet that policy, so it cannot be submitted as the new password. The handler does not otherwise reject setting the password back to the seed value if the policy were ever relaxed. There is no `must_change_password` column.

There is no first-run screen. `frontend-0/src/components/layout/AppLayout.tsx` has a title string for `/settings/tenant-onboarding` and no route renders that path. `frontend-0/src/domain/routes.tsx` does not register it.

#### R-SEED-1. Keep the existing seeded login (P0)

v1 does not add a user, an email, or a password. The first sign-in is `admin@example.com` / `admin123` on `org_kernel`. Copy in the README, the template description, and the deploy guide names that pair and says to change it before anyone else can reach the site. The in-app wizard does not print the seed password; the user types the current password into the change form.

**Acceptance**

- A fresh auto-setup database matches the seed rows above.
- No second credential appears in the repo, the image, or the template.

#### R-SEED-2. Do not clobber identity on later boots (P0)

This is the auto-setup rule in R-START-3, restated as a product guarantee. Restarting the container, redeploying the template, or scaling a second replica must leave the password hash and `org_kernel.name` / `slug` / `basecurrency_id` as the user left them.

**Acceptance**

- Change the password, restart the service, and sign in with the new password only.
- The sign-in error for `admin123` after the change is the normal invalid-credentials response.

#### R-SEED-3. Password change is a hard gate (P0)

Until the seeded user's password no longer matches `admin123`, the authenticated shell shows the password step and does not open the rest of the app. The check runs on the server, comparing the stored hash with bcrypt. The browser bundle does not contain the seed password.

The step calls the existing `POST /api/auth/change-password`. It does not add a second password API. The client sends the current password and the new password. The server keeps the current length, digit, and symbol rules. Additionally, the new password must not be `admin123`.

Detect "still the seed password" only for the seeded user id `user_kernel_admin`. Any other user is unaffected.

After a successful change, My Profile remains the place to change it again. The wizard does not ask a second time unless the hash matches the seed again.

**Acceptance**

- Signing in with the seed password routes to the password step. Deep links into Accounting redirect there as well.
- A new password that fails the existing policy is rejected with the existing error text.
- Submitting `admin123` as the new password is rejected.
- After a successful change, reloading the app does not show the password step, and My Profile can change it again.
- `GET` responses used by the gate do not include the password hash or the seed password.

### 4.4 Onboarding UI and API (tenant org details)

There is no wizard. The closest server route is `POST /api/admin/onboard-tenant` in `backend/src/rest/adminRouter.ts`, mounted at `/api/admin` behind `authMiddleware` (`backend/src/rest/routes.ts`). It is Super Admin only. It creates a new `org` whose id is `org_<slug>`, requires one or more new admin users with emails and passwords, and looks up a role named `Admin`. The kernel seed does not create an `Admin` role, so this handler returns 500 with "Run setup-metadata to seed roles" on a database this repo can actually build. The new org is not the caller's org, and the session stays on `org_kernel`. The frontend client `adminAPI.onboardTenant` in `frontend-0/src/api/superAdminApi.ts` calls this route. Nothing in `frontend-0/src` renders a page that uses it.

The `org` model (`backend/prisma/schema/metadata.prisma`) has `name`, `slug` (unique), `settings` (string), `customer_timezone`, `base_currency`, and `basecurrency_id`. There is no country column and no org view in `seedKernel.ts`. Tenancy treats `org` as unscoped (`docs/kernel/tenancy.md`): a read has no org predicate. v1 still must not let the wizard edit `org_system` or an arbitrary org id.

The sidebar logo and the avatar menu read `user.org.name` from `GET /api/metadata/user/me` (`frontend-0/src/hooks/useUserData.ts`, select in `RestService.getByAuthId`). That handler returns `org.name` and `org.currency` (`code`, `name`, `symbol`). The menu's currency suffix does not read those fields. It reads `user.org.currency_master.base_currency` and, when that object is absent, displays USD. The inline title next to the sidebar logo that would also show the name is commented out in `TopBar.tsx`. After the wizard saves, the client has to reload the current user or the shell keeps the previous name until the next full sign-in. Showing INR or USD from the chart also takes a client read of `org.currency.code` or `org.base_currency`, because `currency_master` is not on this payload.

`org.settings` is a string. The kernel seed writes `{}` on create and does not update it on later upserts. v1 may store a small JSON object in that string. No other code reads it today.

#### R-ORG-1. First-run wizard (P0)

After the password gate, the authenticated shell shows a short wizard before the home page. Net-new route, registered from the Books domain routes. The leftover title in `AppLayout.tsx` is not an implementation of this screen.

Steps:

1. Password (R-SEED-3).
2. Organization profile (R-ORG-2).
3. Geography and chart (R-COA-1).

The user can move back from the chart step to the name step before they finish. Closing the browser and signing in again resumes the first incomplete step.

When the server says onboarding is complete, the home page loads and the wizard does not run again.

**Acceptance**

- A fresh login walks password, then name, then geography, then the home page.
- Refreshing mid-wizard returns to the incomplete step.
- A completed org does not see the wizard on the next login.
- The screen is reachable only when signed in.

#### R-ORG-2. What the profile step writes (P0)

The profile step collects:

- Organization name, required, stored on `org.name` for the caller's org. For this seed that id is `org_kernel`.
- Nothing else that is required.

v1 does not ask for a slug, a legal entity, an address, a tax id, or another user. `id` stays `org_kernel`. `slug` stays `kernel`. Those values are internal. The name is what the sidebar and the avatar menu show.

Optional on the same step (P1): IANA timezone, stored on `org.customer_timezone`. The shell already falls back to UTC when it is null.

On success the client reloads `GET /api/metadata/user/me` (the call `userAPI.getCurrentUser` already makes) so the sidebar and the avatar menu show the new name without a manual logout.

Completion is recorded in `org.settings` as JSON, merged with any existing object, under a single key so later settings are not wiped. Suggested shape:

```json
{
  "onboarding": {
    "profileCompleted": true,
    "geo": "us-ca",
    "chartCompleted": true
  }
}
```

`geo` and `chartCompleted` are written by the chart step. The profile step sets `profileCompleted`. Detecting completion by "name is not Kernel" is not sufficient: a company may be named Kernel.

**Acceptance**

- Saving a name persists it on `org_kernel`. After the me payload reloads, the sidebar logo and the avatar menu show that name.
- `org_system` is unchanged.
- `slug` is still `kernel` and the user's `org_id` is still `org_kernel`.
- A second save updates the name and keeps `profileCompleted` true.
- An empty name is rejected and does not set the flag.

#### R-ORG-3. Net-new onboarding API, not `onboard-tenant` (P0)

Add endpoints on the existing admin router. They do not exist today. They require an authenticated Super Admin (the same `isSuperAdmin` check the onboard-tenant handler uses) and they act only on `req` user's `org_id`.

Proposed contract:

- `GET /api/admin/onboarding`  
  Returns whether the password still matches the seed, whether the profile is complete, whether the chart is complete, the caller's org `id`, `name`, `slug`, `base_currency`, and the stored `geo` if any. No password material.

- `PATCH /api/admin/onboarding/organization`  
  Body `{ "name": string, "timezone"?: string }`. Updates that org. Sets `profileCompleted`. Does not create an org, a user, or a role.

- `POST /api/admin/onboarding/chart`  
  Body `{ "geo": "us-ca" | "india" }`. Specified in R-COA-2.

`POST /api/admin/onboard-tenant` stays as it is and is not called by the wizard. Implementing the wizard by creating a second org would strand the session on `org_kernel` and would 500 while the `Admin` role is absent. Do not seed an `Admin` role just to make that handler work.

There is no org view to update through `PATCH /api/org/view/...`. v1 does not add one. The dedicated route is the write path because it also owns the onboarding flags and must refuse `org_system`.

**Acceptance**

- An anonymous call gets 401. A signed-in user who is not Super Admin gets 403.
- The PATCH updates the caller's org only. A body that includes a different org id cannot redirect the write.
- The wizard's network calls are the three routes above plus the existing change-password route. It does not call `onboard-tenant`.
- OpenAPI or a short comment on the handler states that these routes are Books onboarding, not kernel CRUD.

### 4.5 Geography to chart of accounts

The working seeder is `seedChartOfAccounts` in `backend/lib/gl/seedChart.ts`, invoked by `backend/src/utils/setup/seedChart.ts`:

```bash
npm run seed:coa -- us-ca
npm run seed:coa -- india
npm run seed:coa -- us-ca org_kernel
```

The default org id is `org_kernel`. Accepted geos are the keys of `CHARTS`: `us-ca` and `india`. Templates are `backend/lib/gl/charts/us-ca.json` and `backend/lib/gl/charts/india.json`. Both trees are the same 53 accounts. The geo chooses the currency written on each row: `us-ca` uses USD (`curr_kernel_usd`, already created by the kernel seed); `india` uses INR and creates `curr_kernel_inr` on `org_system` if that code is missing. Upsert is on `(org_id, code)`. Balances, account numbers, and entity links are left alone. A later run with the other geo updates those shared codes in place. It does not create a second tree. Account ids look like `acco_<orgId>_<code>` and must stay within 50 characters.

`POST /api/admin/setup-chart-of-accounts` returns 501 with "Domain setup endpoints are added by the domain, not the kernel." Above that return, `COA_TEMPLATE_MAP` still names prod paths (`prisma/setup-IN`, `prisma/setup-US_CA`, `prisma/setup-PERFIN`, `prisma/setup-NRI`) and template keys `indian`, `us-ca`, `perfin`, `nri-india`, `nri-canada`. Those paths are not the seeder this repo runs. The client types in `superAdminApi.ts` mirror the dead contract and require an `entityId`. `seedChartOfAccounts` does not take an entity id. Accounts it creates leave `entity_id` null, which is what a company-wide chart is in this model.

#### R-COA-1. Wizard geography (P0)

The chart step offers two choices, labeled in plain language:

- United States / Canada, value `us-ca`, currency USD.
- India, value `india`, currency INR.

The labels match [docs/modules/ledger.md](../modules/ledger.md) and [docs/getting-started.md](../getting-started.md). No other template is offered. Perfin and NRI charts are not part of v1.

Confirming the choice calls the chart endpoint once and then marks the wizard complete.

**Acceptance**

- Each choice results in 53 accounts on the caller's org, with the currency named above, visible on Accounting → Chart of Accounts.
- The account codes match a CLI run of `seed:coa` for that geo on an org that had no accounts.
- The UI does not offer `indian`, `perfin`, `nri-india`, or `nri-canada`.

#### R-COA-2. Server uses `seedChartOfAccounts` (P0)

`POST /api/admin/onboarding/chart` (R-ORG-3) validates `geo` with the existing `parseChartGeo` helper (or by calling `seedChartOfAccounts`, which already rejects unknown geos) and calls:

```ts
seedChartOfAccounts(geo, caller.orgId)
```

It does not shell out to `npm run seed:coa`. It does not read `COA_TEMPLATE_MAP`. It does not require an entity.

On success it sets the caller's `base_currency` and `basecurrency_id` to the currency the seeder used (USD/`curr_kernel_usd` or INR/`curr_kernel_inr`), and it writes `settings.onboarding.geo` and `chartCompleted: true`. v1 is one reporting currency, the same currency as the chart. (If product later wants an INR chart under a USD reporting currency, that is the books-demo arrangement and it is out of this wizard.)

The 501 handler and the unused template map are removed or left unwired. The wizard does not call them. Update `SetupChartOfAccountsPayload` in `superAdminApi.ts` only if something still imports it; do not keep a second client contract that posts `entityId` and `coaTemplate`.

**Acceptance**

- Unknown `geo` returns 400 and does not write accounts.
- The handler is Super Admin only and uses the caller's org id. A posted `orgId` is ignored.
- INR is created on `org_system` when missing, which is what `ensureCurrency` already does. The kernel USD row is reused, not duplicated.
- After India is applied, `org.base_currency` is `INR` and `basecurrency_id` is the INR row. The avatar menu shows INR. That requires the menu to read `org.currency.code` (returned by `getByAuthId`) or `org.base_currency`. The current fallback through `currency_master` always prints USD when that object is missing, so leaving the client unchanged fails this check.
- Response includes the counts the function already returns (`created`, `existing`, `total`, `currencyCode`) so the UI can confirm what happened.

#### R-COA-3. Idempotent chart, no silent currency flip (P0)

Running the same geo again upserts and does not duplicate codes (`@@unique([org_id, code])` on `account`).

If accounts with `source_system_id = chart_seed` already exist for this org and the stored geo differs from the requested geo, the endpoint refuses the change with 409. Switching geo rewrites `currency_id` on the shared codes. That is acceptable from the CLI, where the operator typed the command, and it is not acceptable as a second click in the wizard after books exist. v1 has no "replace chart" UI.

If the user has hand-entered accounts and no chart seed rows, the endpoint still runs the upsert. Codes that collide update the seeded fields the function already updates. The wizard copy says that a matching code will be updated.

**Acceptance**

- Two submits of `us-ca` yield one row per code and a second response whose `created` count is 0.
- `us-ca` followed by `india` through this endpoint returns 409 and leaves the USD currency on the existing rows.
- The CLI `npm run seed:coa` is unchanged and can still retarget codes when an operator runs it on purpose.

#### R-COA-4. Skip the chart (P1)

The chart step can be skipped. Skip sets `chartCompleted` true and `chartSkipped` true and does not insert accounts. The user can open Chart of Accounts and add rows by hand, which is the path getting-started already describes when `seed:coa` was not run. Skip does not set `base_currency`. The happy path in section 3 still applies a chart; skip is the exit for someone who will import or type a chart later.

**Acceptance**

- Skip finishes the wizard and leaves `account` empty for that org.
- A later visit does not trap the user in the wizard. Loading a chart after skip is a later action (the CLI, or a future settings control), not a v1 requirement.

## 5. Non-functional requirements

### Security

- The template generates `JWT_SECRET` with Railway's `${{secret()}}` function. It is not a value in git. Rotating it signs everyone out; the template does not rotate it on each deploy of an existing project. `${{secret()}}` is evaluated when the template is deployed, which is the behavior Railway documents for template functions.
- The template does not embed `DATABASE_URL` literals, `RAILWAY_TOKEN`, or a private Postgres proxy. Operators who use the CLI path keep tokens in gitignored `.env` files, as [docs/infrastructure/BUILD_AND_DEPLOY.md](../infrastructure/BUILD_AND_DEPLOY.md) already requires. `railway variable list` output stays out of logs and docs.
- The seed password is the one already published in `seedKernel.ts` and the public docs. v1 adds no other default secret. The password gate (R-SEED-3) is mandatory before the rest of the shell. [SECURITY.md](../../SECURITY.md) already says to change this password before anyone else can reach the process. The wizard is how the one-click path enforces that.
- Onboarding routes are authenticated and Super Admin only. They are not added to `publicPaths`.
- Auto-setup logs omit connection strings and secrets (R-START-5).
- Postgres is private in the template. The app domain is the only public listener.

### Idempotency

- Schema: apply once, transactionally, only while `public.organizations` is missing (R-START-2).
- Identity seed: only while `user_kernel_admin` is missing (R-START-3).
- View seeds: only while that script's views are missing (R-START-4). Re-running the scripts themselves stays safe, as getting-started already says; auto-setup still skips them when the views are present so it does not clobber edits.
- Chart: upsert on `(org_id, code)` (R-COA-3).
- Organization profile: saving again updates the name and keeps the completion flag.

### Multi-instance race

Railway can run more than one replica, and a restart can overlap a previous container. Auto-setup takes a Postgres advisory lock for the whole setup sequence and holds it until the schema transaction and the seeds have finished. Other replicas wait on that lock, then re-read the gates and skip work that is already done. They do not start the API until they have either finished setup or observed that setup is already complete.

The template's app service is configured as a single replica. The lock is still required, because deploys overlap and because an operator can raise the replica count later.

**Acceptance**

- Two containers starting together against one empty database end with one schema, one admin user, and one set of views. Neither logs a duplicate-key failure as the reason the deploy failed.
- The replica that loses the lock still becomes healthy after the winner finishes, and it does not reset the password.

### Health check timing

Covered by R-DEPLOY-3 and R-START-6. The public health URL is `/health`. It becomes successful only after setup when `AUTO_SETUP` is on. The start period must be sized from a measurement of this repository's schema plus the five view seeds, not copied from the current 90 second figure.

### Open-source constraints

- The template source is this public git repository. Anyone with a Railway account can deploy it. Do not point the template at a private fork or at the maintainer's existing project.
- The button is the Railway-documented public button. The template code is created when a maintainer publishes the template; it is not a secret, and it is safe to commit in the README once it exists.
- Default credentials in a public template are the known seed. The mitigation is the in-app password gate plus the README warning, not a per-deploy random admin password (that would be a new secret the docs would have to reveal somehow).
- No `LICENSE` file exists. The README already says not to assume a license. Shipping the button on a public default branch still waits on the maintainer's license decision if they consider the license a blocker; this document does not add a license.
- Example env files stay placeholders. This work does not add a real `DATABASE_URL` or token to the tree.

## 6. Proposed phases

### v1 — basic, this document

One-click Railway template, `AUTO_SETUP` on first boot, seeded Super Admin, forced password change, organization name, `us-ca` or `india` chart, base currency aligned with that chart. Books screens that need views are registered and empty. The user can browse the chart.

### Later — still "getting the books ready"

Not designed here beyond the boundary. Each item needs its own pass.

- Legal entity: name, currency, headquarters flag, and the five ledger default accounts. Those fields already exist on the entity form. A later wizard step can create the first headquarters entity and, once the chart exists, offer `ledger:prefill-entity-defaults` rather than asking the user to hunt for account ids.
- The headquarters partial unique index (`backend/prisma/migration/2026-10-18/entity_one_headquarters.sql`), applied as its own idempotent statement.
- Opening balances for that entity.
- Tax: whether India vs US/CA should seed different tax regions than the five US states `seed:sales` inserts today.
- Fiscal year, only if the product stops assuming January–December.
- Connections: `datalake_bootstrap.sql`, `ENABLE_SYNC_SERVICE=true`, `ERP_CONFIG_ENCRYPTION_KEY`, and the Intuit / Airbyte steps in [docs/operations/connections-setup.md](../operations/connections-setup.md).
- Additional users and a role that is not Super Admin. That is the point where a repaired `onboard-tenant` might matter. It is a different job from naming `org_kernel`.
- Changing geo after postings exist, including what happens to balances and journals when `currency_id` on the shared codes changes.
- Multi-entity reporting currency that differs from the chart currency (the arrangement `seed:books-demo` uses).

### Explicitly untouched

Kernel tenancy, view/`data_graph` mechanics, the generic CRUD API, and the rule that schema changes after `organizations` exists are reviewed SQL files.

## 7. Open questions / decisions needed

These are the choices this document does not close. Everything else in sections 4 and 5 is the proposed requirement.

1. **Manual `setup:kernel` overwrite.** Auto-setup will not re-run the destructive upserts. The manual command still resets `org_kernel` to the name Kernel and the password to `admin123`. Should `seedKernel.ts` itself stop updating password, name, and slug when the row already exists, so an operator cannot wipe a finished setup by following the deploy guide a second time?
2. **Base currency on the India chart.** v1 sets `org.base_currency` to INR when the user picks India, and to USD for `us-ca`. `seed:books-demo` instead leaves the organization at USD and converts INR. Confirm the wizard should follow the chart currency.
3. **Chart skip.** R-COA-4 makes skip a P1. If the happy path must allow "I will type my own accounts" before the feature is done, promote it to P0.
4. **License before the button.** The root README says not to assume a license until a `LICENSE` file exists. Should the deploy button wait for that file?
5. **Who publishes the template.** The button URL needs a template code from Railway's publish step, in some Railway workspace. Which account owns the public template, and who updates it when the default branch changes?
6. **Fabriq brand in the image.** R-DEPLOY-5 bakes the brand at image build so one-click users do not see "Kernel". Confirm that the Docker image should diverge from the checked-in `frontend-0/src/config` default, which is still the kernel brand for local `npm run dev`.
7. **Sync service off in the template.** R-DEPLOY-5 sets `ENABLE_SYNC_SERVICE=false` so v1 does not boot a sync process with no datalake and no connector secrets. Confirm that operators who want QuickBooks later will turn the variable on themselves after following the connections setup guide.
8. **Slug.** v1 never edits `slug` (`kernel`). Confirm the product does not need a public company slug in this release.

## 8. References

Behavior this document relies on, as it exists in the tree today.

| Path | What it establishes |
|---|---|
| `Dockerfile` | Root image. Debian runtime, nginx, `postgresql-client`, Node binary without a global npm, `CMD ["/start.sh"]`, health check on `/health`, 90s start period. Frontend build does not select the Fabriq brand. |
| `start.sh` | Requires `DATABASE_URL` and `JWT_SECRET`. Does not migrate. Starts the API on port 4000, optionally the sync service, then nginx on `PORT`. |
| `nginx.conf` | `/health` proxies to `127.0.0.1:4000/api/health`. `/api/` proxies to the API. Other paths are the SPA. |
| `backend/railway.toml` | Nixpacks backend-only config. Not the full-image deploy. |
| `backend/scripts/setup-kernel-db.js` | `setup:kernel`. Creates the database, applies Prisma SQL only when `public.organizations` is missing, always re-seeds. |
| `backend/src/utils/setup/seedKernel.ts` | `org_system`, `org_kernel`, Super Admin, `admin@example.com` / `admin123`, shell views. Upserts reset name, slug, and password. |
| `backend/package.json` | Scripts `setup:kernel`, `seed:gl`, `seed:entities`, `seed:sales`, `seed:ar-settlement`, `seed:connections`, `seed:coa`, `seed:books-demo`. |
| `backend/src/utils/setup/seedChart.ts` | CLI `seed:coa`. Default org `org_kernel`. |
| `backend/lib/gl/seedChart.ts` | Geos `us-ca` and `india`, 53-account JSON templates, currency, upsert on `(org_id, code)`. |
| `backend/lib/gl/charts/us-ca.json`, `backend/lib/gl/charts/india.json` | The two templates. |
| `backend/src/utils/setup/seedGl.ts`, `seedEntities.ts`, `seedSales.ts`, `seedArSettlement.ts`, `seedConnections.ts` | Books views. `seed:sales` also inserts five US tax regions. |
| `backend/src/rest/adminRouter.ts` | `POST /api/admin/onboard-tenant` creates a new org and needs an `Admin` role. `POST /api/admin/setup-chart-of-accounts` returns 501. Prod `COA_TEMPLATE_MAP` is unused. |
| `backend/src/rest/routes.ts` | Mounts `/api/admin` behind auth. `/api/health` does not touch the database. |
| `backend/src/auth/routes.ts` | `POST /api/auth/change-password` policy. |
| `backend/src/auth/platformAdmin.ts` | Super Admin is a role name containing `super admin`. |
| `backend/src/auth/publicPaths.ts` | Public paths are login and the two health URLs. |
| `backend/prisma/schema/metadata.prisma` | `org` columns, including `settings`, `customer_timezone`, `base_currency`. Table name `organizations`. |
| `backend/prisma/schema/domain.prisma` | `account` unique `(org_id, code)`. |
| `frontend-0/src/domain/routes.tsx` | No onboarding route. |
| `frontend-0/src/components/layout/AppLayout.tsx` | Title string for `/settings/tenant-onboarding` only. |
| `frontend-0/src/api/superAdminApi.ts` | Client for `onboard-tenant` and the 501 chart route. Not used by a page. |
| `frontend-0/src/components/layout/MyProfileModal.tsx` | Existing password-change UI. |
| `backend/src/rest/RestService.ts` | `GET /api/metadata/user/me` selects `org.name` and `org.currency`. It does not select `currency_master`. |
| `frontend-0/src/hooks/useUserData.ts` | Sidebar and avatar menu use `user.org.name`. Currency display reads `currency_master` and falls back to USD. |
| `frontend-0/src/components/layout/TopBar.tsx` | Avatar menu shows organization and currency. The inline title that would repeat them is commented out. |
| `frontend-0/src/domain/navigation.ts` | Sidebar groups that need the view seeds. |
| `docs/getting-started.md` | Local setup, seed order, demo login, `seed:coa` behavior. |
| `docs/operations/deploy.md` | Image layout, manual `setup:kernel` after boot, Railway CLI variable reference. |
| `docs/operations/database.md` | Why `organizations` existing freezes the schema, and which SQL files are extras. |
| `docs/infrastructure/BUILD_AND_DEPLOY.md` | CLI-level Railway steps and the root-Dockerfile rule. |
| `docs/kernel/tenancy.md` | `org_system` vs `org_kernel`. `org` is unscoped. |
| `docs/kernel/auth.md` | Local login, Super Admin, public paths. |
| `docs/modules/ledger.md` | Chart of accounts and the two seed geos. |
| `docs/concepts.md` | Organization vs entity. |
| `SECURITY.md` | Change the seeded password; do not commit secrets. |
| `README.md` | Product entry. No deploy button yet. States that no `LICENSE` file exists. |

Railway product behavior the template depends on, from Railway's public docs rather than this repo: a template can provision Postgres and an app together; a variable reference `${{Postgres.DATABASE_URL}}` reads `DATABASE_URL` from the service named `Postgres`; `${{secret()}}` generates a secret when the template is deployed; the deploy button markdown is documented under Railway's "Publish and Share Templates" page. Config-as-code `railway.toml` configures a single service and is not how this template should be defined. This repo does not vendor those pages.
