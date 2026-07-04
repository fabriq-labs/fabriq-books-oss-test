# Session 3: Sales — Order to Cash

**Duration:** ~60 minutes  
**Objective:** Run the full sales cycle in Fabriq — from customer master through quotes, orders, invoices, payments, and credit notes — and understand when each document creates journal entries on **Accounting → Transactions**.

**Where to find it:** **Sales** in the left sidebar

---

## What you will learn

- The Fabriq sales document chain and which steps your business needs
- How to create, convert, and import each sales document type
- When approved invoices and receipts hit the general ledger
- How delivery challans fit alongside tax invoices

---

## Session overview

The **Sales** module implements **order to cash** — everything from identifying a customer to recording revenue and collecting payment. Fabriq stores each step as a separate document type with its own list page, workflow (where configured), and link to the next step.

```
Customer → Quote → Sales Order → Delivery Challan → Invoice → Payment Receipt
                                                              ↘ Credit Note
```

**Not every business uses every step.** A services firm may go **Customer → Invoice → Payment Receipt** directly. A distributor may use the full chain including delivery challans for physical goods.

**Key Fabriq concept:** Sales forms use **linked fields** — you pick a **Customer**, **Item**, **Tax**, **Currency**, and **Payment Terms** from their respective lists. Those records must exist before you create transactions (or import them — see Session 2).

---

## Part A: Customers

**Path:** **Sales → Customers**

### What customers are in Fabriq

A customer record is the anchor for all accounts-receivable activity. Every quote, sales order, and invoice requires a **Customer**. Fabriq stores:

- Legal / display name and optional **Code** (used when importing from CSV)
- Default **currency** and **payment terms**
- Billing and shipping addresses
- Contact details

### When to create vs import

| Situation | Approach |
|-----------|----------|
| Few customers | **Add Customer** on the list page |
| Migration or bulk load | **Import** → CSV Mapper (Session 2) |
| Ongoing | Create as needed; codes help import and integrations |

### Import mapping

| CSV column | Maps to form field | Notes |
|------------|-------------------|-------|
| Name | **Name** | Required |
| Code | **Code** | Optional; recommended for imports |
| Currency | **Currency** | Currency code: USD, INR, etc. |
| Payment terms | **Payment Terms** | Must exist under **Accounting → Payment Terms** |
| Email / phone | Contact fields | Per sample file |

### Tasks

| Task | Steps |
|------|-------|
| **Create** | Add Customer → name, currency, payment terms, addresses → Save |
| **Edit** | Open from list → edit → Save |
| **Find** | Filters or column search |
| **Import** | Import → CSV → map columns → validate names match existing records → Upload |

---

## Part B: Quotes

**Path:** **Sales → Quotes**

### Role in Fabriq

A quote **does not create journal entries** — it records a formal price offer with line items, taxes, and an expiry date. When the customer accepts, you **convert** the quote to a sales order (or in some setups, directly to an invoice).

### Key fields

| Field | Purpose |
|-------|---------|
| Customer | Who receives the offer |
| Quote date | Date of the offer |
| Expiry date | Last date for acceptance |
| Line items | Item, quantity, rate, tax, discount |
| Status | Draft, sent, accepted, rejected |

### Tasks

| Task | Steps |
|------|-------|
| **Create** | Add Quote → customer → line items → dates → Save |
| **Convert** | Open accepted quote → **Convert to Sales Order** |
| **Import** | Import → CSV → map fields (customer and items must resolve) |

---

## Part C: Sales Orders

**Path:** **Sales → Sales Orders**

### Role in Fabriq

A sales order **confirms** what you will sell — quantities, prices, delivery location, and need-by dates. Like quotes, sales orders **do not create journal entries** until you invoice. They drive fulfillment and can feed delivery challans and invoices.

### Workflow states

Sales orders may move through approval states depending on your organization:

`Draft → Review → Confirmed → Shipped → Delivered`

Available actions depend on your **role** and workflow configuration. Check the document detail page for action buttons in the current state.

### Tasks

| Task | Steps |
|------|-------|
| **Create** | Add Sales Order → customer → line items → delivery location → Save |
| **From quote** | Open accepted quote → convert |
| **To invoice** | Open confirmed order → **Convert to Invoice** |
| **Import** | Import → CSV |

---

## Part D: Invoices

**Path:** **Sales → Invoices**

### Role in Fabriq

The sales **invoice** is the primary **accounts-receivable** document. **If** your administrator has enabled automatic journal creation when an invoice is submitted or approved, Fabriq will create ledger entries such as:

- **Debit** Accounts Receivable  
- **Credit** Revenue  

The **default** invoice approval flow only recalculates totals and sends email — it does **not** create journal entries. Ask your administrator if ledger posting should happen and at which approval step.

### Creation methods

| Method | When to use |
|--------|-------------|
| **Manual** | One-off invoices |
| **From sales order** | Standard flow after fulfillment |
| **PDF upload** | **Sales → Invoices → Upload** — AI extracts header and lines; you review in a form |
| **Import** | Bulk historical invoices during migration |

### Key fields

| Field | Purpose |
|-------|---------|
| Customer | Defaults currency and payment terms |
| Invoice date | Date of the bill |
| Due date | Expected payment date |
| Line items | Item, qty, rate, tax, discount |
| Total | Subtotal, tax, grand total |

### Recording payment

After invoicing, create a **Payment Receipt** (Part F) or record payment from the invoice detail screen. Payment reduces AR and debits bank/cash.

---

## Part E: Delivery Challans

**Path:** **Sales → Delivery Challans**

### Role in Fabriq

A delivery challan documents **goods shipped** separately from the tax invoice — common in India and other jurisdictions where delivery proof and tax billing are separate events.

Fabriq tracks:

- **Ordered quantity** (from sales order)
- **Delivered quantity** (may be partial)
- **Delivery date**

Delivery challans **do not create journal entries**. Revenue is still recorded on the **invoice**.

### Tasks

| Task | Steps |
|------|-------|
| **Create** | Add Delivery Challan → customer → link sales order → lines |
| **Partial delivery** | Enter delivered qty &lt; ordered qty per line |
| **From sales order** | Generate from confirmed order |

---

## Part F: Payment Receipts

**Path:** **Sales → Payment Receipts**

### Role in Fabriq

Records money **received** from a customer. It reduces the outstanding balance on one or more invoices.

**Ledger effect:** A payment receipt can be linked to bank transactions during **reconciliation** (Session 5). Automatic journal creation on save is **not** part of the default setup — verify with your administrator.

### Tasks

| Task | Steps |
|------|-------|
| **Record payment** | Add Payment Receipt → customer → date, amount, method |
| **Bank account** | Select where money was received |
| **Allocate** | Apply to open invoices |
| **Save** | Receipt saved; ledger linkage depends on your setup and reconciliation |

Reconcile bank-imported deposits to payment receipts in **Accounting → Transactions** (Session 5).

---

## Part G: Credit Notes

**Path:** **Sales → Credit Notes**

### Role in Fabriq

Reduces what a customer owes — returns, billing errors, post-sale discounts. Links to the original invoice where possible.

**Ledger effect:** Reduces revenue and/or accounts receivable depending on your organization's setup.

### Tasks

| Task | Steps |
|------|-------|
| **Create** | Add Credit Note → customer → link invoice → line items |
| **Save** | Customer outstanding balance decreases |

---

## Quick reference — common tasks

| I want to… | Go to |
|------------|-------|
| Add a new customer | Sales → Customers → **Add** |
| Import customers | Sales → Customers → **Import** |
| Send a price offer | Sales → Quotes |
| Confirm an order | Sales → Sales Orders |
| Bill a customer | Sales → Invoices |
| Record payment | Sales → Payment Receipts |
| Issue a return credit | Sales → Credit Notes |
| Document a shipment | Sales → Delivery Challans |

For **filters**, **import**, and **bulk edit**, see [Session 2 — Common Features](../02-common-features/README.md).

---

## Completion checklist

- [ ] Created or imported at least one customer
- [ ] Understand which documents post to the ledger in **your** organization (invoice journals are admin-configured; not on by default)
- [ ] Know your organization’s path: full chain vs invoice-only
- [ ] Can convert quote → order → invoice (if your workflow uses them)
- [ ] Ready for [Session 4 — Purchases](../04-purchases/README.md) or [Session 5 — Accounting](../05-accounting/README.md)

---

## Zoho Books reference

| Fabriq screen | Zoho Books | Help link |
|---------------|------------|-----------|
| Sales module | Sales | [Sales module](https://www.zoho.com/books/help/getting-started/zoho-books.html) |
| Customers | Customers | [Customers & Vendors](https://www.zoho.com/books/help/contacts/) |
| Quotes | Quotes | [Quotes](https://www.zoho.com/books/help/quote/) |
| Sales Orders | Sales Orders | [Sales Orders](https://www.zoho.com/books/help/sales-order/) |
| Invoices | Invoices | [Invoices](https://www.zoho.com/books/help/invoice/) |
| Delivery Challans | Packages / shipment docs | [Sales Orders](https://www.zoho.com/books/help/sales-order/) |
| Payment Receipts | Payments Received | [Payments Received](https://www.zoho.com/books/help/payments-received/) |
| Credit Notes | Credit Notes | [Credit Notes](https://www.zoho.com/books/help/credit-note/) |
| Line items | Items | [Items](https://www.zoho.com/books/help/items/) |
| Process flow | Quote → order → invoice → payment | [Sales order workflow](https://www.zoho.com/books/help/sales-order/) |

---

## Guide navigation

| ← Previous | [Guide home](../README.md) | Next → |
|------------|----------------------------|--------|
| [Session 2 — Common Features](../02-common-features/README.md) | | [Session 4 — Purchases](../04-purchases/README.md) |
