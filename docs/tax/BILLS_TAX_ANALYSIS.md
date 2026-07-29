# Purchase Bills — Tax Analysis (vs Sales Invoice)

**Status:** Analysis complete — implementation **BP-0…BP-2 done** (live extract verified); next **BP-3**. Plan + agent handoff: [BILLS_TAX_IMPLEMENTATION_PLAN.md](./BILLS_TAX_IMPLEMENTATION_PLAN.md)  
**Last Updated:** 2026-07-27  
**Branch / PR:** `agentc/bills-tax-analysis-e0b7` · [#37](https://github.com/fabriq-labs/fabriq-ws-setup/pull/37)  
**Companion:** [TAX_ARCHITECTURE.md](./TAX_ARCHITECTURE.md) · [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

Sales invoices already have structured tax (Phases A–C). This doc is the same style of **baseline comparison** for **Purchases → Bills**, so we can decide scope before writing a bills plan.

---

## 1. What is a “bill”?

A bill is **not** a separate Prisma model. It is the same `invoice` (+ `invoice_line_item`) record, reached via the purchases UI.

| Aspect | Detail |
|--------|--------|
| Nav | Purchases → Bills → `/purchases/bills` |
| Routes | `App.tsx` → `pages/Invoice.tsx` / `InvoiceDetailsPage` → `BillsInvoiceForm` |
| Model | `invoice` / `invoice_line_item` (`zeiv.prisma`) |
| Shared view | `invoice_view` (same as sales) |
| Calc | Same `calculate_invoice_total` (already expands `tax_group_id` → `invoice_line_tax`) |

### `invoice_type` is overloaded

Schema comment says `'SALES' | 'PURCHASE'`, but the bills UI uses:

| Source | `invoice_type` value |
|--------|----------------------|
| Sales form / `generate_invoice_from_so` | `'SALES'` |
| Bills UI / upload / `generate_invoice_from_po` | `'With PO'` / `'Without PO'` |
| Some tests / Zoho dbt / extractors | `'PURCHASE'` |

So “is this a purchase bill?” is today: **route/UI context + presence of PO**, not a clean `invoice_type = 'PURCHASE'` flag. Sales posting already guards on `invoice_type === 'SALES'`.

### Party linkage

| Sales invoice | Purchase bill |
|---------------|---------------|
| `customer_id` → `customers` | **No `supplier_id` on `invoice`** |
| Buyer tax profile on customer | Supplier only via `purchase_order.supplier_id` / `supplier_name` string |

Without-PO bills store a free-text `supplier_name` only — no master FK for tax registrations or region defaults.

---

## 2. Current state (bills baseline)

Same shape as the sales baseline in [TAX_ARCHITECTURE.md §1](./TAX_ARCHITECTURE.md).

| Layer | Behaviour today |
|-------|-----------------|
| Schema | Shared `invoice` / lines already have structured tax columns (`tax_region_id`, `seller_tax_region_id`, `tax_responsibility`, `currency_id`, `exchange_rate`, line `tax_group_id`, classification, `invoice_line_tax`) |
| Calc | `calculate_invoice_total`: single `%` **or** tax group → `invoice_line_tax` (works if `tax_group_id` is set) |
| Parties | **Supplier** has address / `legal_registration_number` / `preferred_currency_id` only — **no** `tax_treatment`, `default_tax_region_id`, or Tax Registrations tab |
| Items | `item_master` has groups + classification; **not applied** on bill create / bills UI |
| Frontend | `BillsInvoiceForm` + `InvoiceLineItemRow`: **Tax Rate %** only |
| From PO | Lines copy qty/rate/name; **no tax rate / group / HSN** from item or PO (`purchase_order_item` has no tax fields) |
| PDF | **None** for bills (sales has `InvoicePdf`) |
| Posting | **None** for purchase; sales has single-total posting only (CA-4 deferred) |
| Views | Same `invoice_view` / line / `invoice_line_tax_view` — fields exist, bills UI ignores them |

---

## 3. Side-by-side: sales invoice (done) vs bills (today)

| Concern | Sales invoice (Phase B/C) | Purchase bill |
|---------|---------------------------|---------------|
| Prisma model | `invoice` | **Same** |
| UI form | `InvoiceForm.tsx` + `SalesInvoiceItemTable.tsx` | `BillsInvoiceForm.tsx` + `InvoiceLineItems` / `InvoiceLineItemRow` |
| Party | Customer FK + tax profile + registrations | Supplier via PO / name string; **no tax profile** |
| Place of supply | Header `tax_region_id` (pack-aware) | Schema only — **not in UI** |
| Seller region | `seller_tax_region_id` | Schema only |
| Tax registrations display | Entity + customer primary IDs | Not shown (supplier GSTIN/BN unavailable) |
| Line tax | Tax **group** + HSN/SAC when pack ≠ GENERIC; else `%` | **Tax Rate %** only |
| Component breakdown | Read-only from `invoice_line_tax` | Not shown |
| Intra / inter / export suggestion | UI helpers (`suggestTaxGroupId`, zero-rated for export) | **None** |
| Reverse charge (`tax_responsibility`) | Field exists; pack can surface | Schema only — often **more important** on purchase |
| Currency + exchange rate | Done on sales form | Schema + view only — **not in bills UI** |
| Calc engine | CA-1 done | **Same action** — reuse |
| PDF | Structured labels / components | Missing |
| GL posting | Sales total only; tax split deferred | No AP / input-tax posting |
| Architecture status | Phases A–C largely done | Called out as Phase D: “Purchase bills reuse primitives” |

---

## 4. What already exists that bills can reuse

No new tax engine is required for parity with sales document UX.

| Primitive | Status for bills |
|-----------|------------------|
| `tax_region`, `tax_group`, `tax_group_component`, `tax_master.component_type` | Done (masters) |
| `entity_tax_settings` (pack per LE) | Done |
| `invoice` header tax + currency columns | Done (nullable) |
| `invoice_line_item` group + classification | Done (nullable) |
| `invoice_line_tax` + CA-1 | Done — triggers on `tax_group_id` |
| `party_tax_registration.party_type` includes `supplier` | Schema allows; **no supplier UI / view fields** |
| Pack labels / suggestion helpers (`frontend-1/src/lib/tax/*`) | Built for sales; adaptable if party = supplier |

---

## 5. Gaps (purchase-specific)

### 5.1 Supplier tax profile (largest master gap)

| Capability | entity | customers | supplier |
|------------|--------|-----------|----------|
| `tax_treatment` | Yes | Yes | **Missing** |
| `default_tax_region_id` | Yes | Yes | **Missing** |
| Tax Registrations tab | Yes | Yes | **Missing** |
| View fields for tax | Yes | Yes | **Missing** (`supplier_supplier_view` has none) |

`party_tax_registration` already documents `party_type = supplier`, but nothing writes or displays it for suppliers.

### 5.2 Document party FK

`invoice` has `customer_id` but **no `supplier_id`**. Tax suggestion, registration display, and Without-PO bills need a stable party link (or always require PO). This is a schema decision, not just UI.

### 5.3 Bills UI (parity with sales invoice form)

Missing on `BillsInvoiceForm` / line table vs sales:

- Place of supply / buyer (LE) region chrome  
- Seller (supplier) + buyer (entity) registration display  
- Tax group picker + component breakdown  
- Classification (HSN/SAC) snapshot  
- Pack-driven labels / reverse charge  
- Document currency + editable exchange rate  
- Intra vs inter (and import/overseas) group suggestion  

### 5.4 PO → bill tax continuity

- `purchase_order` / `purchase_order_item`: **no** tax group, rate, classification, or region fields  
- `generate_invoice_from_po` does not stamp tax from `item_master`  
- Bills line comparison UI only reconciles qty/rate/`tax_rate` % against PO  

So even after bills UI gains groups, “create from PO” still needs a policy: copy from item master at bill time, or add tax to PO first.

### 5.5 `invoice_type` cleanup

Sales posting skips non-`SALES`. Bills use `With PO` / `Without PO`. Any future purchase posting or filters need an explicit rule (e.g. keep PO mode in another field, set `invoice_type = 'PURCHASE'`, or derive from route + `purchase_order_id`).

### 5.6 PDF

No bill PDF path. Optional for P0 if AP users only need on-screen totals.

### 5.7 Posting / input tax (later)

Sales CA-4 (output tax split) is deferred. Purchase would need the mirror: AP expense/liability + **recoverable input** tax (`tax_master.is_recoverable` / `tax_account_mapping`). Out of scope unless explicitly pulled forward; today bills have **no** GL posting at all.

---

## 6. Purchase semantics vs sales (design notes)

Same primitives; different party roles and a few pack rules:

| Concept | Sales | Purchase (bills) |
|---------|-------|------------------|
| Document | Outgoing tax invoice | Supplier bill / AP invoice |
| “Our” party | Seller = LE (`entity`) | Buyer = LE (`entity`) |
| Counterparty | Customer | Supplier |
| Place of supply | Often customer / delivery region | Often where goods/services are received (LE / location) |
| Tax group suggestion | Seller region vs POS; export → zero-rated | Buyer region vs supplier region; **import / RCM** cases matter more |
| `tax_responsibility` | Occasional | Reverse charge common (IN); self-assessment analogues in other packs |
| GL (future) | Output liability | Input recoverable (+ expense / AP) |

Architecture already anticipated this (`TAX_ARCHITECTURE` Phase D: “Purchase bills reuse same primitives”; `tax_account_mapping.account_id` note: “or recoverable input on purchase later”).

---

## 7. Key code touchpoints (bills)

| Concern | Location |
|---------|----------|
| Bills form | `frontend-1/src/components/forms/invoice/BillsInvoiceForm.tsx` |
| Line table / tax % | `InvoiceLineItems.tsx`, `InvoiceLineItemRow.tsx` |
| Page shell | `frontend-1/src/pages/Invoice/InvoiceForm.tsx` |
| List / routes | `pages/Invoice.tsx`, `App.tsx` (`purchases/bills/*`) |
| Supplier master | `frontend-1/src/components/forms/Masters/SupplierForm.tsx` |
| Calc (shared) | `backend/src/lib/actions/zeiv.ts` → `calculate_invoice_total` |
| From PO | `generate_invoice_from_po` in `zeiv.ts` |
| Schema | `zeiv.prisma` (`invoice`, `invoice_line_item`, `supplier`, `purchase_order*`) |
| Tax schema | `tax.prisma` (`party_tax_registration`, groups, regions) |
| Sales reference (parity target) | `InvoiceForm.tsx`, `SalesInvoiceItemTable.tsx`, `frontend-1/src/lib/tax/*` |

---

## 8. Implication

Extending structured tax to bills is mostly:

1. **Supplier tax profile** (fields + registrations UI + views)  
2. **Optional `invoice.supplier_id`** (and/or Without-PO party policy)  
3. **Bills UI** reusing sales tax chrome / suggestion helpers (pack-aware)  
4. **PO → bill** tax stamping policy  
5. Optional: PDF, `invoice_type` cleanup, AP/input-tax posting  

It is **not** a new document model or a second calc engine. CA-1 already supports groups on the same lines bills use.

Historical bills with only `%` stay on the legacy path (null `tax_group_id`) — same compatibility story as sales.

---

## 9. Scope decisions (locked 2026-07-27)

| # | Candidate | Decision |
|---|-----------|----------|
| A | Supplier `tax_treatment` + `default_tax_region_id` | **In** |
| B | Tax Registrations tab on supplier | **In** |
| C | `invoice.supplier_id` FK | **In** |
| D | Bills header: POS / regions / registrations / RCM | **In** |
| E | Bills lines: tax group + HSN/SAC + component breakdown | **In** |
| F | UI tax-group suggestion for purchase | **In** |
| G | Currency + exchange rate on bills UI | **In** |
| H | Stamp tax from `item_master` when generating bill from PO | **Out** — do not touch PO/PR |
| I | Add tax fields on PO / PO lines | **Out** — upstream procurement |
| J | Bill PDF | **In** (optional mid-phase) |
| K | Normalize `invoice_type` (`PURCHASE` + separate PO mode) | **In** |
| L | Purchase GL posting + input tax split | **Deferred** (review gate, like sales CA-4) |
| M | Upload / extract → create: map tax & party fields from PDF/image | **In** (added) |

Plan: [BILLS_TAX_IMPLEMENTATION_PLAN.md](./BILLS_TAX_IMPLEMENTATION_PLAN.md).

---

## Related

- [BILLS_TAX_IMPLEMENTATION_PLAN.md](./BILLS_TAX_IMPLEMENTATION_PLAN.md) — phased bills/supplier/extract plan  
- [TAX_ARCHITECTURE.md](./TAX_ARCHITECTURE.md) — country-agnostic tax RFC (sales-first; purchase deferred to Phase D)  
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — sales progress; Phase D backlog lists “Purchase bills reuse primitives”  
- [README.md](./README.md) — tax docs index  
