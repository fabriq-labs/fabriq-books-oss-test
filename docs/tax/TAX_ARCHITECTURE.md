# Tax Architecture — Country-Agnostic Structured Tax (P0 / P1)

**Status:** Proposal / RFC (review before implementation)  
**Last Updated:** 2026-07-24  
**Scope:** Sales invoices first (reusable for quote, sales order, credit note, purchase bills)  
**Companion:** [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

---

## 1. Problem

Fabriq sales invoices use a **single line tax %**. That is enough for simple sales tax, but not for:

- **India:** GSTIN, place of supply, HSN/SAC, CGST/SGST vs IGST, reverse charge
- **Canada:** BN / GST-HST / PST-QST registrations, provincial place of supply, GST+PST or HST groups

Today’s India demo rates and PDF “IGST” labels are cosmetic. The model is not jurisdiction-aware and is not ready for multi-country tax.

### Current state (baseline)

| Layer | Behaviour |
|-------|-----------|
| Schema | `tax_master` = flat rate; line `tax_rate` + `line_tax_amount`; optional unused `tax_rate_intra` |
| Calc | `(qty × rate − discount) × tax_rate%` |
| Parties | Address/`state` only; no tax IDs on `entity` / `customers` |
| Items | `hsn_code` on `item_master` only; not snapshotted on invoice lines |
| PDF | Hardcoded “IGST” column labels; GSTIN styles unused |
| Posting | Single invoice total — no tax component split |

---

## 2. Goal

Build a **generic tax foundation** that:

1. Supports **tax registrations**, **tax regions**, **tax groups (multi-component)**, and **product classification codes**
2. Keeps behaviour **country-agnostic** in core code; India / Canada differ via **data + selection rules**
3. **Does not break** existing invoices or the current single-% path

### Out of scope (this RFC)

- GSTR filing / online GSTN push
- E-invoice IRN / QR
- Full Zoho feature parity (recurring / retainer invoices)
- Automatic GST rate-slab migration keyed only off HSN

---

## 3. Design principles

| Principle | Meaning |
|-----------|---------|
| Generic primitives | Registrations, regions, components, groups — not `gstin` / `hsn` as core types |
| Country packs | Labels, validation, selection rules as config/seeds |
| Additive & compatible | New fields nullable; old `tax_rate` / `line_tax_amount` remain |
| Snapshot on document | Line stores tax components + classification at invoice time |
| Opt-in structured tax | Until group/region set, calc = today’s single % |

### Concept mapping

| Primitive | India | Canada |
|-----------|-------|--------|
| `tax_registration` | GSTIN | BN / GST-HST / PST / QST |
| `tax_region` | State (place of supply) | Province (place of supply) |
| `tax_treatment` | Registered, SEZ, export, composition… | Registrant, non-registrant, exempt… |
| `tax_master` (component) | CGST, SGST, IGST, cess | GST, HST, PST, QST |
| `tax_group` | GST18 = CGST9+SGST9; IGST18 | HST13; GST5+PST7 |
| `classification_code` + `scheme` | HSN / SAC | Optional commodity code |
| `tax_responsibility` | Reverse charge | Special / self-assessment cases |

---

## 4. Data model

### 4.1 Party tax registrations (new)

```text
party_tax_registration
  id
  party_type              entity | customer | supplier
  party_id
  scheme                  GSTIN | GST_HST_BN | PST | QST | VAT | EIN | OTHER
  registration_number
  tax_region_id?          optional: ID applies to this region
  is_primary
  effective_from / effective_to?
  org_id
  audit fields
```

#### Why this table is required

Party tax registrations store “this party’s tax ID(s)” generically for the seller (`entity`), buyer (`customer`), and later `supplier`.

**Why not `customers.gstin` / `entity.gstin`?**

1. **Multiple ID types** — India needs GSTIN; Canada often needs a GST/HST business number plus a separate PST or QST number; later VAT/EIN. One `gstin` column cannot represent that cleanly.
2. **Multiple IDs per party** — Same customer with different GSTINs per state/address; Canadian org with federal + provincial IDs. A single string field forces awkward workarounds.
3. **Same concept for every party** — Seller, customer, and supplier all need tax IDs. One reusable shape (`party_type` + `party_id` + `scheme` + `number`) beats three different columns on three models.
4. **Region attachment** — A registration often belongs to a jurisdiction. `tax_region_id` captures that; a bare `gstin` column does not.
5. **Invoice display without hardcoding India** — The invoice shows primary registration(s) by querying this table. Labels come from `scheme` (GSTIN vs GST/HST #), not from an India-only UI field.

**Division of responsibility**

| Field / table | Answers |
|---------------|---------|
| `tax_treatment` / `default_tax_region` | How do we tax this party? |
| `party_tax_registration` | What is their official tax number(s)? |

**Minimal example**

```text
Customer "Acme"
  tax_treatment = registered
  default_tax_region = ON
  registrations:
    - scheme=GST_HST_BN  number=123456789RT0001  (primary)
    - scheme=PST         number=PST-…            (optional)

Entity "Our Co"
  registrations:
    - scheme=GSTIN       number=27AAAAA0000A1Z5  (primary)
```

The invoice reads these for display; tax calc still uses region + tax group. The registration table is the **identity layer**, not the rate engine.

Skipping this in favour of a short-term `gstin` column blocks Canada multi-ID and multi-GSTIN later and recreates an India-specific schema.

---

### 4.2 Party tax profile fields

On `entity` and `customers` (supplier later if needed):

```text
tax_treatment             String?     # pack-defined values
default_tax_region_id     String?     # FK → tax_region
```

Seller/buyer tax IDs are entered via `party_tax_registration`, not a hard-coded column on the party.

---

### 4.3 Tax regions (new)

```text
tax_region
  id
  country_code            IN | CA | US | …
  code                    MH | ON | BC | …
  name
  region_type             state | province | territory | …
  # system-seeded; optional org overrides later if needed
```

---

### 4.4 Evolve `tax_master` (component)

Keep the existing table; add:

```text
component_type            String?     # cgst | sgst | igst | gst | hst | pst | qst | vat | sales_tax | cess | other
is_recoverable            Boolean?    # input credit eligibility hint
```

Existing fields remain: `tax_name`, `tax_code`, `tax_rate`, `geo`, dates, `status`.

---

### 4.5 Tax groups (new)

```text
tax_group
  id, name, code, org_id, country_code?, status, audit

tax_group_component
  tax_group_id
  tax_master_id
  sequence
```

Examples:

- **IN GST18 (intra):** CGST9 + SGST9
- **IN IGST18:** IGST18 alone
- **CA ON HST13:** HST13 alone
- **CA BC:** GST5 + PST7

---

### 4.6 Item master

```text
tax_group_id              String?     # default group
tax_group_interstate_id?  String?     # optional second default (cross-jurisdiction)
classification_code       String?     # preferred long-term field
classification_scheme     String?     # HSN | SAC | UNSPSC | CUSTOM | …
item_tax_category         String?     # goods | services | digital | …
```

**Compatibility:** keep `hsn_code`, `tax_master_id`, `tax_rate_intra_id` during transition. Migrate UI/logic to groups + classification; backfill where possible (`hsn_code` → `classification_code` + scheme `HSN`).

---

### 4.7 Invoice header

```text
tax_region_id             String?     # place of supply
seller_tax_region_id?     String?     # snapshot of seller establishment region
tax_responsibility        String?     # supplier | recipient
```

---

### 4.8 Invoice line

Keep: `tax_rate`, `tax_rate_intra`, `line_tax_amount`, `tax_type`.

Add:

```text
tax_group_id              String?
classification_code       String?     # snapshot
classification_scheme     String?
taxable_amount            Float?
```

---

### 4.9 Line tax components (new)

```text
invoice_line_tax
  id
  invoice_line_item_id
  tax_master_id
  tax_group_id?
  rate                    Float
  amount                  Float
  component_type          String?     # denormalized for PDF/reports
  org_id
```

Apply the same pattern later to `credit_note_item`, `sales_order_item`, etc.

---

### 4.10 Tax group suggestion (UI — not a custom API)

**Decision:** Do **not** add a `resolveTaxGroup` backend action in v1. The UI composes existing metadata search/lookup APIs:

1. Read seller region (entity / org default tax region)
2. Read invoice `tax_region_id` (place of supply)
3. Load item `tax_group_id` / `tax_group_interstate_id` via item view
4. Apply pack rule in the client (same region → default group; different → interstate)
5. PATCH `invoice_line_item.tax_group_id` via normal view/child APIs

Optional later: persist `tax_selection_rule` as **seed data** the UI reads, still without a dedicated resolver endpoint. Server-side resolve only if imports/API clients need the same logic.

---

### 4.11 Posting map (P1 — optional, review before build)

```text
tax_account_mapping
  org_id
  tax_master_id | component_type
  account_id              # output liability (or recoverable input on purchase later)
```

---

## 5. Calculation behaviour

```text
taxable = qty × rate − discount

if line.tax_group_id:
  clear/rewrite invoice_line_tax rows
  for each component in group (by sequence):
    amount = taxable × component.tax_rate%
  line_tax_amount = sum(amounts)
  tax_rate        = sum(component rates)   # rollup for legacy consumers
else:
  existing path: line_tax_amount = taxable × tax_rate%
```

Header `tax_total` = sum of line taxes (unchanged meaning).

---

## 6. Backend changes

### 6.1 Metadata-driven (default)

| Area | Work |
|------|------|
| Prisma | New models + nullable FKs (propose DDL; user runs migrate/`db push`) |
| Metadata views | `tax_region`, `tax_group`, `party_tax_registration`, `invoice_line_tax`; extend invoice, line, item, customer, entity, tax_master views |
| Seeds | IN/CA regions, components, groups; org tax pack setting |
| Compatibility | No rewrite of historical invoices; null structured fields → old path |

Masters and document fields use the same `/api/{model}/view/{viewId}` pattern. No country-specific invoice controllers.

### 6.2 Custom actions (review gate)

Custom actions are **exceptions**. Prefer UI + view/search APIs. Before implementation, review and approve any custom action.

| Candidate | v1 stance | Notes |
|-----------|-----------|--------|
| Extend `calculate_invoice_total` | **Likely required** | When `tax_group_id` set: expand components → `invoice_line_tax`, roll up `line_tax_amount` / `tax_total`; else legacy `%` |
| `resolveTaxGroup` | **Not in v1** | UI suggestion via lookup/search |
| Pack validation on write | **Optional later** | UI first; add hooks if imports bypass UI |
| Split GL posting | **Optional / later** | Gate on `tax_account_mapping`; keep single total until approved |
| Sales siblings (SO/quote/CN calc) | **After invoice** | Mirror invoice calc once stable |

### 6.3 Country pack (not UI-only)

Pack is **per legal entity** (`entity_tax_settings`) used for:

- **UI:** labels, visible schemes/fields, suggestion rules
- **Seeds:** which regions/groups to offer (filter tenant `tax_group` by pack `country_code`)
- **Later (optional):** server validation of schemes

Core calc engine stays pack-agnostic (sum group components).

### Key code touchpoints (today)

| Concern | Location |
|---------|----------|
| Invoice total calc | `backend/src/lib/actions/zeiv.ts` (`calculate_invoice_total`) |
| Sales doc calcs | `backend/src/lib/actions/sales.ts` |
| Action wiring | `backend/src/lib/actions.ts` |
| Schema | `backend/prisma/schema/zeiv.prisma` (`invoice`, `invoice_line_item`, `tax_master`, `item_master`, `customers`, `entity`) |

---

## 7. Frontend changes

### Masters / settings

- **Legal entity:** tax registrations list; tax treatment; default tax region
- **Customer:** same
- **Tax Master:** `component_type` (+ existing fields)
- **Tax Groups (new):** compose components
- **Item Master:** classification code + scheme; default / interstate **tax group**; gradual move off dual raw tax FKs

Use neutral labels (`Tax registration`, `Tax region`, `Tax group`, `Classification code`). Country pack sets placeholders (e.g. GSTIN, HSN).

### Sales invoice

- Header: tax region (place of supply); show primary seller/buyer registrations (read-only); tax responsibility when enabled
- Lines: tax **group** picker; component breakdown; classification (from item, editable)
- Totals: tax total + optional per-component summary
- Legacy lines: numeric Tax (%) if no group

### PDF

- Columns/labels from `invoice_line_tax` / component names
- Render seller (and buyer when present) registration numbers
- Remove hardcoded “IGST” as the only tax label

Reuse the same line-tax UI pattern later for quote / SO / credit note.

### Key UI touchpoints (today)

| Concern | Location |
|---------|----------|
| Sales invoice form | `frontend-1/src/components/InvoiceForm.tsx` |
| Line items table | `frontend-1/src/components/forms/Masters/SalesInvoiceItemTable.tsx` |
| Tax master form | `frontend-1/src/components/forms/Masters/TaxMasterForm.tsx` |
| Item master (HSN) | `frontend-1/src/components/forms/Masters/ItemMasterForm.tsx` |
| PDF | `frontend-1/src/components/pdf_generator/InvoicePdf.tsx` |

---

## 8. Existing data impact

| Dataset | Effect |
|---------|--------|
| Existing invoices/lines | Amounts unchanged; new fields null; calc unchanged |
| `tax_master` | Kept; optional `component_type` backfill; 1:1 `tax_group` per rate for continuity |
| Items | Old tax FKs + `hsn_code` keep working; backfill `classification_*` and groups when ready |
| Customers / entities | New nullable fields only |
| Reports on `tax_total` / `tax_rate` | Keep working via rollups |
| Posted GL | Historical postings untouched; split only for new posts after mapping |

**Rollout:** structured tax is opt-in. Orgs without groups/regions behave exactly as today.

---

## 9. Phasing

### Phase A — Foundation (schema + masters)

- `tax_region`, `party_tax_registration`, `tax_group` (+ components)
- Extend `tax_master`, entity, customer, item, invoice, invoice_line_item
- `invoice_line_tax`
- Views + Tax Group UI + entity/customer registration UI
- Calc supports groups **when** `tax_group_id` set; else legacy

### Phase B — Invoice P0 UX

- Invoice: tax region, tax group, classification snapshot, component breakdown
- PDF: registrations + dynamic tax columns
- Item: classification + tax groups

### Phase C — P1 behaviour

- UI tax-group suggestion (seller region vs place of supply); stop blind `tax_rate_intra` preference
- IN/CA pack seeds and pack-driven UI chrome
- Optional: tax account mapping + split posting (only if approved)
- Align credit note (then SO/quote)

### Phase D — Hardening (optional follow-on)

- Org setting: require classification on taxable lines
- Scheme validators (GSTIN / BN) as plugins
- Registrations on `location` for multi-branch GSTIN
- Purchase bills reuse same primitives

---

## 10. Country packs (data, not forks)

**India seed:** states as regions; CGST/SGST/IGST components; groups GST5/12/18 and IGST*; rules same-state → item default, different → interstate; schemes GSTIN, HSN, SAC.

**Canada seed:** provinces as regions; GST/HST/PST/QST components; groups (e.g. ON HST13, BC GST+PST); place-of-supply → group; schemes GST_HST_BN, PST, QST.

Core invoice code never branches on `if country === 'IN'`.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Dual tax models confuse UX | Prefer group when present; hide raw % unless legacy/advanced |
| Incomplete migration of `tax_rate_intra` | Keep FKs; resolver falls back; migrate items in batch |
| Metadata view sprawl | Ship views with Phase A; permissions mirror `tax_master` |
| Posting chart not ready | Split posting gated on `tax_account_mapping`; else keep single total |

---

## 12. Success criteria

1. Can enter seller + buyer tax registrations without India-only fields
2. Can set place of supply (`tax_region`) on invoice
3. Can apply a multi-component tax group; line stores component amounts
4. Classification code appears on line (snapshotted from item)
5. Existing invoices and single-% orgs unchanged
6. Same invoice UI works for IN (CGST+SGST/IGST) and CA (HST or GST+PST) via masters/rules

---

## 13. Recommendation

Approve **Phases A–C** as the P0/P1 program. Do **not** add India-only columns on `invoice` / `customers`. Invest in `party_tax_registration`, `tax_region`, `tax_group`, `invoice_line_tax`, and classification snapshots — that is the reusable substrate for India, Canada, and later VAT/US sales tax.

---

## 14. Architecture sketch

```text
party_tax_registration ──► display on invoice (seller/buyer IDs)

UI (pack rules + view/search):
  tax_region + item tax_group(_interstate) ──► set line.tax_group_id

invoice_line_item.tax_group_id
        │
        ▼
calculate_invoice_total (custom action — review before build)
        │
        ├──► invoice_line_tax[] (components)
        └──► line_tax_amount / tax_total (rollups)

PDF ← components + registrations
GL  ← optional split via tax_account_mapping (later)
```

Legacy path (no `tax_group_id`):

```text
line.tax_rate % ──► line_tax_amount ──► tax_total
```

---

## 15. UX: hiding complexity (country pack)

Generic plumbing; localized cockpit. An IN org sees GSTIN, Place of Supply, HSN/SAC, GST groups — not BN/PST or raw `scheme` enums.

| Mechanism | Effect |
|-----------|--------|
| LE `entity_tax_settings.tax_country_pack` | Selects IN / CA / GENERIC presentation per legal entity (multi-entity tenants) |
| Pack field catalog | Which registration schemes, region lists, classification schemes to show |
| Progressive disclosure | Clerk: invoice fields; Admin: tax group composition |
| Smart defaults in UI | Customer → GSTIN + POS; item → classification + suggested group |
| Single-scheme packs | One labeled field (e.g. “GSTIN”), no scheme dropdown |

Same React screens; pack supplies labels and visibility. No `InvoiceFormIndia.tsx` fork.

---

## Related docs

- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — phased build plan (review before coding)
- [README.md](./README.md) — tax docs index
- [../BUSINESS_DOMAIN.md](../BUSINESS_DOMAIN.md) — sales invoice domain notes
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — system architecture
- [../BACKEND.md](../BACKEND.md) — metadata-driven API patterns
- Zoho references (external): [Invoices](https://www.zoho.com/in/books/help/invoice/), [Taxes (IN)](https://www.zoho.com/in/books/help/settings/taxes.html), [HSN/SAC](https://www.zoho.com/in/books/help/items/hsn-sac-code.html)
