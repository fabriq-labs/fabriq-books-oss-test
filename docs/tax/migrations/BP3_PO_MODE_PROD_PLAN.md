# BP-3 Prod Migration Plan — `invoice.po_mode` + `invoice_type = PURCHASE`

**Status:** Proposal for production / shared envs  
**Local/test:** apply [`bp3_invoice_po_mode.sql`](./bp3_invoice_po_mode.sql) (already designed to be idempotent)  
**Related code:** bills UI + upload + `generate_invoice_from_po` + extract create payloads on branch `agentc/bills-tax-analysis-e0b7`

## Goal

Stop overloading `invoice.invoice_type` with PO linkage.

| Field | Meaning | Values |
|-------|---------|--------|
| `invoice_type` | Business class | `SALES` \| `PURCHASE` |
| `po_mode` | Purchase ↔ PO link | `With PO` \| `Without PO` (null on sales) |

## Why

- Sales posting / filters already assume `invoice_type === 'SALES'`.
- Bills UI historically stored `With PO` / `Without PO` in `invoice_type`, so “is this a purchase bill?” was ambiguous.
- Purchase posting (BP-4) and reporting need a clean `PURCHASE` flag.

## Prod steps (ordered)

1. **Freeze window (short)** — avoid creating bills mid-migration if possible; otherwise re-run backfill after deploy.
2. **Backup** — snapshot `invoice` (at least `id, invoice_type, purchase_order_id, org_id`).
3. **Pre-check counts** (read-only):

```sql
SELECT invoice_type, count(*) FROM invoice GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS with_po_literal
FROM invoice WHERE invoice_type IN ('With PO', 'Without PO');
SELECT count(*) AS purchase_missing_po_mode
FROM invoice WHERE invoice_type = 'PURCHASE' AND (po_mode IS NULL OR btrim(po_mode) = '');
```

4. **Apply DDL + backfill** — run [`bp3_invoice_po_mode.sql`](./bp3_invoice_po_mode.sql) against the target DB (user-applied; do **not** use `prisma migrate` / `db push` unless your release process already does).
5. **Sync metadata** — ensure `invoice_view.data_graph` includes `po_mode` (script updates `invoice_view`; also ship updated `backend/prisma/metadata/views/invoice_invoice_view.json` and run your normal metadata sync if prod views are file-driven).
6. **Deploy app** that writes `invoice_type='PURCHASE'` + `po_mode` on create/update (this PR).
7. **Post-check**:

```sql
-- Should be ~0 after migration
SELECT count(*) AS legacy_po_in_type
FROM invoice WHERE invoice_type IN ('With PO', 'Without PO');

SELECT invoice_type, po_mode, count(*)
FROM invoice
GROUP BY 1, 2
ORDER BY 1, 2;

-- Sales unchanged
SELECT count(*) FROM invoice WHERE invoice_type = 'SALES' AND po_mode IS NOT NULL;
-- Prefer 0; if any, clear: UPDATE invoice SET po_mode = NULL WHERE invoice_type = 'SALES';
```

8. **Smoke** — create Without PO bill, With PO bill (link PO), upload PDF → create; confirm DB rows show `PURCHASE` + correct `po_mode`.

## Rollback

- **Code:** revert to prior build (UI reads legacy `invoice_type` With/Without PO as fallback for a while — see `resolvePoModeFromInvoice`).
- **Data (optional):** only if you must restore old shape:

```sql
UPDATE invoice
SET invoice_type = po_mode,
    po_mode = NULL,
    modified_at = CURRENT_TIMESTAMP
WHERE invoice_type = 'PURCHASE'
  AND po_mode IN ('With PO', 'Without PO');
```

Column `po_mode` can remain (nullable) harmlessly.

## Out of scope

- PO / PR schema changes  
- Purchase GL posting (BP-4)  
- Renaming historical sales rows
