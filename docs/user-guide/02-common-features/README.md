# Session 2: Common Features — Filters, Import & Bulk Actions

**Duration:** ~45 minutes  
**Objective:** Master the shared tools on Fabriq list pages — filters, CSV/PDF import with the CSV Mapper, bulk edit, and bulk delete — so you can work efficiently in any module.

**Applies to:** Almost every list screen — Customers, Bills, Transactions, Items, etc.

---

## What you will learn

- How Fabriq filters work (operators, chips, drill-through from reports)
- The three import paths and when to use each
- How the **CSV Mapper** checks that names in your file match existing records before upload
- Bulk edit and bulk delete rules and limitations

---

## Why these features matter

Fabriq reuses the same list-page toolkit across modules. Whether you are importing 500 customers, filtering unpaid invoices, or bulk-updating categories on bank transactions, the interaction pattern is identical. **Session 2 is prerequisite knowledge** for Sales, Purchases, and Accounting sessions.

**Fabriq vs Zoho import:** Zoho Books uses a single Import wizard page per module. Fabriq uses a dedicated **CSV Mapper** with a live data preview — you cannot upload until every customer name, account code, and item code matches a record already in Fabriq.

---

## Part A: Filters

### Purpose

Narrow a long list to what you need right now — e.g. all invoices for one customer in March, or bank transactions with **Reconciliation Status** set to **Unmatched**.

### How to open

1. Open any list page (e.g. **Sales → Invoices**).
2. Click **Filters** in the toolbar.
3. Build conditions in the **Filter modal**.

### Build a filter

Each row has three parts:

| Part | Description |
|------|-------------|
| **Field** | Column to filter on |
| **Operator** | How to compare |
| **Value** | What to match |

Click **+ Add filter** for more rows. All conditions use **AND** — every condition must match for a row to appear.

### Operators by field type

| Field type | Operators |
|------------|-----------|
| Text | Equals, Not Equals, Contains, Not Contains, Greater/Less Than, Is Null, Is Not Null |
| Number | Equals, Not Equals, GT, GTE, LT, LTE, Is Null, Is Not Null |
| Dropdown (select) | Equals, Not Equals, Is Null, Is Not Null |

For dropdown fields (**Customer**, **Supplier**, **Debit Account**, etc.), type in the value box — Fabriq searches the related list and shows matches. Pick the record you want; Fabriq links it to the row automatically.

### Apply and clear

- **Apply** — list refreshes; filters appear as **badge chips** under the toolbar.
- **×** on a chip — remove one filter.
- **Clear All** — remove all visible filters.

### Drill-through from reports

When you click a row or cell on a report (e.g. Trial Balance), Fabriq may open **Transactions** with filters pre-filled. Those chips behave like filters you set manually — you can edit or clear them.

**Account on debit or credit side:** drill-through from some reports shows a single filter chip like **Account: Cash at Bank**, covering both the **Debit Account** and **Credit Account** columns. This avoids missing transactions where the account appears on either side of the entry.

### Hidden filters

Some screens apply permanent filters you cannot see — e.g. the **legal entity** selected in the top bar, or whether you are on **Sales → Invoices** vs **Purchases → Bills**. They are not shown as chips but always constrain the list.

---

## Part B: Import

### Import paths in Fabriq

| Type | Used for | Flow |
|------|----------|------|
| **Generic CSV** | Customers, suppliers, items, accounts, transactions | Upload → CSV Mapper → validate → upload |
| **PDF extract** | Bank statements, some invoices/bills | Upload PDF → AI extract → CSV Mapper → upload |
| **Bank pipeline** | High-volume bank CSV/PDF | Server-side processing; history at **Settings → Import Runs** |

### Step 1 — Start import

1. Open the target list page (e.g. **Sales → Customers**).
2. Click **Import**.
3. Optionally pick a **parent record** — required when importing bank transactions (select the bank account first).
4. Choose **CSV** or **PDF**, or download the **sample file** to see expected columns.

**Supported formats:** CSV, TSV, XLS — typically up to 10 MB per file.

### Step 2 — CSV Mapper

After upload, Fabriq opens the **CSV Mapper**. This is Fabriq’s core import experience.

#### Layout

- Left/top: your CSV column headers
- Per column: a **dropdown** to map to a Fabriq field
- Below: **data preview** with per-row validation status

#### What appears in the dropdown?

Only fields your role is allowed to import appear in the dropdown.

| Category | In dropdown? | Notes |
|----------|--------------|-------|
| Required | Always | Must map before Upload enables |
| Optional | Via **Add column** | Or auto-included if header matches field name |
| Read-only | Never | System fills organization, created-by, and date fields automatically |

#### Auto-matching

Fabriq matches CSV headers to field labels on the form (case-insensitive). **Always review** auto-matches — a column named **Date** might map to the wrong date field.

#### One column per field

Each Fabriq field maps to **at most one** CSV column. Reassigning a column clears the previous mapping for that field.

#### Linked fields — critical rule

Linked fields pick a record from another list (**Customer**, **Item**, **Debit Account**, etc.). Put **names or codes people recognize** in the CSV — not system reference numbers.

| Form field (as shown on screen) | CSV value example | Must already exist in |
|-----------------------------------|-------------------|------------------------|
| **Customer** | `Acme Corp` or `CUST-001` | **Sales → Customers** |
| **Supplier** | `Beta Supplies` | **Purchases → Suppliers** |
| **Debit Account** | `1000` or `Cash at Bank` | **Accounting → Chart of Accounts** |
| **Credit Account** | `4000` or `Sales Revenue` | **Accounting → Chart of Accounts** |
| **Item** | `WIDGET-A` | **Masters → Item Master** |
| **Tax** | `GST-18` | **Accounting → Tax Master** |
| **Currency** | `USD`, `INR` | Currency list |

**Validation flow:**

1. You map a CSV column to a linked field.
2. Fabriq loads distinct values from your CSV.
3. Each value is searched in the related list.
4. Unresolved values show **Not Available** in red.
5. **Upload is blocked** until every value resolves.

**How to fix:** correct the CSV and re-upload, fix values in the preview grid, or create the missing record first (e.g. add the customer) and refresh validation.

#### Upload button rules

**Upload** enables only when:

1. All **required** fields are mapped.
2. No **Not Available** values remain (every name matched an existing record).

#### Row tools in mapper

| Action | Effect |
|--------|--------|
| Select rows + bulk delete | Remove rows from the import preview only (not saved to Fabriq yet) |
| **Errors only** | Show rows where a name did not match |
| Pagination | Navigate large files |

#### Bank transaction import — debit and credit

Bank statement import requires extra care:

1. Select the **bank account** before upload.
2. Map **Debit Amount** (money out) and **Credit Amount** (money in) — not a single unsigned amount column.
3. Map the other side of the entry to **Debit Account** or **Credit Account**.

| Bank statement line | Debit account | Credit account |
|---------------------|---------------|----------------|
| Withdrawal / payment | Expense or contra | Bank |
| Deposit / receipt | Bank | Revenue or contra |

#### PDF bank statements

1. Select bank account.
2. Choose **Extract only** or **Extract + Categorize** (AI assigns categories).
3. For 50+ page statements, enable **chunking**.
4. Review extracted rows in CSV Mapper, then upload.

### Step 3 — Upload

1. Fix all validation errors.
2. Click **Upload** — Fabriq processes in batches of up to 1,000 records.
3. On success, the list page refreshes with new records.

Check **Settings → Import Runs** for server-side bank pipeline status and error logs.

---

## Part C: Bulk Edit

### When it appears

Select **2 or more rows** → purple bar: `N items selected` → click **Edit**.

### Steps

1. **Bulk Edit** modal opens.
2. Click **+ Add field** for each field you want to change.
3. Pick **Field**, enter **Value**, or check **Clear field**.
4. For linked fields, search and pick a record (same experience as filters).
5. **Save** — all selected rows update in one operation.

### Limitations

- Disabled on some read-only screens.
- Workflow-controlled fields may be locked by document state (e.g. cannot bulk-edit an approved bill’s supplier).
- **Transactions** also offers **Reconcile** and **Merge** from the bulk bar — not available on master lists.

---

## Part D: Bulk Delete

1. Select **2 or more rows**.
2. Click **Delete** (red).
3. Confirm in the dialog.

**Caution:** Deletion is permanent for most customer, supplier, and item records. Documents in approval may block delete in certain statuses. On the **CSV Mapper**, bulk delete only removes preview rows — not records already in Fabriq.

---

## Completion checklist

- [ ] Built and applied a filter; cleared it with chips
- [ ] Downloaded a sample import file for one module
- [ ] Understand name matching and **Not Available** errors in the CSV Mapper
- [ ] Know when to select a parent bank account before importing transactions
- [ ] Tried bulk edit or bulk delete on a test list (if permitted)
- [ ] Ready for [Session 3 — Sales](../03-sales/README.md) or your daily module

---

## Zoho Books reference

| Topic | Zoho Books help |
|-------|-----------------|
| Import customers, vendors, items | [Customers & Vendors → Import](https://www.zoho.com/books/help/contacts/) |
| Import invoices | [Invoices → Import](https://www.zoho.com/books/help/invoice/) |
| Import quotes | [Quotes → Import](https://www.zoho.com/books/help/quote/) |
| Import sales orders | [Sales Orders → Import](https://www.zoho.com/books/help/sales-order/) |
| Import purchase orders | [Purchase Orders](https://www.zoho.com/books/help/purchase-order/) |
| Import bills | [Bills](https://www.zoho.com/books/help/bills/) |
| Bank feeds & statements | [Banking → Add Accounts](https://www.zoho.com/books/help/banking/add-accounts.html) |
| Full migration workflow | [Migration Guide](https://www.zoho.com/books/help/migration/) |

---

## Guide navigation

| ← Previous | [Guide home](../README.md) | Next → |
|------------|----------------------------|--------|
| [Session 1 — Overview](../01-overview/README.md) | | [Session 3 — Sales](../03-sales/README.md) |
