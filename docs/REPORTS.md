# Reports — Developer Guide

**Last Updated**: 2026-06-18

---

## Architecture

Every report follows the same four-layer stack:

```
lib/reports/<domain>.ts      ← data function (SQL or Prisma)
        ↓
lib/reports.ts               ← run_report() dispatcher  (switch on report_id)
        ↓
POST /api/report/:id         ← REST route (RestService.generateReport)
        ↓
reportAPI.getReport(id, {})  ← frontend API call (postingApi.ts)
        ↓
<Page>.tsx                   ← React page
```

**Response envelope** — the REST layer always wraps the result:
```json
{ "success": true, "data": <whatever run_report returned> }
```
The frontend reads `result?.data`.

---

## Adding a New Report

### Step 1 — Write the data function

Create or add to a file in `backend/src/lib/reports/`:

```typescript
// backend/src/lib/reports/my_domain.ts
import prisma from '../prisma';

export interface MyReportRow {
  id: string;
  name: string;
  amount: number;
}

export async function getMyReport(
  orgId: string,
  startDate: string,
  endDate: string,
  optionalFilter?: string
): Promise<MyReportRow[]> {
  // Use prisma.$queryRaw for complex SQL (CTEs, window functions)
  // Use prisma.<model>.findMany for straightforward relational queries
  const rows = await prisma.$queryRaw<MyReportRow[]>`
    SELECT id, name, amount
    FROM my_table
    WHERE org_id = ${orgId}
      AND date BETWEEN ${startDate}::date AND ${endDate}::date
  `;
  return rows;
}
```

**Guidelines:**
- Always filter by `orgId` — never return cross-org data
- Use `prisma.$queryRaw` when you need CTEs, window functions, or FX conversion
- Use `prisma.<model>.findMany` for simple relational queries (cleaner, type-safe)
- Convert `Decimal` / `BigInt` fields to `Number` before returning
- Return plain objects — no Prisma model instances

### Step 2 — Register in the dispatcher

Add a branch to `backend/src/lib/reports.ts`:

```typescript
import { getMyReport } from './reports/my_domain';

// inside run_report():
else if (report_id === "my_report") {
  return await getMyReport(
    context.user.org_id,
    filters.from_date,
    filters.to_date,
    filters.optional_filter
  );
}
```

`context.user.org_id` is always available — never trust an `org_id` from `filters`.

### Step 3 — Call from the frontend

```typescript
import { reportAPI } from '@/api/postingApi';

const result = await reportAPI.getReport('my_report', {
  from_date: '2026-01-01',
  to_date:   '2026-12-31',
  optional_filter: 'value',
});

const rows = Array.isArray(result?.data) ? result.data : [];
```

### Step 4 — Build the page

Follow the pattern in `frontend-1/src/pages/reports/IncomeStatement.tsx`:

1. Extract data-fetching into a custom hook with `useCallback` + `useRef` sequence guard:
   ```typescript
   const fetchSeq = useRef(0);
   const fetchReport = useCallback(async () => {
     const seq = ++fetchSeq.current;
     setLoading(true);
     const result = await reportAPI.getReport('my_report', filters);
     if (seq !== fetchSeq.current) return; // stale, discard
     setData(result?.data ?? []);
     setLoading(false);
   }, [filters]);
   ```
   The sequence guard prevents out-of-order responses from clobbering newer fetches.

2. Fire on mount + filter change via `useEffect`.
3. Render with `<Card>` + `<Table>` from `@/components/ui/`.
4. Use `<ReportControls>` for the refresh button and date pickers.

---

## Available Reports

| `report_id` | File | Key filters | Returns |
|---|---|---|---|
| `trial_balance` | perfin.ts | `from_date`, `to_date`, `currency_id`, `legal_entity_ids` | Account debits/credits/balance with FX conversion |
| `monthly_trial_balance` | perfin.ts | `from_date`, `to_date` | Month-by-month account movements |
| `income_statement` | perfin.ts | `from_date`, `to_date`, `currency_id`, `legal_entity_ids` | Income/Expense account tree, hierarchy-rolled up |
| `cash_flow` | perfin.ts | `from_date`, `to_date`, `currency_id` | Operating/Investing/Financing cash movements |
| `personal_income` | perfin.ts | `from_date`, `to_date`, `legal_entity_id` | Income/Expense capped at 3 levels |
| `networth` | perfin.ts | `from_date`, `to_date` | `{ assets, liabilities }` rollup totals |
| `financial_ratios` | perfin.ts | `from_date`, `to_date`, `legal_entity_ids` | Saving, solvency, liquidity, leverage ratios |
| `assets` | perfin.ts | `from_date`, `to_date` | `{ assets, breakdown }` by category |
| `liabilities` | perfin.ts | `from_date`, `to_date` | `{ metrics, breakdown }` secured/unsecured |
| `income_summary_by_category` | perfin.ts | `from_date`, `to_date` | Income totals by category (Salary, Dividend…) |
| `income_analysis_by_type` | perfin.ts | `from_date`, `to_date` | Work income vs investment income split |
| `classification_breakdown` | perfin.ts | `from_date`, `to_date`, `classification` | Pattern-matched breakdown of any classification |
| `my_feed` | zeiv.ts | _(none)_ | Workflow history for the current user |
| `portfolio_summary` | investments.ts | `report_currency`, `legal_entity_id` / `legal_entity_ids` _(optional)_, `connection_id` _(optional)_ | `{ equity, options, cash, accounts, totals, last_sync_at }` |
| `investment_trades` | investments.ts | `from_date`, `to_date`, `connection_id` _(optional)_ | Flat trade rows from broker sync |
| `options_income` | investments.ts | `from_date`, `to_date`, `report_currency`, `legal_entity_id` / `legal_entity_ids` _(optional)_, `connection_id` _(optional)_, `account_id` _(optional)_ | Open premium cash flows + closed round-trip realized P/L — see [INVESTMENTS.md](./book-keeping/INVESTMENTS.md#options-income-report) |

---

## FX Conversion Pattern (perfin.ts)

Reports that convert multi-currency amounts follow this CTE pattern:

```sql
WITH org_base AS (
  -- resolve reporting currency: explicit param → org.basecurrency_id → org.base_currency → fallback
  SELECT COALESCE(c_param.id, c_org.id, ...) AS base_currency_id, ...
  FROM organizations o
  LEFT JOIN currency c_param ON ... -- matches passed currency_id or code
  LEFT JOIN currency c_org   ON c_org.id = o.basecurrency_id
  WHERE o.id = ${orgId}
),
period_avg_rates AS (
  -- most recent AVERAGE rate on or before period end, per source currency
  SELECT DISTINCT ON (er.from_currency_id) er.from_currency_id, er.rate
  FROM exchange_rate er
  WHERE er.org_id = ${orgId}
    AND er.to_currency_id = (SELECT base_currency_id FROM org_base)
    AND er.rate_type = 'AVERAGE'
    AND er.effective_date <= ${endDate}::date
  ORDER BY er.from_currency_id, er.effective_date DESC
)
-- then: amount * COALESCE(rate, 1) to convert to base
```

Use `AVERAGE` rates for P&L (income statement), `CLOSING` rates for opening balances (balance sheet).

---

## Notes

- `report_id` is a plain string — there is no database registry; all reports are hard-coded in `reports.ts`
- The `org_id` always comes from `context.user.org_id` (JWT). Never read it from `filters`
- `filters` is a free-form JSON body sent by the frontend as `{ "filters": { ... } }`
- Both `GET` and `POST /api/report/:id` are supported; always use POST for parameterised reports
- The `zeiv.ts` file contains one feed query; all financial reports live in `perfin.ts`; broker/investment reports in `investments.ts`
