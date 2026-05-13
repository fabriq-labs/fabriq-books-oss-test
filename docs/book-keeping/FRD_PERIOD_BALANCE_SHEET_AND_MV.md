# FRD: Period Balance Sheet, Opening/Closing Balances, and Materialized Closing Balances

**Document type**: Functional requirements (for downstream technical design)  
**Status**: Draft for design handoff  
**Audience**: Engineering / data platform (Claude or human architect)  
**Related**: [BOOKKEEPING_DOMAIN.md](./BOOKKEEPING_DOMAIN.md), [INCOME_STATEMENT_AND_BALANCE_SHEET.md](./INCOME_STATEMENT_AND_BALANCE_SHEET.md)

---

## 1. Purpose

Define how Fabriq computes **balance sheet positions** (Assets, Liabilities, Equity) for **standard financial periods**, including **opening balance** (logically: prior period **closing**), **period movement**, and **closing balance**, **without** relying on synthetic “closing balance” postings or `name` pattern hacks.

Define a **PostgreSQL materialized view** (MV) as the **first-class cache** for **period closing balances per account** (and agreed scope keys), so that:

- Read paths can use **simple lookups** (e.g. opening for period P = closing for predecessor of P from the MV).
- Refresh can later be orchestrated on a schedule (e.g. **dbt** or cron) once view logic is tested; v1 may use manual or app-triggered `REFRESH MATERIALIZED VIEW`.

**Principle**: Ledger truth remains **`posting`**; the MV is a **derived, refreshable snapshot**, not a second source of truth.

---

## 2. Goals

1. **Correctness**: For any allowed reporting period, opening + period movement = closing for every in-scope account, using the same posting rules and dates as defined in §5.
2. **Period vocabulary**: Only **full financial year**, **month within FY**, or **quarter within FY** — no arbitrary date ranges for this feature.
3. **FY alignment**: Only `financial_year_type` values that exist in the product today: `JAN_DEC`, `APR_MAR`, `JUL_JUN`, `OCT_SEP` (see Prisma `enum financial_year_type` on `entity`, and `frontend-1/src/components/Reports/FinancialYearSelector.tsx`).
4. **No workaround postings**: Do **not** depend on postings whose `name` matches `Clos%`, `Closing Balance%`, or any similar convention. Remove hard-coded prior-year windows tied to a single FY calendar (e.g. Apr–Mar only) from reporting logic.
5. **Simplicity at read time**: After MV is populated/refreshed, **previous period closing** for opening columns is obtained from the **MV** (or a thin view on top of it), not from a full historical scan of `posting` in the hot path.
6. **Path to ops**: Document intent to run refreshes **on a schedule** (future **dbt** or equivalent); v1 may use PostgreSQL `REFRESH MATERIALIZED VIEW` from migrations, jobs, or deploy hooks until dbt is introduced.

---

## 3. Non-goals (explicit)

- Arbitrary `[from_date, to_date]` for balance sheet / period balance APIs (only enumerated periods in §4).
- Storing “closing balance” as **manual** journal entries required for correctness.
- **Income statement** full redesign in this FRD (may share `effective_date` rules only).
- **Automatic real-time MV refresh on every posting insert** as a hard requirement for v1 (see §8).
- **HQ consolidation mapping** (`hq_account_id`) full specification in this FRD — entity/tenant scope rules must be stated; consolidation can be a follow-on design if grain differs.

---

## 4. Period model (closed vocabulary)

### 4.1 Financial year types

| `financial_year_type` | First month of FY | Spans two calendar years |
|----------------------|-------------------|---------------------------|
| `JAN_DEC`            | January           | No                        |
| `APR_MAR`            | April             | Yes                       |
| `JUL_JUN`            | July              | Yes                       |
| `OCT_SEP`            | October           | Yes                       |

Semantic alignment with frontend `FY_CONFIG` in `FinancialYearSelector.tsx` (`startMonth`, `crossYear`).

### 4.2 Period kinds

1. **FY** — One row per financial year: `[from_date, to_date]` exactly as produced by the same calendar rules as `buildFYOptions` for the chosen type and label year.
2. **MONTH** — One of the 12 consecutive month buckets inside that FY, each `[first day of month, last day of month]`, as in `buildMonthOptions(fullFYOption)`.
3. **QUARTER** — Four contiguous buckets per FY, each three FY-months long, covering the full FY without overlap:
   - Q1: FY months 1–3  
   - Q2: FY months 4–6  
   - Q3: FY months 7–9  
   - Q4: FY months 10–12  
   (FY “month 1” = FY start month.)

### 4.3 FY label year

**Label year `Y`**: calendar year in which the FY **starts** (consistent with current `buildFYOptions` / product copy, e.g. `APR_MAR` “FY 2024–25” → start `2024-04-01`).

### 4.4 Which FY type applies to a report run

- **Entity-scoped** report (one or more `legal_entity_id`s): use **`financial_year_type`** from the **primary entity** of the selection (design choice: first selected entity, or HQ if always present — pick one in technical design; must be **single** FY type per request).
- **Tenant-wide** (no entity filter): use **HQ entity’s** `financial_year_type`; if missing, default **`JAN_DEC`**.

### 4.5 Period identity (for MV keys)

Every period must be addressable by a **stable key** (design to define exact encoding), e.g.:

- `period_kind` ∈ `{ FY, MONTH, QUARTER }`
- `financial_year_type`
- `fy_start_year` (label `Y`)
- `period_index` — omit or `1` for full FY; `1..12` for month position within FY; `1..4` for quarter.

Server **rejects** any request that does not resolve to exactly one allowed period.

### 4.6 Predecessor period

For opening = prior closing: **predecessor** is the unique period of the **same** `period_kind` whose `to_date` is exactly **one calendar day before** the current period’s `from_date` (cross-FY allowed). First period in book history: opening **zero** if MV/query has no prior row.

---

## 5. Posting and balance rules

### 5.1 Effective date

- `effective_date = DATE(COALESCE(posting.value_date, posting.posting_date))`.

### 5.2 Which postings count

- Include only lines that represent **active** ledger activity (exclude reversed / voided lines per **one** documented rule aligned with existing product behavior — e.g. exclude originals marked `REVERSED`, or net using `reversal_of_posting_id`; technical design picks the single rule).

- **Do not** include or exclude rows based on `posting.name` patterns (`Clos%`, etc.).

### 5.3 Accounts in scope for “balance sheet position”

- **Balance sheet classifications only**: `Assets`, `Liabilities`, `Equity` (from `account.classification` / `account_hierarchy`).

- Income and Expense: **out of scope** for opening/closing **columns** in this FRD unless a separate product decision adds “current-year P&amp;L rolled into equity” (not required here).

### 5.4 Signed amount per account per posting

Use the **same normal-balance convention** as current trial balance logic in `backend/src/lib/reports/perfin.ts` (classification-based debit/credit treatment).

### 5.5 Definitions for any period `[S, E]` (inclusive)

Let `B(account, end_exclusive)` = signed sum of all included postings with `effective_date < end_exclusive` (for opening, `end_exclusive = S`).

- **Opening(account, period)** = `B(account, S)` = cumulative through end of day before `S`.
- **Period movement(account, period)** = signed sum with `S <= effective_date <= E`.
- **Closing(account, period)** = opening + movement = cumulative with `effective_date <= E`.

**Invariant**: For consecutive periods A then B, `closing(A) = opening(B)` when both use the same rules and data.

---

## 6. Materialized view — functional requirements

### 6.1 Role

- The MV holds **pre-aggregated closing balances** (and optional auxiliary columns) **per account** (and per required scope dimensions) **per period key** (§4.5).
- **Opening** for period P may be read as **closing** for `predecessor(P)` from the same MV (or join to a small period dimension table).

### 6.2 Minimum grain (to be detailed in design)

At minimum:

- `org_id` (tenant)
- `legal_entity_id` — nullable only if product explicitly supports “unassigned entity” rows; otherwise require non-null for entity-scoped materialization (design clarifies).
- `account_id`
- Columns defining **period key** (see §4.5)
- `closing_balance` (and currency / reporting currency treatment per existing `exchange_rate` policy — **annex** to mirror trial balance: e.g. CLOSING for position as-of period end, if multi-currency).

Optional: `period_movement`, `opening_balance` denormalized in MV for convenience — **not required** if opening always comes from predecessor lookup.

### 6.3 Consistency with ledger

- After a full refresh for a given scope/period slice, MV **closing** must match **§5.5 closing** computed directly from `posting` for the same scope and period.
- Automated tests must compare MV vs brute-force SQL for representative orgs/entities/periods.

### 6.4 PostgreSQL behavior

- MV is **not** self-updating: product must define **`REFRESH MATERIALIZED VIEW`** (and `CONCURRENTLY` where possible — requires unique index).
- Staleness between refresh and new postings is **acceptable for v1** unless product states otherwise; document user-facing expectation (e.g. “balances as of last nightly refresh”).

### 6.5 Simplification of reporting views

- Normal views / report queries should **prefer** reading **opening** from predecessor **closing** in the MV rather than recomputing cumulative sums over all history **once MV is trusted**.
- Direct-from-posting computation remains the **reference implementation** for tests and for **refresh** definition.

---

## 7. Current system gaps (for migration)

1. **`getTrialBalance`** in `backend/src/lib/reports/perfin.ts`: opening from `previous_year_closing` using `Closing Balance%` and a hard-coded Indian FY window — **remove** as source of truth.
2. **`account_balances` view** in `backend/prisma/migration/views.sql`: excludes `name !~~ 'Clos%'` — **do not** rely on this for correctness; may retain temporarily during migration or remove once data is clean (design decision).
3. **Balance Sheet UI** uses `trial_balance` report id — may continue to do so with extended payload or introduce dedicated `balance_sheet` / period API (design choice).

---

## 8. Refresh and future dbt

### 8.1 v1

- Any of: manual refresh, cron, application job after batch import, or deployment pipeline.
- Document **which orgs/entities/periods** are refreshed (full vs incremental slice).

### 8.2 Later (out of scope for implementation in this FRD)

- **dbt** (or similar) on a schedule to:
  - Build/rebuild the MV or an intermediate model that `REFRESH`es the MV.
  - Version and test SQL in CI.

This FRD only **requires** that the **logical definition** of the MV contents is stable and testable so dbt can wrap it later.

---

## 9. Acceptance criteria (testable)

1. For each `financial_year_type` and each `period_kind`, period boundaries match `FinancialYearSelector` / `buildMonthOptions` / quarter rules in §4.
2. For synthetic posting fixtures, **opening + movement = closing** per account for random periods.
3. **Consecutive periods**: closing period N equals opening period N+1 for the same account and scope.
4. **No** test or production logic depends on `posting.name LIKE 'Closing Balance%'` or `Clos%`.
5. After MV refresh, MV **closing** equals brute-force **§5.5 closing** for the same keys (within rounding / FX rules).
6. First period with no prior postings: **opening = 0**.

---

## 10. Open items for technical design (not product ambiguity)

These are **implementation** choices to lock in design doc, not user-facing options:

- Exact **MV DDL**, unique index for `REFRESH CONCURRENTLY`, and column list.
- **Incremental** refresh strategy vs full refresh per org.
- **Multi-currency** columns: one row per account-native vs reporting currency only.
- Single rule for **reversed** postings.
- API shape: `period_kind` + `fy_type` + `fy_start_year` + `period_index` vs resolved `[from_date, to_date]` only server-side.

---

## 11. References (code)

| Area | Path |
|------|------|
| FY enum | `backend/prisma/schema/zeiv.prisma` — `financial_year_type` |
| FY UI math | `frontend-1/src/components/Reports/FinancialYearSelector.tsx` |
| Trial balance / opening hack | `backend/src/lib/reports/perfin.ts` — `getTrialBalance` |
| Report router | `backend/src/lib/reports.ts` |
| Account balances view | `backend/prisma/migration/views.sql` — `account_balances` |
| Balance sheet page | `frontend-1/src/pages/reports/BalanceSheet.tsx` |

---

*End of FRD.*
