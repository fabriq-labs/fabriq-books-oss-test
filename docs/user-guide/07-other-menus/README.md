# Session 7: Dashboard, Masters & Settings

**Duration:** ~30 minutes  
**Objective:** Use Fabriq’s home dashboard, AI Workbench, investment tracking, master data setup, and key admin settings.

**Covers:** Dashboard, Workbench, Investments, Masters, Settings

---

## What you will learn

- What the role-based dashboard shows and how to use it daily
- How the AI **Workbench** assists categorization and reconciliation
- Investment module screens and ledger integration
- Which reference lists to set up before transaction volume grows
- Settings screens accountants touch (bank connections, import runs)

---

## Part A: Dashboard

**Path:** Top of sidebar — **Dashboard**

The dashboard is your **role-based home**. Content varies by role, but finance users typically see:

- **Period snapshot** — revenue, expenses, cash position for the selected entity
- **Workload items** — documents awaiting your approval or action
- **Agent inbox summary** — pending AI suggestions from Workbench
- **Quick links** to Workbench and Reports

Use the dashboard at the start of each day to clear **To Do** items before deep work in Sales, Purchases, or Accounting.

---

## Part B: Workbench (AI agent)

**Path:** Sidebar — **Workbench**

Fabriq’s **AI-powered bookkeeping workspace** — unique to Fabriq; there is no direct Zoho Books equivalent.

| Screen | Where to find it | Purpose |
|--------|------------------|---------|
| Start session | **Workbench** | Pick an agent template and describe your goal |
| Inbox | **Workbench → Inbox** | Approve or reject pending AI-proposed actions |
| Session | Open from Workbench | Watch the agent execute step by step |

**Typical uses:**

- Batch **categorize** uncategorized bank transactions
- **Reconciliation** suggestions — match transactions to invoices and bills
- Month-end automation tasks (varies by agent template)

The agent proposes actions; you review in the **Inbox** before changes hit the ledger. Nothing is saved without your approval (unless your organization has configured auto-approve rules).

---

## Part C: Investments

**Sidebar:** Investments

Fabriq tracks securities alongside operating books — useful for treasury and investment holdings.

| Screen | Where to find it | Purpose |
|--------|------------------|---------|
| Portfolio | **Investments → Portfolio** | Holdings summary, market value, P&L |
| Instruments | **Investments → Instruments** | Securities list (symbol, type, currency) |
| Holdings | **Investments → Holdings** | Current positions by account |
| Trades | **Investments → Trades** | Buy/sell records |

**Ledger integration:** Trades can create settlement journal entries when configured — linking investment activity to the chart of accounts.

Broker sync (e.g. Questrade) may update instrument prices and holdings automatically depending on your integration setup.

---

## Part D: Masters

**Where to find it:** **Masters** section in the left sidebar

Master data is **shared reference data** for Sales, Purchases, and Accounting. Import and transaction forms link to these records — if a record is missing, import validation fails (Session 2).

### Items & inventory

| Screen | Where to find it | Why it matters |
|--------|------------------|----------------|
| Item Master | **Masters → Items & Inventory → Item Master** | Line items on quotes, orders, invoices, bills |
| Item Categories | **Masters → Items & Inventory → Item Categories** | Grouping and reporting |
| Units of Measurement | **Masters → Items & Inventory → Units of Measurement** | Quantity units on line items |

### Organization structure

| Screen | Where to find it | Why it matters |
|--------|------------------|----------------|
| Legal Entity | **Masters → Organization → Legal Entity** | Multi-company scoping |
| Locations | **Masters → Organization → Locations** | Delivery and inventory locations |
| Business Units | **Masters → Organization → Business Units** | Internal segmentation |
| Departments | **Masters → Organization → Departments** | Requisitions and budget dimensions |
| Projects | **Masters → Organization → Projects** | Project costing on lines |
| Cost Centers | **Masters → Organization → Cost Centers** | Expense allocation |

### Shipping

| Screen | Where to find it |
|--------|------------------|
| Shipping Terms | **Masters → Shipping → Shipping Terms** |
| Shipping Methods | **Masters → Shipping → Shipping Methods** |

> **Best practice:** Set up masters **before** high transaction volume or bulk import. Create items, tax codes, and payment terms before importing invoices.

---

## Part E: Settings *(administrators)*

**Where to find it:** **Settings** in the left sidebar *(administrators)*

Most settings are admin-only. Accountants commonly work with:

| Screen | Where to find it | Accountant use |
|--------|------------------|----------------|
| Bank connections | **Settings → Bank connections** | Connect Plaid accounts (with admin) |
| Import Runs | **Settings → Import Runs** | Review server-side bank import history and errors |
| Users | **Settings → Users** | *(admin)* Role assignment |
| Connections | **Settings → Connections** | *(admin)* ERP integrations |
| Employees | **Settings → Employees** | HR linkage where used |

After a bulk bank import, check **Import Runs** if records are missing or partially loaded.

---

## Completion checklist

- [ ] Reviewed dashboard workload and inbox
- [ ] Know how to start a Workbench session and approve actions in Inbox
- [ ] Identified which masters your organization still needs
- [ ] Know where bank connections and import runs live
- [ ] Completed all seven sessions — return to [Guide home](../README.md) for reference

---

## Zoho Books reference

| Fabriq | Zoho Books | Help link |
|--------|------------|-----------|
| Dashboard | Dashboard | [Dashboard](https://www.zoho.com/books/help/dashboard/) |
| Item Master | Items | [Items](https://www.zoho.com/books/help/items/) |
| Item Categories | Item categories | [Item categories](https://www.zoho.com/books/help/items/) |
| Projects | Projects | [Projects](https://www.zoho.com/books/help/projects/) |
| Organization dimensions | Reporting tags | [Reporting tags](https://www.zoho.com/books/help/settings/reporting-tags.html) |
| Bank connections | Banking setup | [Add Accounts](https://www.zoho.com/books/help/banking/add-accounts.html) |
| ERP connections | Integrations | [Integrations](https://www.zoho.com/books/help/integrations/) |
| Users | Users & Roles | [Users](https://www.zoho.com/books/help/settings/users.html) |
| Import Runs | Migration | [Migration](https://www.zoho.com/books/help/migration/) |
| Settings | Settings | [Settings](https://www.zoho.com/books/help/settings/) |

---

## Guide navigation

| ← Previous | [Guide home](../README.md) | Next → |
|------------|----------------------------|--------|
| [Session 6 — Reports](../06-reports/README.md) | | — |
