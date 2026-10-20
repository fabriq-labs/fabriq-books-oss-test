# Implementation plan: AR Phase 3 (settlement) & Phase 4 (ledger)

Feed this to a coding agent **one work package at a time**. Design source of truth: [`AR_SETTLEMENT_AND_LEDGER.md`](./AR_SETTLEMENT_AND_LEDGER.md). Parent plan: [`QBO_INTEGRATION_PLAN.md`](./QBO_INTEGRATION_PLAN.md) Phases 3–4.

## How to run

1. Complete the named work package (WP), then stop. Do not start the next WP.
2. Read the design § cited before editing. Prefer additive schema; no `prisma db push` / migrate — SQL delta per [`../kernel/adding-a-model.md`](../kernel/adding-a-model.md).
3. Branch from current books line (`fabriq-books` or the active feature branch). Domain code under `backend/lib/` and `frontend-0/src/domain/`; dbt under `backend/integrations/quickbooks/dbt/`.
4. Prove the WP with the acceptance checks listed. Prefer `transform_only` against an org that already has QBO invoices before enabling new Airbyte streams.
5. Do not redeploy prod without an explicit ask. Do not print tokens / `DATABASE_URL`.

## Locked defaults (until product overrides §8 of the design)

| Decision | Default for this plan |
|---|---|
| Ledger cutover | Support `entity_ledger_settings.ledger_start_date`; if null, post all synced history |
| Multi-currency Phase 4 | Block non-functional-currency docs (`ledger_status=blocked`) |
| Deposits | **Out of Phase 3–4** — leave receipts on Undeposited Funds |
| Bank feed vs QBO cash | Defer policy; do not build bank matching in these WPs |
| Void in closed period | Retroactive reverse (design option A) |

---

## Dependency graph

```
WP0 schema + seeds
  ├─► WP1 dbt credit notes
  ├─► WP2 dbt payments + applications
  │     └─► WP3 resolver + orphan sweep + voids
  │           └─► WP4 Master UI (receipts / credits / apps)
  └─► WP5 posting schema + entity_ledger_settings
        └─► WP6 poster lib (invoice → CN → receipt)
              └─► WP7 wire after sync + backfill + T4
```

WP1 and WP2 can proceed in parallel after WP0. WP4 can start once WP2 lands data (even before WP3 polish). WP5+ are Phase 4.

---

## WP0 — Schema delta + seeds (Phase 3 foundation)

**Goal.** Make the data model match design §3 so dbt and UI can land.

**Read.** Design §3, §9; `backend/prisma/schema/sales.prisma`, `domain.prisma` (`posting`); `docs/kernel/adding-a-model.md`.

**Do.**

1. SQL delta (new file under `backend/prisma/migration/<date>/` or docs-linked path used by this repo):
   - Enums `settlement_target_type`, `ledger_status`.
   - `payment_receipt`: `unapplied_amount`, `receivable_account_id`, void + `ledger_*` columns.
   - `payment_receipt_application`: nullable `invoice_id`; add `credit_note_id`, `target_type`, `target_source_record_id`, `applied_date`, lineage quartet; CHECKs for signed amounts; uniques/indexes per design.
   - `credit_note` / `invoice`: void + `ledger_*`.
   - `credit_note_item`: lineage + optional discount/classification parity.
   - NEW `credit_note_application`, `credit_note_line_tax`.
   - Mirror changes in Prisma schema files.
2. Register new/private models in domain allowlists if required (`lib/domain.ts` / tenancy).
3. Seed scripts: `npm run seed:ar-settlement` (or extend `seed:sales`) for Master views:
   - `payment_receipt_view`, `credit_note_view` with nested applications / lines in `data_graph` (no secrets).
4. Apply delta only on local / agreed Railway staging DB.

**Acceptance.**

- [ ] `npx prisma generate` succeeds; `tsc` clean in backend.
- [ ] Views readable via `GET /api/payment_receipt/view/payment_receipt_view` (empty OK).
- [ ] Existing invoice sync still works (`transform_only` smoke).

**Stop.** Do not write dbt yet.

---

## WP1 — dbt: credit memos → `credit_note` + items

**Goal.** Land QBO CreditMemo into Books without applications yet.

**Read.** Design §4 credit-memo mapping; existing `invoice.sql` / `invoice_line_item.sql` as templates; Airbyte stream `credit_memos` / `qb_credit_memos`.

**Do.**

1. Enable / document stream in extraction config notes (`QUICKBOOKS_FORWARD_SYNC.md`).
2. Staging: `stg_qbo_credit_memos`, `stg_qbo_credit_memo_lines` (SalesItem / Discount / Group; skip SubTotal).
3. Normalized: `credit_note.sql`, `credit_note_item.sql` with lineage; `ItemAccountRef → account_id`; void detection via `PrivateNote`.
4. Wire models into dbt project + `sync_batch` stream names.
5. Optional: `credit_note_line_tax` only if header tax split is available; else header `tax_amount` only.

**Acceptance.**

- [ ] `transform_only` creates ≥1 `credit_note` + lines when realm has credit memos (or fixture datalake).
- [ ] Lineage unique; `balance_amount` matches QBO RemainingCredit/Balance when present.
- [ ] `prisma_guard` still blocks public DDL from dbt.

**Stop.** Do not build payment applications yet.

---

## WP2 — dbt: payments → `payment_receipt` + signed applications

**Goal.** Full subledger settlement from QBO Payment + LinkedTxn.

**Read.** Design §3.2–3.3, §4 Payment mapping, §6 examples 6.1–6.7.

**Do.**

1. Staging: `stg_qbo_payments`, `stg_qbo_payment_lines` (explode Line × LinkedTxn; drop Amount 0 noise only when both amount and linked txn empty — keep \$0 dual credit lines).
2. Normalized: `payment_receipt.sql` (`amount`, `unapplied_amount`, deposit + AR accounts, void).
3. `payment_receipt_application.sql`: signed amounts; `target_type`; FKs via lineage left join; `source_record_id = {PaymentId}:{TxnType}:{TxnId}`.
4. Set convenience `payment_receipt.invoice_id` only when exactly one invoice-target app.
5. dbt tests (warn): T1 on receipts touched this run; T3 on credits if apps present.

**Acceptance.**

- [ ] Multi-invoice payment creates N application rows; T1 holds.
- [ ] Credit apply via \$0 payment creates +invoice / −credit apps (example 6.6).
- [ ] Overpay leaves `unapplied_amount > 0` (example 6.4).

**Stop.** Resolver/sweep can be stubbed as “left join null FK OK”.

---

## WP3 — Resolver, orphan sweep, voids / deletes

**Goal.** Idempotent re-sync that converges when QBO edits applications or voids docs.

**Read.** Design §4 Resolver / Orphan sweep / Hard deletes.

**Do.**

1. Post-dbt hook or dbt operation: resolve null `invoice_id` / `credit_note_id` from `target_source_record_id`.
2. Orphan sweep macro: for parents in current batch, delete child apps/lines whose lineage key absent from staging (also apply to `invoice_line_item` if still merge-only).
3. Void: map Voided PrivateNote → `status=void`, sweep apps, set `void_reason`.
4. CDC / deleted-objects: minimal path — document limitation if CDC not wired; optional `datalake.qb_deleted_objects` + mark void. Monthly id-diff is acceptable fallback documented in ops guide.

**Acceptance.**

- [ ] Re-run sync twice → stable row counts; removed QBO line disappears from Books.
- [ ] Voided payment → `status=void`, apps gone, T1 N/A or zeroed per design.

**Stop.** No GL.

---

## WP4 — Master UI for settlement

**Goal.** See receipts, credits, and applications in the shell (metadata Master).

**Read.** Design §6 cheat sheet; Connections Master pattern; `seed:sales` / `seed:ar-settlement`.

**Do.**

1. Finish `data_graph` nesting: receipt → applications → `invoice{number}` / `credit_note{number}`.
2. Routes/nav: Payments received, Credit notes (list). Detail can be Master detail or thin domain page showing balances + app table (read-only OK for sync-fed orgs).
3. Invoice detail: show applied receipts / credits (read-only from apps).
4. Copy: user-friendly (“Applied to”, “Unapplied”), not LinkedTxn jargon.

**Acceptance.**

- [ ] Open a synced multi-invoice receipt; applications visible with signed amounts.
- [ ] Credit note list shows balance; \$0-payment apply reflected on invoice balance.

**Stop.** No native “Record payment” form required in this WP (can follow).

---

## WP5 — Phase 4 schema: posting + ledger settings

**Goal.** Unlock multi-posting per document and defaults for the poster.

**Read.** Design §3.8, §5.

**Do.**

1. SQL/Prisma: `posting.credit_note_id`; `posting_key`; drop `@unique` on `payment_receipt_id` → index; kinds allowlist / `businessContext` for `sales_credit_note`, `sales_receipt`, `sales_settlement`.
2. NEW `entity_ledger_settings` + seed/prefill from synced CoA (AR, Undeposited Funds) where detectable.
3. Add `ledger_*` usage: backfill helper sets `ledger_status='pending'` on posted docs with no active posting (script only; do not auto-post yet).

**Acceptance.**

- [ ] Can insert two `posting` rows with same `payment_receipt_id`.
- [ ] Partial unique on `(org_id, posting_key) WHERE active` works in SQL.

**Stop.** No poster logic yet.

---

## WP6 — Shared poster library

**Goal.** Idempotent create/reverse/repost for invoice, credit note, receipt.

**Read.** Design §5 legs table; §6 examples; existing `backend/lib/gl` patterns if any.

**Do.**

1. `backend/lib/sales/ledgerPosting.ts` (or similar): resolve AR/income/tax/cash accounts; build legs; advisory lock; reverse-and-repost by `posting_key`.
2. Functions: `postInvoice`, `postCreditNote`, `postPaymentReceipt` (applications → no-op unless FX later).
3. Respect `ledger_start_date`, functional currency block, `amount=0` → `not_required`.
4. Unit tests with fixture docs (no QBO required): examples 6.1, 6.3, 6.6.

**Acceptance.**

- [ ] Post twice → no duplicate active postings.
- [ ] Change receipt amount + re-post → old reversed, new active.
- [ ] Example 6.6: CN + invoice post; \$0 receipt → `not_required`; AR net matches.

**Stop.** Do not hook sync yet.

---

## WP7 — Wire after sync + backfill + AR tie-out

**Goal.** Production path: sync lands docs → poster runs → close check.

**Read.** Design §5 order of operations; T4 close invariant.

**Do.**

1. After successful sync proxy (`sourceSystemSync`), enqueue/run poster for org: invoices → credit notes → receipts.
2. CLI: `npm run ledger:post-org -- --org org_xxx` for backfill.
3. Warn-level T4 query/report: GL AR vs Σ balances − unapplied − credit balances.
4. Update `QUICKBOOKS_FORWARD_SYNC.md` with Phase 3–4 ops steps.
5. Optional: Railway staging dry-run with payments + credit memo streams enabled.

**Acceptance.**

- [ ] End-to-end: QBO payment on staging → receipt + apps in UI → postings on Transactions / trial balance.
- [ ] Re-sync does not duplicate postings.
- [ ] T4 documented; variances explained (unsynced refunds/JEs).

**Stop.** Phase 3–4 complete for QBO-first AR.

---

## Explicitly later (do not pull into these WPs)

- QBO Deposit → `bank_deposit`
- RefundReceipt / refund checks / A/R journal entries
- Multi-currency FX legs on applications
- Native “Receive payment” / “Apply credit” write UI (reads in WP4; writes optional follow-up)
- Reverse sync, Bills, PO
- Changing Docker base image

---

## Suggested agent prompts (copy-paste)

| WP | Prompt |
|---|---|
| 0 | “Implement WP0 from `docs/domain/AR_PHASE_3_4_IMPLEMENTATION.md` — schema delta + seeds only.” |
| 1 | “Implement WP1 — dbt credit memos only.” |
| 2 | “Implement WP2 — dbt payments and signed applications.” |
| 3 | “Implement WP3 — resolver, orphan sweep, voids.” |
| 4 | “Implement WP4 — Master UI for receipts and credit notes.” |
| 5 | “Implement WP5 — posting schema and entity_ledger_settings.” |
| 6 | “Implement WP6 — shared ledger poster with unit tests from design §6.” |
| 7 | “Implement WP7 — post-after-sync, backfill CLI, T4 docs.” |

---

## Progress checklist

- [ ] WP0 Schema + seeds  
- [ ] WP1 Credit memo dbt  
- [ ] WP2 Payment + application dbt  
- [ ] WP3 Resolver / sweep / voids  
- [ ] WP4 Master UI  
- [ ] WP5 Posting schema + ledger settings  
- [ ] WP6 Poster lib  
- [ ] WP7 Sync wire + backfill + T4  
