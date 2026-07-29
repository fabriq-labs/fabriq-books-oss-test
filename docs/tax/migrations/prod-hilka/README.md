# Production tax migration — Hilka Digital (read-only analysis + SQL artifacts)

**Target legal entity:** `org_f42159ce-658b-4152-8841-7c1b6f9e881a`  
**Tenant `org_id` (shared):** `org_fabriq-labs-inc`  
**Generated:** 2026-07-24  
**Constraint:** These files are **not applied by the agent**. Review and run yourself (sandbox first).

---

## Prod findings (read-only)

| Check | Result |
|-------|--------|
| New tax tables (`tax_region`, `tax_group`, …) | **Missing** — only `tax_master` exists |
| New columns on entity/customers/item/invoice/lines | **Missing** |
| `tax_master` rows for tenant | **0** |
| Hilka invoices | 5 (all customer Knack, lines at flat `tax_rate = 18`) |
| Customers on tenant | Knack (India / Punjab, GSTIN in name); Unity 7ai (Singapore address — overseas / zero-rate candidate) |
| Items on tenant | 3 services; no HSN / tax FKs |
| Metadata tax views | Only legacy `tax_master_*` |

### Scoping

- DDL is **database-wide** (cannot be limited to one legal entity).
- `tax_master` / `tax_group` are keyed by **tenant** `org_id` = `org_fabriq-labs-inc` (filter groups by `country_code` in UI).
- **`entity_tax_settings` is per legal entity** — Hilka → `IN`, Canada sibling LEs → `CA`.
- Party / invoice backfill SQL is scoped to **Hilka LE** + the two tenant customers used with Hilka sales.

---

## Tables / columns to migrate

### New tables
1. `tax_region`
2. `tax_group`
3. `tax_group_component`
4. `party_tax_registration`
5. `entity_tax_settings` (pack per LE; replaces earlier draft name `org_tax_settings`)
6. `invoice_line_tax`

### Altered tables
| Table | Columns |
|-------|---------|
| `tax_master` | `component_type`, `is_recoverable` |
| `entity` | `tax_treatment`, `default_tax_region_id` |
| `customers` | `tax_treatment`, `default_tax_region_id` |
| `item_master` | `tax_group_id`, `tax_group_interstate_id`, `classification_code`, `classification_scheme`, `item_tax_category` |
| `invoice` | `tax_region_id`, `seller_tax_region_id`, `tax_responsibility` |
| `invoice_line_item` | `tax_group_id`, `classification_code`, `classification_scheme`, `taxable_amount` |

### Metadata (not in these SQL files)
Deploy app view JSON + run metadata sync, then optionally `backend/prisma/seed-tax-phase-a-views.sql` for permissions/`role_view`. Extended `invoice_view` must expose `org_id` (read) for other features; pack resolution uses **`legal_entity_id`**.

If an environment already has `org_tax_settings`, run  
`docs/tax/migrations/rename_org_tax_settings_to_entity_tax_settings.sql` before or instead of creating the old table.

---

## Apply order (you run)

1. **Backup** prod (or run on sandbox clone first).
2. `01_ddl_tax_architecture.sql`
3. `02_seed_tax_regions.sql` (system regions; includes Punjab `PB`)
4. `03_data_hilka_fabriq_labs.sql` (per-LE packs + tenant tax masters/groups + Hilka party/item stamps)
5. Deploy code + sync metadata views / permissions
6. Fill seller GSTIN in `03` (commented) once known
7. **Optional** historical invoice backfill is commented in `03` — leave posted lines on legacy `%` unless finance approves

---

## Intended tax setup for Hilka

| Concept | Value |
|---------|-------|
| Pack | `entity_tax_settings` → `IN` for Hilka LE |
| Seller region | Tamil Nadu (`txreg_in_tn`) |
| Knack | `registered`, region Punjab (`txreg_in_pb`), GSTIN `03AADCK2783N1ZA` |
| Unity 7ai | `export` (overseas), no IN region → use **GST0** group on invoices |
| Groups | GST18 (CGST9+SGST9), IGST18, GST0 |
| Item defaults | intra `GST18`, interstate `IGST18`, scheme `SAC` |

Knack invoices today are TN→PB → **IGST 18%** (matches existing flat 18% totals).
