# Income Statement & Balance Sheet — Data Model, Queries, and UI

This note describes how **Income Statement** and **Balance Sheet** reports are built in Fabriq Books: which models and database views are involved, how `backend/src/lib/reports/perfin.ts` queries them, which filters the HTTP report API accepts, and how the React report pages consume the API.

**Related**: [BOOKKEEPING_DOMAIN.md](./BOOKKEEPING_DOMAIN.md) (multi-entity bookkeeping and organizations).

---

## 1. Models involved and relationships

### Core accounting tables (Prisma)

| Model | Table | Role |
|-------|--------|------|
| `account` | `account` | Chart of accounts: hierarchy (`parent_account_id`), `classification` (Assets, Liabilities, Equity, Income, Expense), `currency`, **`legal_entity_id`** (optional FK to legal-entity `organization`), `org_id` (tenant). |
| `posting` | `posting` | Double-entry lines: `account_id` (debit), `credit_account_id` (credit), `amount`, `value_date` / `posting_date`, `org_id`. |
| `organization` (tenant) | `organizations` | Tenant org record: `id`, `base_currency`, settings. Referenced as **`org_id`** on users and most business data. |
| `organization` (legal entity) | `organization` (zeiv) | Legal entities under a tenant; linked from `account.legal_entity_id`. See BOOKKEEPING_DOMAIN.md. |
| `exchange_rate` | `exchange_rate` | FX rates per tenant org: `from_currency`, `to_currency`, `rate_type` (e.g. AVERAGE, CLOSING), `effective_date`. Used by **trial balance** conversion. |

**Relationships (conceptual)**:

- `account.org_id` → tenant scope.
- `account.legal_entity_id` → optional link to a **legal entity** row (subsidiary/HQ org record).
- `posting.org_id` → tenant scope.
- `posting.account_id` / `posting.credit_account_id` → `account.id` (debit and credit legs).

### How the chart is exposed to SQL

The physical table is **`account`**. Reporting does not query a separate “hierarchy table”; instead, the database exposes a **view** `account_hierarchy` that flattens `account` into a tree with `path`, `level`, and inherited `org_id` / `currency` / `legal_entity_id`. See §2.

---

## 2. Database views used for balances and hierarchy

Defined in `backend/prisma/migration/views.sql` (and mirrored in `metadata-tables.sql`).

### `account_hierarchy` (VIEW)

- **Source**: Recursive CTE over `account`: roots (`parent_account_id` null or `''`), then children joined on `parent_account_id`.
- **Columns** (representative): `id`, `code`, `classification`, `name`, `type`, `parent_account_id`, **`path`** (e.g. `Parent -> Child`), **`level`**, `org_id`, `currency`, **`legal_entity_id`**.
- **Use**: All `perfin` report queries that reference `account_hierarchy` read the **chart structure** and entity/currency context in one place.

### `account_balances` (VIEW)

- **Purpose**: Split each posting into **debit** and **credit** columns per account and `value_date`, aggregated from `account_hierarchy` + `posting`.
- **Behavior**: Rows with posting `name` matching closing patterns may be filtered (`Clos%` excluded in the view definition).
- **Use**: **`getTrialBalance`** in `perfin.ts` joins `account_hierarchy` to `account_balances` for period **debit_amount** / **credit_amount** totals. Trial balance applies **classification-specific signed balance** from those amounts (see §3.2).

### Other balance views (reference)

- `account_balances_complete`, `account_balances_fixed`, `account_balances_with_dates`, etc.: richer running-balance / date-grid variants for analysis. The **Income Statement** and **Balance Sheet** flows in `perfin.ts` as checked in do **not** require these for the primary `getIncomeStatement` / `getTrialBalance` paths described below.

### `posting_account_view` (VIEW)

- Joins `posting` to `account`, `category`, `category_group` for UI/listing. Not the primary driver of the two financial reports, but useful for debugging postings.

---

## 3. Queries in `perfin.ts` and report API filters

Reports are executed through `run_report` in `backend/src/lib/reports.ts`, which maps `report_id` to functions in `perfin.ts` and passes **`context.user.org_id`** as the tenant scope (never taken from client body for security).

### 3.1 Income Statement — `getIncomeStatement`

**Function**: `getIncomeStatement(startDate, endDate, orgId, accountId?)`

**Data flow**:

1. CTE `account_balances`: For each `account_hierarchy` row, sum postings in `[startDate, endDate]` with a single net expression: debit leg `+amount`, credit leg `-amount` (i.e. **net = debit − credit** on the account).
2. CTE `parent_totals`: Sums child balances onto parents via `parent_account_id`.
3. Final `SELECT`: Returns `account_path`, `account_name`, `classification`, `level`, `total_amount` (own + rolled-up).

**Important (current implementation)**: The posting net uses **one formula for all classifications**. Standard “normal balance” rules (e.g. credit minus debit for Income/Liabilities) are **not** applied inside this function; classification is returned for **filtering/grouping** in the UI. Trial balance (`getTrialBalance`) **does** apply classification-based debit/credit logic when using `account_balances`.

**HTTP**: `POST /api/report/income_statement` with body `{ "filters": { ... } }`.

**Filters actually passed from `run_report`** (see `reports.ts`):

| Filter | Passed to `getIncomeStatement` |
|--------|----------------------------------|
| `from_date` | Yes |
| `to_date` | Yes |
| `account_id` | Yes (optional) |

`currency` and `legal_entity_ids` are **not** wired in `run_report` for `income_statement` in the current `reports.ts`; extending the API requires updating both `run_report` and `getIncomeStatement` if those dimensions are needed.

---

### 3.2 Balance Sheet (implemented as Trial Balance) — `getTrialBalance`

The **Balance Sheet** screen in the app is **not** a separate `balance_sheet` report id; it loads **`trial_balance`** and the UI groups rows into Assets / Liabilities / Equity.

**Function**: `getTrialBalance(startDate, endDate, orgId, accountId?, reportCurrency?, legalEntityIds?)`

**Data flow (simplified)**:

1. **`org_base`**: Reporting currency = `filters.currency` if set, else `organizations.base_currency`, else `'INR'`.
2. **`period_avg_rates` / `opening_close_rates`**: FX from `exchange_rate` into `org_base.base_currency`.
3. **`previous_year_closing`**: Opening balances from postings named like `Closing Balance%` in a computed prior fiscal window.
4. **`rolled_up_balances`**: Joins `account_hierarchy` to **`account_balances`** VIEW for the period; builds `total_debits_orig`, `total_credits_orig`, and **`balance_orig`** with classification rules:
   - **Assets, Expense**: `debit − credit`
   - **Liabilities, Equity, Income**: `credit − debit`
5. **`converted_balances`**: Applies rates to debits, credits, balance, opening.
6. **`parent_totals` / `parent_opening_totals`**: Rolls up to parents (implementation uses path-prefix style roll-up in the current file).
7. **Final SELECT**: `total_debits`, `total_credits`, `balance`, `opening_balance`, `total_balance`, etc.

**HTTP**: `POST /api/report/trial_balance` with `{ "filters": { ... } }`.

**Filters passed from `run_report`**:

| Filter | Passed to `getTrialBalance` |
|--------|-------------------------------|
| `from_date` | Yes |
| `to_date` | Yes |
| `account_id` | Yes (optional) |
| `currency` | Yes (optional; reporting currency override) |
| `legal_entity_ids` | Yes (optional; array of legal entity ids) |

When `legal_entity_ids` is set, accounts are restricted to those whose **`account_hierarchy.legal_entity_id`** is in the list (accounts with `NULL` legal entity are excluded from that scoped result set).

---

## 4. Significance of `org_id` and legal entity

### `org_id` (tenant)

- **Meaning**: The **Fabriq tenant** (customer) boundary. Users belong to an org; `AuthContext.user.org_id` scopes all report queries.
- **Usage**: Every `getIncomeStatement` / `getTrialBalance` query filters `account_hierarchy` / postings by `ah.org_id = orgId` (and posting `org_id` where applicable).

### Legal entity (`legal_entity_id` on account)

- **Meaning**: A **company** or registered entity **within** the tenant—often a row in the `organization` model used as legal entity (HQ vs subsidiary). Stored on **`account`**, surfaced on **`account_hierarchy`**.
- **Usage in reports**:
  - **`getTrialBalance`**: Optional filter `legal_entity_ids` limits the chart to accounts tagged with those entities.
  - **`getIncomeStatement`** (current code): No legal-entity filter in the query; entire tenant chart is included unless narrowed by `account_id`.

Multi-entity rules and HQ consolidation are described in more detail in [BOOKKEEPING_DOMAIN.md](./BOOKKEEPING_DOMAIN.md).

---

## 5. UI: `IncomeStatement.tsx` and `BalanceSheet.tsx`

### Income Statement — `frontend-1/src/pages/reports/IncomeStatement.tsx`

- Calls `reportAPI.getReport("income_statement", filters)` with **`from_date`**, **`to_date`**, and optionally **`account_id`** when a single account is selected.
- Filters client-side rows by **view** (Summary vs Detail): Summary keeps `level === 0` and non-zero amounts; other view filters non-zero.
- Groups rows by **`classification`** into **Income** and **Expense** sections.
- **Section totals**: Sums `total_amount` in the group for the footer row (simple arithmetic on API numbers).

### Balance Sheet — `frontend-1/src/pages/reports/BalanceSheet.tsx`

- Calls `reportAPI.getReport("trial_balance", filters)` with **`from_date`**, **`to_date`**, optional **`currency`**, optional **`legal_entity_ids`**, optional **`account_id`**.
- Loads legal entities via `viewAPI.search("organization", "organization_view", ...)` for the multi-select filter.
- **Classification grouping**: Normalizes API `classification` strings and displays sections for **Assets**, **Liabilities**, **Equity** (and may still receive Income/Expense rows from the API—the page orders only the three balance-sheet buckets for display).
- Shows **Debits / Credits / Total** columns using trial balance fields (`total_debits`, `total_credits`, `total_balance`).
- **Totals per section**: Uses `aggregateTrialBalanceSectionRows` from `frontend-1/src/lib/trailBalanceSectionTotal.ts` to sum either **level-0** rows only (when roots exist) or all visible rows (legal-entity–scoped responses), avoiding double-counting children when parent rows are present.

**Naming**: The page title is “Balance Sheet” but the PDF export component is shared with trial balance naming in places—worth being aware of when comparing exports to product copy.

---

## Quick reference: API report ids

| UI / product name | `report_id` | Core `perfin` function |
|---------------------|-------------|-------------------------|
| Income Statement | `income_statement` | `getIncomeStatement` |
| Balance Sheet (current implementation) | `trial_balance` | `getTrialBalance` |

---

*Last updated from codebase paths: `backend/src/lib/reports.ts`, `backend/src/lib/reports/perfin.ts`, `backend/prisma/schema/data.prisma`, `backend/prisma/migration/views.sql`, `frontend-1/src/pages/reports/IncomeStatement.tsx`, `frontend-1/src/pages/reports/BalanceSheet.tsx`.*
