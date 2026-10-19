# QuickBooks Online integration — design review & implementation plan

**Audience:** implementers porting prod QBO sync onto the books/kernel branch.  
**Depends on:** universal sales schema in [`SALES_MODEL.md`](./SALES_MODEL.md) (`sales.prisma` / `tax.prisma` on `agentc/sales-universal-model-6a16`).  
**Prod reference:** `origin/prod` → `backend/integrations/quickbooks/`, `backend/integrations/shared/`, `backend/integrations/sync_service/`, Node reverse sync under `backend/src/lib/integrations/quickbooks/`.

---

## Parallelism verdict (vs sales frontend)

**Yes — QBO forward sync can start before sales UI**, with a hard gate on schema + connection foundation.

| Workstream | Needs sales frontend? | Needs sales posting lib? | Needs `source_system`? |
|---|---|---|---|
| Port `backend/integrations/` + adapt dbt to new column names | No | No | Yes (join target) |
| OAuth / encrypted credentials / sync trigger API | No (minimal connect UI later) | No | Yes |
| Land customers / items / invoices / tax into public tables | No | No | Yes |
| Create ledger `posting` for posted QBO invoices | No | **Yes** (or a sync-only poster) | Yes |
| Sales Master screens / invoice form | **Yes** | Useful | No |
| QBO reverse sync (PO push) | No | No | Yes — **out of scope** (purchases) |

**Recommended parallel split**

1. **Track A (this plan):** QBO foundation + dbt rename to universal model → rows appear in DB (verify with SQL / generic Master once views seeded).
2. **Track B (separate):** Sales Phase B frontend + `postInvoice` / tax expand.
3. **Join point:** After both land, wire “sync creates postings” (or run a one-shot poster over synced `status=posted` invoices).

Do **not** block Track A on React forms. Do **not** point sync at prod databases.

---

## A. Architecture summary (prod today)

```
Intuit QBO (OAuth, realm_id)
        │
        ▼
Airbyte Cloud  ──extract──►  datalake.qb_*  (JSONB / flattened)
        │
        ▼
dbt (quickbooks/dbt): staging → sync_batch → normalized → public.*
        │
        ▲
Railway FastAPI sync_service
  POST sync(org_id, system_type=quickbooks)
  → validate org API key
  → trigger Airbyte
  → run quickbooks/run_dbt.py
```

**Credentials:** `public.source_system` row per `(org_id, system_type)` with AES-encrypted `connection_config` / optional `extraction_config` (`ERP_CONFIG_ENCRYPTION_KEY`). See prod `ERP_CREDENTIALS_MIGRATION.md`.

**QBO forward objects (normalized today)**

| dbt model | Target table (prod) |
|---|---|
| `account` | `account` |
| `customers` | `customers` |
| `supplier` | `supplier` |
| `item_master` | `item_master` |
| `invoice` | `invoice` (always `invoice_type='SALES'`) |
| `invoice_line_item` | `invoice_line_item` (`instance_id` → invoice) |
| `location` | `location` (synthesized from BillAddr) |
| `tax_master` / `tax_group` / `tax_group_component` | tax tables |

**Not normalized on QBO prod today:** `payment_receipt`, `credit_note`, Payment LinkedTxn applications, Bills (`PURCHASE`).

**Reverse sync (Node):** `ERPConnector` factory → QBO **purchase_order** (+ expense accounts) only. Sales reverse push does not exist. **Out of scope for this plan.**

**Extraction policy:** Airbyte Cloud (PSO-managed), table prefix `qb_`, incremental via `MetaData.LastUpdatedTime`. Strategy: `QUICKBOOKS_STRATEGY.md`.

---

## B. Object coverage matrix (QBO → universal books model)

| QBO entity | Prod Fabriq | Books target | Status |
|---|---|---|---|
| Account | `account` | `account` | **RENAME fields** — prod dbt writes `type` array; books uses `account_types` + `classification`. Fix mapping. |
| Customer | `customers` | `customer` | **RENAME table + columns** — `customer_name`→`name`, `customer_address`→`address`, `zip_code`→`postal_code`, `primary_email`→`email`, `preferred_currency_id`→`currency_id`, drop required `industry` |
| Vendor | `supplier` | `supplier` (thin) | **SIMPLIFY** — map to thin supplier columns; park onboarded_date / industry / etc. |
| Item | `item_master` | `item_master` | **RENAME** — `item_name`→`name`, `item_code`→`code`, `stockable` Y/N→`is_stockable` bool, `supplier_id`→`preferred_supplier_id`, Decimal `unit_price` |
| Invoice | `invoice` | `invoice` | **RENAME** — `invoice_type`→`direction='sales'`, amounts→`net_amount`/`tax_amount`/`total_amount`/`balance_amount`, `deliver_to`→`ship_to`, status→lowercase enum, Decimal, lineage keep |
| Invoice line | `invoice_line_item` | `invoice_line_item` | **RENAME** — `instance_id`→`invoice_id`, `rate`→`unit_price`, qty/amount Decimal, optional lineage |
| BillAddr location | `location` | `location` | **RENAME** — `legal_entity_id`→`entity_id`, add lineage (or keep deterministic id), `zip_code`→`postal_code` |
| TaxRate | `tax_master` | `tax_master` | **RENAME** — `tax_rate` Int% → `rate` Decimal(9,6); add `source_record_id` (prod used synthetic `tax_code` only) |
| TaxCode | `tax_group` (+ components) | `tax_group` / `tax_group_component` | **ADAPT** — map components; set `is_active` vs status string |
| Term | joined into customer/invoice | `payment_terms` | **ADD model sync** (or name-match only as today) — prefer upsert `payment_terms` with lineage |
| Payment | — | `payment_receipt` + `payment_receipt_application` | **GAP** — no QBO normalized model yet |
| CreditMemo | — | `credit_note` + lines | **GAP** — no QBO normalized model yet |
| Bill | — | `invoice` `direction=purchase` | **LATER** (purchases) |

---

## C. Design review findings (by severity)

### P0 — Must fix before first green sync on books

1. **`source_system` missing on books.** Every normalized model joins `public.source_system`. Port the Prisma model + encryption middleware (or equivalent) before dbt can run. Also bootstrap `datalake` schema + `sync_batch` (dbt integrations layer); `prisma_guard` must keep refusing DDL on `public`.
2. **Blind paste of prod dbt will fail.** Column and table names diverge (`customers` vs `customer`, `invoice_type` vs `direction`, `instance_id` vs `invoice_id`, Float vs Decimal, `account.type` vs `account_types`).
3. **Account classification mapping.** Prod QBO `account.sql` emits `type` as `text[]` and title-case classes (`Assets`); books expects `account_types` + lowercase enum `classification` (`asset`, …).
4. **Tax rate type.** Prod stores `tax_rate` as integer percent (rounds 9.10→9); books `tax_master.rate` is `Decimal(9,6)`. Stop Int rounding; document percent vs fraction once in a dbt macro.
5. **Invoice line parent FK.** Must write `invoice_id`, never `instance_id`.
6. **Status / money semantics.** Prod writes Paid/Partial/Open strings and often sets both net and total from `TotalAmt`. Books: remote open/paid ⇒ `status=posted` + `balance_amount`; map `tax_amount` from `TxnTaxDetail.TotalTax` and `net_amount` from total−tax (or line sum)—do not copy `invoice_net_total = total_amt`.

### P1 — Should decide in Phase 0 design spike

7. **Posting policy for synced invoices.** Prod dbt never creates `posting`. Options: (a) leave `status=posted` without `posting` until Track B poster exists (`synced_unposted`); (b) call shared `postInvoice` from a Node hook after dbt; (c) SQL-generate postings in dbt (discouraged). **Recommendation:** (a) then (b).
8. **`due_date` dropped on prod.** Staging extracts `DueDate`; normalized `invoice.sql` never selects it (only uses it for terms matching). Books has `invoice.due_date` — write it.
9. **Entity HQ join.** Prod uses `is_it_headquartres` and sometimes `coalesce(le.id, org_id)` as legal entity — unsafe when org id ≠ entity id. Use `entity.is_headquarters` and a real `ent_*` id.
10. **Location / line identity.** Prod uses MD5 deterministic ids without lineage. Prefer lineage + natural key, or deterministic id **and** `source_record_id`.
11. **Payment terms.** Join today on prod `payment_terms` / `no_of_days` → books `name` / `days`. Upserting `payment_terms` with QBO Term Id as lineage is cleaner than name-only match.
12. **Multi-connection fragility.** Prod lateral join picks “any active quickbooks” `source_system` without scoping to the sync request’s connection. Scope by `org_id` + the connection being synced.
13. **Unique constraints with null lineage.** In-app rows may null `source_record_id`; synced rows must always set all three lineage keys.

### P2 — Follow-ups (not blocking first customer/invoice land)

14. **No QBO Payment / CreditMemo streams in normalized layer** — add after core sales objects sync (schema already ready).
15. **`invoice_line_tax` / line `tax_group_id`** — prod leaves these null; wire TaxCode→TaxRate for books tax posting.
16. **Vendor tax id** — map QBO `TaxIdentifier` into `party_tax_registration` (not a free-text supplier column).
17. **TaxAgency** — staging only; park as label behind `tax_master` / region, not a first-class table.
18. **Reverse PO connector** — purchases module; do not port in QBO-first sales slice.
19. **Airbyte connection management UI** — minimal: store `extraction_config`; full admin UI can wait.
20. **Department / Class** — parked per `SALES_MODEL.md`.

### Design smells to clean while porting

- `run_dbt.py` first-run detection still references `public.customers` — update to `public.customer`.
- Supplier normalized model fills many prod-only required strings (`industry`, `onboarded_date`) — drop for thin supplier.
- Mixing `status` display strings (`Paid`/`Open`) with books enum (`draft`/`posted`/`void`) — map in dbt: QBO balance==0 → still `posted` with `balance_amount=0`; never invent `draft` for remote posted invoices.
- Item: map PrefVendor→`preferred_supplier_id` and SalesTaxCode→`tax_group_id`, not only `item_tax_category` label.
- Prefer real QBO Ids in lineage over synthetic `qbo_code_*` / `qbo_rate_*` codes where unique constraints allow.

---

## D. Proposed implementation phases (QBO-first)

### Phase 0 — Foundations (books branch)

**Deliverables**

- Prisma `source_system` in `integrations.prisma` (org-scoped JSON configs, `@@unique([org_id, system_type])`, optional `entity_id`) — **model landed on this branch**; encryption middleware still Phase 0 follow-up when connectors land
- Datalake bootstrap SQL: `datalake` schema + `sync_batch` (`prisma/migration/2026-10-19/datalake_bootstrap.sql`)
- Sales/tax/public schema via `sales_universal_model_delta.sql` or fresh `setup:kernel`
- Shared encryption helper usable from Node (and document Python parity in `integrations/shared/`) — when porting connectors
- Env template entries: `ERP_CONFIG_ENCRYPTION_KEY`, QBO OAuth placeholders, Airbyte placeholders — **no secrets committed**
- Register `source_system` in domain SQL allowlist — **done**

**Acceptance**

- Insert one `system_type='quickbooks'` row for a non-prod org — covered by `npm run smoke:sales-model`
- Decrypt round-trip when encryption middleware lands
- App boots without QBO configured

### Phase 1 — Bring integrations tree + dbt rename (no new QBO objects)

**Deliverables**

- Copy/adapt `backend/integrations/{shared,sync_service,quickbooks}` onto books
- Rewrite normalized models to universal columns (matrix in §B), including: `due_date`, net/tax/total split, HQ `is_headquarters`, scoped `source_system` join
- Update `run_dbt.py` / dbt tests / first-run checks for `customer` (not `customers`)
- Docker/Railway notes for sync_service pointing at books schema; keep `prisma_guard` (no public DDL from dbt)
- Seed or script: ensure `payment_terms` / currency / HQ entity lookup still works

**Acceptance**

- `transform_only` (or full sync against sandbox Airbyte) merges:
  - ≥1 `account`, ≥1 `customer`, ≥1 `item_master`, ≥1 `invoice` + lines, tax group/rate if present in realm
- All merged rows have lineage populated
- `invoice.direction = sales`, amounts Decimal, lines use `invoice_id`, `due_date` set when QBO sends DueDate
- No writes to prod DB

### Phase 2 — Connection + sync trigger (API)

**Deliverables**

- Node routes (via `domain.ts`): create/update QBO connection, test connection, trigger sync (proxy to sync_service or in-process)
- Minimal admin UI **optional** — API + curl/docs enough for parallel track
- Persist Airbyte connection id in `extraction_config`

**Acceptance**

- Authenticated admin can trigger sync for one org; `last_sync_at` / `last_sync_status` updated
- Missing credentials → 503/400, app otherwise healthy

### Phase 3 — Payments + credit memos (QBO gaps)

**Deliverables**

- Staging + normalized: Payment → `payment_receipt` + `payment_receipt_application`
- CreditMemo → `credit_note` + `credit_note_item` with lineage
- Map deposit account → `account_id` via synced CoA

**Acceptance**

- Multi-invoice payment creates application rows summing to payment amount
- Credit memo links `invoice_id` when QBO provides a usable link; else null

### Phase 4 — Ledger alignment (join with sales Track B)

**Deliverables**

- After `postInvoice` / `postReceipt` / `postCreditNote` exist: sync hook or batch job creates `posting` for remote posted docs
- Trial balance still balances on Module 1 reports

**Acceptance**

- Synced posted invoice appears on Transactions and trial balance
- Idempotent re-sync does not duplicate postings (lineage or `posting.invoice_id` guard)

### Phase 5 — Explicit non-goals (do not start in QBO-first)

- NetSuite / Zoho / Xero ports (separate plans; reuse `source_system` + sync_service)
- QBO Bill → purchase invoice UI
- Reverse sync of invoices/customers to QBO
- Purchase order reverse connector
- Real-time webhooks from Intuit (Airbyte schedule is enough)
- Department/Class dimensions
- Pointing Railway sync at production Fabriq DB

---

## E. Suggested work breakdown (agent-sized tasks)

| # | Task | Depends |
|---|---|---|
| Q0 | Add `source_system` + encryption + SQL delta | Sales schema merged or same branch |
| Q1 | Vendor `backend/integrations/quickbooks` + shared + sync_service into repo | Q0 |
| Q2 | Rewrite dbt normalized SQL for `account`, `customer`, `supplier`, `item_master` | Q1 |
| Q3 | Rewrite dbt for `invoice`, `invoice_line_item`, `location`, tax_* | Q2 |
| Q4 | Sync trigger API + sandbox dry-run doc | Q0–Q3 |
| Q5 | Payment + CreditMemo normalized models | Q3 |
| Q6 | Posting alignment with sales lib | Sales Phase B + Q3 |

Frontend sales forms are **not** in this list. A thin “Connections” settings page can attach to Q4 if needed for demos.

---

## F. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Airbyte schema drift per realm | Keep staging resilient (`null::` for missing columns) as prod does |
| Duplicate customers on re-sync | Merge on `(org_id, source_system_id, source_record_id)` |
| Tax percent vs fraction confusion | One conversion helper in dbt macros; assert in tests |
| Sync without entity | Default `entity_id` to org HQ entity when QBO has no dimension |
| Parallel frontend assumes different column names | Freeze `SALES_MODEL.md`; integrations only target that schema |

---

## G. Review checklist (for you)

- [ ] Agree parallelism: dbt+foundation before UI
- [ ] Agree posting deferred to Phase 4 (synced rows visible in DB first)
- [ ] Agree Payment/CreditMemo are Phase 3 (not in first land)
- [ ] Agree reverse PO sync stays out
- [ ] Confirm `source_system` lives in domain/integrations schema (not kernel platform) on books

Once approved, implementation should start at **Phase 0** on a branch off the sales-model branch (or merged `fabriq-books` after sales schema lands).

---

## H. Sources

- Prod tree: `origin/prod:backend/integrations/{quickbooks,shared,sync_service}` and `backend/src/lib/integrations/quickbooks/`
- Books targets: `sales.prisma`, `tax.prisma`, [`SALES_MODEL.md`](./SALES_MODEL.md)
- Cross-check: coding-agent inventory of the same prod paths (object matrix, `due_date` drop, net=total smell, HQ join, multi-connection lateral join)
