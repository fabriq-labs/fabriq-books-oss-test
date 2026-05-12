# Opening Balance & Balance Sheet — Developer Reference

> **Status**: Living document — updated as features are built.
> **Last updated**: 2026-05-12

---

## Table of Contents

1. [Opening Balance Data Model](#2-the-opening-balance-data-model)
2. [Migration Journal — How Balances Are Imported](#3-migration-journal--how-balances-are-imported)
3. [Opening Balances UI](#35-opening-balances-ui-redesign)
4. [Account Form — Opening Balance Display](#36-account-form--opening-balance-display)
5. [How Reports Read Opening Balances](#4-how-reports-read-opening-balances)
6. [Database Views](#5-database-views)
7. [Trial Balance Reports](#6-trial-balance-reports)
8. [Verification](#7-verification)
9. [Key Design Decisions](#8-key-design-decisions)

---

## 1. Overview

This document covers two related features:

1. **Opening Balance Migration** — how a business imports its prior-system closing balances (e.g. from Zoho Books) into Fabriq on day one.
2. **Balance Sheet / Trial Balance reports** — how the imported balances flow into the period and monthly reports.

The core invariant: `OPENING_BALANCE` postings are never mixed into period activity. Reports read them separately and surface them as the opening column.

---

## 2. The Opening Balance Data Model

### 2.1 Posting type

Every posting in the system has a `posting_type` field. The value `'OPENING_BALANCE'` is reserved exclusively for migration journal entries. It is excluded from all period-activity aggregations.

### 2.2 Double-entry structure

Each balance-sheet account gets one posting dated on the **last day of the prior financial year** (the migration date, e.g. `2025-03-31`):

| Account classification | Debit (`account_id`) | Credit (`credit_account_id`) | Amount |
|---|---|---|---|
| Asset — normal balance (Cash ₹45L) | asset account | OBC | ₹45L |
| Asset — contra / abnormal (Acc. Dep ₹8L) | OBC | asset account | ₹8L |
| Liability — normal (AP ₹22L) | OBC | liability account | ₹22L |
| Equity — normal (Retained Earnings ₹40L) | OBC | equity account | ₹40L |

Fields set on every OPENING_BALANCE posting:
- `posting_type = 'OPENING_BALANCE'`
- `posting_date = value_date = migration_date`
- `status = 'ACTIVE'`
- `name = 'Opening Balance - {account_name}'`

### 2.3 Opening Balance Clearing (OBC)

The **OBC account** (`code = '__OBC__'`, `classification = 'Equity'`) is the contra-account for all opening balance entries. It is auto-upserted per `(org_id, legal_entity_id)` on first import.

- ID pattern: `acco_{orgId}_{legalEntityId}_obc` (special chars replaced with `_`)
- When the import is balanced (Assets = Liabilities + Equity), OBC nets to **exactly zero**.
- A non-zero OBC balance on the balance sheet indicates a data imbalance in the imported figures — it is intentionally visible so the user can correct it.

Income and expense accounts are **not** part of the opening balance import — they reset each financial year. Only balance-sheet accounts (Assets, Liabilities, Equity) are imported.

---

## 3. Migration Journal — How Balances Are Imported

### 3.1 Service layer

**File**: `backend/src/services/book-keeping/migration-journal/MigrationJournalService.ts`

Key functions:
- `createMigrationJournal(sdl, { legal_entity_id, migration_date, rows, replace? })` — creates OPENING_BALANCE postings
- `deleteMigrationJournal(sdl, { legal_entity_id, migration_date })` — removes all OPENING_BALANCE postings for the entity/date
- `getMigrationJournalStatus(sdl, { legal_entity_id })` — returns migration dates and posting counts

The service uses `SystemDataLayer` (not the permission-filtered DAL) so it can write `posting_type`, `status`, and other system fields that view-based permissions would strip.

### 3.2 CSV import

**File**: `backend/src/services/book-keeping/migration-journal/MigrationJournalCsvParser.ts`

Accepts two CSV formats:

**Format A — Debit / Credit columns (Zoho Books style)**
```csv
Account Code,Account Name,Debit Balance,Credit Balance
1101,Cash on Hand,200000,
1102,Checking Account,4500000,
1202,Accumulated Depreciation,,800000
2101,Accounts Payable,,2200000
```
The parser resolves `signed_balance = debit - credit` for debit-normal (Assets/Expense) accounts and `credit - debit` for credit-normal (Liabilities/Equity/Income) accounts.

**Format B — Signed balance column**
```csv
Account Code,Balance
1101,200000
1202,-800000
2101,-2200000
```
Positive = normal balance direction; negative = abnormal.

Account resolution: by `code` first, then `name` if code column absent. Unresolvable accounts are collected as parse errors but do not abort the import if at least one row succeeds.

### 3.3 API endpoints

Registered as custom actions (self-registering via `register.ts`):

| Endpoint | Purpose |
|---|---|
| `POST /api/setup/custom/migration-journal` | JSON: `{ legal_entity_id, migration_date, rows, replace? }` |
| `POST /api/setup/custom/migration-journal-csv` | Multipart CSV + same params |
| `POST /api/setup/custom/migration-journal-status` | Check existing journals for an entity |
| `POST /api/setup/custom/migration-journal-delete` | Hard-delete by entity + date |

`replace = true` deletes existing OPENING_BALANCE postings for the entity/date inside the same transaction before inserting new ones. Without it, a second submit returns a 409-style error.

### 3.4 UI entry point

**Route**: `/accounting/opening-balances`
**File**: `frontend-1/src/pages/accounting/OpeningBalances.tsx`

See §3.5 for the full UI design.

---

### 3.5 Opening Balances UI — design and behaviour

**Route**: `/accounting/opening-balances`  
**File**: `frontend-1/src/pages/accounting/OpeningBalances.tsx`

#### Layout (matches Master.tsx pattern)

```
Opening Balances                    [+ Add Opening Balance]  [Import CSV]
Imported as of 30 Mar 2025

14 accounts · 30 Mar 2025                               [🗑 Remove all]
─────────────────────────────────────────────────────────────────────────
Account                                                          Balance
─────────────────────────────────────────────────────────────────────────
1102  Checking Account                              ₹45,00,000.00  Dr
1105  Accounts Receivable                           ₹38,00,000.00  Dr
2101  Accounts Payable                              ₹22,00,000.00  Cr
...
```

#### Key design decisions

| Decision | Rationale |
|---|---|
| Entity from global switcher, not page-level dropdown | The entity context is already global; a page-level selector would be redundant and inconsistent with all other pages. |
| No standalone date field on the main page | The migration date only matters at import time; it lives inside the Add modal with a sensible default. |
| Two columns only (Account + Amount with Dr/Cr badge) | A separate "Classification side" column is redundant — the Dr/Cr badge conveys the same information more compactly. |
| No warning banner for existing entries | The table itself shows what exists. The modal surfaces the "X entries will be replaced" note inline when the user actively chooses to add. |
| "Remove all" is low-prominence (small, destructive-coloured) | Deleting all opening balances is irreversible and rarely needed. The action is available but not prominent. |

#### How OBC is identified in the frontend

Each `OPENING_BALANCE` posting has two legs: the real account and the OBC account. Since `posting_view` returns `account.code` and `credit_account.code`, the frontend identifies OBC by:

```ts
const isOBCDebit = posting.account?.code === '__OBC__';
// Real account is on the credit side (liability/equity)
// Otherwise real account is on the debit side (asset)
```

This avoids fetching account classifications — `code === '__OBC__'` is a reliable signal because OBC is always created with that exact code.

#### Sign convention for display

The amount in the table is the raw posting amount (always positive). The Dr/Cr badge tells the user which side:

- **Dr** (blue) — account is the debit leg → normal balance for Assets
- **Cr** (green) — account is the credit leg → normal balance for Liabilities/Equity

Contra-asset accounts (e.g. Accumulated Depreciation) naturally appear as **Cr** since they were entered in the Credit Balance column of the Zoho export.

#### Add modal

Opens on "+ Add Opening Balance". Contains:
- **Date field** — pre-filled to the last day of the previous FY (derived from the entity's `financial_year_type`)
- **Account rows table** — searchable dropdown per row, grouped by Assets / Liabilities / Equity; duplicate accounts suppressed
- **Live balance check** — shows Assets − (Liabilities + Equity) difference; green if balanced
- **Inline replace warning** — "X existing entries will be replaced" when postings already exist, inside the modal (not a page-level banner)
- **Save / Replace** button label changes based on whether entries exist

#### Import CSV

The "Import CSV" button at the top triggers a file picker directly. It uses the same `migrationDate` state as the modal (pre-filled from FY type). The import replaces existing entries if any exist (`replace = true` when `existingCount > 0`). Parse errors are logged to the console; successful rows are imported even if some fail to resolve.

#### Data loading

The imported entries table is populated via the metadata-driven search API — no custom endpoint:

```ts
viewAPI.search("posting", "posting_view", 1, 200, undefined, {
  legal_entity_id: entityId,
  posting_type: "OPENING_BALANCE",
}, { value_date: "asc" })
```

The response is processed in the frontend to extract real (non-OBC) accounts. Results are sorted: debit-side (assets) first, then credit-side (liabilities/equity), alphabetical within each group.

---

### 3.6 Account Form — Opening Balance Display

**File**: `frontend-1/src/components/forms/Masters/AccountForm.tsx`

When viewing an account in edit mode, the form shows a read-only **Opening Balance** banner at the top if an `OPENING_BALANCE` posting exists for that account:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📅  Opening Balance  as of 30 Mar 2025  ·  ₹45,00,000.00  Dr   │
└─────────────────────────────────────────────────────────────────┘
  Name
  [Checking Account                                              ]
  Classification
  ...
```

#### How it works

One search call on mount (edit mode only):

```ts
viewAPI.search("posting", "posting_view", 1, 1, undefined, {
  OR: [{ account_id: id }, { credit_account_id: id }],
  posting_type: "OPENING_BALANCE",
})
```

This uses the `SearchQueryBuilder`'s native OR support — a single API call returns the posting if it exists, regardless of which leg the account is on.

#### Sign convention

The `classification` is already loaded into the form. Two checks determine the display sign:

```ts
const onDebitLeg    = posting.account_id === accountId;
const debitNormal   = ['Assets', 'Expense'].includes(classification);
const displayBalance = (onDebitLeg === debitNormal) ? +amount : -amount;
```

| Account | Leg | Classification | Display |
|---|---|---|---|
| Checking Account | Debit | Assets | +₹45L (Dr) |
| Accumulated Depreciation | Credit | Assets | −₹8L (Cr) |
| Accounts Payable | Credit | Liabilities | +₹22L (Cr) |

#### Why no new endpoint / no Prisma relation change

The posting table already has `debit_postings` and `credit_postings` relations on the account model. Fetching via those relations would load all postings for the account — unnecessary for this display. Using the view API search with `posting_type = 'OPENING_BALANCE'` and `limit = 1` fetches exactly one row, using the existing permission-controlled API with no backend changes.

#### The `balance` field on the account model

The account model has a `balance: Decimal?` field that was previously shown as an editable form field. This field is now **removed from the UI** — it was a static, manually-entered value that was never reliably maintained. The dynamic opening balance from the `OPENING_BALANCE` posting replaces it as the authoritative source. The model field is retained in the schema (removing it would require a migration) but is no longer surfaced in the form.

---

## 4. How Reports Read Opening Balances

### 4.1 The problem: opening balance for subsequent financial years

The migration journal creates `OPENING_BALANCE` postings on the **last day of the prior system's FY** (e.g. `2025-03-31`). These correctly feed FY 2025-26 reports. But for FY 2026-27 (`fromDate = 2026-04-01`), a filter that only reads `OPENING_BALANCE` postings would still return the original Zoho figures — it has no knowledge of the FY 2025-26 business activity that accumulated between the migration and the new FY start.

The correct FY 2026-27 opening balance is:

```
Zoho migration snapshot  +  all FY 2025-26 balance-sheet movements
```

Two design options were considered.

---

### Option A — Cumulative approach (chosen)

Compute the opening balance by summing **all balance-sheet postings** (any `posting_type`) dated before `fromDate`. The DB derives the correct cumulative position from first principles every time:

```sql
WHERE posting_date < ${fromDate}::date
  AND org_id = ${orgId}
  AND ah.classification IN ('Assets', 'Liabilities', 'Equity')
  -- Income and Expense excluded — they reset at each FY boundary
```

For FY 2025-26 (`fromDate = 2025-04-01`): only the Zoho migration postings qualify → same result as before.  
For FY 2026-27 (`fromDate = 2026-04-01`): Zoho migration + all FY 2025-26 balance-sheet activity → correct closing position carried forward automatically.

Income/Expense accounts are excluded from the cumulation — their opening balance is always 0 in a new FY, which is correct accounting behaviour.

**Why chosen**: no extra process, always correct, zero operational burden on the business.  
**Trade-off**: as years accumulate, the query scans more historical postings. Acceptable for a small business; can be optimised later without changing the API contract.

> **TODO — future optimisation**: When query time becomes noticeable, add a `period_closing_snapshot` materialized view that stores the cumulative balance per account at each FY-end. The opening balance query can then read the snapshot for the most recent FY-end before `fromDate` and add only the delta since then. The API contract (`fromDate`, `toDate` → opening/period/closing columns) does not change.

---

### Option B — Explicit period close (not chosen)

At the end of each FY, run a process that:
1. Computes every balance-sheet account's closing balance.
2. Inserts new `OPENING_BALANCE` postings dated the last day of the FY (e.g. `2026-03-31`).
3. Future FYs read only the **most recent** OPENING_BALANCE snapshot before their start.

The query must pick only the latest snapshot, not all of them — otherwise the Zoho migration (2025-03-31) and the FY 2025-26 close (2026-03-31) would both be summed for FY 2026-27, double-counting the migration amounts.

**Why not chosen**: requires an explicit period-close step the business must remember to run; risk of stale snapshots if postings are backdated after close; adds operational complexity with no benefit at current scale.

---

### 4.2 The filter rule (implemented — Option A)

Both `getTrialBalance` (`previous_year_closing` CTE) and `getMonthlyTrialBalance` (`fy_opening` CTE) use:

```sql
WHERE posting_date < ${fromDate}::date
  AND org_id = ${orgId}
  AND ah.classification IN ('Assets', 'Liabilities', 'Equity')
```

Key points:
- **No `posting_type` filter** — all posting types contribute to the cumulative balance-sheet position. `OPENING_BALANCE` postings seed the starting balance; regular postings accumulate on top for subsequent FYs.
- **`posting_date < fromDate`** — not a year-window. Scans all history before the FY start, so FY 2026-27 correctly includes both the Zoho migration and all FY 2025-26 activity.
- **Classification filter** — Income and Expense accounts are excluded; their opening balance is always 0 in a new FY.
- **`fromDate` is always the FY start** — month selection within a FY passes the same `fromDate`, so the opening balance column is stable across all months of the same FY.

> **Previous behaviour (removed)**: The original code filtered `p.name LIKE 'Closing Balance%'` within a hardcoded April–March window from `startDate.getFullYear()`. This broke in two ways: (1) it missed the migration journal entirely (wrong name pattern); (2) for APR_MAR entities, months Jan–Mar set `currentYear = N+1`, making `prevYearEnd = N+1-03-31`, which excluded the migration date `N-03-31` from the window. Both issues are resolved by the cumulative approach.

---

### 4.3 Sign convention in the opening balance CTE

Each posting contributes to both of its legs with classification-aware signs:

**Debit leg** (`account_id`):
- Assets / Expense → `+amount` (normal balance is debit)
- Liabilities / Equity / Income → `−amount`

**Credit leg** (`credit_account_id`):
- Assets / Expense → `−amount`
- Liabilities / Equity / Income → `+amount`

Worked examples for migration date = 2025-03-31, FY start = 2025-04-01:

| Account | Leg | Classification | Contribution |
|---|---|---|---|
| Cash on Hand ₹2L | DR | Assets | +200,000 |
| Checking ₹45L | DR | Assets | +4,500,000 |
| Acc. Dep ₹8L | CR | Assets | −800,000 |
| AP ₹22L | CR | Liabilities | +2,200,000 |
| Retained Earnings ₹40L | CR | Equity | +4,000,000 |
| OBC | both | Equity | 0 (nets out) |

### 4.4 Why `fromDate` is always the FY start

When the user selects a specific month in the UI (e.g. October 2025 within FY 2025-26), the frontend passes:
- `from_date = 2025-04-01` (FY start — **unchanged**)
- `to_date = 2025-10-31` (end of selected month)

This keeps `fromDate` constant for all months within the same FY, so `opening_balance` is identical across every month view of that FY. The `to_date` controls how much period activity is included.

> **Old behaviour (removed)**: The code previously computed a fixed April–March window from `startDate.getFullYear()`. For APR_MAR entities, months Jan–Mar would set `currentYear = N+1`, making `prevYearEnd = N+1-03-31`. A migration dated `N-03-31` (e.g. 2025-03-31) then fell outside the window `N-04-01` to `N+1-03-31` and showed zero opening balance. This was fixed by replacing the year-window with `posting_date < fromDate`.

---

## 5. Database Views

Two views were added to support the monthly trial balance and simplify future queries. Both are in `backend/prisma/migration/views.sql`.

### 5.1 `v_posting_legs`

Flattens each double-entry posting into individual per-account rows — one row for the debit leg, one for the credit leg. Eliminates the repeated `CASE WHEN p.account_id = ah.id ... WHEN p.credit_account_id = ah.id` pattern.

```sql
CREATE OR REPLACE VIEW public.v_posting_legs AS
  SELECT org_id, legal_entity_id, posting_type, posting_date, value_date,
         account_id,        amount AS debit_amount, 0::numeric AS credit_amount
  FROM posting WHERE account_id IS NOT NULL
  UNION ALL
  SELECT org_id, legal_entity_id, posting_type, posting_date, value_date,
         credit_account_id, 0::numeric AS debit_amount, amount AS credit_amount
  FROM posting WHERE credit_account_id IS NOT NULL;
```

### 5.2 `v_account_monthly`

Aggregates non-OPENING_BALANCE activity by account and calendar month. The base for the monthly trial balance query.

```sql
CREATE OR REPLACE VIEW public.v_account_monthly AS
  SELECT org_id, legal_entity_id, account_id,
         DATE_TRUNC('month', value_date)::date AS period_month,
         SUM(debit_amount)  AS period_debits,
         SUM(credit_amount) AS period_credits
  FROM v_posting_legs
  WHERE posting_type IS DISTINCT FROM 'OPENING_BALANCE'
  GROUP BY org_id, legal_entity_id, account_id, DATE_TRUNC('month', value_date);
```

---

## 6. Trial Balance Reports

### 6.1 Standard trial balance — `getTrialBalance`

**File**: `backend/src/lib/reports/perfin.ts`
**Report ID**: `trial_balance`
**Frontend**: `/reports/balance-sheet`

Returns one row per account with:

| Field | Description |
|---|---|
| `opening_balance` | Signed balance from OPENING_BALANCE postings before `fromDate` |
| `total_debits` | Sum of debit amounts for postings in `[fromDate, toDate]` |
| `total_credits` | Sum of credit amounts for postings in `[fromDate, toDate]` |
| `balance` | Net period activity (classification-aware sign) |
| `total_balance` | `opening_balance + balance` — the closing position |

Excludes `OPENING_BALANCE` postings from period activity. The `balance` column reflects only transactions that happened within the selected period.

### 6.2 Monthly trial balance — `getMonthlyTrialBalance`

**File**: `backend/src/lib/reports/perfin.ts`
**Report ID**: `monthly_trial_balance`
**Frontend**: `/reports/monthly-trial-balance`

Returns **one row per account per month** with:

| Field | Description |
|---|---|
| `fy_opening` | Same as `opening_balance` above — constant for all months of an account |
| `period_month` | First day of the month (e.g. `2025-04-01`) |
| `period_debits` | Raw debits for this month |
| `period_credits` | Raw credits for this month |
| `net_movement` | Classification-aware net for this month |
| `cumulative_balance` | `fy_opening + SUM(net_movement)` through this month (window function) |

The frontend groups flat rows by `account_id`, then renders:
- **Preceding months** (all months before the selected month): one **Net** column each
- **Selected month** (last month in the range): separate **Debits** and **Credits** columns, highlighted
- **Closing Balance**: the `cumulative_balance` of the last month row

Months with zero activity across all accounts do not appear in the result set (the query only returns months present in `v_account_monthly`).

### 6.3 Report API

Both reports go through the same dispatcher in `backend/src/lib/reports.ts`:

```
POST /api/reports/{report_id}
Body: { from_date, to_date, legal_entity_ids?, account_id?, currency_id? }
```

The `from_date` must always be the FY start date (not the selected month start) for opening balance to work correctly.

---

## 7. Verification

An integration test suite exercises the full flow end-to-end:

**File**: `backend/src/__tests__/setup/verification-suite.test.ts`

```bash
# Run against .env.test DB and leave data for inspection
VERIFICATION_SUITE_TEST=1 LEAVE_DATA=1 npx jest src/__tests__/setup/verification-suite.test.ts --forceExit

# Clean up after review
VERIFICATION_SUITE_TEST=1 npx jest src/__tests__/setup/verification-suite.test.ts --forceExit
```

**What it verifies** (36 tests):

| Step | Coverage |
|---|---|
| Tier 1 (always) | CSV file exists, balance sheet is balanced, OBC ID derivation, stable posting ID format |
| Step 1 | CSV import creates 14 postings, OBC = 0 |
| Step 2 | 20 FY2025-26 business postings inserted with stable IDs |
| Step 3 | Migration-only TB snapshot — each Zoho balance visible in `balance` column |
| Step 4 | Full FY2025-26 TB — key account ending balances, payroll/tax cleared, OBC still 0 |
| Step 5 | APR_MAR FY2025-26 opening_balance column — Zoho values appear correctly; Jan and Mar 2026 month views also correct (regression for the year-window bug) |

**Test data** (stable IDs, safe to delete):
- 14 `OPENING_BALANCE` postings dated `2025-03-31` for `org_indian_demo`
- 20 JOURNAL postings `post_vs_001` through `post_vs_020` (FY2025-26 activity)
- One OBC account `acco_org_indian_demo_org_indian_demo_obc`

The test CSV is at `backend/test-data/verification-suite/zoho-trial-balance-fy2024-25.csv`.

---

## 8. Key Design Decisions

### Data model

| Decision | Rationale |
|---|---|
| `posting_type = 'OPENING_BALANCE'` instead of a naming convention | Type is a first-class field; name is user-facing and mutable. Querying by type is precise and doesn't break if the name format changes. |
| OBC as an Equity account | It represents the net of all opening entries. A zero OBC means the balance sheet was balanced at import. Non-zero OBC is a visible signal to fix the data. |
| One posting per account (not one journal entry) | Keeps the query simple — each OPENING_BALANCE posting is self-contained. No journal grouping needed. |
| `code = '__OBC__'` as the OBC identifier | Used by the frontend to identify the OBC leg in each posting without needing to know the account ID in advance. Reliable because OBC is always created with this exact code. |

### Report queries

| Decision | Rationale |
|---|---|
| Cumulative approach: all balance-sheet postings before `fromDate` | No period-close ceremony required. The DB derives the correct opening balance from first principles for any FY automatically. |
| `posting_date < fromDate` not a year-window | Opening balance is stable across all month selections within a FY, and avoids the calendar-year assumption that broke APR_MAR Jan–Mar months. |
| `fromDate` = FY start regardless of selected month | The API caller (frontend) sends the FY start as `from_date`. This is the correct accounting convention: opening balance is at the FY boundary, not the month boundary. |
| Separate monthly trial balance page | The monthly view returns a fundamentally different data shape (N rows per account). Mixing it into the balance sheet page would require dynamic column counts and complex layout switching. |

### UI

| Decision | Rationale |
|---|---|
| Entity from global switcher, not page-level dropdown | Entity context is already global; a page-level selector is redundant and inconsistent with all other pages. |
| Search API for imported entries display (no custom endpoint) | `viewAPI.search("posting", "posting_view", ...)` with `posting_type = 'OPENING_BALANCE'` returns exactly what's needed — paginated, permissioned, no extra backend code. |
| OR filter in single search call for account form | `SearchQueryBuilder` supports native OR. One call with `OR: [{account_id}, {credit_account_id}]` replaces two calls and a merge. |
| `balance` field removed from AccountForm UI | The static model field was never reliably maintained. The dynamic opening balance from the posting is authoritative. The schema field is retained but not surfaced. |
| "Remove all" not "Remove row by row" | OPENING_BALANCE postings are atomic — the whole set for an entity/date is meaningful as a unit. Partial deletion would leave the balance sheet in an inconsistent state. |
