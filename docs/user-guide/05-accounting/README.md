# Session 5: Accounting & Banking

**Duration:** ~60 minutes  
**Objective:** Manage Fabriq’s general ledger — chart of accounts, journal entries, bank feeds, reconciliation, and opening balances — and understand **where transactions actually come from** in your environment.

**Where to find it:** **Accounting** in the left sidebar

---

## What you will learn

- How Fabriq’s chart of accounts is structured and scoped by legal entity
- What a **transaction (journal entry)** is and where they come from
- Reconciliation statuses and the categorize → reconcile workflow
- Bank connection setup and the bank-transactions view

---

## Session overview

**Accounting** is the ledger heart of Fabriq. Sales invoices, purchase bills, payment receipts, bank imports, manual journals, and investment trades can all create **journal entries** on **Transactions** — paired debit and credit lines. Reports in Session 6 read directly from these entries.

```
Business events → Accounting → Transactions → Reports
```

Every journal entry on **Transactions** has:

- **Debit Account** and **Credit Account**
- **Amount**, **Posting Date**, **Value Date**
- Optional: **Category**, **Description**, link to invoice or payment receipt

---

## Part A: Chart of Accounts

**Path:** **Accounting → Chart of Accounts**

### Structure in Fabriq

Accounts are organized in a **parent-child hierarchy** per legal entity. Each account has a code, name, classification, and currency.

| Classification | Normal balance | Examples |
|----------------|---------------|----------|
| Assets | Debit | Cash, bank, receivables |
| Liabilities | Credit | Payables, loans |
| Equity | Credit | Capital, retained earnings |
| Income | Credit | Revenue, interest income |
| Expense | Debit | Rent, salaries, COGS |

### Tasks

1. Confirm correct **legal entity** in the top bar.
2. Browse tree or flat list.
3. **Add Account** — name, code, classification, parent, currency.
4. **Import** — CSV with code, name, classification, parent code (Session 2).
5. **Deactivate** an account (mark **Inactive**) instead of deleting accounts that already have transaction history.

### Group companies

Subsidiary accounts may map to a head-office account for consolidated reporting across entities.

---

## Part B: Transactions

**Path:** **Accounting → Transactions**

### Where journal entries come from

| Source | Ledger effect | Default in product? |
|--------|---------------|---------------------|
| Bank statement import | Debit/credit bank vs expense or income | **Yes** |
| Manual journal | You choose debit and credit accounts | **Yes** |
| Opening balance / migration | Opening balance entries | **Yes** (migration setup) |
| Sales invoice approved | Debit AR, credit revenue (+ tax) | **Only if** your admin enabled automatic journals |
| Bill approved | Debit expense, credit AP | **Not wired** in default approval flows |
| Payment receipt | Debit bank, credit AR | **Not automatic** — often via reconciliation |
| Investment trade | Settlement entries | When configured |

### Reconciliation status

Bank and imported transactions show a **Reconciliation Status** on the list and in filters:

| Status (as shown) | Meaning |
|-------------------|---------|
| **Unmatched** | Not linked to a source document |
| **Suggested** | Fabriq or AI suggested a match |
| **Matched** | Linked to invoice, bill, or payment receipt |
| **Confirmed** | You verified the match |

**Typical workflow:** Import bank statement → **Categorize** (assign expense/income account) → **Reconcile** (link to invoice/bill/receipt) → status moves to **Matched** or **Confirmed**.

### Key actions

| Action | Purpose |
|--------|---------|
| **Filter** | Date, account, category, reconciliation status |
| **Categorize** | Assign category / contra account |
| **Reconcile** | Link transaction to source document |
| **Merge** | Combine duplicate transactions |
| **Bulk Edit** | Mass-update fields |
| **Import** | CSV bank statement — [Session 2](../02-common-features/README.md) |
| **Drill-through** | From reports with pre-filled filters |

### Manual journal

1. Click **Add** on **Accounting → Transactions**.
2. Select **Debit Account**, **Credit Account**, **Amount**, dates, and **Description**.
3. Save — the entry appears immediately on **Transactions** and in reports.

---

## Part C: Bank Transactions

**Path:** **Accounting → Bank Transactions**

A **bank-focused view** of the same journal entries, with charts and categorization tools. Shows activity for connected bank accounts only.

**Setup:** Settings → **Bank connections** (Plaid integration). An administrator connects accounts; accountants sync and categorize.

**Workflow:** connect → sync/import → categorize → reconcile → confirm.

Use **Transactions** for all journal entries including non-bank journals; use **Bank Transactions** for day-to-day bank review.

---

## Part D: Opening Balances

**Path:** **Accounting → Opening Balances**

Set starting balances per account at financial-year start or go-live date. **Total debits must equal total credits** before you record new-period activity.

Run **Trial Balance** (Session 6) after entering opening balances to verify.

---

## Part E: Other accounting screens

| Screen | Where to find it | Purpose |
|--------|------------------|---------|
| Tax Master | **Accounting → Tax Master** | Tax codes for invoice lines |
| Payment Terms | **Accounting → Payment Terms** | Due-date rules for invoices and bills |
| Budget Periods | **Accounting → Budget Periods** | Budget time windows |
| Budget Lines | **Accounting → Budget Lines** | Budget amounts per account |
| Exchange Rates | **Accounting → Exchange Rates** | FX rates for multi-currency |

---

## Completion checklist

- [ ] Located chart of accounts for your legal entity
- [ ] Understand where journal entries come from (invoice, bill, bank, manual)
- [ ] Can filter Transactions by reconciliation status
- [ ] Know categorize vs reconcile steps
- [ ] Ready for [Session 6 — Reports](../06-reports/README.md)

---

## Zoho Books reference

| Fabriq screen | Zoho Books | Help link |
|---------------|------------|-----------|
| Chart of Accounts | Chart of Accounts | [Chart of Accounts](https://www.zoho.com/books/help/accountant/chart-of-accounts.html) |
| Transactions | Manual Journals | [Journal](https://www.zoho.com/books/help/accountant/journal.html) |
| Bank Transactions | Banking | [Banking](https://www.zoho.com/books/help/banking/) |
| Bank connections | Add bank accounts | [Add Accounts](https://www.zoho.com/books/help/banking/add-accounts.html) |
| Reconciliation | Bank reconciliation | [Reconciliation](https://www.zoho.com/books/help/banking/reconciliation.html) |
| Opening Balances | Opening balances | [Opening Balances](https://www.zoho.com/books/help/accountant/opening-balances.html) |
| Tax Master | Taxes | [Taxes](https://www.zoho.com/books/help/settings/taxes.html) |
| Payment Terms | Payment Terms | [Payment Terms](https://www.zoho.com/books/help/settings/preferences.html) |
| Budget Periods / Lines | Budgets | [Budgets](https://www.zoho.com/books/help/accountant/budgets.html) |
| Exchange Rates | Currencies | [Currencies](https://www.zoho.com/books/help/settings/currencies.html) |

---

## Guide navigation

| ← Previous | [Guide home](../README.md) | Next → |
|------------|----------------------------|--------|
| [Session 4 — Purchases](../04-purchases/README.md) | | [Session 6 — Reports](../06-reports/README.md) |
