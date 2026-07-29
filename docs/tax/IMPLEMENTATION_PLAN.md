# Tax Implementation Plan (P0 / P1)

**Status:** Phase A + B done; Phase C largely done (suggestion, registrations UX, pack-on-LE, export→GST0, invoice currency). **Pause** before posting (CA-4) / CN-SO parity (CA-5).  
**Last Updated:** 2026-07-25  
**Branch / PR:** `cursor/entity-tax-settings-2c15` · [#35](https://github.com/fabriq-labs/fabriq-ws-setup/pull/35)  
**Architecture:** [TAX_ARCHITECTURE.md](./TAX_ARCHITECTURE.md)

This plan turns the tax RFC into sequenced work. Default approach: **metadata + UI first**; **custom actions only after explicit review**.

---

## Progress snapshot (2026-07-25)

| Phase | Status | Notes |
|-------|--------|-------|
| **A — Foundation** | **Done** | Schema + views + Tax Groups UI + CA-1 (`calculate_invoice_total` expands groups → `invoice_line_tax`); pack stored as **`entity_tax_settings` per LE** |
| **B — Invoice P0 UX** | **Done** | POS, seller/buyer registration display, HSN/SAC, tax groups, component breakdown, IN pack chrome, PDF |
| **C — P1 behaviour** | **Mostly done** | Intra/inter suggestion; CA seeds; item-master groups UX; **Tax Registrations tab** on entity/customer; **Tax country pack** field on OrganizationForm (upserts `entity_tax_settings`); **export → GST0** suggestion; **invoice `currency_id` + editable latest `exchange_rate`**. **Deferred:** CA-4 posting split, CA-5 CN/SO/quote |
| **D — Harden** | Partially started via purchase bills | Validation plugins, multi-GSTIN location, CN/SO still open; **purchase bills BP-0/BP-1 done** — see [BILLS_TAX_IMPLEMENTATION_PLAN.md](./BILLS_TAX_IMPLEMENTATION_PLAN.md) |

### Shipped since 2026-07-24 (UX / product)

| Item | Detail |
|------|--------|
| Pack per legal entity | `entity_tax_settings.tax_country_pack` (`IN` \| `CA` \| `GENERIC`); renamed from draft `org_tax_settings` |
| Set pack in UI | OrganizationForm **Tax country pack** creates/updates `entity_tax_settings` on save; default tax region filtered by pack `country_code` |
| Tax Registrations tab | Embedded on entity + customer (HQ-mapping style); CRUD `party_tax_registration` with own Save; pack-aware schemes (GSTIN / BN…) |
| Export / overseas | `customers.tax_treatment = export` → line tax group suggests zero-rated (`GST0` / pack codes); do not stamp IN POS from customer default |
| Invoice currency | `invoice.currency_id` + snapshotted `exchange_rate` (numeric, **not** FK to `exchange_rate` row); UI currency lookup fills latest rate to LE base; user can edit |
| Prod SQL artifacts | `docs/tax/migrations/prod-hilka/*`, `invoice_currency_exchange_rate.sql`, rename helper |

### Demo / seeds / migrations (apply manually; not wired into `setup-db.js`)

| Script | Purpose |
|--------|---------|
| `backend/prisma/seed-tax-regions.sql` | IN states + CA provinces/territories (`org_id=system`); `entity_tax_settings` per LE for `org_indian_demo` (IN) + `org_techflow_us` (CA) |
| `backend/prisma/seed-tax-groups-in.sql` | IN tax groups + item backfill for indian demo |
| `backend/prisma/seed-tax-groups-ca.sql` | CA `tax_master` components + groups + pack for `org_techflow_us` |
| `backend/prisma/seed-tax-phase-b-demo.sql` | IN demo POS/GSTIN/HSN polish for invoice smoke tests |
| `backend/prisma/seed-tax-phase-a-views.sql` | View/permission SQL if needed outside metadata sync |
| `docs/tax/migrations/prod-hilka/01_ddl_tax_architecture.sql` | Prod DDL for tax tables + column extensions |
| `docs/tax/migrations/prod-hilka/02_seed_tax_regions.sql` | Prod system regions |
| `docs/tax/migrations/prod-hilka/03_data_hilka_fabriq_labs.sql` | Hilka LE pack + tenant GST groups + party stamps |
| `docs/tax/migrations/invoice_currency_exchange_rate.sql` | `invoice.currency_id` + `exchange_rate` |
| `docs/tax/migrations/rename_org_tax_settings_to_entity_tax_settings.sql` | Only if old `org_tax_settings` table exists |

**IN smoke login (local indian-demo):** `sanjay.gupta@demo-india.com` / `Metalimits@123`

**Next gate:** finish **prod/sandbox apply** of DDL + metadata sync (see §12); validate Hilka invoice paths (registered / export / currency); then decide on CA-4 / CA-5.

---

## 0. Constraints and decisions (locked for this plan)

| Decision | Detail |
|----------|--------|
| Country-agnostic core | No `gstin` / India-only columns as the primary design |
| Country pack | **Per legal entity** via `entity_tax_settings` (not tenant-only); drives UI labels/visibility + region/group filters; optional server validation later |
| Registrations vs pack | `party_tax_registration` = identity numbers (GSTIN/BN…); `entity_tax_settings` = which rulebook/pack the LE uses |
| API style | Metadata views for CRUD/search; no country-specific controllers |
| Tax group suggestion | **UI** using lookup/search APIs — **no** `resolveTaxGroup` action in v1; export treatment prefers zero-rated group |
| Invoice currency | Document `currency_id` + snapshotted numeric `exchange_rate` (latest lookup, user-editable); not `exchange_rate.id` FK |
| Custom actions | Exception list; review before coding (see §2) |
| DDL | Propose schema; **user** runs migrate / SQL (agents must not apply DDL) |
| Compatibility | Existing invoices and single-`tax_rate` path must keep working |
| First document | Sales invoice; then credit note; then SO/quote |
| Metadata changes | Do not change view JSON without explicit OK (e.g. invoice `org_id` read was approved) |

---

## 1. Review gates (before coding)

Approve in this order:

1. **Architecture** — [TAX_ARCHITECTURE.md](./TAX_ARCHITECTURE.md) (model + UX pack)
2. **This plan** — phases, scope cuts, custom-action list
3. **Custom action design** (if any) — especially `calculate_invoice_total` extension (§2)
4. **Schema DDL proposal** — field list / Prisma diff (no apply until you run it)
5. **Then** metadata views → UI → seeds

---

## 2. Custom actions — review checklist

Prefer **not** adding new endpoints. Anything below needs sign-off before development.

| ID | Action / change | Needed for | Proposal | Approve? |
|----|-----------------|------------|----------|----------|
| CA-1 | Extend `calculate_invoice_total` in `backend/src/lib/actions/zeiv.ts` | Correct totals when `tax_group_id` set; write `invoice_line_tax` rows; roll up `line_tax_amount` / `tax_total` | **Yes for Phase A/B** — only extension of existing action | ✅ Done |
| CA-2 | `resolveTaxGroup` (new) | Suggest group from regions + item | **No for v1** — UI + search | ☐ N/A |
| CA-3 | Pack validation hooks on create/update | Reject wrong schemes via API/import | **Defer** — UI validation first | ☐ |
| CA-4 | Split sales invoice posting by tax component | GL Output CGST/HST/etc. | **Defer** — after sandbox/prod data check | ☐ |
| CA-5 | Mirror calc in `sales.ts` (CN/SO/quote) | Parity on other docs | **Defer** — after invoice + sandbox OK | ☐ |

### CA-1 behaviour sketch (for review)

```text
on line field change (qty, rate, discount, tax_rate, tax_group_id):
  taxable = qty × rate − discount
  if tax_group_id:
    load tax_group_component → tax_master rates
    replace invoice_line_tax rows (rate, amount, component_type)
    line_tax_amount = sum(amounts)
    tax_rate = sum(rates)          # legacy rollup
  else:
    existing: line_tax_amount = taxable × tax_rate%
  recompute invoice tax_total / invoice_total
```

Alternative (if CA-1 rejected): UI writes `invoice_line_tax` via child view APIs and PATCHes rollups — higher drift risk; not recommended.

---

## 3. Phase overview

| Phase | Name | Outcome |
|-------|------|---------|
| **A** | Foundation | Schema + views + masters UI + optional CA-1 |
| **B** | Invoice P0 UX | Invoice/PDF structured tax; pack chrome for IN |
| **C** | P1 behaviour | UI suggestion (incl. export); CA seeds; pack/registrations UX; invoice currency; optional posting |
| **D** | Harden / extend | Validation plugins; CN/SO; purchase; multi-GSTIN location |

Each phase ends with: existing orgs without pack/groups still behave as today.

---

## 4. Phase A — Foundation (schema + masters)

### 4.1 Prisma (propose only)

**New models**

- `tax_region`
- `party_tax_registration`
- `tax_group`
- `tax_group_component`
- `invoice_line_tax`

**Extend**

| Model | Fields |
|-------|--------|
| `tax_master` | `component_type`, `is_recoverable?` |
| `entity` | `tax_treatment`, `default_tax_region_id` |
| `customers` | `tax_treatment`, `default_tax_region_id` |
| `item_master` | `tax_group_id`, `tax_group_interstate_id?`, `classification_code`, `classification_scheme`, `item_tax_category?` (keep `hsn_code`, old tax FKs) |
| `invoice` | `tax_region_id`, `seller_tax_region_id?`, `tax_responsibility?`, `currency_id?`, `exchange_rate?` (added Phase C) |
| `invoice_line_item` | `tax_group_id`, `classification_code`, `classification_scheme`, `taxable_amount?` |

**Entity pack setting** (locked):

- `entity_tax_settings` keyed by **`legal_entity_id`** (unique) — pack per LE for multi-entity tenants
- `org_id` on the row is tenant filter only, not the pack key
- (Earlier draft name `org_tax_settings` was renamed; see `docs/tax/migrations/rename_org_tax_settings_to_entity_tax_settings.sql`)

Deliverable: schema diff / PR description for you to apply.

### 4.2 Metadata views + permissions

| View | Purpose |
|------|---------|
| `tax_region_view` | Search/list regions |
| `tax_group_view` (+ component child) | CRUD groups |
| `party_tax_registration_view` | CRUD registrations |
| `invoice_line_tax_view` | Child lines (if not only written by CA-1) |
| Extend | `tax_master_view`, `customers_view`, entity view, `item_master_view`, `invoice_view`, line item view |

Permissions: mirror `tax_master` / admin patterns.

### 4.3 Seeds (minimal)

- System or org-scoped IN states + CA provinces as `tax_region`
- Backfill path: optional 1:1 `tax_group` per existing `tax_master` for continuity
- IN demo: remap GST/IGST/CGST/SGST into proper groups (data script; review separately)

### 4.4 Frontend masters

| Screen | Work |
|--------|------|
| Tax Master | Show `component_type` |
| Tax Groups (new) | List/create; attach components via metadata UI or small form |
| Entity | Tax treatment, default region, registrations list |
| Customer | Same |
| Item | Classification + tax group fields (pack labels) |

### 4.5 Backend custom (only if CA-1 approved)

- Extend `calculate_invoice_total` as in §2
- Wire triggers if new fields should re-run calc (`tax_group_id`)

### 4.6 Phase A exit criteria

- [x] CRUD tax groups and party registrations via views
- [x] Nullable fields on invoice/item/customer/entity available via views
- [x] Legacy invoice create/edit unchanged when new fields null
- [x] CA-1 (if approved): group on line produces component rows + correct totals

---

## 5. Phase B — Invoice P0 UX

### 5.1 Sales invoice form

Files (today): `InvoiceForm.tsx`, `SalesInvoiceItemTable.tsx`

| Area | Work |
|------|------|
| Header | Tax region search (filter by pack country); show seller/buyer primary registration (read-only from `party_tax_registration`) |
| Lines | Tax **group** search dropdown; classification snapshot from item (editable); component breakdown read-only from `invoice_line_tax` or group definition |
| Legacy | If no `tax_group_id`, keep Tax (%) input |
| Totals | Existing tax total; optional per-component summary |

### 5.2 Country pack in UI

- Pack catalog from `entity_tax_settings.tax_country_pack` for the invoice **legal entity**
- IN pack: labels GSTIN, Place of Supply, HSN/SAC; schemes `[GSTIN]`; regions IN; show reverse charge if enabled
- GENERIC: hide structured chrome; Tax (%) only
- CA pack can land in Phase C if IN-first

### 5.3 PDF

- `InvoicePdf.tsx` / templates: stop hardcoding “IGST”
- Render registrations + component columns from data

### 5.4 Item master UX alignment

- Prefer tax group + classification over dual raw tax FKs in UI (keep FKs in DB)

### 5.5 Phase B exit criteria

- [x] IN-pack org can enter GSTINs on entity/customer, POS on invoice, HSN on lines, multi-component tax on lines
- [x] PDF shows registrations + correct component labels
- [x] Non-pack / legacy invoice path still works

---

## 6. Phase C — P1 behaviour

### 6.1 UI tax suggestion (no new API)

On customer / place-of-supply / item change:

```text
if customer.tax_treatment = export:
  → zero-rated tax group (IN: GST0; CA: CA_EXEMPT / pack codes)
  → do not auto-fill place of supply from customer default region
else if seller_region and tax_region same → item.tax_group_id
else if different → item.tax_group_interstate_id ?? item.tax_group_id
PATCH line.tax_group_id
(trigger existing calc / CA-1)
```

Stop preferring `tax_rate_intra` blindly in `InvoiceForm`.

**Status:** Done — intra/inter + export (`suggestTaxGroupId`, `fetchZeroRatedTaxGroup` in `frontend-1/src/lib/tax/`).

### 6.2 Pack seeds

- IN: GST groups + interstate groups; wire item defaults in demo data — **done** (`seed-tax-groups-in.sql` + phase-b demo)
- CA: provinces, GST/HST/PST groups, pack labels — **done** (`seed-tax-regions.sql`, `seed-tax-groups-ca.sql`, CA labels in `taxPack.ts`)

### 6.3 Item master UX (brought forward from §5.4)

- Primary: `classification_scheme` / `classification_code` + `tax_group_id` / `tax_group_interstate_id`
- Legacy: `tax_master_id` demoted to optional; `hsn_code` kept in sync when scheme is HSN/SAC
- Pack-aware labels via LE `entity_tax_settings.tax_country_pack`

**Status:** Done (`ItemMasterForm.tsx`).

### 6.4 Masters: pack + registrations UX — **done (2026-07-25)**

- **OrganizationForm:** Tax country pack field; on save create/update `entity_tax_settings`; default tax region `SearchDropDown` filtered by pack country
- **TaxRegistrationsTab:** on entity + customer (tab pattern like HQ Account Mapping); own Save for `party_tax_registration`
- **CustomersForm / OrganizationForm Details:** tax treatment + default tax region
- Creating an LE in the UI no longer leaves pack as implicit `GENERIC` if the user picks IN/CA on save

### 6.5 Invoice document currency — **done (2026-07-25)**

- Schema: `invoice.currency_id`, `invoice.exchange_rate` (default `1`) — snapshot rate, not `exchange_rate.id`
- UI: currency lookup; auto-fill latest rate (invoice currency → LE base) as of invoice date; user may edit
- Defaults: customer preferred currency → LE base; same currency → rate `1`
- DDL: `docs/tax/migrations/invoice_currency_exchange_rate.sql` (user-applied)
- **Out of scope for this slice:** FX-aware sales posting / `base_amount` on invoice (payment_receipt already has currency + rate + base_amount)

### 6.6 Optional (separate approval) — **paused for sandbox/prod**

- `tax_account_mapping` + split posting (CA-4)
- Credit note line tax parity (CA-5 start)

### 6.7 Phase C exit criteria

- [x] Intra vs inter suggestion works in UI for IN
- [x] Export / overseas suggests zero-rated group (GST0) when group exists for tenant
- [x] CA pack seeds + labels usable for registrations + groups
- [x] Item master prefers groups + classification over raw tax FKs
- [x] No dependency on `resolveTaxGroup` backend action
- [x] Pack settable from OrganizationForm → `entity_tax_settings`
- [x] Tax Registrations tab on entity + customer
- [x] Invoice currency + editable latest exchange rate
- [ ] CA-4 / CA-5 — **deferred** until after sandbox/prod data check

---

## 7. Phase D — Hardening (backlog)

- Require classification when org / LE setting on
- Scheme validators (GSTIN / BN) as pack plugins (UI then optional API)
- `party_tax_registration` on `location` for multi-branch
- **Purchase bills** — see [BILLS_TAX_IMPLEMENTATION_PLAN.md](./BILLS_TAX_IMPLEMENTATION_PLAN.md) (supplier + bills UX + extract mapping; **no PO/PR**)
- Quote / SO / delivery challan alignment
- Invoice FX posting / `base_amount` when document currency ≠ functional currency
- Auto-create `entity_tax_settings` server-side on entity create (belt-and-suspenders vs form upsert)

---

## 8. Workstream checklist (by layer)

### Schema / data

- [x] Prisma models + FKs (proposed)
- [x] User-applied DDL (local; prod via §12 / `docs/tax/migrations/*`)
- [x] `prisma generate`
- [x] Seed regions + sample groups (IN + CA scripts)
- [x] Invoice `currency_id` + `exchange_rate` (Prisma + SQL artifact)
- [ ] Production apply complete for all target envs (see §12)

### Metadata

- [x] New view JSON (+ permissions / role_view)
- [x] Extend existing invoice/customer/item/entity/tax_master views (+ invoice currency fields)
- [x] Child relations in data_graph where needed (`tax_group_component` relation name)
- [x] `entity_tax_settings_view`

### Backend custom

- [x] Review §2 table
- [x] Implement only approved items (CA-1 done; CA-4/5 deferred)

### Frontend

- [x] Pack context + IN (then CA) catalogs
- [x] Masters: registrations tab, tax groups, item/entity/customer fields, pack on OrganizationForm
- [x] Invoice header/lines/totals + currency / exchange rate
- [x] PDF
- [x] UI suggestion helper (intra/inter + export)
- [x] Item master: groups + classification primary

### Docs / demo

- [x] Keep `docs/tax/*` updated if design shifts
- [x] setup-IN demo groups (not orphan CGST/SGST rows only)
- [x] Prod Hilka migration pack under `docs/tax/migrations/prod-hilka/`

---

## 9. Explicit non-goals (this program)

- GSTR-1 filing / GSTN online push
- E-invoice IRN/QR
- Recurring / retainer invoices
- Forked per-country invoice APIs
- Replacing metadata CRUD with hand-written tax REST
- `resolveTaxGroup` backend in v1
- Storing `exchange_rate.id` on invoice (snapshot the number instead)

---

## 10. Suggested PR sequence (after approval)

1. **Docs only** — this folder  
2. **Schema proposal + views** — no UI behaviour change  
3. **Masters UI** — registrations, tax groups, item fields  
4. **CA-1** (if approved) — calc extension  
5. **Invoice + PDF + IN pack**  
6. **UI suggestion + CA pack seeds**  
7. **Pack per LE + registrations tab + export GST0 + invoice currency** ← **current (#35)**  
8. **Optional posting / CN** — after sandbox/prod validation  

---

## 11. Open items for reviewer

1. Pack storage: → **`entity_tax_settings` per `legal_entity_id`** (multi-entity tenants) — **locked**
2. Approve CA-1 as drawn in §2? → **Yes, done**
3. IN-first for Phase B, CA in Phase C — OK? → **Yes**
4. Should `invoice_line_tax` be UI-readable only (written solely by CA-1) or also manually editable? → **CA-1 writes; UI read-only breakdown**
5. `tax_region`: global system seed vs per-org copy? → **system seed (`org_id=system`)**
6. Invoice currency FX in posting? → **Deferred** (UI + snapshot only for now)

---

## 12. Production / sandbox data migration checklist

Do **not** reuse demo IDs (`txgrp_demo_*`, `txreg_ca_on`, `org_techflow_us`, etc.) on production. Treat seeds as templates.

**Hilka-shaped prod pack (verbatim SQL order):** see `docs/tax/migrations/prod-hilka/README.md` + `invoice_currency_exchange_rate.sql`.

### DDL / app deploy (once per environment)

1. Apply tax DDL (`prod-hilka/01_ddl_tax_architecture.sql` or equivalent) — user-run only.
2. Apply invoice currency DDL (`docs/tax/migrations/invoice_currency_exchange_rate.sql`).
3. Deploy app code (branch / GHCR image).
4. `npm run sync-metadata` against that DB; then `psql … -f prisma/seed-tax-phase-a-views.sql` for tax view permissions.
5. Confirm invoice view exposes `org_id` (read), `legal_entity_id`, `currency_id`, `exchange_rate`.

### Reference data

6. Insert `tax_region` rows for countries you operate (`country_code` + `code`; prefer `org_id = 'system'`) — or run `prod-hilka/02_seed_tax_regions.sql`.
7. **Per legal entity:** upsert `entity_tax_settings` with `tax_country_pack` = `IN` | `CA` | `GENERIC` (and tenant `org_id` for filtering) — UI can also set pack after deploy.
8. Per tenant: create `tax_master` rows with correct `component_type` (`cgst`/`sgst`/`igst`/`gst`/`hst`/`pst`/`qst`/…).
9. Per tenant: create `tax_group` + `tax_group_component` compositions including a **zero-rated** group (e.g. `GST0`) for export; filter by `country_code` in UI from the LE pack.
10. Stamp seller `entity.default_tax_region_id` (+ `tax_treatment`).
11. Stamp customer `default_tax_region_id` / `tax_treatment` where known (`export` for overseas).
12. Insert `party_tax_registration` for entity + customers (scheme + registration number; mark primary) — or use Tax Registrations tab after deploy.

### Item + open documents

13. Backfill `item_master.classification_code` / `classification_scheme` from `hsn_code` where appropriate (`HSN`/`SAC`).
14. Set `item_master.tax_group_id` and `tax_group_interstate_id` (map from legacy `tax_master_id` / `tax_rate_intra_id` where possible; keep old FKs for compatibility).
15. For **new** invoices after cutover: set `tax_region_id`, line `tax_group_id`, classification snapshot, `currency_id` / `exchange_rate`; let CA-1 write `invoice_line_tax`.
16. Historical posted invoices: leave alone unless a one-off rebuild is approved (do not bulk rewrite posted tax without finance sign-off). Optional currency backfill to LE base is in the invoice currency SQL.

### Verify before CA-4 / CA-5

17. Same-region vs cross-region invoice: correct group suggestion + component rows.
18. Export customer: GST0 (or pack zero-rated) suggested — not CGST/SGST.
19. PDF registrations / POS / component labels.
20. Legacy path: invoice with only `%` tax (no group) still totals correctly.
21. Currency select: latest rate loads; editable; saves without API DateTime errors.

---

## Related

- [TAX_ARCHITECTURE.md](./TAX_ARCHITECTURE.md)
- [README.md](./README.md)
- [migrations/prod-hilka/README.md](./migrations/prod-hilka/README.md)
- Touchpoints: `zeiv.prisma`, `tax.prisma`, `InvoiceForm.tsx`, `OrganizationForm.tsx`, `CustomersForm.tsx`, `TaxRegistrationsTab.tsx`, `SalesInvoiceItemTable.tsx`, `TaxMasterForm.tsx`, `ItemMasterForm.tsx`, `InvoicePdf.tsx`, `frontend-1/src/lib/tax/*`, `frontend-1/src/lib/currency/exchangeRateLookups.ts`
