# Session 1: Overview & Getting Started

**Duration:** ~30 minutes  
**Objective:** Understand what Fabriq Books does, how to sign in, select your legal entity, and navigate list pages confidently.

**Audience:** Finance team, bookkeepers, accountants

---

## What you will learn

- How Fabriq Books fits into your order-to-cash and procure-to-pay workflows
- The sidebar modules and when to use each
- How multi-entity (legal entity) scoping works
- The shared list-page pattern used across Customers, Invoices, Bills, and Transactions

---

## What Fabriq Books is

Fabriq Books is a **double-entry bookkeeping** application built for small and mid-sized businesses. Every financial event — a sale, a bill, a bank deposit — ultimately creates **journal entries** on **Accounting → Transactions**. Sales and Purchases modules capture business documents; Accounting holds the ledger; Reports read from that ledger.


| Area       | Sidebar        | Business flow                                     | Fabriq focus                               |
| ---------- | -------------- | ------------------------------------------------- | ------------------------------------------ |
| Money in   | **Sales**      | Order to cash — quote → order → invoice → receipt | Customer master, revenue documents, AR     |
| Money out  | **Purchases**  | Procure to pay — requisition → PO → bill          | Supplier master, approval workflows, AP    |
| Ledger     | **Accounting** | Transactions, bank feeds, chart of accounts       | Chart of accounts, manual journals, reconciliation |
| Analysis   | **Reports**    | Balance sheet, P&L, trial balance, cash flow      | Period-close statements from live transactions     |
| Automation | **Workbench**  | AI-assisted categorization and reconciliation     | Fabriq-specific; no Zoho equivalent        |


Fabriq is **configurable per organization**: your administrator controls which menus, approval steps, and form fields you see. If a button or column is missing, ask your admin — it is usually a role or access setting, not a product limitation.

---

## Before you start

### Sign in and select your entity

1. **Sign in** with the email and password your administrator provided.
2. **Select the legal entity** in the top bar before doing any bookkeeping work.

The entity selector is critical in Fabriq. Chart of accounts, transactions, budgets, and most reports are **scoped to the entity you pick**. Switching entities changes which accounts and journal entries you see. Group companies may have several entities; always confirm you are in the right one before recording transactions or approving documents.

1. **Use the left sidebar** to move between modules.

### Roles and permissions

Fabriq uses **role-based access**. Your role determines:

- Which sidebar sections appear
- Which workflow actions you can take (e.g. approve a bill, submit a PR)
- Which fields are read-only vs editable on forms

You may see the same list page as a colleague but with different **Add**, **Import**, or approval buttons. This is by design.

---

## Sidebar at a glance


| Section     | Where to find it | Purpose                                              |
| ----------- | ---------------- | ---------------------------------------------------- |
| Dashboard   | Top of sidebar   | Home — workload, period snapshot, agent inbox        |
| Workbench   | Sidebar          | AI agent for batch categorization and reconciliation |
| Reports     | Sidebar          | Financial statements                                 |
| Sales       | Sidebar          | Customer revenue (order to cash)                     |
| Purchases   | Sidebar          | Supplier spend (procure to pay)                      |
| Accounting  | Sidebar          | Ledger, chart of accounts, bank feeds                |
| Investments | Sidebar          | Portfolio, trades, holdings                          |
| Masters     | Sidebar          | Items, locations, organization reference data        |
| Settings    | Sidebar          | Users, integrations, bank connections *(admin)*      |


Set up **Masters** (items, locations, payment terms) before high transaction volume. Session 7 covers masters in detail.

---

## The list page pattern

Almost every transactional screen — Customers, Invoices, Suppliers, Bills, Transactions — uses the same layout. Learn it once in Session 1; apply it everywhere.


| Control     | What it does in Fabriq                                                    |
| ----------- | ------------------------------------------------------------------------- |
| **Filters** | Narrow the list; active filters show as **badge chips** below the toolbar |
| **Columns** | Show or hide table columns (persists per user where enabled)              |
| **Add**     | Open the create form for a new record                                     |
| **Import**  | Bulk upload from CSV or PDF — opens the **CSV Mapper** (Session 2)        |
| **Export**  | Download list data *(where enabled)*                                      |


**Bulk actions:** Select **two or more rows** with checkboxes. A selection bar appears with **Edit** (bulk edit) and **Delete** (bulk delete). Some screens add module-specific actions — e.g. Transactions offers **Reconcile** and **Merge**.

**Workflow lists:** Purchase documents (requisitions, orders, bills) often have tabs such as **To Do** or filters by approval status — e.g. bills waiting for your approval under **Purchases → Bills**.

Full details on filters, import, and bulk edit: [Session 2 — Common Features](../02-common-features/README.md).

---

## How data flows (big picture)

Journal entries on **Accounting → Transactions** are the ledger. They can come from several places — but **not every approval step creates them by default**.


| Source                          | Creates journal entries? | Notes                                                                                                                                                       |
| ------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bank statement import**       | Yes                      | Importing a bank CSV or PDF creates rows on **Transactions** (you then categorize and reconcile)                                                              |
| **Manual journal**              | Yes                      | **Accounting → Transactions → Add**                                                                                                                           |
| **Opening balance / migration** | Yes                      | **Accounting → Opening Balances** or migration setup                                                                                                        |
| **Sales invoice**               | Only if configured       | The **default** invoice approval flow recalculates totals and sends email — it does **not** post to the ledger. Your admin can turn on automatic journals on Submit or Approve |
| **Purchase bill**               | Not by default           | Approving a bill may send notifications; automatic expense/AP journals are **not** on in the default setup                                                  |
| **Payment receipt**             | Not automatic by default | Can be linked to bank transactions during **reconciliation**                                                                                                |


**Reports always read from Transactions** — there is no separate reporting database. If you approve an invoice and reports do not change, open **Accounting → Transactions** and check for matching journal entries. If none exist, ledger posting for that document is not set up for your organization yet.

```
Business documents (quote, invoice, bill, payment)
        │
        ▼
Approval (where configured) ──► may create journal entries (if your admin enabled this)
        │
Bank import / manual journal ──► journal entries created directly
        │
        ▼
Accounting → Transactions (debit + credit lines)
        │
        ▼
Reports (trial balance, P&L, balance sheet)
```

---

## Completion checklist

- Signed in and selected the correct legal entity
- Can name the four main modules: Sales, Purchases, Accounting, Reports
- Opened at least one list page and located Filters, Add, and Import
- Understand that missing buttons usually mean role/permission limits
- Ready for [Session 2 — Common Features](../02-common-features/README.md)

---

## Zoho Books reference

Use these links if you are comparing Fabriq to Zoho Books or migrating from Zoho.


| Topic                         | Zoho Books help                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Product overview              | [How Zoho Books Works](https://www.zoho.com/books/help/getting-started/zoho-books.html) |
| Dashboard                     | [Dashboard](https://www.zoho.com/books/help/dashboard/)                                 |
| Welcome / setup               | [Welcome Guide](https://www.zoho.com/books/help/getting-started/welcome.html)           |
| Migration from another system | [Migration Guide](https://www.zoho.com/books/help/migration/)                           |


---

## Guide navigation


| ← Previous | [Guide home](../README.md) | Next →                                                         |
| ---------- | -------------------------- | -------------------------------------------------------------- |
| —          |                            | [Session 2 — Common Features](../02-common-features/README.md) |


