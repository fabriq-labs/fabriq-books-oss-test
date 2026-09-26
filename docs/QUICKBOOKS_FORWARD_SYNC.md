# QuickBooks Online → Fabriq Forward Sync Guide

**Audience:** engineers and PSO setting up a tenant connection  
**Scope:** forward sync only (QuickBooks Online **into** Fabriq)  
**Last updated:** 2026-09-18

This is the operational how-to. Design decisions and field-mapping strategy live in:

- [QUICKBOOKS_INTEGRATION_TO_FABRIQ.md](./QUICKBOOKS_INTEGRATION_TO_FABRIQ.md) — illustrated setup (Intuit Playground → Airbyte → Fabriq Sync)
- [QUICKBOOKS_TO_FABRIQ_USER_GUIDE.md](./QUICKBOOKS_TO_FABRIQ_USER_GUIDE.md) — what syncs, field maps, and nested concepts (tax, invoice status, etc.)
- [backend/integrations/quickbooks/QUICKBOOKS_STRATEGY.md](../backend/integrations/quickbooks/QUICKBOOKS_STRATEGY.md)
- [docs/INTEGRATIONS.md](./INTEGRATIONS.md)
- [docs/RAILWAY_SYNC_SERVICE_IMPLEMENTATION.md](./RAILWAY_SYNC_SERVICE_IMPLEMENTATION.md)

---

## Table of contents

1. [What “forward sync” means](#1-what-forward-sync-means)
2. [Prerequisites](#2-prerequisites)
3. [Connect QuickBooks to Fabriq (step-by-step)](#3-connect-quickbooks-to-fabriq-step-by-step)
4. [What happens when you click Sync (end-to-end)](#4-what-happens-when-you-click-sync-end-to-end)
5. [Line-by-line: staging → batch → normalized → orchestrator](#5-line-by-line-staging--batch--normalized--orchestrator)
6. [Field mapping reference](#6-field-mapping-reference)
7. [Verify the sync worked](#7-verify-the-sync-worked)
8. [Troubleshooting](#8-troubleshooting)
9. [Checklist](#9-checklist)

---

## 1. What “forward sync” means

**Forward sync** = data flows **from QuickBooks Online into Fabriq**.

It does **not** push Fabriq records back to QuickBooks. That direction is **reverse sync** (Phase 2 for most entities; PO path is scaffolded under `backend/src/lib/integrations/quickbooks/`).

```
QuickBooks Online
       │
       ▼  (1) Airbyte Cloud extracts via QBO API
datalake.qb_*                 ← raw tables (customers, vendors, items, accounts)
       │
       ▼  (2) DBT staging views
datalake.stg_qbo_*
       │
       ▼  (3) DBT sync_batch + normalized models
public.customers / supplier / item_master / account
       │
       ▼
Fabriq UI / APIs / workflows
```

| Direction | Mechanism | Code location |
|-----------|-----------|---------------|
| **Forward** (QBO → Fabriq) | Airbyte + DBT | `backend/integrations/quickbooks/` |
| **Reverse** (Fabriq → QBO) | Direct API | `backend/src/lib/integrations/quickbooks/` |

Two credential stores on the same `source_system` row:

| Credential | Column | Used for |
|------------|--------|----------|
| QBO OAuth (`client_id`, `client_secret`, `refresh_token`, `realm_id`) | `connection_config` (encrypted) | Test Connection + reverse sync API |
| Airbyte API (`client_id`, `client_secret`, `connection_id`) | `extraction_config` (encrypted) | UI **Sync** button → trigger Airbyte jobs |

Without `extraction_config`, Test Connection can still succeed, but **Sync cannot run**.

---

## 2. Prerequisites

- Fabriq tenant (`org_id`) and admin login
- Intuit Developer app (QuickBooks Online)
- Airbyte Cloud workspace with access to write into Fabriq Postgres schema `datalake`
- Sync service deployed and reachable (see [RAILWAY_SYNC_SERVICE_IMPLEMENTATION.md](./RAILWAY_SYNC_SERVICE_IMPLEMENTATION.md))
- `ERP_CONFIG_ENCRYPTION_KEY` consistent between Node backend and Python sync service

---

## 3. Connect QuickBooks to Fabriq (step-by-step)

### Step A — Register an Intuit app and get OAuth credentials

1. Open [Intuit Developer Dashboard](https://developer.intuit.com/app/developer/dashboard).
2. Create or open a **QuickBooks Online** app.
3. Copy:
   - **Client ID**
   - **Client Secret**
4. Run the OAuth authorize flow once (OAuth Playground or your redirect URI) and capture:
   - **Refresh Token** — long-lived; rotates when refreshed
   - **Realm ID** (`realmId` on the OAuth callback) — company ID

| Field | Why it matters |
|-------|----------------|
| `client_id` / `client_secret` | Identify your Intuit app |
| `refresh_token` | Exchanged for short-lived access tokens (~1 hour) |
| `realm_id` | Required in every QBO path: `/v3/company/{realmId}/...` |
| `environment` | `sandbox` or `production` (default `production`) |

**API bases:**

- Production: `https://quickbooks.api.intuit.com`
- Sandbox: `https://sandbox-quickbooks.api.intuit.com`
- Token: `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`

---

### Step B — Create the connection in Fabriq UI

1. Open Fabriq → **Settings → Connections → New**.
2. Select **QuickBooks Online** (`system_type = quickbooks`).
3. Fill the form (defined in `frontend-1/src/pages/settings/CreateConnectionPage.tsx`):

   | UI label | Stored as |
   |----------|-----------|
   | Client ID | `connection_config.oauth.client_id` |
   | Client Secret | `connection_config.oauth.client_secret` |
   | Refresh Token | `connection_config.oauth.refresh_token` |
   | Company ID (Realm ID) | `connection_config.oauth.realm_id` |
   | Environment | `connection_config.oauth.environment` |

4. Click **Test Connection**.
   - Backend calls `testErpConnection('quickbooks', ...)` which uses `QuickBooksAPIClient` (e.g. expense accounts probe).
   - Success means OAuth + `realm_id` are valid for that environment.
5. Save. Fabriq inserts/updates `public.source_system` with:
   - `system_type = 'quickbooks'`
   - `is_active = true`
   - encrypted `connection_config`
   - `org_id` of the current tenant

Note the saved row’s **`id`** (e.g. `srcsys_xxx`) — you need it in Step D.

---

### Step C — Airbyte Cloud connection (extraction)

Forward sync does **not** pull master data through the Node QBO client. Airbyte does the extract.

1. In Airbyte Cloud, create a **QuickBooks** source (same company OAuth / credentials).
2. Destination = Fabriq PostgreSQL, schema **`datalake`**.
3. Enable Phase 1 streams:

   | Stream | Raw table |
   |--------|-----------|
   | Customers | `datalake.qb_customers` |
   | Vendors | `datalake.qb_vendors` |
   | Items | `datalake.qb_items` |
   | Accounts | `datalake.qb_accounts` |

4. Prefer **incremental** sync on `MetaData.LastUpdatedTime`.
5. Copy the Airbyte **connection UUID**.

---

### Step D — Attach Airbyte config to the Fabriq connection

From `backend/`:

```bash
export AIRBYTE_CLIENT_ID="your_airbyte_client_id"
export AIRBYTE_CLIENT_SECRET="your_airbyte_client_secret"
# optional:
# export AIRBYTE_API_BASE="https://api.airbyte.com"

npx ts-node scripts/set-extraction-config.ts \
  --source-system-id "srcsys_xxx" \
  --airbyte-connection-id "airbyte_connection_uuid"
```

Script: `backend/scripts/set-extraction-config.ts`.

What it writes (encrypted) into `source_system.extraction_config`:

```json
{
  "type": "airbyte",
  "client_id": "...",
  "client_secret": "...",
  "connection_id": "...",
  "api_base": "https://api.airbyte.com"
}
```

- `connection_id` = Airbyte connection UUID (not the QBO realm id).
- `api_base` is optional; defaults to `https://api.airbyte.com`.

---

### Step E — Run forward sync

**From UI (recommended):**

1. Open the QuickBooks connection detail page (`ConnectionDetailPage` — QuickBooks is in `SYNCABLE_SYSTEM_TYPES`).
2. Choose sync mode:

   | Mode | Behavior |
   |------|----------|
   | `full_sync` | Airbyte extract + DBT transform |
   | `extract_only` | Airbyte only |
   | `transform_only` | DBT only (raw data already in `datalake`) |

3. Click **Sync**.

**What the stack does:**

```
POST /api/source_system/:id/sync
  → last_sync_status = in_progress
  → Python sync service POST /sync
       → load & decrypt extraction_config
       → Airbyte: token → start job → poll until done
       → python run_dbt.py   (staging → integrations → normalized)
       → last_sync_status = success | error
```

**DBT-only (ops / Railway cron):**

```bash
cd backend/integrations/quickbooks
export org_id="your_org_id"
# DB_* or DATABASE_URL required
python run_dbt.py

# After an Airbyte full refresh, re-merge all staged rows:
FORCE_PROCESS_ALL=true python run_dbt.py
```

---

## 4. What happens when you click Sync (end-to-end)

| # | Stage | Who | Input | Output |
|---|--------|-----|-------|--------|
| 1 | UI trigger | Frontend | connection id + `sync_mode` | `POST /api/source_system/:id/sync` |
| 2 | Mark in progress | Node backend | `source_system` row | `last_sync_status = in_progress` |
| 3 | Extract | Airbyte Cloud (via sync service) | QBO API | `datalake.qb_*` |
| 4 | Stage | DBT `staging/stg_qbo_*.sql` | `qb_*` | `datalake.stg_qbo_*` views |
| 5 | Batch meta | DBT `integrations/sync_batch.sql` | staging | `datalake.sync_batch` |
| 6 | Normalize | DBT `normalized/*.sql` | staging + batch + `source_system` | `public.*` |
| 7 | Orchestrate | `run_dbt.py` | env (`org_id`, DB_*) | runs stages 4→6 in order |
| 8 | Status | Sync service | result | `last_sync_status = success \| error` |

Entity mapping (Phase 1):

| Staging | Normalized Fabriq table |
|---------|-------------------------|
| `stg_qbo_customers` | `public.customers` |
| `stg_qbo_vendors` | `public.supplier` |
| `stg_qbo_items` | `public.item_master` |
| `stg_qbo_accounts` | `public.account` |

---

## 5. Line-by-line: staging → batch → normalized → orchestrator

### 5.1 Staging — `stg_qbo_customers.sql`

File: `backend/integrations/quickbooks/dbt/models/staging/stg_qbo_customers.sql`

| Lines | What it does |
|-------|----------------|
| 4–8 | `config(materialized='view', schema='datalake')` — create a **view**, not a copy of data |
| 12–16 | Keep Airbyte lineage: `_airbyte_raw_id`, `_airbyte_extracted_at`, `_airbyte_generation_id`, `_airbyte_meta` |
| 19 | `"Id" as customer_id` — QBO primary key → snake_case |
| 22–30 | Core identity: `DisplayName`, `CompanyName`, name parts, `Active` |
| 33–37 | Nested JSONB: e.g. `"PrimaryEmailAddr"->>'Address'` → `primary_email` |
| 40–52 | Billing / shipping address fields from `"BillAddr"` / `"ShipAddr"` |
| 55–66 | Balance, payment method/term refs, tax flags |
| 69–70 | `"MetaData"->>'LastUpdatedTime'` → `last_updated_time` (incremental cursor) |
| 72 | `from source('datalake', 'qb_customers')` — Airbyte-landed raw table |

Same pattern for `stg_qbo_vendors`, `stg_qbo_items`, `stg_qbo_accounts`.

**Why staging exists:** QBO uses PascalCase and nested JSON; Fabriq and DBT normalized models need flat snake_case columns.

---

### 5.2 Sync batch — `sync_batch.sql`

File: `backend/integrations/quickbooks/dbt/models/integrations/sync_batch.sql`

| Lines / block | What it does |
|---------------|----------------|
| 4–9 | Incremental table in `datalake`, unique on `id` |
| 12–36 (`accounts_batch`) | One CTE per stream; same shape for customers / vendors / items |
| 14 | `md5(generation_id + min(extracted_at) + stream)` → stable batch `id` |
| 15–18 | Audit: `source_system_type = 'quickbooks'`, stream name, destination table |
| 21–26 | `row_count`, time window from `_airbyte_extracted_at` |
| 26 | `airbyte_job_id = _airbyte_generation_id::text` |
| 35 | `group by _airbyte_generation_id` — one batch per Airbyte generation |
| 112–120 | `UNION ALL` of all stream batches |
| 122–144 | Join `public.source_system` where `system_type = 'quickbooks'` and `is_active` |
| 146–152 | Incremental: skip batch ids already in `sync_batch` |

Normalized models join this so every Fabriq row gets `ingest_batch_id`.

---

### 5.3 Normalized — `customers.sql`

File: `backend/integrations/quickbooks/dbt/models/normalized/customers.sql`

| Lines | What it does |
|-------|----------------|
| 4–11 | Incremental **merge** into `public.customers`; unique key = `[source_record_id, source_system_id, org_id]` |
| 16–25 | Map staging → Fabriq columns (`customer_name`, address, phone, email, …) |
| 28–30 | Parse QBO timestamps → `created_at` / `modified_at` / `source_updated_at` |
| 33–35 | Lineage: `source_system_id`, `source_record_id` (= QBO `Id`), `ingest_batch_id` |
| 38 | `org_id` from DBT var injected by `run_dbt.py` |
| 47 | From `stg_qbo_customers` |
| 49–56 | Lateral join to `sync_batch` for this generation + stream `customers` |
| 58–65 | Lateral join to active `source_system` with `system_type = 'quickbooks'` |
| 68–69 | Only rows with a batch **and** `active = true` |
| 71–76 | Incremental: only rows newer than `max(source_updated_at)` unless `force_process_all` |

Parallel files: `supplier.sql`, `item_master.sql`, `account.sql`.

---

### 5.4 Orchestrator — `run_dbt.py`

File: `backend/integrations/quickbooks/run_dbt.py`

| Concept (in `main()`) | Behavior |
|-----------------------|----------|
| `load_env_file()` | Load `.env` / `env` under the integration folder (Railway env wins if already set) |
| `ensure_db_env_from_database_url()` | Derive `DB_HOST`, `DB_USER`, … from `DATABASE_URL` if needed |
| `validate_environment()` | Require `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| Require `org_id` | Passed as `--vars '{"org_id":"..."}'` into normalized models |
| `FORCE_PROCESS_ALL=true` | Sets `force_process_all` so incremental filters are skipped |
| `is_first_run()` | If key tables missing → `--threads 1` (avoid create deadlocks) |
| Stage **staging** | `dbt run --select staging.*` |
| Stage **integrations** | `dbt run --select integrations.*` (`sync_batch`) |
| Stage **normalized** | `dbt run --select normalized.*` + `org_id` vars |
| Post | Optional `restore_constraints.py`, then `dbt test` |

---

## 6. Field mapping reference

### Customers

| QBO | Staging | `public.customers` |
|-----|---------|-------------------|
| `Id` | `customer_id` | `source_record_id` |
| `DisplayName` | `display_name` | `customer_name` (fallback: company / `Unknown`) |
| `PrimaryEmailAddr.Address` | `primary_email` | `primary_email` |
| `PrimaryPhone.FreeFormNumber` | `primary_phone` | `primary_phone` |
| `BillAddr.Line1` | `billing_address_line1` | `customer_address` |
| `MetaData.LastUpdatedTime` | `last_updated_time` | `source_updated_at` |

### Vendors → suppliers

| QBO | Staging | `public.supplier` |
|-----|---------|-------------------|
| `Id` | `vendor_id` | `source_record_id` |
| `DisplayName` | `display_name` | `supplier_name` |
| `CompanyName` | `company_name` | `legal_name` |
| `BillAddr.Line1` | `billing_address_line1` | `supplier_address` |

### Items

| QBO | Staging | `public.item_master` |
|-----|---------|----------------------|
| `Id` | `item_id` | `source_record_id` |
| `Name` | `name` | `item_name` / `name` |
| `Sku` | `sku` | `item_code` |
| `UnitPrice` | `unit_price` | `unit_price` |
| `TrackQtyOnHand` | `track_qty_on_hand` | `stockable` |

### Accounts

| QBO | Staging | `public.account` |
|-----|---------|------------------|
| `Id` | `account_id` | `source_record_id` |
| `Name` | `account_name` | `name` |
| `AccountType` | `account_type` | `type` |
| `AccountSubType` | `account_sub_type` | `sub_type` |
| `CurrentBalance` | `current_balance` | `balance` |
| `ParentRef.value` | `parent_account_id` | `parent_account_id` |

Full mapping tables and Zoho/Xero comparisons: [QUICKBOOKS_STRATEGY.md](../backend/integrations/quickbooks/QUICKBOOKS_STRATEGY.md).

---

## 7. Verify the sync worked

Replace `<org_id>` with the tenant id.

```sql
-- Connection status
SELECT id, name, system_type, is_active, last_sync_at, last_sync_status
FROM public.source_system
WHERE system_type = 'quickbooks' AND org_id = '<org_id>';

-- Raw Airbyte landing
SELECT count(*) FROM datalake.qb_customers;
SELECT count(*) FROM datalake.qb_vendors;
SELECT count(*) FROM datalake.qb_items;
SELECT count(*) FROM datalake.qb_accounts;

-- Normalized Fabriq rows with lineage
SELECT customer_name, source_record_id, source_system_id, ingest_batch_id
FROM public.customers
WHERE org_id = '<org_id>' AND source_system_id IS NOT NULL
LIMIT 20;

SELECT supplier_name, source_record_id
FROM public.supplier
WHERE org_id = '<org_id>' AND source_system_id IS NOT NULL
LIMIT 20;
```

In the UI: connection detail should show `last_sync_status.status = success` and a fresh `last_sync_at`.

---

## 8. Troubleshooting

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| Test Connection fails | Bad OAuth / realm / environment | Refresh token, sandbox vs production, `realm_id` |
| Sync button missing / errors before Airbyte | No `extraction_config` | Re-run `set-extraction-config.ts` |
| `Failed to decrypt extraction_config` | Encryption key mismatch | Same `ERP_CONFIG_ENCRYPTION_KEY` on Node + sync service |
| Airbyte succeeds, Fabriq empty | DBT / `org_id` | Sync service logs; `org_id` env; `datalake.stg_qbo_*` row counts |
| Only some rows update | Incremental filter | After Airbyte full refresh use `FORCE_PROCESS_ALL=true` or `full_sync` with force path |
| Duplicate / wrong tenant data | Wrong `org_id` or multiple active QBO `source_system` rows | One active `quickbooks` connection per org; confirm `org_id` in DBT vars |

---

## 9. Checklist

- [ ] Intuit app created; refresh token + realm_id obtained
- [ ] Fabriq connection saved; **Test Connection** OK
- [ ] Airbyte source → Postgres `datalake`; streams land as `qb_*`
- [ ] `set-extraction-config.ts` run for that `source_system` id
- [ ] Sync service reachable; encryption key aligned; `org_id` available to DBT
- [ ] UI **Sync** with `full_sync` → `last_sync_status.success`
- [ ] Rows visible in `public.customers`, `supplier`, `item_master`, `account` with `source_record_id` set

---

## Related files (quick index)

| Path | Role |
|------|------|
| `frontend-1/src/pages/settings/CreateConnectionPage.tsx` | QBO form fields |
| `frontend-1/src/pages/settings/ConnectionDetailPage.tsx` | Sync button + modes |
| `backend/scripts/set-extraction-config.ts` | Write Airbyte `extraction_config` |
| `backend/integrations/sync_service/` | Airbyte trigger + poll + call DBT |
| `backend/integrations/quickbooks/run_dbt.py` | DBT stage runner |
| `backend/integrations/quickbooks/dbt/models/staging/` | Flatten QBO → snake_case |
| `backend/integrations/quickbooks/dbt/models/integrations/sync_batch.sql` | Ingest batch lineage |
| `backend/integrations/quickbooks/dbt/models/normalized/` | Merge into Prisma tables |
| `backend/src/lib/integrations/quickbooks/` | Reverse sync / API client (not forward extract) |
