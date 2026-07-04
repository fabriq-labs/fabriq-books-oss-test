# Session 4: Purchases & Workflows — Procure to Pay

**Duration:** ~75 minutes  
**Objective:** Manage supplier spend in Fabriq — from purchase requisition through approval workflows, purchase orders, and vendor bills — including how PR auto-generates POs.

**Where to find it:** **Purchases** in the left sidebar

---

## What you will learn

- The Fabriq procure-to-pay chain and how it differs from simpler AP workflows
- Purchase Requisition (PR) approval states and who acts at each step
- How Fabriq **splits one PR into multiple POs** by supplier and need-by date
- PO and Bill workflows, three-way matching, and when bills affect the ledger (org-dependent)

**Fabriq difference:** Fabriq includes a built-in **Purchase Requisition** workflow with manager and buyer approval gates. Many products (including Zoho Books) typically start at Purchase Order or Bill — see Zoho reference at the end.

---

## Session overview

```
Supplier → Purchase Requisition (PR) → Purchase Order (PO) → Bill → Payment
```

| Document | Posts to ledger? | Typical owner |
|----------|------------------|---------------|
| Supplier | No | Procurement / AP |
| Purchase Requisition | No | Requester → Manager → Buyer |
| Purchase Order | No | Buyer |
| Bill | **Yes** — expense + AP *(when configured)* | AP / Buyer |

Workflow states and action names below describe the **default** setup. Your administrator may have customized flows.

---

## Part A: Suppliers

**Path:** **Purchases → Suppliers**

Suppliers (vendors) mirror customers on the sales side. Every purchase order and bill requires a **Supplier**.

| Task | How in Fabriq |
|------|---------------|
| **Create / edit** | Same pattern as [Session 3 — Customers](../03-sales/README.md) |
| **Import** | CSV Mapper with supplier name or code |
| **Filter** | Includes onboarded-date filter for vendor lifecycle tracking |

---

## Part B: Purchase Requisition (PR)

**Path:** **Purchases → Purchase Requisitions**

### What a PR is

An **internal request to buy**. The requester does not commit spend — they seek approval. On final buyer approval, Fabriq can **auto-generate Purchase Order(s)** from PR lines.

### Workflow

```
Draft → Manager Review → Buyer Review → Delivery (final)
         ↑_______________|    |_________|
              reject / send back
```

| State | Who acts | Meaning |
|-------|----------|---------|
| **Draft** | Requester | Being prepared |
| **Manager Review** | Requester's manager | First approval gate |
| **Buyer Review** | Buyer role | Procurement review |
| **Delivery** | Delivery role | Final; PO generation runs |

### Key actions

| From | Action | To | What happens automatically |
|------|--------|-----|-------------|
| Draft | Submit | Manager Review | Email notification |
| Manager Review | Approve by Manager | Buyer Review | Email |
| Manager Review | Reject / Send Back | Draft | — |
| Buyer Review | **Approve by Buyer** | Delivery | **PO auto-generated** + email |
| Buyer Review | Reject / Send Back | Manager Review or Draft | — |

### How PR creates Purchase Orders

When the buyer clicks **Approve by Buyer**, Fabriq **automatically generates Purchase Order(s)**. **One requisition can create one or many POs.**

#### Grouping rule

PR lines are grouped by:

| Field | Role |
|-------|------|
| **Supplier** | Vendor fulfilling the line |
| **Need-by date** | Required date (grouped by calendar date) |

**One PO per unique supplier + need-by date combination.**

```
PR line items
      │
      ▼
Group by:  Supplier  +  Need-by date
      │
      ▼
One Purchase Order per group
```

#### Scenarios

**1 · Same supplier, same need-by date → one PO**

| PR line | Item | Supplier | Need-by date |
|---------|------|----------|--------------|
| 1 | Widget A | Acme Ltd | 10 Jun 2026 |
| 2 | Widget C | Acme Ltd | 10 Jun 2026 |

**Result:** **1 PO** to Acme Ltd with **2 line items**.

**2 · Same supplier, different need-by dates → multiple POs**

| PR line | Item | Supplier | Need-by date |
|---------|------|----------|--------------|
| 1 | Widget A | Acme Ltd | 10 Jun 2026 |
| 2 | Widget C | Acme Ltd | 20 Jul 2026 |

**Result:** **2 POs** to Acme Ltd — one per need-by date, **1 line item each**.

**3 · Different suppliers, same need-by date → multiple POs**

| PR line | Item | Supplier | Need-by date |
|---------|------|----------|--------------|
| 1 | Widget A | Acme Ltd | 10 Jun 2026 |
| 2 | Part X | Beta Corp | 10 Jun 2026 |

**Result:** **2 POs** — one to Acme Ltd, one to Beta Corp.

**4 · Mixed example → three POs from one PR**

| PR line | Item | Supplier | Need-by date |
|---------|------|----------|--------------|
| 1 | Widget A | Acme Ltd | 10 Jun 2026 |
| 2 | Widget C | Acme Ltd | 10 Jun 2026 |
| 3 | Widget B | Acme Ltd | 20 Jul 2026 |
| 4 | Part X | Beta Corp | 10 Jun 2026 |

**Result:** **3 POs** — Acme (Jun 10, 2 lines), Acme (Jul 20, 1 line), Beta (Jun 10, 1 line).

#### Summary table

| Supplier on lines | Need-by date on lines | POs created |
|-------------------|----------------------|-------------|
| Same | Same | **1** PO (all lines combined) |
| Same | Different | **1 PO per date** |
| Different | Same | **1 PO per supplier** |
| Different | Different | **1 PO per supplier + date pair** |

**Tip for requesters:** Use the **same supplier and same need-by date** on all lines if you want a single PO.

#### What each generated PO contains

| Copied from PR (header) | Per group (lines) |
|-------------------------|-------------------|
| Requester, department, project, budget, deliver-to, PR number, legal entity | Supplier from the group |
| | Need-by date for the group |
| | Payment terms, shipping terms/method from supplier master |
| | Line items: product, qty, rate, need-by date per line |

Each PO links back to the purchase requisition and shows the **PR number** on the header.

#### Requirements before PO generation

- Every PR line must have a **supplier** assigned.
- PR must reach **Delivery** state.
- If any PO in the batch fails, the **whole operation rolls back** — no partial PO set.

#### Finding generated POs

1. **Purchases → Purchase Orders** — filter by PR number.
2. Open the approved PR — linked POs reference the requisition.
3. Check workflow state **Pending PO Creation** if orders start in draft.

### Requester checklist

1. Purchases → Purchase Requisitions → **Add**.
2. Add line items — item, qty, estimated price, **supplier**, **need-by date**, project/department.
3. **Submit**.
4. If sent back — edit and resubmit.

### Approver checklist

1. Open PR from **To Do** tab.
2. Verify **supplier** and **need-by date** on every line (controls PO split).
3. Approve, reject, or send back.
4. After buyer approval — check **Purchase Orders**.

### Dashboard tabs

- **To Do** — awaiting your action  
- **Created by Me** — your PRs  
- **By workflow state**

---

## Part C: Purchase Order (PO)

**Path:** **Purchases → Purchase Orders**

POs are created **manually** or **from an approved PR** (grouped by supplier + need-by date).

### Workflow

```
Pending PO Creation → PO Pending Approval → PO Issued (final)
                                        ↘ PO Cancelled
```

| State | Meaning |
|-------|---------|
| Pending PO Creation | Buyer drafting |
| PO Pending Approval | Awaiting approval |
| PO Issued | Approved; send to supplier |
| PO Cancelled | Rejected |

**Approve** on a PO may trigger: email, draft bill creation, optional ERP sync (if configured).

### PO checklist

1. Confirm supplier, lines, prices, delivery date.
2. **Submit** → approver **Approve**.
3. Send PO to supplier (outside Fabriq).
4. On vendor invoice arrival → create **Bill**.

---

## Part D: Bills (vendor invoices)

**Path:** **Purchases → Bills**

Bills are vendor invoices. They live under **Purchases → Bills** — separate from **Sales → Invoices**, even though both are invoices in business terms.

### Workflow

```
Draft → Submitted → Approved (final)
          ↑________|
            Reject
```

**Approve** marks the bill final in the approval flow and may trigger email notifications. **Automatic expense/AP journal entries on approve are not part of the default setup** — confirm with your administrator how bills should hit the ledger.

### Entry methods

| Method | Steps |
|--------|-------|
| **Manual** | Add Bill → supplier, lines → Submit → Approve |
| **PDF upload** | **Purchases → Bills → Upload** → AI extract → review → submit for approval |
| **Import** | Bills list → Import → map the **Supplier** column |
| **From PO** | Match bill lines to PO lines (three-way match) |

### Three-way matching

| Document | Confirms |
|----------|----------|
| Purchase Order | What you ordered and at what price |
| Receipt / delivery | What you received |
| Bill | What the supplier is charging |

Fabriq supports matching bill lines to PO lines during entry and approval.

---

## Part E: How approval works in Fabriq

| Concept | What you see in the app |
|---------|-------------------------|
| **Status** | Current approval step on the document (e.g. Draft, Manager Review, Approved) |
| **Action** | Buttons on the document that move it to the next step (Submit, Approve, Reject) |
| **Assignment** | Who is responsible — often by role (manager, buyer) or named user |
| **Automatic follow-up** | Things that happen when you approve — email, PO creation, journal entries, ERP sync |
| **History** | Audit trail of who moved the document and when |

**Filtered lists:** Use workflow tabs on purchase orders and bills — e.g. **To Do** for items awaiting your approval.

---

## Completion checklist

- [ ] Understand PR → PO auto-generation and the supplier + need-by date rule
- [ ] Know which role acts at each PR and PO state
- [ ] Can enter or approve a bill and understand ledger impact in your organization
- [ ] Know where to find **To Do** items for approvals
- [ ] Ready for [Session 5 — Accounting](../05-accounting/README.md)

---

## Zoho Books reference

| Fabriq screen | Zoho Books | Help link |
|---------------|------------|-----------|
| Purchase module | Purchase transactions | [Purchase transactions](https://www.zoho.com/books/help/getting-started/zoho-books.html) |
| Suppliers | Vendors | [Customers & Vendors](https://www.zoho.com/books/help/contacts/) |
| Purchase Requisitions | *(custom / requisition apps)* | — |
| Purchase Orders | Purchase Orders | [Purchase Orders](https://www.zoho.com/books/help/purchase-order/) |
| Bills | Bills | [Bills](https://www.zoho.com/books/help/bills/) |
| Convert PO to Bill | Convert PO to Bill | [PO → Bill](https://www.zoho.com/books/help/purchase-order/functions.html) |

---

## Guide navigation

| ← Previous | [Guide home](../README.md) | Next → |
|------------|----------------------------|--------|
| [Session 3 — Sales](../03-sales/README.md) | | [Session 5 — Accounting](../05-accounting/README.md) |
