# Getting started

This page takes a new checkout from an empty database to a signed-in Books shell with the ledger and sales lists registered. Connector setup (Intuit, Airbyte, encryption keys) is not part of this path. You can explore entities, the chart, customers, and reports without a connection. When you want imported data, read [Connections](./modules/connections.md) and then [Connections setup](./operations/connections-setup.md).

## What you need

Install Node.js 20 or newer, npm, PostgreSQL, and the `psql` client. The setup script shells out to `psql` and expects it on your `PATH`. PostgreSQL itself is not started by this repository. Version 14 or newer matches the client used in the Docker image.

The example database URL is `postgresql://kernel:kernel@localhost:5432/kernel_app`. That user and database do not have to be the ones you use. They are the placeholders in `backend/.env.example`. If you prefer them, create the role before setup. The role needs permission to create a database, because setup connects to the `postgres` maintenance database and creates `kernel_app` when it is missing.

```sql
CREATE USER kernel WITH PASSWORD 'kernel' CREATEDB;
```

If you already have a superuser you trust for local work, put that user in `DATABASE_URL` instead and skip the `CREATE USER`.

## Environment files

The API process is started with its working directory set to `backend/`, and it loads `backend/.env`. Copy the example and edit the two values that identify your machine:

```bash
cp backend/.env.example backend/.env
```

`DATABASE_URL` is the application database. `JWT_SECRET` signs the local login cookie's token; any long random string is fine on your laptop. `AUTH_PROVIDER=local` selects the built-in login, which is the path this guide uses.

A second file, the repo-root `.env`, is read by the Python sync process and is the file you pass into Docker. You do not need it to sign in and click around. Create it when you follow [Connections setup](./operations/connections-setup.md), and keep `DATABASE_URL` and `JWT_SECRET` identical to `backend/.env` so the API and the sync process talk to the same database.

The web dev server proxies `/api` to `http://localhost:4000`. Leave `VITE_API_BASE_URL` unset. Copying `frontend-0/.env.example` is optional.

## Install dependencies and create the schema

From the repository root:

```bash
npm run install:all
cd backend && npm run setup:kernel
```

`install:all` installs the root, backend, and `frontend-0` packages. `setup:kernel` is the schema step. On an empty server it creates the database named in `DATABASE_URL`, generates SQL from `backend/prisma/schema`, applies that SQL, generates the Prisma client, and seeds the shell. The seed creates:

- `org_system`, the organization that owns shared defaults
- `org_kernel`, the tenant you log into
- a Super Admin role and the user `admin@example.com` with password `admin123`
- one US dollar currency on `org_system`
- the views the shell needs for users, roles, views, permissions, currencies, and workflows

Do not run `prisma db push` or `prisma migrate` for this. Setup applies reviewed SQL on purpose. The reason, and what to do when `organizations` already exists, is in [Database](./operations/database.md).

`setup:kernel` does not register the Books lists. Those are a second set of commands. They are safe to re-run.

## Seed the Books screens

From `backend/`, load `backend/.env` into the shell first. The API’s dev script and most of the seed scripts load that file themselves. `seed:gl` and `seed:entities` do not, and they need `DATABASE_URL` in the environment:

```bash
cd backend
set -a
. ./.env
set +a
npm run seed:gl
npm run seed:entities
npm run seed:sales
npm run seed:ar-settlement
npm run seed:connections
```

Each command writes views, permissions, and role links on `org_system`. It does not invent a second API. After it runs, the Master list for that model has columns.

| Command | What you gain |
|---|---|
| `seed:gl` | Chart of accounts and the transactions (postings) list. |
| `seed:entities` | Entities and exchange rates. |
| `seed:sales` | Customers, invoices, items, suppliers, and tax rates, groups, and regions. It also inserts a short list of US state tax regions so the tax region screen is not empty. |
| `seed:ar-settlement` | Payments received and credit notes, including the application fields the API can read. |
| `seed:connections` | The connections list. Credential and extraction payloads are omitted from this view so secrets are not returned as list columns. |

Two further commands load sample numbers. They are optional. Skip them if you would rather enter your own chart.

```bash
npm run seed:coa -- us-ca
npm run seed:books-demo
```

`seed:coa` loads a 53-account chart onto `org_kernel`. The argument `us-ca` stores the accounts in USD. `india` stores the same account codes in INR. An organization keeps one chart: running the other geography later updates those shared codes rather than creating a second tree.

`seed:books-demo` adds the US dollar and Indian rupee currencies if they are missing, two entities (Fabriq US, marked headquarters, and Fabriq India), INR-to-USD average and closing rates, a small USD chart on the US entity, and opening balances plus journals dated in 2026. Re-running it updates the same rows. With the organization base currency left at USD, the 2026 income statement shows US service revenue of 8,000.00, sales revenue of 1,428.00 (120,000 INR at 0.0119), US rent of 2,400.00, and rent of 428.40 (36,000 INR at 0.0119).

## Start the API and the UI

From the repository root:

```bash
npm run dev
```

That starts the API on port 4000 and the web app on port 5174. Open http://localhost:5174 and sign in as `admin@example.com` / `admin123`. This password is the local seed. Change it from My Profile (avatar menu) before anyone else can reach the machine.

The checked-in shell label is “Kernel”, because `frontend-0/src/config/config.json` is the kernel brand. The sidebar groups are still the Books screens. To put “Fabriq Books” on the window and the sidebar, stop the dev server and apply the brand once, then start again:

```bash
cd frontend-0 && node config/scripts/select-brand.js fabriq
cd .. && npm run dev
```

The command copies `frontend-0/config/fabriq/` over `frontend-0/src/config/`. It does not change routes or data.

## Where to click first

The home page is a set of counts: users, roles, views, permissions, currencies, the chart, transactions, entities, exchange rates, and workflows. It is a dashboard of those lists, not a close checklist. The work is in the sidebar.

1. **Accounting → Entities.** Open an entity, or create one if you skipped the demo seed. Set the name, the legal name, and the currency (USD is already seeded). The headquarters checkbox marks the entity that represents the group; the database can enforce one headquarters per organization once the partial index in [Database](./operations/database.md) is applied. The **Ledger defaults** section is five account dropdowns plus a ledger start date. Save the accounts you want on file for that entity. They are stored defaults. Filling them does not post journals by itself. If a synced chart is already loaded, `npm run ledger:prefill-entity-defaults -- --org org_kernel` (from `backend/`) can fill blank defaults from account names and types. It will not overwrite a default you already set, and it does not post.
2. **Accounting → Chart of Accounts.** After `seed:coa` or `seed:books-demo` you should see accounts. Otherwise use **New** and create a few accounts with a classification (asset, liability, equity, income, expense), a code, and a name.
3. **Accounting → Transactions** and **Opening Balances.** Transactions are postings: one debit account, one credit account, and an amount. Opening balances is a grid of balance-sheet accounts for one entity. Debits and credits must match in each account currency before it will save. The demo seed has already written 2026 journals if you ran it.
4. **Reports → Income Statement** (or Trial Balance, Balance Sheet, Cash Flow, Posting List). Choose the financial year. The default year is January–December. Pick the reporting currency and the entities. A row marked `rate_missing` means the exchange rate for that account currency and period is not in Exchange Rates.
5. **Sales → Customers**, then **Items**, **Tax**, and **Invoices**. Customers, items, suppliers, and tax have forms, so you can add a row and open it again. The invoice list shows invoices already stored. Opening one shows the header, the amounts, the open balance, and the lines. The payments and credit notes lists are the review screens for those documents.
6. **Integrations → Connections.** The list is empty until you create a connection. The day-to-day story is [Connections](./modules/connections.md). Nothing in that list talks to QuickBooks until an administrator has saved credentials and import settings.

The entity control in the top bar filters the transactions list to one entity, or to all entities. Reports have their own entity picker, so a report can include several entities in one reporting currency.

## If a list is empty or a save fails

A list with no columns usually means that model's seed has not been run, or the API is pointed at a different database than the one you seeded. Compare `DATABASE_URL` in `backend/.env` with the database you intended. Restarting the API is required after you add a Prisma model, because routes are registered only at process start. Restarting is not required after a view seed; refresh the browser.

`setup:kernel` refuses a `DATABASE_URL` whose database name is `postgres`. Point it at an application database.

Schema questions, including a database that already has `organizations` from an older checkout, belong in [Database](./operations/database.md).
