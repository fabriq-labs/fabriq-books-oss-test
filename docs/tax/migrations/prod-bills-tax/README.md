# Production migration — Bills tax (branch `agentc/bills-tax-analysis-e0b7`)

**Generated from commits on** `agentc/bills-tax-analysis-e0b7` vs base `cursor/entity-tax-settings-2c15`  
**Constraint:** Agent does **not** apply these to prod. You run them. Prefer a sandbox clone first.

Related: [BP3_PO_MODE_PROD_PLAN.md](../BP3_PO_MODE_PROD_PLAN.md) · [BILLS_TAX_IMPLEMENTATION_PLAN.md](../../BILLS_TAX_IMPLEMENTATION_PLAN.md) §13

---

## What this pack covers (from branch commits)

| Commit theme | DB change | File |
|--------------|-----------|------|
| BP-0 supplier tax + `invoice.supplier_id` | **DDL** + FK/indexes | `01_ddl.sql` |
| BP-0 optional PO → bill supplier backfill | **DML** | `02_dml_backfill.sql` |
| BP-3 `po_mode` + `invoice_type` = PURCHASE | **DDL** + **DML** backfill | `01_ddl.sql`, `02_dml_backfill.sql` |
| View metadata (`supplier_*`, `invoice_view`) | **DML** on `view.data_graph` | `03_dml_metadata_views.sql` |
| BP-2 `invoice_extractor` prompt text | **DML** on `prompt_template` | `04_update_invoice_extractor_prompt.sh` |

### Explicitly **not** in this pack

| Artifact | Why |
|----------|-----|
| `prod-hilka/01–03` (tax_region, tax_group, entity_tax_settings, …) | Sales tax architecture — **prerequisite**, already documented separately |
| `invoice_currency_exchange_rate.sql` | Already on base branch / earlier work |
| `bp0_supplier_tax_registrations_demo.sql` | **Demo org only** (`org_indian_demo`) — do not run on prod |
| `bp3_demo_purchase_tax_groups.sql` | **Demo org only** — do not run on prod |
| App code / Prisma generate | Deploy the release; run `npx prisma generate` in app build, not against prod DB |

### Prerequisite

`public.tax_region` (and related sales tax tables) must exist — `supplier.default_tax_region_id` FKs to `tax_region`.  
If `00_precheck.sql` shows `has_tax_region = f`, apply [`../prod-hilka/`](../prod-hilka/) (or your equivalent) **first**.

---

## Apply order

1. Backup / snapshot prod (or run on a clone).  
2. `00_precheck.sql` — confirm prerequisites + legacy counts.  
3. `01_ddl.sql` — columns + FKs + indexes.  
4. `02_dml_backfill.sql` — supplier_id + po_mode / PURCHASE.  
5. `03_dml_metadata_views.sql` — expose fields on views.  
6. Optional: `04_update_invoice_extractor_prompt.sh` — PDF extract prompt (if prod uses DB `prompt_text`).  
7. Deploy app build from this branch / PR.  
8. `99_postcheck.sql` — expect `legacy_po_literals_remaining = 0`, `sales_with_po_mode = 0`.  
9. Smoke: Without PO bill, With PO bill, supplier tax fields, PDF upload (if used).

---

## Verbatim terminal commands (prod)

Replace the connection string (or export it). Strip `?schema=public` for `psql`.

```bash
# From repo root (fabriq-ws-setup)
cd /path/to/fabriq-ws-setup

# --- set prod URL (you fill this in) ---
export PROD_DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME'

# psql rejects Prisma's ?schema=public query param
PROD_URL="$(printf '%s' "$PROD_DATABASE_URL" | sed 's/?schema=public//')"

# Optional safety: refuse if URL looks like local
case "$PROD_URL" in
  *127.0.0.1*|*localhost*) echo "Refusing: URL looks local"; exit 1 ;;
esac

# 0) Precheck (read-only)
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/00_precheck.sql

# 1) DDL
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/01_ddl.sql

# 2) Backfill DML
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/02_dml_backfill.sql

# 3) View metadata DML
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/03_dml_metadata_views.sql

# 4) Invoice extractor prompt (optional but recommended for PDF upload)
chmod +x docs/tax/migrations/prod-bills-tax/04_update_invoice_extractor_prompt.sh
PROD_DATABASE_URL="$PROD_DATABASE_URL" \
  bash docs/tax/migrations/prod-bills-tax/04_update_invoice_extractor_prompt.sh

# 5) Postcheck (read-only)
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/99_postcheck.sql
```

### If prod URL is already in a local env file (do not commit secrets)

```bash
cd /path/to/fabriq-ws-setup

# Example: read from a gitignored file you maintain
# export PROD_DATABASE_URL="$(grep '^PROD_DATABASE_URL=' backend/.env.prod | head -1 | sed 's/^PROD_DATABASE_URL=//;s/^"//;s/"$//')"

export PROD_DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME'
PROD_URL="$(printf '%s' "$PROD_DATABASE_URL" | sed 's/?schema=public//')"

psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/00_precheck.sql
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/01_ddl.sql
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/02_dml_backfill.sql
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/03_dml_metadata_views.sql
chmod +x docs/tax/migrations/prod-bills-tax/04_update_invoice_extractor_prompt.sh
PROD_DATABASE_URL="$PROD_DATABASE_URL" bash docs/tax/migrations/prod-bills-tax/04_update_invoice_extractor_prompt.sh
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f docs/tax/migrations/prod-bills-tax/99_postcheck.sql
```

### One-liner sequence (after `PROD_URL` is set)

```bash
for f in 00_precheck 01_ddl 02_dml_backfill 03_dml_metadata_views 99_postcheck; do
  echo "===== $f ====="
  psql "$PROD_URL" -v ON_ERROR_STOP=1 -f "docs/tax/migrations/prod-bills-tax/${f}.sql" || exit 1
done
# Prompt update separately (needs python3 + repo checkout):
PROD_DATABASE_URL="$PROD_DATABASE_URL" bash docs/tax/migrations/prod-bills-tax/04_update_invoice_extractor_prompt.sh
```

---

## Rollback (optional)

Code can keep reading legacy `invoice_type` With/Without PO via `resolvePoModeFromInvoice` for a while.  
Data rollback only if you must restore the old shape:

```sql
BEGIN;
UPDATE invoice
SET invoice_type = po_mode,
    po_mode = NULL,
    modified_at = CURRENT_TIMESTAMP
WHERE invoice_type = 'PURCHASE'
  AND po_mode IN ('With PO', 'Without PO');
COMMIT;
```

Columns `po_mode`, `supplier_id`, supplier tax fields can remain nullable harmlessly. Dropping FKs/columns is usually unnecessary.

---

## Smoke after deploy

1. Supplier → set tax treatment + default region + Tax Registrations.  
2. New bill → PO Mode **Without PO**, pick item with tax groups → group suggests.  
3. Bill with **With PO** + PO link.  
4. Confirm DB: `invoice_type='PURCHASE'`, `po_mode` set.  
5. PDF upload (if used) with `APP_NAME=fabriq_books`.
