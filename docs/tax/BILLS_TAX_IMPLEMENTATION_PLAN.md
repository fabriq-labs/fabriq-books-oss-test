# Purchase Bills Tax Implementation Plan

**Status:** **BP-0 → BP-3 done** (bill PDF skipped; purchase posting deferred as BP-4). **Follow-ups shipped (same branch family):** receipt photo upload; Without-PO simple **Done** (no Submit); quick-add supplier/customer on invoice forms. Prod still needs user-applied `po_mode` DDL.  
**Last Updated:** 2026-07-28  
**Branch / PR:** `agentc/bills-receipt-upload-mime-f9a3` · prior `agentc/bills-tax-analysis-e0b7` · [#37](https://github.com/fabriq-labs/fabriq-ws-setup/pull/37) / follow-up PR on mime branch  
**Base branch:** `cursor/entity-tax-settings-2c15`  
**Analysis:** [BILLS_TAX_ANALYSIS.md](./BILLS_TAX_ANALYSIS.md)  
**Architecture:** [TAX_ARCHITECTURE.md](./TAX_ARCHITECTURE.md)  
**Sales plan (done):** [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)  
**Prod DDL plan:** [migrations/BP3_PO_MODE_PROD_PLAN.md](./migrations/BP3_PO_MODE_PROD_PLAN.md) · **full prod pack:** [migrations/prod-bills-tax/](./migrations/prod-bills-tax/)  
**End-user doc brief:** [§13](#13-end-user-documentation-brief-for-docs-agent) (screens, fields, workflows, expected behaviour) — **docs agent: also cover §13.15 follow-ups**

Extends structured tax to **Purchases → Bills** and **Suppliers**, including the **upload → extract → create bill** path (BP-2+; PDF + receipt images on purchases). Reuses sales primitives; does **not** change PO / PR. Purchase GL posting is **deferred (BP-4 / CA-B4)**.

---

## Agent handoff (read this first)

Use this section if you are picking up the branch cold. For **end-user help docs**, start at [§13](#13-end-user-documentation-brief-for-docs-agent).

### Where we are

| Phase | Status | Notes |
|-------|--------|-------|
| **BP-0 — Schema + supplier** | **Done** | Supplier tax fields + `invoice.supplier_id`; views; SupplierForm + Tax Registrations; DDL + demo regs SQL |
| **BP-1 — Bills form P0 UX** | **Done** | Structured tax chrome; HQ LE on create; Without PO default; document-currency display (no line FX convert); Seller GSTIN verified intra / inter / overseas |
| **BP-2 — Upload / extract** | **Done** | Was PDF-only; **reopened:** purchases accept PDF + JPEG/PNG/WebP/HEIC (MIME normalize on `/extract`); sales upload stays PDF-only |
| **BP-3 — Suggestion + polish** | **Done** | Purchase `suggestTaxGroupId`; `po_mode` + `invoice_type=PURCHASE` (local DDL applied; prod = user-applied). **Bill PDF out of scope** |
| **Follow-ups (UX / upload)** | **Done** | See [§ Follow-ups after BP-3](#follow-ups-after-bp-3-2026-07-28--document-in--13) — receipt photos, Without-PO Done, quick-add party |
| **BP-4 — Harden** | Deferred | Purchase posting (CA-B4) |

### Locked product decisions (do not reopen unless product asks)

| Topic | Decision |
|-------|----------|
| Scope | Bills + suppliers + upload only — **no PO/PR** schema/forms/tax |
| Posting | **Deferred** (CA-B4) |
| Upload files | **Purchases:** PDF, JPEG, PNG, WebP, HEIC/HEIF (normalize empty/`octet-stream` MIME from extension). **Sales upload:** PDF only |
| HTTP API | **No new extract endpoint** — extend existing `/api/agent/extract` + tool |
| Tax group from PDF | **Reasonable** name/rate match → `tax_group_id`; else keep `tax_rate` `%` |
| Currency | Document currency on lines/display; FX is header snapshot only — **do not convert line amounts** on currency change |
| Place of supply | Default from HQ LE on create; **do not** overwrite when switching supplier if already set |
| New bill default | **Without PO**; Map to PO / PO qty only when With PO + PO linked |
| Without-PO save UX | **No workflow Submit** — field autosave + **Done** (back to list). **With PO** keeps Draft → Submit → Approve |
| Quick-add party | From bill **Supplier** / sales invoice **Customer** dropdown: **Add new …** → modal → create via view API → select on document |

### Environment / runtime (critical for bill PDF upload)

| Item | Value / rule |
|------|----------------|
| `APP_NAME` | **Must be `fabriq_books`** — seeded `prompt_template.app_name` is `fabriq_books`. Mismatch → `No prompt templates found for model: invoice, view: invoice_view` on upload |
| Prompt type | `invoice_extractor` on view `invoice_view` (`view_0e6394e6-edfc-4eba-947f-b1e47bc507f1`) |
| Prompt files | `backend/prisma/metadata/prompt-templates/view_0e6394e6_edfc_4eba_947f_b1e47bc507f1_invoice_extractor_fabriq.{json,txt}` |
| DB | **Local only** (`127.0.0.1`) — never use `PROD_DATABASE_URL` |
| DDL | Propose only; **user** applies (`docs/tax/migrations/`). Never `prisma db push` / migrate unless user asks |
| Cloud agent env | Secrets are injected at **pod start**. Changing env in the dashboard does **not** update a running agent — start a **new** Cloud Agent. Cloud Agents cannot be forked |
| dotenv | Does **not** override an already-set `APP_NAME` from process env |

**Verify prompt lookup after env change:**

```bash
# Expect APP_NAME=fabriq_books on the running backend process
tr '\0' '\n' < /proc/$(pgrep -f 'ts-node-dev.*src/index.ts' | head -1)/environ | grep '^APP_NAME='

# Expect invoice_extractor row
DATABASE_URL=$(grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//;s/?schema=public//')
psql "$DATABASE_URL" -c "SELECT prompt_type, app_name FROM prompt_template WHERE prompt_type='invoice_extractor';"
```

### Local demo context

| Item | Detail |
|------|--------|
| Org | `org_indian_demo` (often `org_id` / demo id `52` in local seeds — confirm before SQL) |
| Typical login | `sanjay.gupta@demo-india.com` / `Metalimits@123` (or `admin@example.com` / `admin123` per CLAUDE.md) |
| Demo suppliers | HP (KA GSTIN), Apollo (DL), Cipla (MH), Acme Global (US EIN) — see `bp0_supplier_tax_registrations_demo.sql` |
| HQ LE | Karnataka / GSTIN `29AABCD1234A1Z5` (demo) |
| Sample PDFs | `backend/test-data/bp2-bill-seeded-supplier-hp.pdf`, `bp2-bill-new-supplier-nova.pdf` |
| Sample receipt images | `backend/test-data/receipts/sample-receipt.{jpg,png,webp}` (+ phone JPEG) |

### Key files (BP-2 done; BP-3 starting points)

| Layer | Path |
|-------|------|
| Resolve / create payloads | `backend/src/agent/invoiceExtractResolve.ts` |
| Extract tool | `backend/src/agent/AgentTools.ts` (`extractInvoiceFromFileTool`) |
| Extract stream errors | `backend/src/agent/utils/streamErrorMessage.ts`, `AgentService.handleRequestViaStreaming`, `routes.ts` `/extract` |
| Zod schema | `backend/src/agent/GenericFunctions.ts` (`extractInvoiceFromFileSchema`) |
| Prompt text | `…_invoice_extractor_fabriq.txt` (+ DB `prompt_text` must stay in sync if you edit) |
| Filename parse helper | `backend/src/agent/prompt/promptTemplateFileMatch.ts` (underscore types like `invoice_extractor`) |
| Upload UI | `frontend-1/src/pages/Invoice/InvoiceUpload.tsx`, `frontend-1/src/lib/bills/billUploadMime.ts`, `backend/.../billUploadMime.ts` |
| Bills form | `frontend-1/src/components/forms/invoice/BillsInvoiceForm.tsx`, `frontend-1/src/lib/bills/createBillDefaults.ts` |
| Quick-add party | `frontend-1/src/components/forms/shared/QuickPartyCreateDialog.tsx`, `SearchDropDown` (`createOptionLabel` / `onCreateNew`); sales `InvoiceForm.tsx` |
| Line tax UI | `InvoiceLineItems.tsx`, `InvoiceLineItemRow.tsx`, `InvoiceOrderSummary.tsx` |
| Sales suggest | `frontend-1/src/lib/tax/taxPack.ts` → `suggestTaxGroupId`; sales wiring in `InvoiceForm.tsx` |
| Totals | `calculate_invoice_total` via DAL `functionMap` on line/header field save (Submit may re-run; not required for Without PO) |
| Unit tests | `invoiceExtractResolve.test.ts`, `bp2-extract-upload-create.test.ts`, `billUploadMime.test.ts`, `receipt-image-extract.test.ts`, `messageProcessor-image.test.ts`, … |

### Testing notes (important)

- BP-2 Jest **injects** extract payloads into `tool.execute` — it does **not** call live LLM or `DynamicPromptManager` prompt load.
- Optional live LLM extract: `RUN_BP2_LLM_EXTRACT=1` (needs working LLM keys + `APP_NAME=fabriq_books`).
- Live HP sample extract verified 2026-07-27 (API + `llm_trace` success) with `APP_NAME=fabriq_books`.
- Bad LLM credentials must fail fast (HTTP 502 + error `llm_trace`) — do not reintroduce swallowed `consumeStream` errors.

### What went wrong / was rolled back (do not reintroduce)

| Issue | Resolution |
|-------|------------|
| UI upload: no prompt for `invoice` / `invoice_view` | Cause: `APP_NAME=zeiv` vs seeded `fabriq_books`. **Fix env**, do not add cross-`app_name` fallback |
| Brief APP_NAME fallback in `DynamicPromptManager` | **Reverted** — keep exact `APP_NAME` match |
| Kept (not a workaround) | Underscore prompt-type filename parsing + clearer missing-template errors |
| UI stuck on “Processing your PDF…” | AI SDK `consumeStream` swallowed provider 401s. Fixed: rethrow + error `llm_trace` + mapped HTTP status + FE error/Retry |

### Explicit non-goals for BP-3 / remaining

- Do not change PO / PR models or stamp tax onto PO lines  
- Do not add a new HTTP extract API  
- Do not expand **sales** invoice upload beyond PDF  
- Do not implement purchase GL posting (BP-4) unless explicitly asked  
- Do not run DDL against prod  

### Remaining engineering (not blocking end-user docs)

1. **Prod apply** `bp3_invoice_po_mode.sql` — user; see [BP3_PO_MODE_PROD_PLAN.md](./migrations/BP3_PO_MODE_PROD_PLAN.md).  
2. Optional polish: pack-aware “Seller tax registration” label (still often shows “Seller GSTIN”).  
3. Optional smoke: RCM path; legacy %-only bill.  
4. **BP-4** — purchase posting when scheduled.

---

## Follow-ups after BP-3 (2026-07-28) — document in §13

Not part of the original BP-0…BP-3 tax checklist, but **shipped** for end users and must appear in help docs.

| # | Capability | Status | User-visible behaviour | Primary code |
|---|------------|--------|------------------------|--------------|
| F1 | **Receipt photo upload** | Done | Purchases → Bills → upload accepts **PDF or photo** (JPEG/PNG/WebP/HEIC). Sales invoice upload stays PDF-only. | `InvoiceUpload`, `billUploadMime`, `/api/agent/extract` |
| F2 | **Extract tax as components, not fake lines** | Done | Tax summary rows (VAT/GST/CGST/…) must not become product lines; mapped to tax groups when possible. | `invoice_extractor` prompt + `invoiceExtractResolve` |
| F3 | **Payment terms from extract** | Done | Free-text terms (e.g. “Due on receipt”) match master → `payment_terms_id`; never send text as relation. | `invoiceExtractResolve`, `InvoiceUpload` create |
| F4 | **Without PO → Done (no Submit)** | Done | Without PO bills: edits **autosave**; footer shows **Done** (return to Bills). With PO: Submit / Approve / Reject unchanged. Totals refresh on line field save. | `BillsInvoiceForm`, `functionMap` / `calculate_invoice_total` |
| F5 | **Quick-add supplier / customer** | Done | On bill **Supplier** dropdown: **+ Add new supplier**. On sales invoice **Customer** dropdown: **+ Add new customer**. Modal with required fields → create → party selected on the document. | `QuickPartyCreateDialog`, `SearchDropDown`, `BillsInvoiceForm`, `InvoiceForm` |

**Docs agent:** treat F1–F5 as released product behaviour in [§13](#13-end-user-documentation-brief-for-docs-agent) (especially §13.5, §13.7, §13.11, §13.15).

---

## Progress snapshot (2026-07-27)

### Shipped in BP-0 / BP-1 (product)

| Item | Detail |
|------|--------|
| Supplier tax profile | `tax_treatment`, `default_tax_region_id`; Tax Registrations tab (`party_type=supplier`) |
| Bill ↔ supplier | `invoice.supplier_id`; supplier lookup on `BillsInvoiceForm` |
| Legal entity / pack | HQ LE auto on create + post-load persist; editable Legal Entity; pack from LE → Tax section |
| Tax chrome | POS, RCM, Seller/Buyer registration display, line tax group + HSN/SAC + component breakdown |
| Without PO UX | New bills default `Without PO`; catalog lines; Map to PO / PO qty columns only when With PO + PO linked |
| Currency | Header `currency_id` + editable `exchange_rate` (doc → LE base snapshot); **line amounts not converted** — display uses document currency code |
| Demo data | `docs/tax/migrations/bp0_supplier_tax_registrations_demo.sql` — HP (KA), Apollo (DL), Cipla (MH), Acme Global (US/export EIN) |

### Shipped in BP-2 (product + eng)

| Item | Detail |
|------|--------|
| Schema / prompt | `extractInvoiceFromFileSchema` + `invoice_extractor` prompt: supplier tax id, POS, RCM, HSN, tax_components, currency |
| Resolve helper | `invoiceExtractResolve.ts` — supplier (GSTIN/name), currency+FX, regions, LE HQ, tax group match |
| Auto-create | PO-match path uses `buildBillCreatePayloads` (supplier_id, currency, tax fields, classification, tax_group_id) |
| Manual upload create | `InvoiceUpload` persists resolved FKs + `line_tax_amount`; defaults Without PO |
| Preview | Shows supplier tax ID, POS, currency/FX, HSN, tax % / group code |
| Fixtures / tests | Sample PDFs + resolve/create Jest; optional `RUN_BP2_LLM_EXTRACT=1` |
| Extract failure UX | Stream errors rethrown; error `llm_trace`; `/extract` mapped status (e.g. 502 on provider 401); FE clears Processing + shows Retry |

### Shipped in BP-3 (product + eng)

| Item | Detail |
|------|--------|
| Purchase tax suggestion | On catalog item select / supplier or POS change: `suggestTaxGroupId` with **seller = supplier region**, **POS = bill place of supply**, **treatment = supplier**. Export → zero-rated group when available |
| When suggestion is empty | If item has no intra (`tax_group_id`) / inter (`tax_group_interstate_id`) defaults (and not export with zero-rated), line **`tax_group_id` stays unset** → legacy **Tax %** path. **Expected** — not a bug |
| `invoice_type` / `po_mode` | Bills are `PURCHASE`; UI **PO Mode** = With PO \| Without PO. Sales stay `SALES` with `po_mode` null |
| Migration | Local: `bp3_invoice_po_mode.sql` applied. Prod: user applies per [`BP3_PO_MODE_PROD_PLAN.md`](./migrations/BP3_PO_MODE_PROD_PLAN.md) |
| Bill PDF | **Skipped** (product: not required) |
| Demo tax groups | `bp3_demo_purchase_tax_groups.sql` — GST18 restored; GST12 uses flat 12% master (not CGST9+SGST9) |

### Verified (local indian-demo)

| Check | Result |
|-------|--------|
| Seller GSTIN intra (HP / KA) | Pass — `29AABCH2222B1Z2` |
| Seller GSTIN inter (Apollo / DL) | Pass — `07AABCA1111A1Z7` |
| Seller reg overseas (Acme EIN) | Pass — `12-3456789` (label still “Seller GSTIN”) |
| Currency INR → USD display | Pass — symbol changes; numbers unchanged; FX header-only |
| Prompt lookup with `APP_NAME=fabriq_books` | Pass |
| Live LLM extract of HP PDF | **Pass** — supplier/GSTIN/POS/currency/HSN resolved; `llm_trace` success (~5s) |
| Bad LLM credentials fail fast | Pass — HTTP 502 + error `llm_trace` (no hang) |
| `po_mode` backfill | Pass — legacy Without PO bills → `PURCHASE` + `Without PO`; sales unchanged |
| BP-2 Jest resolve/create | Pass after GST18 restore |

**Local DB only:** apply DDL/seeds against `127.0.0.1` — **do not** use `PROD_DATABASE_URL`.

### What’s next

1. ~~Purchase tax-group suggestion~~ — **done**.  
2. ~~`po_mode` + `invoice_type = PURCHASE`~~ — **done** locally; **prod user apply** pending.  
3. ~~Optional bill PDF~~ — **out of scope**.  
4. **BP-4 later** — purchase posting when sales CA-4 path is clear.  
5. Docs agent: use [§13](#13-end-user-documentation-brief-for-docs-agent).

### BP-2 design decisions (locked 2026-07-27) — implemented

| # | Decision | Choice |
|---|----------|--------|
| 1 | Tax group from PDF | **Reasonable match** via `invoiceExtractResolve` (normalize component names/rates). Else leave `tax_rate` `%` |
| 2 | Upload file types | **PDF only** |
| 3 | API surface | **No new HTTP API** — prompt + Zod + resolve in extract tool; FE uses `data.resolved` |

---

## 0. Scope (locked from product direction)

### In scope

| Area | Detail |
|------|--------|
| **Supplier tax profile** | `tax_treatment`, `default_tax_region_id`, Tax Registrations tab (`party_type=supplier`) |
| **Bill party link** | `invoice.supplier_id` FK (Without PO + tax display/suggestion) |
| **Bills form UX** | Place of supply, regions, registrations, RCM (`tax_responsibility`), tax groups, HSN/SAC, component breakdown, currency + exchange rate — mirror sales invoice patterns |
| **Purchase tax suggestion** | Adapt sales UI helpers for supplier ↔ LE regions; import / reverse-charge rules |
| **Upload / extract → create** | Extract tax + party fields from bill PDF/image; map correctly onto `invoice` / lines / supplier when creating bills |
| **`invoice_type` cleanup** | Distinguish purchase bills from sales; keep With/Without PO as a separate field (not overloaded into `invoice_type`) |
| **Bill PDF (optional mid-phase)** | Show registrations + component tax labels like sales PDF |
| **Purchase posting (deferred gate)** | AP + input-tax split — same review style as sales CA-4; **not** in first build |

### Explicitly out of scope

| Area | Reason |
|------|--------|
| **PO / PR models, forms, tax fields** | Upstream procurement module — do not change |
| **Stamp tax onto PO lines** | Same |
| **Change PO matching scoring logic** as a product goal | Auto-match may still *create* a bill today; we only improve **bill** tax fields written on create, not PO tax correctness |
| Sales CA-4 / CN-SO parity | Separate sales backlog |
| GSTR filing / e-invoice | Architecture non-goals |

### Compatibility

- Existing bills with only `tax_rate %` keep working (null `tax_group_id` → legacy calc path).
- Shared `calculate_invoice_total` (CA-1) already expands groups — **no second calc engine**.
- DDL: propose only; **user** applies SQL / migrate.

---

## 1. Review gates (before coding)

Approve in order:

1. **Analysis** — [BILLS_TAX_ANALYSIS.md](./BILLS_TAX_ANALYSIS.md)  
2. **This plan** — phases, out-of-scope, custom-action list  
3. **Custom actions** (if any) — §2  
4. **Schema DDL proposal** — supplier fields + `invoice.supplier_id` + optional `po_mode` rename (§4)  
5. Then metadata views → supplier UI → bills UI → extract/create mapping  

---

## 2. Custom actions — review checklist

Prefer metadata + UI. Sign off before coding exceptions.

| ID | Action / change | Needed for | Proposal | Approve? |
|----|-----------------|------------|----------|----------|
| CA-B1 | None for totals | Groups already handled by existing `calculate_invoice_total` | **No new calc action** | ✅ |
| CA-B2 | Extract schema / prompt extension only | Richer LLM fields (GSTIN, HSN, components, currency, RCM) | **Yes** — extend `invoice_extractor` prompt + Zod tool schema; **not** a new endpoint | ✅ |
| CA-B3 | Post-extract **resolve** helpers | Map GSTIN → supplier; currency → `currency_id`; rates/components → `tax_group_id` (reasonable match) or `%`; region text → `tax_region_id` | Shared helper used by upload + agent create — **no new API** | ✅ |
| CA-B4 | Purchase GL posting + input tax split | AP / recoverable input by component | **Defer** — after bills UX + extract mapping stable | ☐ later |
| CA-B5 | New `resolveTaxGroup` API | Suggestion | **No** — reuse / adapt frontend `suggestTaxGroupId` for purchase (BP-3) | ✅ no |

### CA-B2 / create-path behaviour sketch

```text
extract (LLM):
  + supplier tax id(s), place of supply / region names
  + line HSN/SAC, tax component labels+rates+amounts (when printed)
  + currency code, reverse charge hint
  keep legacy tax_rate / line_tax_amount

on Create bill (InvoiceUpload + agent auto-create):
  resolve supplier_id (match name and/or registration number)
  write supplier_name + supplier_id
  resolve currency_id from context.currency; snapshot exchange_rate (LE base)
  set tax_region_id / seller_tax_region_id when resolvable
  set tax_responsibility when RCM detected
  per line:
    set classification_* from HSN/SAC
    prefer tax_group_id when components/rate match a tenant group
    else tax_rate % (legacy)
  trigger calculate_invoice_total → invoice_line_tax when group set
```

Do **not** invent India-only columns on `invoice`.

---

## 3. Phase overview

| Phase | Name | Outcome |
|-------|------|---------|
| **BP-0** | Schema + supplier foundation | Supplier tax fields; `invoice.supplier_id`; views; registrations tab |
| **BP-1** | Bills form P0 UX | Structured tax + currency on `BillsInvoiceForm` (parity with sales chrome) |
| **BP-2** | Upload / extract mapping | Extract + create persist tax/party/currency correctly |
| **BP-3** | Suggestion + polish | Purchase group suggestion; `invoice_type` / `po_mode` cleanup; bill PDF **skipped** |
| **BP-4** | Harden (optional) | Purchase posting CA-B4; validation plugins |

Each phase: orgs without pack/groups still behave as today on bills.

---

## 4. Phase BP-0 — Schema + supplier foundation

### 4.1 Prisma (propose only)

| Model | Change |
|-------|--------|
| `supplier` | Add `tax_treatment String?`, `default_tax_region_id String?` (+ FK → `tax_region`) |
| `invoice` | Add `supplier_id String?` (+ FK → `supplier`); index |
| `invoice` | `invoice_type` = `SALES` \| `PURCHASE`; `po_mode` = `With PO` \| `Without PO` (purchase only) — see §7 |
| — | **No** changes to `purchase_order` / `purchase_requisition` / PO lines |

`party_tax_registration` already allows `party_type = supplier` — no table change.

Deliverable: DDL snippet under `docs/tax/migrations/` (user-applied).

### 4.2 Metadata views

| View | Work |
|------|------|
| `supplier_*` view(s) | Expose tax treatment, default region; child or embed path for registrations |
| `invoice_view` | Expose `supplier_id` (+ supplier selectProps); ensure purchase-relevant tax fields already present remain writable |
| `party_tax_registration_view` | Confirm supplier party_type usable (permissions) |

Do not change view JSON without explicit OK (same rule as sales plan).

### 4.3 Frontend masters

| Screen | Work |
|--------|------|
| `SupplierForm.tsx` | Tax treatment + default tax region (pack-filtered), mirror customer |
| Tax Registrations tab | Reuse `TaxRegistrationsTab` with `party_type=supplier` |

### 4.4 Phase BP-0 exit criteria

- [x] Can set supplier tax treatment / default region  
- [x] Can CRUD supplier GSTIN/BN via registrations tab  
- [x] Can set `invoice.supplier_id` via view API  
- [x] PO/PR untouched  

---

## 5. Phase BP-1 — Bills form P0 UX

### 5.1 Form touchpoints

| File | Work | Status |
|------|------|--------|
| `BillsInvoiceForm.tsx` | Supplier lookup, POS, registrations, RCM, currency + FX, Legal Entity, HQ LE create/persist | Done |
| `InvoiceLineItems.tsx` / `InvoiceLineItemRow.tsx` | Tax group + HSN/SAC + components; Without PO catalog lines; document `currencyCode` display | Done |
| `createBillDefaults.ts` | New bill payload: Without PO + HQ LE + default region + base currency | Done |
| Shared tax / currency libs | Reuse `frontend-1/src/lib/tax/*` + `exchangeRateLookups` | Done |

Pack from bill `legal_entity_id` → `entity_tax_settings` (same as sales).

### 5.2 Behaviour notes (purchase)

| Topic | Rule |
|-------|------|
| Buyer | Legal entity (our company) |
| Seller | Supplier |
| Place of supply | Editable; default from HQ LE on create; **not** overwritten when switching supplier if already set |
| Legacy | No `tax_group_id` → Tax % only (current bills behaviour) |
| PO link UI | With/Without PO on bill only; **no** tax fields on PO |
| Document currency | Lines/totals **display** in `invoice.currency` code; amounts are document-currency numbers; FX is header snapshot for books later — **no line conversion on currency change** |
| Catalog `unit_price` | Bare number copied into line rate (interpreted as document currency when entered) |

### 5.3 Phase BP-1 exit criteria

- [x] IN-pack org can enter supplier GSTIN, POS on bill, HSN on lines, multi-component tax on lines  
- [x] Currency + rate editable on bill; line/footer display follows document currency  
- [x] Seller registration pops on bill for intra / inter / overseas suppliers  
- [x] Without PO default; Map to PO hidden unless With PO  
- [x] Legacy `%` path still works  
- [x] Sales invoice UI unchanged except shared lib reuse  

---

## 6. Phase BP-2 — Upload / extract → create mapping

**Status:** Design locked (2026-07-27) — **implemented**.  
**Constraints:** PDF-only UI · no new HTTP API · reasonable tax-group match else keep `%`.

### 6.0 How it works

```text
PDF upload (InvoiceUpload, PDF only)
  → POST /api/agent/extract  (existing; promptTypes: invoice_extractor)
  → LLM fills extractInvoiceFromFileSchema
      (supplier_tax_id, place_of_supply, HSN, tax_components, currency, …)
  → extractInvoiceFromFileTool.execute
      1. resolveExtractedInvoice(auth, params)
         • GSTIN/name → supplier_id (or name-only if unknown)
         • currency code → currency_id + exchange_rate (→ LE base)
         • place of supply text → tax_region_id
         • HQ LE → legal_entity_id
         • tax_components / rates → tax_group_id (reasonable match) else tax_rate %
      2. If PO number + full line match → auto-create bill with mapped FKs
      3. Else return { data: { …extract, resolved } } for preview
  → User clicks Create (Without PO by default)
      InvoiceUpload merges data.resolved into workflow create + line addChild
```

Sample PDFs + Jest: `backend/test-data/bp2-bill-*.pdf`, `backend/src/__tests__/agent/bp2-extract-upload-create.test.ts`  
(deterministic tool.execute + create; optional live LLM via `RUN_BP2_LLM_EXTRACT=1`).

**Live UI upload vs tests:** BP-2 Jest covers resolve/create with injected extract payloads — it does **not** load `invoice_extractor` via `DynamicPromptManager`. A UI upload failure `No prompt templates found …` means prompt lookup failed: set `APP_NAME=fabriq_books` to match seeded `prompt_template.app_name`, and ensure `invoice_extractor` is seeded for `invoice_view`.

### 6.1 Baseline gaps (pre-BP-2 — historical)

These were the gaps **before** BP-2; all rows below are addressed in code except live LLM smoke.

| Issue | Pre-BP-2 | After BP-2 |
|-------|----------|------------|
| Extract schema | Flat `tax_rate` / `line_tax_amount` only | Structured GSTIN, HSN, components, currency, RCM (+ legacy fields) |
| Manual create | Dropped tax amounts / supplier / currency | Persists resolved FKs + `line_tax_amount` |
| Auto-create (PO match) | Flat tax only | `buildBillCreatePayloads` with structured fields |
| Images | Agent could accept | **Purchases UI:** PDF + photos (JPEG/PNG/WebP/HEIC); **sales UI:** PDF-only |
| Live LLM UI smoke | — | Still recommended after `APP_NAME=fabriq_books` |

### 6.2 Workstreams

| Layer | Work |
|-------|------|
| Prompt `invoice_extractor` | Ask for supplier tax id(s), place of supply / state/province, line HSN/SAC, per-line tax components when printed (name/rate/amount), currency code, reverse-charge / RCM hint; keep legacy flat fields |
| Zod `extractInvoiceFromFileSchema` | Add optional structured fields (passthrough-friendly); country-agnostic names — **same tool, no new endpoint** |
| Legacy `InvoiceExtractor` | Align expected schema / prompt for parity if still used by `parseDocument` |
| Resolve on create (shared helper) | currency code → `currency_id`; GSTIN/name → `supplier_id`; region text → `tax_region_id`; components/rates → **reasonable match** → `tax_group_id`, else `tax_rate` `%` |
| `InvoiceUpload.handleCreateInvoice` | Persist `supplier_id`/`supplier_name`, currency + rate, regions, responsibility, line classification + group/`tax_rate`, `line_tax_amount`; do not drop extracted tax amounts |
| Agent auto-create path | Same mapper when tool creates invoice (tax fields on **bill** only; still no PO tax writes) |
| Preview UI | Show supplier, currency, tax rate/amount, HSN if present; allow user correction before create |
| File types | **Purchases:** PDF + JPEG/PNG/WebP/HEIC — MIME allowlist + extension fallback in `billUploadMime`; **sales:** PDF only |

### 6.3 Mapping priority (when PDF is ambiguous)

1. Explicit component breakdown on PDF → **normalize labels** (e.g. CGST/SGST/IGST/HST via regex) + compare rates to tenant `tax_group` components → set `tax_group_id` when match is confident → CA-1 writes `invoice_line_tax`  
2. Else single rate / amount → `tax_rate` (+ keep `line_tax_amount` until recalc)  
3. Never invent a group that does not exist for the tenant  
4. User can fix on bill form after create (BP-1)

**Match bar (reasonable):** same set of component types (order-insensitive) and rates within a small epsilon (e.g. 0.01); ignore punctuation/case/spacing in names. If multiple groups match, prefer exact rate set + active status; if still ambiguous, leave `%`.

### 6.4 Phase BP-2 exit criteria

- [x] Extracted GSTIN / HSN / currency / rates visible in preview when present  
- [x] Create bill persists supplier link, currency, classification, and tax rate or group  
- [x] Reasonable component/rate match → `tax_group_id`; else `%`  
- [x] Manual create no longer drops `line_tax_amount` / supplier  
- [x] Upload UI remains PDF-only; no new HTTP API  
- [x] No PO/PR schema or form changes  
- [x] End-to-end smoke with real sample PDF (LLM extract) — HP PDF live extract + error-path fail-fast verified  

---

## 7. Phase BP-3 — Suggestion + polish

**Status:** **Done** — suggestion + `po_mode` shipped (local DDL; prod user-applied); **bill PDF skipped**.

| Item | Work | Status |
|------|------|--------|
| Purchase suggestion | Adapt `suggestTaxGroupId` for buyer (LE) vs supplier region; export/overseas → zero-rated; wire catalog + supplier/POS changes | **Done** — `BillsInvoiceForm` + `InvoiceLineItems` |
| `invoice_type` / PO mode | Bills set `PURCHASE`; With/Without PO in `po_mode` | **Done** — schema + UI + upload + `generate_invoice_from_po`; see [`bp3_invoice_po_mode.sql`](./migrations/bp3_invoice_po_mode.sql) + [`BP3_PO_MODE_PROD_PLAN.md`](./migrations/BP3_PO_MODE_PROD_PLAN.md) |
| Bill PDF | — | **Skipped** |
| Demo seed | `docs/tax/migrations/bp3_demo_purchase_tax_groups.sql` — GST12 / IGST12 / GST0 / GST18 + stamp catalog items | Local apply |

### Decision (locked)

**`invoice_type` vs PO mode:** Option **(1)** approved — add `po_mode`; backfill legacy `With PO` / `Without PO` from `invoice_type` → `PURCHASE` + `po_mode`. Sales rows stay `SALES` with `po_mode` null. **Local/test:** apply SQL. **Prod:** user applies per prod plan (no agent DDL on prod).

### Suggestion behaviour (user-visible)

```text
On catalog item select (Without PO) or when supplier / place of supply changes:
  if supplier.tax_treatment = export → zero-rated tax group (when configured)
  else if supplier region == bill place of supply → item.tax_group_id (intra)
  else → item.tax_group_interstate_id ?? item.tax_group_id (inter)
  if none of the above resolve → leave tax_group_id empty → use Tax % on the line
```

Users can always override the tax group (or %) on the line after suggestion.

### Phase BP-3 exit criteria

- [x] Changing supplier / POS / item suggests a sensible purchase tax group when pack ≠ GENERIC  
- [x] New bills identifiable as `PURCHASE` without losing With/Without PO (`po_mode`)  
- [x] Bill PDF — skipped (not required)  
- [x] Live UI/API smoke: HP sample PDF extract → resolve (with `APP_NAME=fabriq_books`) — done in BP-2 follow-up; re-check after BP-3 form changes  
- [x] Empty item tax defaults → no auto tax group (legacy %) — confirmed expected

---

## 8. Phase BP-4 — Harden (optional / later)

- CA-B4: purchase posting + input recoverable mapping (`tax_account_mapping` direction = input)  
- Scheme validators on supplier registrations  
- Require classification when LE setting on  
- Multi-location GSTIN on `location` (shared with sales Phase D)

**Gate:** same as sales — after sandbox/prod data check on bill UX + extract.

---

## 9. Workstream checklist (by layer)

### Schema / data

- [x] Propose `supplier` tax fields + `invoice.supplier_id` (+ optional `po_mode` deferred to BP-3)  
- [x] User-applied DDL artifact (`bp0_supplier_invoice_supplier_id.sql`)  
- [x] Local apply / generate  
- [x] No PO/PR DDL  
- [x] Demo supplier tax registrations seed  

### Metadata

- [x] Extend supplier + invoice views  
- [x] Registrations usable for supplier  
- [x] Update `invoice_extractor` prompt template metadata  

### Backend

- [x] Extend extract Zod schema + tool mapping  
- [x] Shared resolve/mapper for create paths  
- [x] Align legacy `InvoiceExtractor` schema  
- [ ] CA-B4 deferred  

### Frontend

- [x] SupplierForm + TaxRegistrationsTab  
- [x] BillsInvoiceForm + line table structured tax + currency display  
- [x] InvoiceUpload preview + create payload  
- [x] Extract failure UX (no hang; error llm_trace; FE Retry)  
- [x] Purchase suggestion helper (seller=supplier / POS=LE; export→zero-rated)  
- [x] `po_mode` + `invoice_type=PURCHASE` (DDL + UI + upload + generate-from-PO)  
- [x] Bill PDF — skipped  

### Docs / demo

- [x] Keep `docs/tax/BILLS_*` updated  
- [x] Smoke: registered supplier GSTIN on bill (intra / inter / overseas); currency display  
- [x] Unit tests: tax-group reasonable match  
- [x] Sample PDF fixtures + upload→resolve→create tests (seeded HP + unknown Nova)  
- [x] Docs: agent handoff + APP_NAME=`fabriq_books` requirement  
- [x] Smoke: live LLM extract on sample PDF after env fix  
- [x] Extract auth failure fail-fast + llm_trace  
- [x] Demo tax groups for purchase suggestion (`bp3_demo_purchase_tax_groups.sql`)  
- [x] Local apply: `bp3_invoice_po_mode.sql` + prod plan doc  
- [ ] Smoke: RCM path  
- [ ] Smoke: legacy %-only bill  
- [ ] Prod apply: `bp3_invoice_po_mode.sql` (user; see `BP3_PO_MODE_PROD_PLAN.md`)  

---

## 10. Suggested PR sequence (after approval)

1. **Docs** — analysis + this plan — done  
2. **Schema proposal + views** — supplier + `invoice.supplier_id` — done  
3. **Supplier UI** — treatment, region, registrations — done  
4. **Bills form tax + currency** — BP-1 — done  
5. **Extract prompt/schema + create mapping** — BP-2 — **done**  
6. **Suggestion + invoice_type/po_mode** — BP-3 — **done** (PDF skipped)  
7. **Optional posting** — BP-4 after review  

---

## 11. Open items for reviewer

1. ~~Approve scope cuts (no PO/PR; posting deferred)?~~ — locked  
2. ~~Approve `invoice.supplier_id` + supplier tax fields DDL?~~ — done locally  
3. ~~`po_mode` migration (recommended) vs soft `PURCHASE` only?~~ — **approved; local done; prod = user apply**  
4. Prod apply `bp3_invoice_po_mode.sql` when ready — see [`BP3_PO_MODE_PROD_PLAN.md`](./migrations/BP3_PO_MODE_PROD_PLAN.md)  
5. ~~CA-B2 / no new HTTP API?~~ — locked ✅  
6. ~~Tax group from PDF: aggressive vs `%`?~~ — **reasonable regex/rate match**, else `%` — locked ✅  
7. ~~Images vs PDF-only?~~ — **reopened for purchases** (PDF + JPEG/PNG/WebP/HEIC); sales stays PDF-only ✅  
8. ~~Bill PDF in BP-3 or skip?~~ — **skipped**  
9. When should CA-B4 (purchase posting) be scheduled relative to sales CA-4?  
10. Overseas / non-GSTIN regs: keep label “Seller GSTIN” (pack) vs pack-aware “Seller tax registration”? — polish  

---

## 12. Success criteria

1. [x] Supplier has tax treatment, default region, and tax registration(s)  
2. [x] Bill links to `supplier_id` and shows seller/buyer tax IDs  
3. [x] Bill can use tax groups + HSN/SAC + component breakdown (pack-aware)  
4. [x] Bill supports currency + editable exchange rate (+ document-currency display)  
5. [x] Upload extract → create maps available tax/party/currency fields onto the bill  
6. [x] Legacy `%`-only bills and orgs without pack unchanged  
7. [x] PO/PR modules untouched  
8. [x] Bills classified as `PURCHASE` with separate `po_mode`  
9. [x] Purchase tax-group suggestion from item defaults + supplier/POS geography  

---

## 13. End-user documentation brief (for docs agent)

**Audience:** AP / bookkeeping users and admins configuring masters.  
**Product area:** Purchases → **Bills**, **Suppliers**, **Item master**, **Upload bill / receipt**; also sales **Customer** quick-add on invoices (shared UX).  
**Out of scope for user docs:** Purchase orders / requisitions tax (unchanged); bill PDF print layout (not shipped); purchase GL / input-tax posting (not shipped yet).  
**Related sales docs:** Structured tax on sales invoices already exists — mirror language where helpful; purchase roles are inverted (buyer = us / legal entity, seller = supplier).  
**Must include follow-ups:** [§13.15](#1315-follow-up-features-shipped-after-bp-3--required-in-user-docs) (receipt photos, Without-PO Done, quick-add party).

### 13.1 Feature summary (one paragraph)

Users can record **purchase bills** with structured tax: link a **supplier**, choose **legal entity** and **place of supply**, see seller/buyer tax registrations, set line **tax groups** and **HSN/SAC**, and work in the bill’s **document currency**. New bills default to **Without PO** (pick catalog items; save as you type and press **Done** — no Submit). **With PO** unlocks PO linking, Map-to-PO columns, and the usual **Submit / Approve** flow. Tax groups can be **suggested** from item defaults based on supplier vs place-of-supply regions (or zero-rated for overseas/export suppliers). Users can **upload a supplier PDF or a photo of a receipt** to extract and create a draft bill. From the bill (or sales invoice) party dropdown they can **quickly add a new supplier or customer**. Bills that only have a tax **percentage** still work.

### 13.2 Navigation / entry points

| User journey | How to get there (typical) | Screen / component |
|--------------|----------------------------|--------------------|
| Create / edit a bill | Purchases → Bills → New / open bill | `BillsInvoiceForm` |
| Upload PDF or receipt photo → create bill | Purchases → Bills → upload (“Upload bill or receipt”) | `InvoiceUpload` |
| Maintain supplier tax | Masters → Suppliers → edit supplier | `SupplierForm` + Tax Registrations tab |
| Maintain item tax defaults | Masters → Items → edit item | `ItemMasterForm` (tax group intra/inter + classification) |
| Quick-add supplier while on a bill | Bill form → Supplier dropdown → **+ Add new supplier** | `QuickSupplierCreateDialog` |
| Quick-add customer while on a sales invoice | Sales invoice → Customer dropdown → **+ Add new customer** | `QuickCustomerCreateDialog` |

Exact sidebar labels may vary by brand/config; docs should use the product’s Purchases / Masters names.

### 13.3 Concepts glossary (user language)

| Term | Meaning for users |
|------|-------------------|
| **Bill** | Purchase invoice from a supplier (AP document). Internally classified as invoice type **Purchase**. |
| **PO Mode** | **Without PO** (default): enter lines from the item catalog; **Done** closes the form (no Submit). **With PO**: link a purchase order; Map to PO / PO qty and **Submit / Approve** become available. |
| **Legal entity** | Your company entity on the bill (buyer). Defaults to headquarters on create. Drives tax pack / buyer GSTIN display. |
| **Supplier** | Seller party. Should have tax treatment, default region, and tax registration(s) for best tax display and suggestion. Can be created inline from the bill. |
| **Place of supply (POS)** | Tax region for the bill. Defaults from HQ legal entity on create; **changing supplier does not overwrite** an already-set POS. |
| **Tax treatment** | On supplier (e.g. domestic vs **export** / overseas). Export drives **zero-rated** tax group suggestion when configured. |
| **Tax group** | Named GST/HST (etc.) bundle (e.g. GST 18% CGST+SGST). Preferred over a raw %. |
| **Tax %** | Legacy single percentage on a line when no tax group is set. |
| **HSN / SAC** (classification) | Line / item product classification code; pack may label this HSN, SAC, etc. |
| **Seller / Buyer registration** | Tax IDs shown on the bill (e.g. GSTIN). Label may still say “Seller GSTIN” even for overseas EIN-style regs. |
| **RCM / reverse charge** | Bill-level tax responsibility when reverse charge applies (user/LLM can set; full RCM workflow polish still optional). |
| **Document currency + exchange rate** | Amounts on lines are in the bill currency; exchange rate is a header snapshot to the legal entity base currency — **changing currency does not recalculate line amounts**. |
| **Intra vs inter** | Same tax region as supplier → use item’s default (intra) tax group. Different region → item’s interstate / out-of-province group, else fall back to default group. |

### 13.4 Prerequisites (admin / setup)

Document these as “before first use” for structured tax:

1. **Legal entity** has tax settings / country pack (e.g. India GST) and a default tax region.  
2. **Tax groups** exist for the org (intra, inter/interstate, and ideally zero-rated for export).  
3. **Suppliers** have: tax treatment, default tax region, and at least one **Tax registration** (GSTIN / BN / EIN as applicable).  
4. **Items** used on Without-PO bills should have:  
   - **Tax group (intra-state / default)**  
   - **Tax group (inter-state / other region)** when cross-region purchases are expected  
   - Classification scheme + code (HSN/SAC) when required  
5. For PDF / photo upload: environment must use the books app prompt configuration (ops detail; end users only need “upload works” — if extract fails with a template error, escalate to admin).  
6. Users who quick-add suppliers/customers need permission to create those masters (same as Masters → Suppliers / Customers).

### 13.5 Workflow A — Create a Without-PO bill (manual)

1. Create a new bill → **PO Mode** defaults to **Without PO**.  
2. Confirm **Legal Entity** (HQ usually pre-filled).  
3. Select **Supplier** (or use **+ Add new supplier** in the dropdown — see §13.15).  
4. Confirm **Place of supply** (pre-filled from HQ; edit if needed — supplier change won’t clear it).  
5. Optionally set currency / exchange rate; enter line amounts in that currency.  
6. Add lines → pick **catalog items**.  
7. System may auto-fill **tax group** and classification from the item + geography:  
   - Same region as supplier → item default tax group  
   - Different region → item interstate tax group (or default if inter missing)  
   - Export supplier → zero-rated group when available  
   - **If the item has no intra/inter tax groups**, the tax group stays **blank** and the user enters or keeps **Tax %** — this is expected.  
8. User may override tax group, tax %, HSN/SAC, qty, rate — **changes save as you leave the field**; bill totals update when qty/rate/tax change.  
9. When finished, click **Done** to return to the Bills list. **There is no Submit button** on Without-PO bills.

### 13.6 Workflow B — Create a With-PO bill

1. Set **PO Mode** to **With PO** (may lock after leaving Draft depending on workflow).  
2. Select **PO Number** (purchase order).  
3. Line table shows PO mapping controls (Map to PO / PO qty) when a PO is linked.  
4. Tax chrome (POS, registrations, groups) still applies on the **bill**; PO itself is not edited for tax.  
5. Use **Submit** (then Approve / Reject as configured) — same approval path as before.

### 13.7 Workflow C — Upload supplier bill / receipt

1. Open **Upload bill or receipt** (Purchases → Bills → upload).  
2. Upload a **PDF or photo** (JPEG, PNG, WebP, HEIC/HEIF; up to 10MB). Sales invoice upload remains PDF-only.  
3. Wait for processing; on failure, an error is shown with **Retry** (do not leave the UI stuck on “Processing…”).  
4. Review preview: supplier, tax ID, place of supply, currency / FX, line HSN, tax % or matched group.  
5. Create bill (defaults to **Without PO** / Purchase). Correct fields on the bill form afterward if needed.  
6. If a matching PO is fully detected, the system may auto-create; otherwise user creates from preview.  
7. Extracted tax components are matched to org tax groups when confident; otherwise the line keeps a **%**. Tax labels in a footer (e.g. CGST/SGST) are **not** separate product lines.  
8. Printed payment terms may be matched to a payment-terms master when the wording matches.  
9. HEIC preview may be unavailable in some browsers; the file is still sent for extraction.

### 13.8 Workflow D — Configure a supplier for tax

1. Open supplier → set **Tax treatment** and **default tax region**.  
2. Open **Tax Registrations** tab → add registration number(s) for the supplier (party type supplier).  
3. Use that supplier on bills to see seller registration and improve suggestion geography.  
4. Alternatively, create a minimal supplier from the bill dropdown (§13.15); add tax registrations later for full tax display.

### 13.9 Workflow E — Configure an item for tax suggestion

1. Open item master.  
2. Set **Tax group (intra / default)** and **Tax group (inter / other region)** using pack labels.  
3. Set classification scheme + code.  
4. Without these defaults, bills will not auto-set a tax group on catalog pick (user uses % or picks a group manually).

### 13.10 Field reference — Bills form

| UI label (approx.) | What users should know |
|--------------------|------------------------|
| PO Mode | Without PO / With PO — changes footer actions (Done vs Submit) |
| Legal Entity | Buyer entity; affects pack and buyer tax ID |
| PO Number | Only when With PO |
| Supplier | Linked party; **+ Add new supplier** in dropdown; drives seller region / treatment / GSTIN display |
| Place of supply | Tax region; not auto-cleared on supplier change |
| Currency / Exchange rate | Document currency; FX is header-only snapshot |
| Seller / Buyer tax ID | Display from registrations / LE |
| Reverse charge / RCM | When applicable |
| Line: Item | Catalog (Without PO) or PO-mapped (With PO) |
| Line: Tax group | Suggested or manual; empty → use Tax % |
| Line: Tax % | Used when no tax group |
| Line: HSN/SAC / classification | From item or upload / editable |
| Line: Component breakdown | Shown when tax group expands into components |
| Done | Without PO only — leave the bill (data already saved) |
| Submit / Approve / Reject | With PO only — approval workflow |

### 13.11 Expected behaviours & FAQ (docs-ready)

| Question | Answer to publish |
|----------|-------------------|
| Why didn’t a tax group appear when I picked an item? | The item has no intra/inter tax group defaults (and isn’t on an export/zero-rated path). Set tax groups on the item, or choose a group / % on the line. |
| Why didn’t place of supply change when I changed supplier? | By design — POS defaults once from HQ and is not overwritten so users don’t lose a deliberate POS. |
| Why didn’t line amounts change when I switched currency? | Amounts stay in document currency numbers; only the currency code / FX snapshot update. Re-enter amounts if the invoice is in another currency. |
| Can I upload a photo of a bill? | **Yes on Purchases → Bills upload** — PDF or JPEG/PNG/WebP/HEIC. Sales invoice upload stays PDF-only. |
| Why is there no Submit on my bill? | **PO Mode is Without PO**. Edits autosave; use **Done** to return to the list. Switch to **With PO** if you need Submit / Approve. |
| Can I create a supplier without leaving the bill? | Yes — open the Supplier dropdown → **+ Add new supplier** → fill required fields → **Done**. The new supplier is selected on the bill. |
| Can I create a customer from a sales invoice? | Yes — Customer dropdown → **+ Add new customer** (same pattern). |
| What’s the difference between Purchase and PO Mode? | Purchase is the document class (vs sales). PO Mode only controls whether the bill is linked to a PO (and whether Submit appears). |
| Do purchase orders get tax fields now? | No — tax is on bills (and suppliers / items), not on PO/PR. |
| Will the bill PDF show GST breakdown like sales? | Not in this release (skipped). |
| Does creating a bill post AP / input tax to the ledger? | Not yet — purchase posting is a later phase. |

### 13.12 Demo scenarios (India pack — useful for screenshots)

| Scenario | Setup | Expected UX |
|----------|--------|-------------|
| Intra-state | Supplier HP (Karnataka GSTIN), POS Karnataka, item with GST18 | Seller GSTIN shown; suggest GST 18% group |
| Inter-state | Supplier Apollo (Delhi), POS Karnataka, item with inter group | Seller Delhi GSTIN; suggest interstate / IGST group when item has it |
| Overseas / export | Supplier Acme Global (EIN), treatment export | Seller reg may show EIN; suggest zero-rated if configured |
| No item tax defaults | Item without tax groups | Line tax group empty; use Tax % |
| PDF / photo upload | Sample HP PDF or `test-data/receipts/sample-receipt.jpg` | Preview supplier/GSTIN/POS/currency/HSN; create Purchase + Without PO |
| Without PO Done | New Without-PO bill, edit lines | Footer **Done**; no Submit |
| With PO Submit | PO Mode With PO + PO linked | Submit / Approve available |
| Quick-add supplier | Supplier dropdown → Add new | Modal → created supplier selected on bill |

### 13.13 Doc outline suggestion (for the docs agent)

1. Overview — structured tax on purchase bills  
2. Before you start — LE, tax groups, suppliers, items  
3. Create a bill without a PO (autosave + **Done**)  
4. Create a bill with a PO (Submit / Approve)  
5. Tax suggestion rules (intra / inter / export / blank)  
6. Currency and exchange rate on bills  
7. Upload a bill PDF or receipt photo  
8. Quick-add supplier (bills) and customer (sales invoices)  
9. Maintain supplier tax profile & registrations  
10. Maintain item tax groups & HSN/SAC  
11. Troubleshooting FAQ (§13.11)  
12. What’s not included yet (PO tax, bill PDF print, purchase posting)

### 13.14 Tone / accuracy constraints for docs agent

- Do **not** document PO/PR tax configuration (it was not built).  
- Do **not** claim automatic ledger posting of input GST.  
- Do describe purchase upload as **PDF or receipt photo**; sales upload remains PDF-only.  
- Do describe empty tax group after item select as **expected** when item defaults are missing.  
- Do describe **Without PO → Done (no Submit)** and **With PO → workflow Submit** accurately.  
- Do document **quick-add supplier/customer** from the invoice party dropdown.  
- Prefer pack-neutral wording (“tax registration”, “place of supply”) and note India labels (GSTIN, HSN) as examples.  
- UI label “Seller GSTIN” may appear for non-GSTIN overseas IDs until polish.

### 13.15 Follow-up features shipped after BP-3 — required in user docs

These are **released** even though they were not in the original BP-0…BP-3 tax scope. Document them alongside bills tax.

#### F1 — Upload receipt photos (purchases)

- **Where:** Purchases → Bills → upload.  
- **Accepts:** PDF, JPEG, PNG, WebP, HEIC/HEIF (max 10MB).  
- **Sales:** invoice upload remains PDF-only.  
- **Preview:** PDF and common images in-browser; HEIC may show a placeholder but still extracts.  
- **After extract:** Create draft bill (Without PO by default); tax components → tax group when match is confident.

#### F2 — Without PO: Done instead of Submit

- **Where:** Bill form when **PO Mode = Without PO**.  
- **Behaviour:** Field changes persist automatically (blur/save). Footer primary control is **Done** (returns to Bills list).  
- **With PO:** Shows **Submit** / **Approve** / **Reject** as before.  
- **Totals:** Update when line qty, rate, tax %, discount, or tax group change — users do not need Submit for totals on Without-PO bills.

#### F3 — Quick-add supplier / customer

- **Bills:** Supplier dropdown → **+ Add new supplier** → modal (name, address, city, state, country, zip, phone, email; legal name optional) → **Done** creates the supplier and selects it on the bill.  
- **Sales invoices:** Customer dropdown → **+ Add new customer** → modal (name, address, city, state, country, zip, industry, email; phone optional) → **Done** creates and selects.  
- **API (for implementers / advanced docs):** `POST /api/supplier/view/supplier_view` and `POST /api/customers/view/customers_view` via `viewAPI.create` — not workflow create.  
- **Limitation:** Quick-add does not collect tax registrations; users can add those later on the supplier/customer master for full GSTIN display and suggestion quality.

---

## Related

- [BILLS_TAX_ANALYSIS.md](./BILLS_TAX_ANALYSIS.md)  
- [TAX_ARCHITECTURE.md](./TAX_ARCHITECTURE.md)  
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)  
- **End-user doc source of truth for this feature:** [§13](#13-end-user-documentation-brief-for-docs-agent)  
- Touchpoints: `SupplierForm.tsx`, `TaxRegistrationsTab.tsx`, `BillsInvoiceForm.tsx`, `InvoiceForm.tsx` (sales + quick-add customer), `InvoiceLineItemRow.tsx`, `InvoiceLineItems.tsx`, `createBillDefaults.ts`, `InvoiceUpload.tsx`, `QuickPartyCreateDialog.tsx`, `SearchDropDown`, `invoiceExtractResolve.ts`, `AgentTools.ts` / `GenericFunctions.ts` (`extractInvoiceFromFile*`), `invoice_extractor` prompt, `billUploadMime.ts`, `promptTemplateFileMatch.ts`, `zeiv.ts` (`calculate_invoice_total`), `frontend-1/src/lib/tax/*` (`suggestTaxGroupId`)  
- Migrations: `docs/tax/migrations/bp0_supplier_invoice_supplier_id.sql`, `bp0_supplier_tax_registrations_demo.sql`, `bp3_invoice_po_mode.sql`, [`BP3_PO_MODE_PROD_PLAN.md`](./migrations/BP3_PO_MODE_PROD_PLAN.md)  
- Helpers: `frontend-1/src/lib/bills/poMode.ts`, `backend/src/lib/bills/poMode.ts`  
- Sample PDFs: `backend/test-data/bp2-bill-seeded-supplier-hp.pdf`, `bp2-bill-new-supplier-nova.pdf`  
- Sample receipt images: `backend/test-data/receipts/`  
- Prompt docs: [docs/agent/04-PROMPT_SYSTEM.md](../agent/04-PROMPT_SYSTEM.md), [SESSION_FAILURE_PATTERNS.md Pattern 5](../agent/debugging/SESSION_FAILURE_PATTERNS.md#5-prompt-template-not-found)
