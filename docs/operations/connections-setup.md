# Connections setup

This page is for the person who prepares a QuickBooks Online connection so other people can import. The day-to-day clicks — test, save, import, read the lists — are in [Connections](../modules/connections.md). Read that page to see what the bookkeeper does with the values you produce here.

QuickBooks Online is the connector the app implements today. The end-user guide talks about a connection in general and then about this connector, because it is the one on the form. The sections below are specific to QuickBooks and to Airbyte. A later connector can add its own section beside them: its own developer-app steps, its own landing tables, and the same Books screens on the other side.

You need a Books database that has already been through [Getting started](../getting-started.md), including `seed:connections`, and the `datalake` schema from [Database](./database.md).

## How the pieces fit

Books does not pull the full company file itself during an import. Three pieces cooperate:

1. **The connection in Books** stores QuickBooks OAuth credentials, encrypted, and stores the Airbyte client and connection id, also encrypted. The list view never selects those blobs.
2. **Airbyte** extracts QuickBooks and lands raw tables in the `datalake` schema of the same Postgres database Books uses.
3. **The sync service** is a Python process. In the Docker image it listens on `127.0.0.1:8090`. It asks Airbyte to sync when the run mode needs a pull, then runs the QuickBooks dbt project, which merges `datalake.qb_*` into the Books tables (`customer`, `invoice`, `payment_receipt`, and the rest).

dbt is not allowed to change tables in `public`. A guard in the dbt project refuses that DDL. Airbyte should write only to `datalake`.

```text
QuickBooks Online
    → Airbyte
    → datalake.qb_*
    → dbt (staging, then merge)
    → Books tables you see in the app
```

## Encryption key

Connection secrets are encrypted at rest. Generate a 32-byte key and put it in the environment of the API and of the sync process. They have to share it, or one of them cannot read what the other wrote.

```bash
python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
```

Set `ERP_CONFIG_ENCRYPTION_KEY` to that value in `backend/.env` (the API) and in the repo-root `.env` (the sync process and Docker). Do not commit either file. Rotating the key does not re-encrypt existing rows; treat a rotation as a new key for new saves, and plan to re-save connections if you replace it.

## Intuit application

The connection form needs a client id, a client secret, a refresh token, a company id, and an environment.

1. Create an app in the [Intuit developer dashboard](https://developer.intuit.com/). Note the client id and client secret for the environment you will use.
2. Authorize the app against the QuickBooks company and exchange the authorization code for a refresh token. Intuit’s OAuth playground, or a one-time authorization you run yourself, is enough. Books does not host that browser redirect. You paste the resulting refresh token into the connection form.
3. Copy the company id. Intuit returns it as `realmId` on the callback. The form labels it “Company ID (Realm ID)”.
4. Choose sandbox or production to match the company you authorized. A sandbox token will not talk to a production company.

On the connection form, enter those values, run **Test connection**, and save. The test is a live call. A new connection is not saved until the test succeeds. Afterward the detail page shows the company id and the environment, and it does not echo the secret or the refresh token.

## Airbyte workspace

Use Airbyte Cloud, or an Airbyte API you can reach, with a source of QuickBooks Online and a destination of the Books Postgres.

**Destination.** Same database as `DATABASE_URL`. Schema (namespace) `datalake`. Stream prefix `qb_`, so the customers stream lands as `datalake.qb_customers`. The dbt models read columns named as QuickBooks sends them (`Id`, `DisplayName`, `DocNumber`, and so on), plus Airbyte’s `_airbyte_raw_id`, `_airbyte_extracted_at`, `_airbyte_generation_id`, and `_airbyte_meta`. Some nested values (`MetaData`, `CurrencyRef`) are JSON. A destination that stores only an opaque blob, with no `Id` column, will not match these models.

**Source.** The QuickBooks source uses the same realm and OAuth client you saved on the connection. Keep the Airbyte source and the Books connection pointed at the same company.

**Streams to enable.** The destination table is the stream name with the `qb_` prefix.

| Airbyte stream | Destination table | Books records |
|---|---|---|
| `accounts` | `datalake.qb_accounts` | Accounts |
| `customers` | `datalake.qb_customers` | Customers |
| `vendors` | `datalake.qb_vendors` | Suppliers |
| `items` | `datalake.qb_items` | Items |
| `invoices` | `datalake.qb_invoices` | Invoices and lines |
| `tax_rates` | `datalake.qb_tax_rates` | Tax rates |
| `tax_codes` | `datalake.qb_tax_codes` | Tax groups |
| `tax_agencies` | `datalake.qb_tax_agencies` | Agency lineage used while mapping tax |
| `payments` | `datalake.qb_payments` | Payment receipts and applications |
| `credit_memos` | `datalake.qb_credit_memos` | Credit notes and lines |

Payments and credit memos are what fill the settlement lists. Without them, an import still loads customers and invoices, and the payments and credit notes lists stay empty. Deposits, bills, purchase orders, and journal entries are not mapped by this transform. Leave those streams off unless you are keeping the raw tables for your own use; dbt will not turn them into Books documents.

Copy the Airbyte **connection** UUID (the connection between that source and destination, not the QuickBooks company id) and an Airbyte **API** client id and secret. In the Books connection, open **Set up data import** and paste:

- Import connection ID — the Airbyte connection UUID
- API client ID and API client secret — the Airbyte application client
- API address — under Advanced, default `https://api.airbyte.com`. Change it only if your Airbyte API lives somewhere else.

Save. The page then shows “Import settings saved” and hides the values.

The same values can be written from the API if you are scripting setup. The route is `POST /api/source_system/<id>/extraction-config` with a JSON body of `airbyte_connection_id`, `client_id`, and `client_secret`. From `backend/` there is also:

```bash
npm run integrations:set-extraction-config -- \
  --source-system-id srcsys_xxx \
  --airbyte-connection-id <airbyte-connection-uuid>
```

That script loads `backend/.env`. It reads `AIRBYTE_CLIENT_ID` and `AIRBYTE_CLIENT_SECRET` from the environment, and it takes the connection ids from the flags above, not from `SOURCE_SYSTEM_ID` or `AIRBYTE_CONNECTION_ID` by themselves. Prefer the screen unless you are automating. Do not put those values in a committed file.

## Environment for the sync process

Local API development loads `backend/.env`. The Python sync process loads the repo-root `.env` when it can find one next to `backend/`. Docker and Railway inject the same names into the container environment. Keep them consistent.

| Variable | Role |
|---|---|
| `DATABASE_URL` | Books Postgres. Required. |
| `JWT_SECRET` | API sessions. Required by the image. |
| `AUTH_PROVIDER` | `local` for the seeded login. |
| `ERP_CONFIG_ENCRYPTION_KEY` | Encrypts connection secrets. Required once you save a connection. |
| `ENABLE_SYNC_SERVICE` | `true` in the image by default. Set it when you run the API yourself and want imports. |
| `SYNC_PORT` | Loopback port, default `8090`. |
| `SYNC_SERVICE_URL` | Where the API sends the import. Default `http://127.0.0.1:8090`. |
| `ORG_ID` | Used when you invoke dbt by hand. The import button passes the organization from the signed-in user. |

`AIRBYTE_CLIENT_ID`, `AIRBYTE_CLIENT_SECRET`, and `AIRBYTE_API_BASE` are inputs to `integrations:set-extraction-config` when you run it from `backend/` (that script loads `backend/.env`). `AIRBYTE_CONNECTION_ID` and `SOURCE_SYSTEM_ID` in the repo-root example are reminders for the flag values, not names the script reads on its own. The running import reads the encrypted copy stored on the connection, not these variables.

On a laptop, install the Python project once if you are not using the image:

```bash
cd backend/integrations && uv sync
uv run uvicorn sync_service.main:app --host 127.0.0.1 --port 8090
```

Leave that process running while you import. The API has to be able to reach `SYNC_SERVICE_URL`.

## Authorize the import

Each user who starts an import needs an API key stored on their user row. In the app: avatar → **My Profile** → **Generate new API key**. The key is shown once. The import does not ask you to paste it anywhere. The API sends the stored value to the sync service, and the sync service checks that it matches a user in the same organization. If you skip this step, the import responds that an API key was not found.

Generating a new key replaces the previous one. Anything you built that called the API with the old key has to be updated. The in-app import starts working with the new stored value immediately.

## Sync modes

The connection page exposes three modes. The API names, if you call `POST /api/source_system/<id>/sync` with `{ "sync_mode": "..." }`, are:

| UI label | `sync_mode` | What the service does |
|---|---|---|
| Import now | `full_sync` | Trigger the Airbyte sync, then run dbt. |
| Reprocess existing import | `transform_only` | Run dbt on whatever is already in `datalake`. Airbyte is not called. |
| Pull data only | `extract_only` | Trigger Airbyte and do not run the Books merge. |

`full_sync` and `extract_only` require the extraction config on the connection. `transform_only` does not.

For a one-off transform on a machine where the raw tables are already loaded, run dbt directly. This command does not call Airbyte; it only runs the merge.

```bash
cd backend/integrations
export ORG_ID=org_kernel
uv run python quickbooks/run_dbt.py
```

`ORG_ID` must be the tenant that owns the connection. The seeded tenant is `org_kernel`. `DATABASE_URL` has to be visible to the process; the runner reads the repo-root `.env` when that file sits next to `backend/`.

`SKIP_AIRBYTE=true` is a switch on the sync service, not on this command. When it is set, a `full_sync` or `extract_only` started from the app skips the Airbyte call and continues with whatever is already in `datalake`. Leave it unset for a normal import.

At the end of a dbt run the project links applications that arrived before their invoice or credit note, deletes application rows whose source line is gone for receipts included in the run, deletes credit-note lines in the same situation, and clears applications on receipts whose status is void. A second run of the same mode should settle on the same rows.

## Confirm the import

In the app, the connection shows a last-import time and a health badge. Then open the lists in [Connections](../modules/connections.md): customers, invoices, payments received, credit notes. An imported row has a source id.

If you query the database, filter by your organization id and avoid printing connection secrets. Useful checks are counts, not credentials:

```sql
SELECT id, name, last_sync_at, last_sync_status->>'status' AS status
FROM source_system
WHERE org_id = 'org_kernel';

SELECT count(*) FROM customer WHERE org_id = 'org_kernel' AND source_system_id IS NOT NULL;
SELECT count(*) FROM invoice WHERE org_id = 'org_kernel' AND direction = 'sales';
SELECT count(*) FROM payment_receipt WHERE org_id = 'org_kernel';
SELECT count(*) FROM credit_note WHERE org_id = 'org_kernel';
```

`last_sync_status` is a status object (success, error, in progress). It is not the OAuth token. `connection_config` and `extraction_config` are the encrypted blobs. Do not select them into a ticket or a log.
