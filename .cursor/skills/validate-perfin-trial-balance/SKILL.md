---
name: validate-perfin-trial-balance
description: >-
  Validates `getTrialBalance` in `backend/src/lib/reports/perfin.ts` by comparing
  report numbers for a given `account_id`, financial-year date range, and `org_id`
  against manual SQL (opening, period activity, FX, hierarchy roll-up). Use when
  debugging trial balance discrepancies, verifying perfin trial balance after
  posting changes, or when the user asks to reconcile trial balance to postings.
license: Project-specific skill for Fabriq Books application
---

# Validate perfin trial balance (`getTrialBalance`)

## Source of truth

Implementation: `getTrialBalance` in `backend/src/lib/reports/perfin.ts` (raw SQL via Prisma `$queryRaw`). Parameters: `startDate`, `endDate`, `orgId`, optional `accountId`, `reportCurrency`, `legalEntityIds`.

**Important**: The function computes `prevYearStart` / `prevYearEnd` in TypeScript but **does not** use them in SQL. Opening balances come only from the `previous_year_closing` CTE (`posting_type = 'OPENING_BALANCE'` and `posting_date < startDate`). Do not assume a fixed “previous FY window” in SQL when reproducing opening figures.

## Inputs to collect

| Input | Notes |
|-------|--------|
| `org_id` | Tenant scope; all queries must filter business data by this. |
| `account_id` | `account_hierarchy.id` for the row to validate (leaf or parent). |
| `start_date`, `end_date` | Inclusive `value_date` / rate cutoffs exactly as passed to `getTrialBalance` (e.g. India FY 2025–26 → `2025-04-01` … `2026-03-31` if the UI uses April–March). |
| `report_currency` | Optional `currency.id` or ISO code; if omitted in code, org base currency applies. Manual FX must use the same target currency. |
| `legal_entity_ids` | If the API call passes this array, restrict `account_hierarchy` (and any joins) with `legal_entity_id = ANY($ids)` as in the query. |

## Reporting semantics (what each column means)

For each `account_hierarchy` row, the query returns (report currency unless `*_orig`):

- **`total_debits_orig` / `total_credits_orig`**: Sum of `account_balances.debit_amount` / `credit_amount` for that account, `value_date` between `start_date` and `end_date`, after view filters (see below).
- **`balance_orig`**: Classification-aware net from those debits/credits:
  - **`Assets`, `Expense`**: `SUM(debit_amount - credit_amount)`
  - **`Liabilities`, `Equity`, `Income`**, or classification text ILIKE `'%revenue%'`: `SUM(credit_amount - debit_amount)`
  - **Else**: `SUM(debit_amount - credit_amount)`
- **`opening_balance`**: Sum of signed `OPENING_BALANCE` postings **before** `start_date` (debit and credit legs), converted with **CLOSING** rate to base: latest `exchange_rate` per account currency with `rate_type = 'CLOSING'`, `to_currency_id = base`, `effective_date < start_date`, ordered by `effective_date DESC`.
- **`total_debits` / `total_credits` / `balance`**: Same as orig, multiplied by **period** **AVERAGE** rate: latest per currency with `rate_type = 'AVERAGE'`, `effective_date <= end_date`.
- **Parent roll-up**: `parent_totals` / `parent_opening_totals` sum **converted** child rows over true parent/child edges (`hierarchy_descendants`), not `path` prefix matching.
- **`total_balance`**: `(balance + rolled_up_period) + (opening_balance + rolled_up_opening)` — i.e. closing-style total in report currency for the displayed row.

## `account_balances` view (period legs)

Defined in `backend/prisma/migration/views.sql`. Per day and posting `name`:

- Debit side: postings where `posting.account_id = ah.id`.
- Credit side: postings where `posting.credit_account_id = ah.id`.
- Excludes rows where `name` matches `'Clos%'` (closing-pattern names).

Posting filters in the view align with trial balance activity: active status, not reversed/duplicate, `reversal_of_posting_id IS NULL`, `posting_type <> 'DUPLICATE'`.

## Workflow checklist

Copy and track:

```
- [ ] Confirm start_date / end_date match the UI/API call to getTrialBalance
- [ ] Confirm org_id and optional legal_entity_ids / report_currency match
- [ ] Fetch account classification + currency from account_hierarchy
- [ ] Manual period *_orig totals from account_balances (same date range)
- [ ] Manual opening orig from OPENING_BALANCE postings (posting_date < start_date)
- [ ] Resolve base_currency_id and period / opening FX rates (same rules as query)
- [ ] If account is a parent: sum converted child balances + opening for descendants
- [ ] Compare manual totals to API row (opening_balance, total_debits, total_credits, balance, total_balance, *_orig)
- [ ] Assert identity: total_balance ≈ opening_balance + balance (allow tiny numeric drift)
```

Use **read-only** `SELECT` only. Read `DATABASE_URL` from `backend/.env` and run via `psql` (same pattern as `.cursor/skills/database-debug/SKILL.md`).

> **NEVER modify data.** Do not run INSERT, UPDATE, DELETE, or DDL at any point during validation. When a fix is identified (wrong-direction posting, phantom entry, duplicate, etc.), present the finding clearly and instruct the user to make the change themselves via the application UI or their own SQL session.

## SQL building blocks (manual parity)

Replace `:org_id`, `:account_id`, `:start_date`, `:end_date` with literals or `\set` variables in `psql`.

### 1) Account metadata

```sql
SELECT id, name, path, classification, currency AS account_currency_id, legal_entity_id
FROM account_hierarchy
WHERE org_id = :org_id AND id = :account_id;
```

### 2) Period activity in **original** currency (single account)

Mirrors `rolled_up_balances` for one `account_id`:

```sql
SELECT
  COALESCE(SUM(ab.debit_amount), 0) AS total_debits_orig,
  COALESCE(SUM(ab.credit_amount), 0) AS total_credits_orig,
  CASE
    WHEN ah.classification IN ('Assets', 'Expense')
      THEN COALESCE(SUM(ab.debit_amount - ab.credit_amount), 0)
    WHEN ah.classification IN ('Liabilities', 'Equity', 'Income')
      OR LOWER(ah.classification::text) LIKE '%revenue%'
      THEN COALESCE(SUM(ab.credit_amount - ab.debit_amount), 0)
    ELSE COALESCE(SUM(ab.debit_amount - ab.credit_amount), 0)
  END AS balance_orig
FROM account_hierarchy ah
LEFT JOIN account_balances ab
  ON ab.account_id = ah.id AND ab.org_id = ah.org_id
  AND ab.value_date BETWEEN :start_date::date AND :end_date::date
WHERE ah.org_id = :org_id AND ah.id = :account_id
GROUP BY ah.id, ah.classification;
```

Compare to `total_debits_orig`, `total_credits_orig`, `balance_orig` on the trial balance row (for a **leaf**, rolled-up period should be zero; parent rows include children — use section 4).

### 3) Opening balance in **original** currency (single account)

Mirrors `previous_year_closing` aggregation for one account:

```sql
WITH legs AS (
  SELECT
    p.account_id AS account_id,
    CASE
      WHEN ah.classification IN ('Assets', 'Expense') THEN p.amount
      WHEN ah.classification IN ('Liabilities', 'Equity', 'Income')
        OR LOWER(ah.classification::text) LIKE '%revenue%' THEN -p.amount
      ELSE p.amount
    END AS opening_balance_orig
  FROM posting p
  INNER JOIN account_hierarchy ah ON ah.id = p.account_id AND ah.org_id = p.org_id
  WHERE p.posting_type = 'OPENING_BALANCE'
    AND p.posting_date < :start_date::date
    AND p.org_id = :org_id
    AND p.account_id IS NOT NULL
    AND COALESCE(p.status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
    AND p.reversal_of_posting_id IS NULL
    AND COALESCE(p.posting_type, '') <> 'DUPLICATE'
  UNION ALL
  SELECT
    p.credit_account_id AS account_id,
    CASE
      WHEN ah.classification IN ('Assets', 'Expense') THEN -p.amount
      WHEN ah.classification IN ('Liabilities', 'Equity', 'Income')
        OR LOWER(ah.classification::text) LIKE '%revenue%' THEN p.amount
      ELSE -p.amount
    END AS opening_balance_orig
  FROM posting p
  INNER JOIN account_hierarchy ah ON ah.id = p.credit_account_id AND ah.org_id = p.org_id
  WHERE p.posting_type = 'OPENING_BALANCE'
    AND p.posting_date < :start_date::date
    AND p.org_id = :org_id
    AND p.credit_account_id IS NOT NULL
    AND COALESCE(p.status, 'ACTIVE') NOT IN ('REVERSED', 'DUPLICATE')
    AND p.reversal_of_posting_id IS NULL
    AND COALESCE(p.posting_type, '') <> 'DUPLICATE'
)
SELECT COALESCE(SUM(opening_balance_orig), 0) AS opening_balance_orig
FROM legs
WHERE account_id = :account_id;
```

Multiply `opening_balance_orig` by the same **CLOSING** rate the query uses (see `opening_close_rates` in source) to compare to `opening_balance` on the row.

### 4) Parent accounts — roll-up

If `account_id` is a parent, the returned `balance`, `total_debits`, `total_credits`, `opening_balance` include **all descendants** in the account tree (same org). To validate manually:

1. Build the recursive set of `(root_id, descendant_id)` where `root_id = :account_id` (same recursion as `hierarchy_descendants` in source).
2. For period and opening, sum each descendant’s **converted** amounts (apply per-descendant currency and the same period/opening rates as the query), excluding the root from the “children only” sum, then add the root’s own converted amounts — matching `COALESCE(cb.*, 0) + COALESCE(pt.*, 0)` and opening with `pot`.

For a quick sanity check on parents: sum **leaf** descendants’ `balance_orig` and compare trend to rolled-up `balance_orig` only if currencies and rates are uniform; with mixed currencies, always reconcile in **report** currency using rates.

## Interpreting mismatches

| Symptom | Likely cause |
|---------|----------------|
| `*_orig` wrong, report currency right | FX layer only; re-check `exchange_rate` rows and `rate_type` / dates. |
| Period orig wrong | `account_balances` vs raw `posting`: value_date range, CLOS exclusion, status/type filters, wrong account leg. |
| Opening wrong | `OPENING_BALANCE` postings dated on/after `start_date` still in “opening” for a different report window; duplicate OB postings; credit vs debit leg sign. |
| Parent row wrong, leaf OK | Descendant set or double-counting own vs children in manual roll-up. |
| Small fractional delta | `numeric` rounding; compare with a tolerance (e.g. `1e-6` relative or 0.01 absolute in report currency). |
| System row count > external statement | Phantom postings — see “Error patterns” section below. |
| Gap = exactly 2 × some transaction amount | Wrong-direction posting (DR/CR legs swapped) — common for refunds/reversals. |
| Gap appears in one month, stable after | Use running-balance checkpoint query to isolate the month, then audit that month's postings. |

---

## Bank statement reconciliation workflow

Use this when the trial balance closing figure diverges from a bank statement for the same account and period.

### Leg direction convention (Assets)

In the `posting` table, for an asset account (e.g. savings account):

- `posting.account_id = <this account>` → **debit leg** → money **in** (deposit, balance increases)
- `posting.credit_account_id = <this account>` → **credit leg** → money **out** (withdrawal, balance decreases)

The `account_balances` view exposes these as `debit_amount` / `credit_amount` per day.

### Step 1 — establish opening balance agreement

Compare `opening_balance_orig` from SQL building block 3 with the opening balance implied by the external statement (first-row balance + first withdrawal, or stated opening). If these agree, the period is the only source of divergence.

### Step 2 — monthly isolation

Run this to see which month(s) the gap originates in. Compare `system_net` per month to the bank statement's month-end balance movements.

```sql
SELECT
  DATE_TRUNC('month', posting_date)::date AS month,
  COUNT(*)                                AS row_count,
  SUM(CASE WHEN account_id       = :account_id THEN amount ELSE 0 END) AS debit_total,
  SUM(CASE WHEN credit_account_id = :account_id THEN amount ELSE 0 END) AS credit_total,
  SUM(CASE WHEN account_id       = :account_id THEN  amount
           WHEN credit_account_id = :account_id THEN -amount
      END)                                AS net
FROM posting
WHERE org_id = :org_id
  AND (account_id = :account_id OR credit_account_id = :account_id)
  AND COALESCE(posting_type, '') NOT IN ('DUPLICATE', 'OPENING_BALANCE')
  AND COALESCE(status, 'ACTIVE')  NOT IN ('REVERSED', 'DUPLICATE')
  AND reversal_of_posting_id IS NULL
  AND posting_date::date BETWEEN :start_date::date AND :end_date::date
GROUP BY 1
ORDER BY 1;
```

Cross-reference `row_count` per month against the external statement's transaction count. A month where `row_count` is higher is where phantom postings live.

### Step 3 — running balance checkpoints

Pinpoints exactly which posting breaks the trail. Pick key dates where the external statement gives a known balance and compare:

```sql
WITH cumulative AS (
  SELECT
    posting_date::date AS date,
    id,
    SUM(
      CASE WHEN account_id        = :account_id THEN  amount
           WHEN credit_account_id = :account_id THEN -amount
      END
    ) OVER (ORDER BY posting_date, id) AS running_net
  FROM posting
  WHERE org_id = :org_id
    AND (account_id = :account_id OR credit_account_id = :account_id)
    AND COALESCE(posting_type, '') NOT IN ('DUPLICATE', 'OPENING_BALANCE')
    AND COALESCE(status, 'ACTIVE')  NOT IN ('REVERSED', 'DUPLICATE')
    AND reversal_of_posting_id IS NULL
    AND posting_date::date BETWEEN :start_date::date AND :end_date::date
)
SELECT
  date,
  ROUND((:opening_balance + running_net)::numeric, 2) AS system_balance
FROM cumulative
WHERE date IN (/* paste key checkpoint dates from external statement */)
ORDER BY date, id;
```

Compare `system_balance` to the external statement balance at each checkpoint. The first checkpoint where they diverge narrows the window to that month; look for the specific posting within it.

---

## Error patterns (from real reconciliation)

### Pattern 1 — Phantom duplicate posting

**Symptom**: system row count > external statement for a specific date; balance overstated by the phantom amount.

**How to find**:
1. Monthly isolation query shows one month with extra rows.
2. Within that month, look for two postings on the same date with the same `amount` and the same leg direction (both `account_id = <this>`, or both `credit_account_id = <this>`).
3. Check the **contra account** on each:

```sql
SELECT p.id, p.posting_date::date, p.amount,
  p.posting_type, p.status,
  p.account_id, p.credit_account_id,
  ah_a.name  AS debit_account_name,
  ah_c.name  AS credit_account_name
FROM posting p
LEFT JOIN account_hierarchy ah_a ON ah_a.id = p.account_id
LEFT JOIN account_hierarchy ah_c ON ah_c.id = p.credit_account_id
WHERE p.org_id = :org_id
  AND (p.account_id = :account_id OR p.credit_account_id = :account_id)
  AND p.posting_date::date = :suspect_date
  AND p.amount = :suspect_amount
ORDER BY p.posting_date, p.id;
```

**Red flag**: one posting credits/debits a **parent/group account** (e.g. “Cash & Bank Accounts - IN”) rather than a real leaf account. Real transactions always go to a leaf. The posting whose contra is a group account is the phantom.

**Note**: Phantom postings often have `posting_type = NULL` and `status = NULL` — they will **not** be caught by the `DUPLICATE` filter. You must find them by examining contra accounts.

### Pattern 2 — Wrong-direction posting (swapped DR/CR legs)

**Symptom**: gap = exactly **2 × transaction amount**. The system records money leaving when the bank shows money arriving (or vice versa).

**Common trigger**: refunds, reversals, and “MCD REF” / “RVSL” type bank entries — the importer or user posts these with the account on the wrong leg.

**How to confirm**:
```sql
SELECT p.id, p.posting_date::date, p.amount,
  CASE WHEN p.account_id        = :account_id THEN 'DEBIT (deposit)'
       WHEN p.credit_account_id = :account_id THEN 'CREDIT (withdrawal)'
  END AS leg_for_this_account,
  ah_a.name AS debit_account,
  ah_c.name AS credit_account
FROM posting p
LEFT JOIN account_hierarchy ah_a ON ah_a.id = p.account_id
LEFT JOIN account_hierarchy ah_c ON ah_c.id = p.credit_account_id
WHERE p.id = :suspect_posting_id;
```

Check the contra account classification and name: if an expense account is on the **debit** side of a posting that is crediting the bank account, but the bank shows a deposit (money in), the legs are swapped.

**Fix direction**: The contra account tells you what the entry *was intended to be*. A refund from a vendor (deposit into bank) should DR bank / CR the original expense or a payable — not CR bank / DR expense.

### Pattern 3 — Zero-amount phantom

**Symptom**: row count is 1 higher than external statement; no balance impact.

**How to find**: look for `amount = 0` in the monthly isolation query or directly:

```sql
SELECT id, posting_date::date, amount, posting_type, status, name
FROM posting
WHERE org_id = :org_id
  AND (account_id = :account_id OR credit_account_id = :account_id)
  AND amount = 0
  AND posting_date::date BETWEEN :start_date::date AND :end_date::date;
```

Report the posting ID to the user and ask them to delete it — it contributes nothing to balances but inflates counts.

### Pattern 4 — `posting_type` reference

| `posting_type` value | Meaning | Included in trial balance? |
|---|---|---|
| `NULL` | Regular period posting | ✅ Yes |
| `'OPENING_BALANCE'` | Opening balance entry | Opening CTE only (not period) |
| `'DUPLICATE'` | System-flagged duplicate | ❌ Excluded |
| `status = 'REVERSED'` or `reversal_of_posting_id IS NOT NULL` | Reversed entry | ❌ Excluded |

**Important**: Phantom postings from bad imports or UI bugs often have `posting_type = NULL` and `status = NULL` — they look like regular postings and ARE included in the trial balance. Only contra-account inspection reveals them.

### Pattern 5 — Schema notes learned in production

- Organisation table: `organizations` (plural), base currency column: `basecurrency_id`.
- `account_hierarchy.currency` holds the currency ID (not `currency_id`).
- `posting.posting_date` is stored as a **timestamp**, not a plain date — always cast: `posting_date::date`.
- When org_id is needed and not provided, derive it from the account object: `SELECT org_id, legal_entity_id FROM account_hierarchy WHERE id = :account_id`.

## Optional: parity via application

To capture the exact query output under the same Prisma config, a short `tsx`/`ts-node` snippet can call `getTrialBalance(start, end, orgId, accountId, reportCurrency, legalEntityIds)` and print the row — use when SQL manual steps are already aligned but UI still differs (middleware, caching, or different dates).

## Related skills

- `.cursor/skills/database-debug/SKILL.md` — `DATABASE_URL`, `psql`, org_id rules.
- `.cursor/skills/advanced-db-debug/SKILL.md` — deeper permission or cross-module tracing if numbers disagree due to visibility rather than math.
