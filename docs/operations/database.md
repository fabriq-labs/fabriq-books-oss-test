# Database

Books stores its data in PostgreSQL. The schema is the Prisma files under `backend/prisma/schema/`. Applying that schema, and changing it later, is a deliberate SQL step. This page is the one to follow for a local database and for the database behind a deployed container. It does not cover connector credentials; those are in [Connections setup](./connections-setup.md).

## Why the schema is applied as SQL

`npm run setup:kernel` (from `backend/`) is the supported way to create a new application database. It refuses to use the `postgres` maintenance database as the app database. It connects there only to run `CREATE DATABASE` when the name in `DATABASE_URL` does not exist yet. It then generates SQL from the Prisma schema with `prisma migrate diff` and applies that script with `psql`. It generates the Prisma client and seeds `org_system`, the `org_kernel` tenant, Super Admin, the US dollar, and the shell views.

`prisma db push` and `prisma migrate dev` are not part of this workflow. A push applies whatever the schema currently says, with no file you can read in review, and it will not create the partial indexes this project keeps in SQL. `migrate dev` would also start a migration history this repository does not use. The diff command above is only the generator inside `setup:kernel`. You do not run a migrate workflow yourself for day-to-day setup.

When the `organizations` table is already present, `setup:kernel` leaves every table alone and only re-runs the kernel seed. That is intentional. An existing database is updated by the SQL files below, not by asking setup to guess a diff against production data.

The `psql` client has to be on your `PATH`. The API process reads `DATABASE_URL` from `backend/.env`. Do not commit that file, and do not paste the URL into issues, logs, or docs.

## A new database

For a checkout that has never been set up:

```bash
cd backend && npm run setup:kernel
```

That creates the tables that are in the Prisma schema, including the ledger, sales, tax, and connection tables. It does not create the `datalake` schema the import pipeline uses, and it does not create partial unique indexes. After setup, apply the landing schema. It is safe to run more than once:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migration/2026-10-19/datalake_bootstrap.sql
```

Run that from `backend/`, with `DATABASE_URL` already exported or loaded. The file creates the `datalake` schema and a `sync_batch` table. It does not create the `qb_*` tables. Airbyte creates those when it first lands data. See [Connections setup](./connections-setup.md).

Then apply the headquarters rule, which Prisma cannot express. The file is idempotent:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migration/2026-10-18/entity_one_headquarters.sql
```

Two further constraints live in `prisma/migration/2026-10-20/ar_settlement_phase3_delta.sql` and are also outside what Prisma generates: a check that invoice applications are non-negative and credit-note applications are non-positive, and a unique index on `posting (org_id, posting_key)` for rows whose status is `active`. On a database that `setup:kernel` just built, do not run that whole file. It is an upgrade script for an older shape and includes statements that are not relevant to a fresh schema. If you want those two constraints, apply these statements on their own:

```sql
ALTER TABLE "payment_receipt_application"
  ADD CONSTRAINT "payment_receipt_application_signed_amount_check" CHECK (
    (
      "target_type" = 'invoice'
      AND "amount_applied" >= 0
      AND "credit_note_id" IS NULL
    )
    OR (
      "target_type" = 'credit_note'
      AND "amount_applied" <= 0
      AND "invoice_id" IS NULL
    )
    OR (
      "target_type" NOT IN ('invoice', 'credit_note')
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS "posting_org_posting_key_active_uidx"
  ON "posting"("org_id", "posting_key")
  WHERE "status" = 'active' AND "posting_key" IS NOT NULL;
```

If the constraint already exists, Postgres will say so. Skip it.

Seeds for the Books screens are separate commands (`seed:gl`, `seed:entities`, `seed:sales`, `seed:ar-settlement`, `seed:connections`). They write views. They are described in [Getting started](../getting-started.md).

## A database that already has tables

If `organizations` exists, `setup:kernel` will not add columns. The dated files under `backend/prisma/migration/` are the upgrades that brought an older database up to the schema in this tree. Read each file before you apply it. Apply only the files whose objects your database does not already have, in date order:

| File | What it is for |
|---|---|
| `2026-10-18/module1_delta.sql` | Entity address fields and exchange rates, on a database that did not have them. Not idempotent. |
| `2026-10-18/entity_one_headquarters.sql` | One headquarters entity per organization. Idempotent. |
| `2026-10-19/sales_universal_model_delta.sql` | Sales, tax, and connection tables on an older database. Read it before applying; it alters stub tables. |
| `2026-10-19/datalake_bootstrap.sql` | `datalake` schema and `sync_batch`. Idempotent. Required for import. |
| `2026-10-20/ar_settlement_phase3_delta.sql` | Settlement columns, credit-note applications, the signed-amount check, and the posting key index. Written as an upgrade. |
| `2026-10-20/wp5_entity_ledger_columns.sql` | Ledger default columns on `entity`, copied forward from an older `entity_ledger_settings` table if that table exists. |

A database created today by `setup:kernel` already contains the Prisma tables and columns. Replaying `module1_delta.sql` or the sales delta onto it will fail on objects that already exist. Use the “new database” steps instead.

After any SQL change, regenerate the client and restart the API. Routes are registered only when the process starts.

```bash
cd backend && npx prisma generate
```

## Adding a table later

New models go in the Prisma schema (`domain.prisma`, or a product file beside it such as `sales.prisma`). Follow [Adding a model](../kernel/adding-a-model.md): write the model with `org_id`, produce a SQL diff, apply that diff with `psql`, seed a view, restart the API, and add a form if the screen needs one. The kernel page is the procedure. It is written for any application on this engine. Books is one such application.

Do not put secrets into a view’s `data_graph`. The connections view omits `connection_config` and `extraction_config` for that reason. A list cannot redact a field it selected.
