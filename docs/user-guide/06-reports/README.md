# Session 6: Reports & Month-End Close

**Duration:** ~45 minutes  
**Objective:** Run Fabriq financial reports, drill through to underlying transactions, and complete a structured month-end close.

**Where to find it:** **Reports** in the left sidebar

---

## What you will learn

- How Fabriq reports relate to live transactions on **Accounting → Transactions** (no separate reporting database)
- Shared report controls: financial year, period, entity, currency
- When to use each standard report
- A practical month-end checklist

---

## Session overview

Fabriq reports are generated from **Transactions** in real time. When you import bank lines, add a manual journal, or reconcile a transaction, the next report refresh reflects it. Approving an invoice or bill only changes reports **if** that action created or linked journal entries in your organization.

**Reports → Overview** lists all available reports with navigation links.

---

## Part A: How to run any report

### Shared controls

| Control | Purpose |
|---------|---------|
| **Financial year** | e.g. FY 2025-26 — defines period boundaries |
| **Period / month** | Month or custom date range within the FY |
| **Legal entity** | Single entity or multi-select for group consolidation |
| **Currency** | Display currency when consolidating |
| **Refresh** | Regenerate with current filter values |
| **Export** | PDF or Excel for auditors and management |

### Steps

1. Reports → select report.
2. Set financial year and period.
3. Confirm legal entity (defaults to top-bar selection).
4. Report loads automatically or click **Refresh**.
5. Click rows or cells to **drill through** to **Accounting → Transactions** *(where supported)*.
6. **Export** for records.

Drill-through opens **Transactions** with filters pre-filled (Session 2). Edit the filter chips to investigate further.

---

## Part B: Balance Sheet

**Path:** **Reports → Balance Sheet**

| Topic | Detail |
|-------|--------|
| **Shows** | Assets, liabilities, equity at a point in time |
| **Columns** | Opening balance, period activity, closing balance |
| **Use when** | Month-end, year-end, lender or investor requests |
| **Export** | PDF, Excel |

The balance sheet must balance: assets = liabilities + equity. If it does not, check unposted documents and opening balances (Session 5).

---

## Part C: Income Statement (P&L)

**Path:** **Reports → Income Statement**

| Topic | Detail |
|-------|--------|
| **Shows** | Revenue minus expenses for the selected period |
| **Use when** | Profitability review, management reporting, board packs |

Income and expense accounts roll up from the chart of accounts hierarchy.

---

## Part D: Monthly Trial Balance

**Path:** **Reports → Monthly Trial Balance**

| Topic | Detail |
|-------|--------|
| **Shows** | Debits and credits per account by month |
| **Use when** | Month-end close — verify total debits = total credits |
| **Drill-through** | Click a cell → filtered **Transactions** for that account and month |

This is the accountant’s primary **integrity check** before signing off a period.

---

## Part E: Cash Flow

**Path:** **Reports → Cash Flow**

| Topic | Detail |
|-------|--------|
| **Shows** | Operating, investing, and financing cash movements |
| **Use when** | Liquidity analysis, forecasting, covenant reporting |

Classification depends on account mapping in your chart of accounts.

---

## Part F: Posting List

**Path:** **Reports → Posting List**

| Topic | Detail |
|-------|--------|
| **Shows** | Full journal entry audit trail |
| **Actions** | Merge duplicates *(where enabled)* |
| **Use when** | Audit support, finding specific entries, investigating discrepancies |

---

## Part G: Month-end checklist

Work through in order:

| Step | Action | Screen |
|------|--------|--------|
| 1 | Categorize and reconcile all bank transactions | [Session 5 — Transactions](../05-accounting/README.md) |
| 2 | Approve pending bills and invoices that belong in the period | **Purchases** / **Sales** |
| 3 | Run **Monthly Trial Balance** — confirm debits = credits | **Reports → Monthly Trial Balance** |
| 4 | Run **Income Statement** — review P&L | **Reports → Income Statement** |
| 5 | Run **Balance Sheet** — confirm position at period end | **Reports → Balance Sheet** |
| 6 | Run **Cash Flow** if required | **Reports → Cash Flow** |
| 7 | Export PDFs for audit trail | Each report → **Export** |

Use **Workbench** (Session 7) for AI-assisted batch categorization if you have a large backlog of unmatched bank lines.

---

## Completion checklist

- [ ] Ran at least one report with FY, period, and entity set correctly
- [ ] Used drill-through from Trial Balance to Transactions
- [ ] Exported a report to PDF or Excel
- [ ] Can execute the month-end checklist steps in order
- [ ] Ready for [Session 7 — Other Menus](../07-other-menus/README.md)

---

## Zoho Books reference

| Fabriq report | Zoho Books | Help link |
|---------------|------------|-----------|
| Reports module | Business Overview Reports | [Business Overview](https://www.zoho.com/books/help/reports/business-overview.html) |
| Balance Sheet | Balance Sheet | [Balance Sheet](https://www.zoho.com/books/help/reports/balance-sheet.html) |
| Income Statement | Profit and Loss | [Profit and Loss](https://www.zoho.com/books/help/reports/profit-and-loss.html) |
| Cash Flow | Cash Flow Statement | [Cash Flow](https://www.zoho.com/books/help/reports/cash-flow.html) |
| Trial Balance | Trial Balance | [Trial Balance](https://www.zoho.com/books/help/reports/trial-balance.html) |
| Posting List | General Ledger / Journal | [Account Transactions](https://www.zoho.com/books/help/reports/account-transactions.html) |
| Filter and customize | Report filters | [Filter and customize reports](https://www.zoho.com/books/help/reports/business-overview.html) |

---

## Guide navigation

| ← Previous | [Guide home](../README.md) | Next → |
|------------|----------------------------|--------|
| [Session 5 — Accounting](../05-accounting/README.md) | | [Session 7 — Other Menus](../07-other-menus/README.md) |
