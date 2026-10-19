# QuickBooks Online → Fabriq Books forward sync

**Audience:** engineers setting up a single-tenant Books connection  
**Scope:** forward sync only (QBO → Fabriq)  
**Code:** `backend/integrations/{shared,sync_service,quickbooks}` (uv)  
**Schema targets:** universal models in [`SALES_MODEL.md`](./SALES_MODEL.md)

This is the Books/kernel port of prod’s `docs/QUICKBOOKS_FORWARD_SYNC.md`. Pipeline shape is the same (Airbyte → `datalake.qb_*` → dbt staging → sync_batch → normalized merge). What changed is **where it runs, how it is packaged, and which Prisma columns** it writes.

---

## What stayed the same

```
QuickBooks Online
       │  Airbyte Cloud
       ▼
datalake.qb_*
       │  dbt staging (stg_qbo_*)
       ▼
datalake.sync_batch
       │  dbt normalized (merge)
       ▼
public.customer / supplier / item_master / account / invoice / …
```

- `source_system.connection_config` = encrypted QBO OAuth  
- `source_system.extraction_config` = encrypted Airbyte client + connection UUID  
- Sync modes: `full_sync` | `extract_only` | `transform_only`  
- `prisma_guard` — dbt never DDL’s `public.*`

---

## What changed vs prod `QUICKBOOKS_FORWARD_SYNC.md`

| Topic | Prod | Books (this branch) |
|-------|------|---------------------|
| **Deploy** | Separate Railway **sync service** image | **Same Docker image** as nginx + Node; uvicorn on `127.0.0.1:$SYNC_PORT` (default 8090) |
| **Python tooling** | `pip` + `requirements.txt` | **`uv`** + `pyproject.toml` / `uv.lock` under `backend/integrations/` |
| **Env files** | `sync_service/.env` + integration `.env` | **Repo-root `.env`** (same keys injected in Docker). Prefer `DATABASE_URL` + `ERP_CONFIG_ENCRYPTION_KEY` |
| **Org var** | lowercase `org_id` | **`ORG_ID`** (legacy `org_id` still accepted) |
| **Customers table** | `public.customers` / `customer_name` | **`public.customer` / `name`** (+ `email`, `phone`, `postal_code`, …) |
| **Invoice** | `invoice_type=SALES`, `invoice_number`, `legal_entity_id`, `deliver_to`, float amounts | **`direction=sales`**, `number`, `entity_id`, `ship_to`, **`due_date`**, Decimal `net_amount` / `tax_amount` / `total_amount`, status `posted` |
| **Lines** | `instance_id`, no lineage | **`invoice_id`** + lineage unique key |
| **Location / HQ** | `is_it_headquartres` string; deterministic `loca_` id without lineage | **`entity.is_headquarters`**; location has **lineage** (`source_record_id` = address hash) |
| **payment_terms** | `payment_terms` / `no_of_days` columns | **`name` / `days`** |
| **account** | `type` array | **`account_types`** |
| **item_master** | `item_code`, `stockable` Y/N, `supplier_id` text | **`code`**, `is_stockable` bool, **`preferred_supplier_id`**, optional `tax_group_id` |
| **tax_*** | merge on `tax_code`/`code`; Int rate | lineage keys + **Decimal `rate`**; `is_active` bool |
| **source_system join** | any active quickbooks row | **scoped to `org_id`** |
| **UI** | `frontend-1` Connections pages | Not ported — use Node APIs / curl (Phase 2) |
| **set-extraction-config** | `backend/scripts/set-extraction-config.ts` | Ported: `npm run integrations:set-extraction-config` |
| **Node APIs** | Rest + Connections UI | `POST /api/source_system/connections`, `test-connection`, `:id/sync` via `lib/integrations/` |

---

## Local / Docker ops (Books)

```bash
# deps
cd backend/integrations && uv sync

# dbt only (raw already in datalake)
export DATABASE_URL=...   # or rely on repo-root .env
export ORG_ID=org_xxx
export SKIP_AIRBYTE=true
uv run python quickbooks/run_dbt.py

# HTTP sync (same process model as the container)
uv run uvicorn sync_service.main:app --host 127.0.0.1 --port 8090
```

### Phase 2 — save connection + trigger sync (Node)

```bash
# 1) Upsert QBO connection (JWT or X-API-Key auth)
curl -s -X POST "$API/api/source_system/connections" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "system_type": "quickbooks",
    "name": "QBO Sandbox",
    "oauth": {
      "client_id": "...",
      "client_secret": "...",
      "refresh_token": "...",
      "realm_id": "...",
      "environment": "sandbox"
    }
  }'

# 2) Test connection
curl -s -X POST "$API/api/source_system/test-connection" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"system_type":"quickbooks","connection_id":"srcsys_xxx"}'

# 3) Attach Airbyte extraction_config
cd backend
AIRBYTE_CLIENT_ID=... AIRBYTE_CLIENT_SECRET=... \
  npm run integrations:set-extraction-config -- \
  --source-system-id srcsys_xxx \
  --airbyte-connection-id <airbyte_uuid>

# 4) Generate a user API key once (required for sync proxy → Python)
curl -s -X POST "$API/api/auth/generate-api-key" -H "Authorization: Bearer $TOKEN"

# 5) Trigger sync
curl -s -X POST "$API/api/source_system/srcsys_xxx/sync" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sync_mode":"transform_only"}'
```

Container (`start.sh`):

- Starts Node `:4000`, sync `:8090` (loopback), nginx `:$PORT`
- `ENABLE_SYNC_SERVICE=true` (default), `SYNC_SERVICE_URL=http://127.0.0.1:8090` for the Node proxy

---

## Verify (SQL)

```sql
SELECT id, name, last_sync_at, last_sync_status
FROM public.source_system
WHERE system_type = 'quickbooks' AND org_id = '<org_id>';

SELECT name, source_record_id, ingest_batch_id
FROM public.customer
WHERE org_id = '<org_id>' AND source_system_id IS NOT NULL
LIMIT 20;

SELECT number, direction, due_date, net_amount, tax_amount, total_amount, status
FROM public.invoice
WHERE org_id = '<org_id>' AND direction = 'sales'
LIMIT 20;
```

---

## Related

- Design / phases: [`QBO_INTEGRATION_PLAN.md`](./QBO_INTEGRATION_PLAN.md)  
- Column include/park: [`SALES_MODEL.md`](./SALES_MODEL.md)  
- Prod operational guide (reference): `origin/prod:docs/QUICKBOOKS_FORWARD_SYNC.md`
