# Technical Design: Period Balance Sheet & Materialized Closing Balances

**FRD**: [FRD_PERIOD_BALANCE_SHEET_AND_MV.md](./FRD_PERIOD_BALANCE_SHEET_AND_MV.md)  
**Status**: Draft — implementation-ready  
**Author**: Design handoff 2026-05-11

---

## 1. Scope and decisions locked

This document resolves every open item listed in FRD §10.

| Open item | Decision |
|-----------|----------|
| Exact MV DDL and unique index | §5 below |
| Incremental vs. full refresh | Full per `org_id`, v1 (§6) |
| Multi-currency columns | Two columns: `closing_balance_orig` + `closing_balance` (§5.4) |
| Single reversal rule | Exclude any posting where `status = 'REVERSED'` OR `reversal_of_posting_id IS NOT NULL` (§3) |
| API shape | `period_kind + fy_type + fy_start_year + period_index` resolved server-side (§7) |
| HQ entity identifier | `entity.is_it_headquartres = 'Yes'` — existing schema column (§7.3) |

---

## 2. Period utility (shared)

### 2.1 Period parameter type

```typescript
// backend/src/lib/period.ts  (new file)

export type PeriodKind = 'FY' | 'MONTH' | 'QUARTER';
export type FYType = 'JAN_DEC' | 'APR_MAR' | 'JUL_JUN' | 'OCT_SEP';

export interface PeriodParams {
  period_kind: PeriodKind;
  fy_type: FYType;
  fy_start_year: number;       // label year Y — calendar year FY starts
  period_index: number;        // 1 for FY; 1-12 for MONTH; 1-4 for QUARTER
}

export interface PeriodBounds {
  from_date: string;  // 'YYYY-MM-DD', inclusive
  to_date: string;    // 'YYYY-MM-DD', inclusive
}
```

### 2.2 FY config (mirrors FinancialYearSelector.tsx)

```typescript
const FY_CONFIG: Record<FYType, { startMonth: number; crossYear: boolean }> = {
  JAN_DEC: { startMonth: 1,  crossYear: false },
  APR_MAR: { startMonth: 4,  crossYear: true  },
  JUL_JUN: { startMonth: 7,  crossYear: true  },
  OCT_SEP: { startMonth: 10, crossYear: true  },
};
```

### 2.3 `resolvePeriodBounds(params): PeriodBounds`

```typescript
export function resolvePeriodBounds(p: PeriodParams): PeriodBounds {
  const { startMonth, crossYear } = FY_CONFIG[p.fy_type];
  const fyEndYear = crossYear ? p.fy_start_year + 1 : p.fy_start_year;
  const fyEndMonth = crossYear ? startMonth - 1 : 12;

  if (p.period_kind === 'FY') {
    if (p.period_index !== 1) throw new Error('period_index must be 1 for FY');
    return {
      from_date: isoDate(p.fy_start_year, startMonth, 1),
      to_date:   isoDate(fyEndYear, fyEndMonth, lastDay(fyEndYear, fyEndMonth)),
    };
  }

  if (p.period_kind === 'MONTH') {
    if (p.period_index < 1 || p.period_index > 12)
      throw new Error('period_index must be 1-12 for MONTH');
    // FY month 1 = startMonth
    let month = startMonth + p.period_index - 1;
    let year  = p.fy_start_year;
    if (month > 12) { month -= 12; year += 1; }
    return {
      from_date: isoDate(year, month, 1),
      to_date:   isoDate(year, month, lastDay(year, month)),
    };
  }

  if (p.period_kind === 'QUARTER') {
    if (p.period_index < 1 || p.period_index > 4)
      throw new Error('period_index must be 1-4 for QUARTER');
    // Q1 = FY months 1-3, Q2 = 4-6, Q3 = 7-9, Q4 = 10-12
    const fyMonthStart = (p.period_index - 1) * 3 + 1;
    const fyMonthEnd   = fyMonthStart + 2;
    const { year: sy, month: sm } = fyMonthToCalendar(p.fy_start_year, startMonth, fyMonthStart);
    const { year: ey, month: em } = fyMonthToCalendar(p.fy_start_year, startMonth, fyMonthEnd);
    return {
      from_date: isoDate(sy, sm, 1),
      to_date:   isoDate(ey, em, lastDay(ey, em)),
    };
  }

  throw new Error(`Unknown period_kind: ${p.period_kind}`);
}

// helpers — 
function lastDay(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function pad2(n: number) { return String(n).padStart(2, '0'); }
function isoDate(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function fyMonthToCalendar(fyStartYear: number, startMonth: number, fyMonth: number) {
  let month = startMonth + fyMonth - 1;
  let year  = fyStartYear;
  if (month > 12) { month -= 12; year += 1; }
  return { year, month };
}
```

### 2.4 `predecessorParams(params): PeriodParams`

Returns the unique prior period (same `period_kind`) whose `to_date` is one day before the input's `from_date`. Cross-FY by natural arithmetic.

```typescript
export function predecessorParams(p: PeriodParams): PeriodParams {
  if (p.period_kind === 'FY') {
    return { ...p, fy_start_year: p.fy_start_year - 1, period_index: 1 };
  }
  if (p.period_kind === 'MONTH') {
    if (p.period_index === 1) {
      return { ...p, fy_start_year: p.fy_start_year - 1, period_index: 12 };
    }
    return { ...p, period_index: p.period_index - 1 };
  }
  if (p.period_kind === 'QUARTER') {
    if (p.period_index === 1) {
      return { ...p, fy_start_year: p.fy_start_year - 1, period_index: 4 };
    }
    return { ...p, period_index: p.period_index - 1 };
  }
  throw new Error(`Unknown period_kind: ${p.period_kind}`);
}
```

### 2.5 Frontend — add `buildQuarterOptions`

Add to `frontend-1/src/components/Reports/FinancialYearSelector.tsx`:

```typescript
export interface QuarterOption {
  value: string;            // e.g. 'APR_MAR:2024:Q2'
  label: string;            // e.g. 'Q2 Jul–Sep 2024'
  period_index: number;     // 1-4
  from_date: string;
  to_date: string;
}

export function buildQuarterOptions(fy: FinancialYearOption, fyType: FinancialYearType): QuarterOption[] {
  // derive startMonth from FY_CONFIG and fy.from_date
  const [startYear, startMonth] = fy.from_date.split('-').map(Number);
  const quarters: QuarterOption[] = [];
  for (let q = 1; q <= 4; q++) {
    const mStart = startMonth + (q - 1) * 3;
    const mEnd   = mStart + 2;
    const { year: sy, month: sm } = wrap(startYear, mStart);
    const { year: ey, month: em } = wrap(startYear, mEnd);
    const lastDay = new Date(ey, em, 0).getDate();
    const label = `Q${q} ${monthName(sm)} – ${monthName(em)} ${ey}`;
    quarters.push({
      value:        `${fyType}:${startYear}:Q${q}`,
      label,
      period_index: q,
      from_date:    `${sy}-${pad2(sm)}-01`,
      to_date:      `${ey}-${pad2(em)}-${pad2(lastDay)}`,
    });
  }
  return quarters;
}

function wrap(baseYear: number, month: number) {
  if (month > 12) return { year: baseYear + 1, month: month - 12 };
  return { year: baseYear, month };
}
function monthName(m: number) {
  return new Date(2000, m - 1, 1).toLocaleString('default', { month: 'short' });
}
```

---

## 3. Posting inclusion rule (reversal)

**Single rule**: include a posting in all balance calculations if and only if:

```sql
(p.status IS DISTINCT FROM 'REVERSED')
AND (p.reversal_of_posting_id IS NULL)
```

Rationale: `status = 'REVERSED'` marks the original as superseded; `reversal_of_posting_id IS NOT NULL` marks the reversal entry itself. Excluding both legs gives net-zero effect — equivalent to the pair never existing.

This replaces all `posting.name LIKE 'Clos%'` exclusions and the `account_balances` view's `WHERE name !~~ 'Clos%'` filter as the authoritative inclusion signal. The `account_balances` view can be updated separately once closing-balance postings are no longer created.

---

## 4. Effective date

```sql
DATE(COALESCE(p.value_date, p.posting_date)) AS effective_date
```

Used for all period boundary comparisons in the MV and in `resolvePeriodBounds`-based report queries. This replaces the current `p.value_date BETWEEN` filter in `getTrialBalance` / `getIncomeStatement`, which silently drops postings with a null `value_date`.

---

## 5. Materialized view

### 5.1 Period dimension table (prerequisite)

A small, refreshable plain table to enumerate all periods the product cares about. The application populates this via a seeding job (see §6.2).

```sql
CREATE TABLE IF NOT EXISTS period_dim (
  fy_type       TEXT        NOT NULL,  -- 'JAN_DEC' | 'APR_MAR' | 'JUL_JUN' | 'OCT_SEP'
  fy_start_year INTEGER     NOT NULL,  -- label year Y
  period_kind   TEXT        NOT NULL,  -- 'FY' | 'MONTH' | 'QUARTER'
  period_index  INTEGER     NOT NULL,  -- 1 for FY; 1-12 MONTH; 1-4 QUARTER
  from_date     DATE        NOT NULL,
  to_date       DATE        NOT NULL,
  PRIMARY KEY (fy_type, fy_start_year, period_kind, period_index)
);
```

Seed: for each `fy_type`, generate FY rows for `fy_start_year` in `[current - 5, current + 1]`, then expand to MONTH and QUARTER rows. A TypeScript seeder using `resolvePeriodBounds` keeps this in sync.

### 5.2 MV DDL

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS period_closing_balance AS
WITH org_currencies AS (
  SELECT
    o.id AS org_id,
    COALESCE(c_org.id, c_inr.id) AS base_currency_id
  FROM organizations o
  LEFT JOIN currency c_org ON c_org.id = o.basecurrency_id
  LEFT JOIN currency c_inr ON c_inr.org_id = o.id AND c_inr.code = 'INR'
),
-- CLOSING rate as of period to_date (balance sheet uses closing rate, not average)
closing_rates AS (
  SELECT DISTINCT ON (er.org_id, er.from_currency_id, pd.fy_type, pd.fy_start_year, pd.period_kind, pd.period_index)
    er.org_id,
    er.from_currency_id,
    pd.fy_type,
    pd.fy_start_year,
    pd.period_kind,
    pd.period_index,
    er.rate
  FROM exchange_rate er
  JOIN period_dim pd ON er.effective_date <= pd.to_date
  WHERE er.rate_type = 'CLOSING'
  ORDER BY er.org_id, er.from_currency_id, pd.fy_type, pd.fy_start_year, pd.period_kind, pd.period_index,
           er.effective_date DESC
),
active_postings AS (
  SELECT
    p.org_id,
    p.legal_entity_id,
    COALESCE(p.account_id, p.credit_account_id)        AS account_id,
    ah.classification,
    ah.currency                                         AS account_currency_id,
    -- signed amount per normal-balance convention (same as getTrialBalance)
    CASE
      WHEN ah.classification IN ('Assets','Expense') THEN
        CASE WHEN p.account_id = ah.id THEN p.amount ELSE -p.amount END
      WHEN ah.classification IN ('Liabilities','Equity','Income') THEN
        CASE WHEN p.credit_account_id = ah.id THEN p.amount ELSE -p.amount END
      ELSE
        CASE WHEN p.account_id = ah.id THEN p.amount ELSE -p.amount END
    END                                                 AS signed_amount,
    DATE(COALESCE(p.value_date, p.posting_date))        AS effective_date
  FROM posting p
  JOIN account_hierarchy ah
    ON ah.id IN (p.account_id, p.credit_account_id)
    AND ah.org_id = p.org_id
    AND ah.classification IN ('Assets','Liabilities','Equity')
  WHERE p.org_id IS NOT NULL
    AND p.legal_entity_id IS NOT NULL
    AND (p.status IS DISTINCT FROM 'REVERSED')
    AND p.reversal_of_posting_id IS NULL
),
-- closing balance = cumulative sum through period to_date
period_raw AS (
  SELECT
    ap.org_id,
    ap.legal_entity_id,
    ap.account_id,
    ap.account_currency_id,
    pd.fy_type,
    pd.fy_start_year,
    pd.period_kind,
    pd.period_index,
    COALESCE(SUM(ap.signed_amount) FILTER (WHERE ap.effective_date <= pd.to_date), 0) AS closing_balance_orig
  FROM active_postings ap
  CROSS JOIN period_dim pd
  GROUP BY
    ap.org_id, ap.legal_entity_id, ap.account_id, ap.account_currency_id,
    pd.fy_type, pd.fy_start_year, pd.period_kind, pd.period_index
)
SELECT
  pr.org_id,
  pr.legal_entity_id,
  pr.account_id,
  pr.fy_type,
  pr.fy_start_year,
  pr.period_kind,
  pr.period_index,
  pr.closing_balance_orig,
  -- convert to reporting (base) currency using CLOSING rate as of period end
  pr.closing_balance_orig * COALESCE(
    cr.rate,
    CASE WHEN pr.account_currency_id = oc.base_currency_id THEN 1 ELSE 1 END
  )                                         AS closing_balance,
  oc.base_currency_id                       AS report_currency_id
FROM period_raw pr
JOIN org_currencies oc ON oc.org_id = pr.org_id
LEFT JOIN closing_rates cr
  ON  cr.org_id          = pr.org_id
  AND cr.from_currency_id = pr.account_currency_id
  AND cr.fy_type          = pr.fy_type
  AND cr.fy_start_year    = pr.fy_start_year
  AND cr.period_kind      = pr.period_kind
  AND cr.period_index     = pr.period_index
WITH NO DATA;
```

### 5.3 Unique index (required for `REFRESH CONCURRENTLY`)

```sql
CREATE UNIQUE INDEX period_closing_balance_pk
  ON period_closing_balance
  (org_id, legal_entity_id, account_id, fy_type, fy_start_year, period_kind, period_index);
```

### 5.4 Column glossary

| Column | Meaning |
|--------|---------|
| `closing_balance_orig` | Cumulative signed balance in the account's native currency |
| `closing_balance` | `closing_balance_orig` × CLOSING FX rate as of `period.to_date`; falls back to 1× if no rate found |
| `report_currency_id` | Org base currency `currency.id`; denormalized for join-free report reads |

### 5.5 Opening and movement at read time

No `opening_balance` or `period_movement` column is stored. Instead:

- **Opening(P)** = `closing_balance` where `(fy_type, fy_start_year, period_kind, period_index)` = `predecessorParams(P)`.
- **Movement(P)** = `Closing(P) - Opening(P)`.
- The report query performs a self-join on `period_closing_balance` using the predecessor key (see §8).

---

## 6. Refresh strategy

### 6.1 v1 trigger points

| Trigger | Action |
|---------|--------|
| Post-import (CSV/PDF batch completes) | Call `REFRESH MATERIALIZED VIEW CONCURRENTLY period_closing_balance` scoped to the affected `org_id` — not possible with CONCURRENTLY on a filtered refresh, so refresh the full view (acceptable for v1 data volumes) |
| Manual API endpoint | `POST /api/reports/mv/refresh` (admin-only) — runs the refresh synchronously or fires a background job |
| Deploy hook | Add refresh to post-migration script until dbt is introduced |

### 6.2 Period dimension seeding

Before the first MV refresh and after each new FY rolls over, seed `period_dim` by running:

```typescript
// backend/src/scripts/seed-period-dim.ts
import { resolvePeriodBounds } from '../lib/period';
// For each fy_type × fy_start_year in [current-5, current+1]:
//   insert FY row (period_index=1)
//   insert 12 MONTH rows (period_index 1-12)
//   insert 4 QUARTER rows (period_index 1-4)
// Uses ON CONFLICT DO NOTHING
```

### 6.3 Future dbt path

The MV SQL in §5.2 is written to be extractable verbatim into a dbt `materialized='table'` or wrapping a `REFRESH MATERIALIZED VIEW` hook. No changes to logic are needed; dbt just takes over scheduling and CI testing.

---

## 7. API design

### 7.1 New endpoint

```
POST /api/reports/period-balance-sheet
```

Request body:

```typescript
interface PeriodBalanceSheetRequest {
  fy_type:        FYType;
  fy_start_year:  number;
  period_kind:    PeriodKind;
  period_index:   number;
  legal_entity_ids?: string[];  // omit for org-wide (uses HQ entity's fy_type — see §7.3)
  report_currency?: string;     // currency.id or ISO code; default: org base
}
```

Response:

```typescript
interface PeriodBalanceSheetResponse {
  period:   { from_date: string; to_date: string; label: string };
  currency: string;  // ISO code of report_currency
  rows:     BalanceSheetRow[];
}

interface BalanceSheetRow {
  account_id:       string;
  account_path:     string;
  account_name:     string;
  classification:   'Assets' | 'Liabilities' | 'Equity';
  level:            number;
  parent_account_id: string | null;
  opening_balance:  number;
  period_movement:  number;
  closing_balance:  number;
}
```

### 7.2 Server-side validation

```typescript
const bounds     = resolvePeriodBounds(req.body);   // throws on invalid period
const predParams = predecessorParams(req.body);
// Resolve legal_entity_ids → confirm all belong to org (org_id from JWT)
// Resolve report_currency if supplied
```

Server rejects requests that don't resolve to an allowed period (i.e., `resolvePeriodBounds` throws).

### 7.3 FY type resolution

```typescript
async function resolveEntityFYType(orgId: string, legalEntityIds?: string[]): Promise<FYType> {
  if (legalEntityIds?.length) {
    // Use financial_year_type of the first entity in the list
    const e = await prisma.entity.findFirst({
      where: { id: { in: legalEntityIds }, org_id: orgId },
      select: { financial_year_type: true },
    });
    return (e?.financial_year_type as FYType) ?? 'JAN_DEC';
  }
  // Tenant-wide: use HQ entity (is_it_headquartres = 'Yes')
  const hq = await prisma.entity.findFirst({
    where: { org_id: orgId, is_it_headquartres: 'Yes' },
    select: { financial_year_type: true },
  });
  return (hq?.financial_year_type as FYType) ?? 'JAN_DEC';
}
```

Note: `is_it_headquartres` preserves the existing schema column name (typo is intentional match).

---

## 8. Report query using the MV

The period balance sheet query joins `period_closing_balance` to itself on the predecessor key to derive opening, then subtracts to get movement.

```sql
-- Parameters: :org_id, :fy_type, :fy_start_year, :period_kind, :period_index
-- Predecessor params computed by server: :pred_fy_start_year, :pred_period_index
-- legal_entity filter: :entity_ids

WITH
current_closing AS (
  SELECT pcb.account_id, SUM(pcb.closing_balance) AS closing_balance
  FROM period_closing_balance pcb
  WHERE pcb.org_id          = :org_id
    AND pcb.fy_type          = :fy_type
    AND pcb.fy_start_year    = :fy_start_year
    AND pcb.period_kind      = :period_kind
    AND pcb.period_index     = :period_index
    AND (:entity_ids IS NULL OR pcb.legal_entity_id = ANY(:entity_ids))
  GROUP BY pcb.account_id
),
prior_closing AS (
  SELECT pcb.account_id, SUM(pcb.closing_balance) AS closing_balance
  FROM period_closing_balance pcb
  WHERE pcb.org_id          = :org_id
    AND pcb.fy_type          = :fy_type
    AND pcb.fy_start_year    = :pred_fy_start_year
    AND pcb.period_kind      = :period_kind
    AND pcb.period_index     = :pred_period_index
    AND (:entity_ids IS NULL OR pcb.legal_entity_id = ANY(:entity_ids))
  GROUP BY pcb.account_id
),
-- Roll up to parent accounts via account_hierarchy (same recursive CTE as getTrialBalance)
leaf_rows AS (
  SELECT
    ah.id AS account_id,
    ah.path AS account_path,
    ah.name AS account_name,
    ah.classification,
    ah.level,
    ah.parent_account_id,
    COALESCE(pc.closing_balance, 0)  AS closing_balance,
    COALESCE(pr.closing_balance, 0)  AS opening_balance,
    COALESCE(pc.closing_balance, 0) - COALESCE(pr.closing_balance, 0) AS period_movement
  FROM account_hierarchy ah
  LEFT JOIN current_closing cc ON cc.account_id = ah.id
  LEFT JOIN prior_closing   pr ON pr.account_id = ah.id
  WHERE ah.org_id = :org_id
    AND ah.classification IN ('Assets','Liabilities','Equity')
)
-- parent roll-up omitted for brevity — same hierarchy_descendants + parent_totals pattern as getTrialBalance
SELECT * FROM leaf_rows ORDER BY account_path;
```

This query is **O(1) in history** once the MV is populated — no full posting scan.

---

## 9. Migration plan

### 9.1 Remove `previous_year_closing` CTE

In `backend/src/lib/reports/perfin.ts → getTrialBalance` (lines 321–358):

- **Replace** the `previous_year_closing` CTE and the hard-coded `prevYearStart`/`prevYearEnd` (lines 259–261, 336–337) with a call to the MV predecessor lookup once the MV is trusted.
- **Interim** (before MV is populated): replace with a direct cumulative-sum query using `effective_date < startDate` and the reversal rule from §3 — drop the `name LIKE 'Closing Balance%'` filter entirely.

### 9.2 `account_balances` view

The view at `backend/prisma/migration/views.sql` lines 3–50 filters `WHERE name !~~ 'Clos%'`. This can remain in place temporarily because it is only used by `getTrialBalance`'s `rolled_up_balances` CTE for period activity (not opening). Once closing-balance postings are no longer created, the filter becomes a no-op and can be dropped in a follow-on migration.

**Do not** rely on this filter for correctness once the MV path is live.

### 9.3 Migration order

1. Add `period_dim` table and seed it.
2. Create `period_closing_balance` MV (with `WITH NO DATA`).
3. Create unique index on the MV.
4. Run first refresh (`REFRESH MATERIALIZED VIEW period_closing_balance`).
5. Add `POST /api/reports/period-balance-sheet` endpoint reading from MV.
6. Update `getTrialBalance` to use cumulative-sum opening (no `Clos%` filter).
7. Update `BalanceSheet.tsx` to call the new endpoint with period params (or extend existing payload — see §9.4).
8. Remove `previous_year_closing` CTE from `getTrialBalance` once tests pass.

### 9.4 Balance sheet page

`frontend-1/src/pages/reports/BalanceSheet.tsx` currently calls the `trial_balance` report id and filters client-side. Two options:

- **Option A (recommended)**: Keep calling trial_balance but pass `from_date`/`to_date` derived from `resolvePeriodBounds` — zero UI change required. The opening column still comes from the updated `getTrialBalance` (no `Clos%`).
- **Option B**: Wire the page to the new `period-balance-sheet` endpoint and add period-kind selector UI. Enables quarter selection. Do this as a follow-on once the backend is stable.

---

## 10. Test plan (maps to FRD §9 acceptance criteria)

| AC | Test |
|----|------|
| Period boundaries match `buildFYOptions`/`buildMonthOptions`/quarters | Unit tests in `backend/src/lib/period.test.ts` for all 4 FY types × all 3 period kinds |
| Opening + movement = closing per account | Integration test: seed 3 postings across two consecutive months; assert invariant after MV refresh |
| Consecutive periods: closing N = opening N+1 | Same fixture; compare predecessor closing to current opening |
| No `Clos%` dependency | `grep -r "Clos%" backend/src` returns 0 results (run in CI) |
| MV closing = brute-force closing | SQL test comparing `period_closing_balance.closing_balance` vs direct `posting` sum for 3 representative orgs/entities/periods |
| First period, no prior postings: opening = 0 | `predecessorParams` returns period with no MV row → falls back to 0 |

---

## 11. File map

| Path | Action |
|------|--------|
| `backend/src/lib/period.ts` | **New** — `resolvePeriodBounds`, `predecessorParams`, FY helpers |
| `backend/src/lib/reports/period_balance_sheet.ts` | **New** — query using MV |
| `backend/src/lib/reports.ts` | **Edit** — add route for `period-balance-sheet` |
| `backend/src/lib/reports/perfin.ts:259-358` | **Edit** — remove `previous_year_closing` CTE and hard-coded APR-MAR window |
| `backend/src/scripts/seed-period-dim.ts` | **New** — populates `period_dim` |
| `backend/prisma/migration/YYYYMMDD_period_mv.sql` | **New** — DDL for `period_dim` + MV + index |
| `frontend-1/src/components/Reports/FinancialYearSelector.tsx` | **Edit** — add `buildQuarterOptions`, `QuarterOption` |
| `frontend-1/src/pages/reports/BalanceSheet.tsx` | **Edit (deferred)** — Option B wiring to new endpoint |

---

---

## 12. First-time setup: Migration Journal

### 12.1 Problem

When a user migrates from QuickBooks / Tally / Excel, they have a trial balance snapshot (account balances as of a date) but no intention to import years of individual transactions. Without seeding, every opening column in Fabriq starts at zero.

### 12.2 Why the MV handles it without changes

Opening-balance postings dated on the **last day before the first live period** are just regular postings. The MV computes `closing_balance = cumulative sum of postings with effective_date ≤ period.to_date`, so:

- FY2024-25 (starting 2024-04-01): migration postings dated 2024-03-31 are excluded from period activity, but appear as the closing of FY2023-24 → become opening for FY2024-25 ✓
- FY2022-23 and earlier: 2024-03-31 > those periods' `to_date` → not included ✓
- No MV DDL changes needed.

### 12.3 Posting structure

Each account gets one true double-entry posting (`account_id` AND `credit_account_id` both set):

| Classification | `account_id` (Debit leg) | `credit_account_id` (Credit leg) |
|---|---|---|
| Assets (balance > 0) | asset account | Opening Balance Clearing |
| Liabilities (balance > 0) | Opening Balance Clearing | liability account |
| Equity (balance > 0) | Opening Balance Clearing | equity account |

- `posting_type = 'OPENING_BALANCE'`
- `name = 'Opening Balance - {account_name}'`
- `value_date = posting_date = migration_date`

**Opening Balance Clearing** (code `__OBC__`, classification `Equity`) is auto-upserted per `(org_id, legal_entity_id)` on first migration journal submission. If Assets ≠ L + E, the clearing account carries the residual, making the discrepancy visible on the balance sheet.

### 12.4 API

Registered via `customActionRegistry` (side-effect import in `backend/src/index.ts`):

| Endpoint | Purpose |
|----------|---------|
| `POST /api/setup/custom/migration-journal` | Create/replace journal from `{legal_entity_id, migration_date, rows:[{account_id,balance}], replace?}` |
| `POST /api/setup/custom/migration-journal-csv` | Create/replace from CSV file upload |
| `POST /api/setup/custom/migration-journal-status` | Check if opening balances exist for an entity |
| `POST /api/setup/custom/migration-journal-delete` | Hard-delete opening balance postings for `{legal_entity_id, migration_date}` |

### 12.5 Files

| File | Role |
|------|------|
| `backend/src/lib/actions/migrationJournal.ts` | Core logic: upsert OBC account, create postings, delete |
| `backend/src/lib/actions/migrationJournalCsv.ts` | CSV parsing and account-code resolution |
| `backend/src/rest/setupCustomActions.ts` | Registers the four endpoints above |
| `frontend-1/src/pages/setup/MigrationJournal.tsx` | UI: manual entry + CSV upload tabs |

### 12.6 Idempotency

`replace = true` deletes all `OPENING_BALANCE` postings for the entity/date inside the same transaction before creating new ones. Without `replace`, a 409 is returned if postings already exist for that date.

---

*End of design.*
