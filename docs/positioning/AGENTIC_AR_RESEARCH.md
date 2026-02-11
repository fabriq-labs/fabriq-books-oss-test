# Agentic AR / FinOps: Research & Build Feasibility

**Purpose**: Map agentic AR (Accounts Receivable) processes to the Fabriq codebase and identify what can be built today vs. what requires net-new work. Aligns with Fabriq Books positioning (agentic FinOps, order-to-cash automation) and ERP plug-in strategy (NetSuite, QuickBooks, Zoho Books).

**References**: [BUSINESS_DOMAIN.md](../BUSINESS_DOMAIN.md), [INTEGRATIONS.md](../INTEGRATIONS.md), [AI_AGENT.md](../AI_AGENT.md), [IMPORT_FUNCTIONALITY.md](../IMPORT_FUNCTIONALITY.md), [fabriqdata.com/books](https://fabriqdata.com/books.html).

---

## 1. Competitive Landscape (Incumbents)

### HighRadius
- **Positioning**: Enterprise AR automation with agentic AI.
- **Collections**: Agentic AI for debt collection — prioritization by risk/collectability, personalized outreach, auto-escalation when recovery odds drop; behavior segmentation (claims ~40% efficiency gain).
- **Cash application**: 11 AI agents; 90%+ straight-through posting; remittance capture from PDF/email; invoice matching (full/partial, PO, multiple refs); exception handling with work queues and suggested matches; short/overpayment and tolerance handling.
- **Overlap with Fabriq**: Order-to-cash, invoice → payment flow, ERP-agnostic data.

### Growfin
- **Positioning**: AI AR automation that "enhances your ERP."
- **Collections**: Automated follow-ups, account prioritization, collections CRM (strategize, track, collaborate, report); DSO reduction, payment delay prediction/prevention.
- **Cash application**: AI payment matching and posting; automated reconciliation (up to ~90%).
- **ERP**: Integrates with existing ERP for receivables; cash flow visibility and forecasting; faster close.
- **Overlap**: Same AR processes; "plug into ERP" model matches Fabriq's integration architecture.

### Others (Emagia, etc.)
- **Cash application**: Match payments to open invoices, capture remittance (PDF/email), post, handle exceptions.
- **Collections**: Rules + behavior-based follow-up, promise-to-pay tracking, escalation.
- **Dispute management**: Central dispute tracking, routing, resolution suggestions (often the "hidden cost" in AR).

### Where Ramp (and similar) fit — different segment

**Ramp** (ramp.com) is **not** in the AR / order-to-cash space. It operates on the opposite side of the ledger:

| Dimension | Ramp | HighRadius / Growfin |
|-----------|------|----------------------|
| **Process** | **Accounts Payable (AP)** + corporate cards + expense | **Accounts Receivable (AR)** + order-to-cash |
| **Cash flow** | Money **going out** (pay suppliers, card spend) | Money **coming in** (collect from customers, apply cash) |
| **Product** | Corporate cards, Bill Pay (AP), invoice capture, GL coding, approvals, ERP sync | Collections, cash application, dispute management, DSO/aging |
| **Typical size** | SMB to mid-market (50,000+ businesses); "mid-sized companies" for Bill Pay | HighRadius: mid-market (RadiusOne) + **enterprise** (1,300+ customers, 200+ Global 2000). Growfin: mid-market / enterprise |
| **Overlap with Fabriq** | Fabriq has **procurement/P2P** (PO, supplier invoice, payment); Ramp competes more with Bill.com, Brex, Concur on cards/AP | Same AR/O2C space as Fabriq Books (collections, cash app, etc.) |

So: **Ramp and HighRadius are in different categories** (AP vs AR), not just different company sizes. Ramp targets smaller companies for **spend and payables**; HighRadius targets mid-market and enterprise for **receivables and treasury**. Fabriq spans both sides (procurement + sales/AR), so Ramp is a **procurement/AP** reference (cards, bill pay) and HighRadius/Growfin are **AR** references.

**Common AR process set**: (1) **Collections** — prioritization, follow-up, reminders, escalation; (2) **Cash application** — match payments to invoices, remittance capture, posting, exceptions; (3) **Dispute management** — track, route, resolve; (4) **Reporting/DSO** — aging, cash forecasting.

---

## 2. What Fabriq Already Has (Codebase Summary)

### 2.1 Data model (AR-relevant)

| Entity | Purpose | Key fields |
|--------|---------|------------|
| `customers` | Customer master | name, contact, payment_term_id, currency, org_id, source_* |
| `invoice` | Sales & purchase invoices | invoice_type (SALES/PURCHASE), customer/supplier, totals, balance_amount, wf_instance_id, source_* |
| `invoice_line_item` | Line-level detail | For matching and disputes |
| `payment_receipt` | Customer payments | customer_id, invoice_id, amount, payment_type (FULL/PARTIAL/ADVANCE), payment_reference, payment_method, source_* |
| `sales_order` | Orders | customer_id, status, totals, source_* |
| `credit_note` | Returns/credits | customer_id, invoice_id, credit_note_total, balance_amount, reason |
| `payment_terms` | Terms master | For due dates and DSO |
| `source_system` | ERP connections | Encrypted OAuth, per-org, system_type (zoho_books, xero, quickbooks) |

**Gaps for "full" AR product**: No first-class **dispute** or **collection_activity** (e.g. call/email log, promise-to-pay) models; no **remittance** or **cash_application_exception** model. These can be added as new models.

### 2.2 Integrations (ERP plug-in)

- **Forward sync (ELT)**: Zoho Books, Xero, QuickBooks Online → `datalake` → DBT → normalized `invoice`, `payment_receipt`, `customers`, `sales_order` in `public` with lineage (`source_system_id`, `source_record_id`, `source_updated_at`). NetSuite planned.
- **Reverse sync**: Workflow-triggered API calls via **connector factory**; today only **purchase order** create is implemented (Zoho, QuickBooks). Connector interface: `createPurchaseOrder`, `getPurchaseOrder`, `getExpenseAccounts`, `getSystemType`.
- **Credentials**: Stored per-org in `source_system.connection_config` (encrypted). Same config usable by sync pipelines and app (e.g. future AR actions).

**Implication**: Fabriq can already **ingest** AR data (invoices, payments, customers) from multiple ERPs into one place. Agentic AR can run **on top of this normalized layer**. Pushing actions back to ERP (e.g. post payment, update invoice status) would need new connector methods and optional reverse-sync flows.

### 2.2.1 Bank and credit card statement import (CSV / PDF → ledger)

Fabriq already supports **bank and credit card statement import** via CSV or PDF, with **AI extractors** that post transactions directly into the **ledger** (`posting` model). See [IMPORT_FUNCTIONALITY.md](../IMPORT_FUNCTIONALITY.md).

| Capability | Status |
|------------|--------|
| **CSV import** | ✅ Generic import for any model; posting view supports CSV → ledger. |
| **PDF import** | ✅ PDF upload → `/api/parse-document/posting` → extractor registry. |
| **Document types** | ✅ `bank_statement`, `account_statement`, `credit_card_statement` (BankStatementExtractor). |
| **Target** | ✅ Extracted transactions → posting (journal/ledger) records. |
| **Optional** | ✅ Posting import extension: extraction + **AI categorization** (BankStatementWithCategorizationExtractor) using Chart of Accounts context. |

Flow: Upload CSV or PDF → AI extraction (if PDF) → CSV mapper (review/edit) → UploadService → **posting** records created. No separate "bank feed" API yet; adding something like **Plaid** would provide **live/scheduled bank and card connectivity** on top of this (same posting model), making the bank side "good to go" for reconciliation and cash visibility.

### 2.3 Workflow engine

- **State machine**: workflow_flow → workflow_state → workflow_action; workflow_instance per record; side-effects (e.g. call ERP connector).
- **Existing**: Invoice workflow; purchase requisition/PO workflows; side-effect for "PO Issued" → create PO in ERP.
- **Fit for AR**: Same pattern can drive **collections workflows** (e.g. Invoice → states like "Reminder Sent" → "Promise to Pay" → "Escalate") and **cash application** (e.g. "Unmatched" → "Matched" → "Posted") with assignments and role-based actions.

### 2.4 AI agent

- **Tools**: CRUD via view-based REST, `searchRecords`, `analyticsQuery` (with org_id), `getAnalyticsContext` (workflow states, schema). **ERP**: `erpConnector` with handlers (e.g. getPurchaseOrder, getExpenseAccounts, getSystemType).
- **Prompts**: Default + analytics (multi-step SQL, workflow-aware). Invoice extractor prompt exists.
- **No dedicated "AR agent" yet**: No tools for "suggest payment allocation," "prioritize collections," or "match payment to invoices."

### 2.5 Business domain

- **Sales/O2C**: Sales order → delivery challan → invoice → payment receipt; partial payments and advance payments supported; payment_type (FULL/PARTIAL/ADVANCE); balance tracking.
- **Planned (BUSINESS_DOMAIN)**: "Automated Follow-ups: AI-powered payment reminders and delivery scheduling"; "Payment Collection: 30% reduction in payment collection cycle."

---

## 3. AR Process → Fabriq Build Feasibility

### 3.1 Collections (prioritization, follow-up, reminders, escalation)

| Capability | Build with current codebase? | Notes |
|------------|------------------------------|--------|
| **Aging / overdue list** | ✅ Yes | `invoice` (SALES) + `invoice_date` / terms → due date; `balance_amount` > 0. Analytics + agent queries (e.g. overdue by customer, bucket). |
| **Prioritization (risk/amount)** | ✅ Yes | Rules or LLM: sort by balance, age, customer segment. No "risk score" model yet — can add or derive from history. |
| **Reminder scheduling** | ✅ Yes | Workflow on invoice (or new "collection_task") with states and scheduled actions; cron/job to "send reminder" (e.g. call email API or enqueue). |
| **Promise-to-pay tracking** | ⚠️ Partial | No dedicated model. Options: (1) Extend invoice or workflow with "promised_date"/notes, or (2) Add `collection_activity` (type: reminder, promise, escalation) linked to invoice/customer. |
| **Escalation rules** | ✅ Yes | Workflow actions + conditions (e.g. days overdue, balance) → transition to "Escalated" state and assign to role. |
| **Outbound comms (email)** | ⚠️ New | No built-in email/send. Need: template engine + email provider (SendGrid, etc.) or integration to external automation (e.g. HighRadius/Growfin do this; Fabriq can orchestrate "mark as reminder sent" and store outcome). |

**Verdict**: **Collections logic and workflows** (aging, prioritization, escalation, scheduling) are **feasible** with current stack. **Reminder execution** (sending emails) and **promise-to-pay** need a small amount of new model + integration work.

---

### 3.2 Cash application (match payments to invoices, post, exceptions)

| Capability | Build with current codebase? | Notes |
|------------|------------------------------|--------|
| **List open invoices & unapplied payments** | ✅ Yes | Invoice: `invoice_type = 'SALES'`, `balance_amount` > 0. Payment_receipt: `invoice_id` null or payment_type = ADVANCE. Agent/analytics can aggregate by customer. |
| **Match by reference (invoice #, PO)** | ✅ Yes | `payment_receipt.payment_reference` + `invoice.invoice_number` (and line-level PO if needed). Rule-based or LLM "suggest match." |
| **Apply payment to invoice (Fabriq)** | ✅ Yes | Create/update `payment_receipt` with `invoice_id`, amount; backend can update `invoice.balance_amount` (or keep derived). Workflow optional (e.g. "Pending apply" → "Applied"). |
| **Remittance capture (PDF/email)** | ⚠️ New | No remittance parser. Options: (1) Use existing **invoice extractor** pattern for "remittance" doc type and populate a **remittance** or **payment_receipt** staging model; (2) Integrate doc AI (e.g. LLM + extraction) to get invoice refs and amounts. |
| **Auto-match (rules + AI)** | ✅ Yes | Service that: (1) Gets unmatched payments; (2) Finds open invoices (customer, amount, reference); (3) Suggests or applies matches. Can be driven by agent tool ("suggestCashApplication") or background job. |
| **Exception queue** | ⚠️ Partial | No "cash_app_exception" model. Can use workflow state (e.g. "Exception") on payment_receipt or invoice; or add small model (payment_id, reason, suggested_invoice_ids, status). |
| **Post to ERP (reverse sync)** | ⚠️ New | Connector today has no `createPayment` / `applyPayment`. Would need per-ERP implementation (Zoho/QuickBooks/NetSuite payment APIs) and optional workflow step "Post to ERP." |

**Verdict**: **Cash application inside Fabriq** (matching, applying, balance updates, suggestions, basic exception handling) is **feasible**. **Remittance capture** and **posting back to ERP** need new pieces (doc pipeline + connector methods).

---

### 3.3 Dispute management

| Capability | Build with current codebase? | Notes |
|------------|------------------------------|--------|
| **Track disputes** | ⚠️ New | No `dispute` model. Add: dispute (invoice_id, customer_id, reason, amount, status, assigned_to, due_date); optional line-level link. |
| **Link to invoice/customer** | ✅ Yes | Once dispute exists, standard relations and views. |
| **Status workflow** | ✅ Yes | Workflow on dispute (Open → Under review → Resolved / Rejected). |
| **Resolution (credit note)** | ✅ Yes | `credit_note` already exists; dispute resolution can create or link credit_note. |
| **Routing / assignment** | ✅ Yes | workflow_state assigned_for (ROLE/USER); optional expression. |

**Verdict**: **Dispute management** is **feasible** with one new model + workflow + optional agent tools (e.g. "list open disputes," "suggest resolution").

---

### 3.4 Reporting & DSO

| Capability | Build with current codebase? | Notes |
|------------|------------------------------|--------|
| **Aging report** | ✅ Yes | Invoices (SALES, balance > 0) + due date; bucket by 0–30, 31–60, etc. `analyticsQuery` or reporting view. |
| **DSO** | ✅ Yes | Definition: (e.g. receivables / revenue) * days. Revenue from invoice totals; receivables from balance_amount. Can be per period/customer. |
| **Cash flow / forecast** | ⚠️ Partial | No forecast model. Can do "expected cash" from payment_terms + open AR; full forecasting would need assumptions and possibly new entities. |

**Verdict**: **Aging and DSO** are **feasible** with current data and analytics/agent. **Cash forecasting** is partial today; can be extended.

---

### 3.5 Agentic behavior (AI that "does" things)

| Capability | Build with current codebase? | Notes |
|------------|------------------------------|--------|
| **Answer AR questions** | ✅ Yes | "Overdue by customer," "payments not applied," "DSO" via analytics + search tools. |
| **Suggest next action** | ✅ Yes | Agent uses workflow state + aging + balance to suggest "send reminder" or "escalate"; human or workflow action executes. |
| **Suggest payment allocation** | ✅ Yes | Tool that returns "payment X likely applies to invoices A, B"; user or auto-applies. |
| **Auto-send reminders** | ⚠️ New | Needs email/send integration and possibly "collection_activity" logging. |
| **Auto-apply cash (STP)** | ✅ Yes | Rule-based or LLM-based matcher + service that creates/updates payment_receipt and balance; can run as job or behind agent. |
| **Auto-escalate** | ✅ Yes | Workflow + cron: "if overdue > N days and state = Reminder Sent → transition to Escalated." |

**Verdict**: **Agentic "suggest and orchestrate"** (queries, suggestions, allocation, escalation rules) fits the current agent and workflow design. **Fully autonomous outbound actions** (e.g. sending emails) need a small integration layer.

---

## 4. What You Can Build With This Codebase (Summary)

### High confidence (mostly existing stack)

1. **Collections**
   - Aging and overdue reports (by customer, bucket).
   - Prioritization (by balance, days overdue, optional risk).
   - Workflow-driven collection states (e.g. Reminder 1 → Reminder 2 → Promise → Escalate) with assignments.
   - Escalation rules (workflow transitions + cron).
   - **Gap**: Email sending and promise-to-pay **storage** (add integration + optional `collection_activity` or fields on invoice/workflow).

2. **Cash application (in-Fabriq)**
   - Unapplied payments and open invoices (by customer).
   - Rule-based or LLM-based **suggest match** (reference, amount, customer).
   - Apply payment to invoice (create/update `payment_receipt`, update balance); optional workflow for "pending apply" → "applied."
   - Exception handling via workflow state or a small exception model.
   - **Gap**: Remittance **parsing** (PDF/email) and **posting to ERP** (new connector methods).

3. **Dispute management**
   - New `dispute` model + workflow (Open → Review → Resolved) + link to invoice/credit_note.
   - Reporting and agent tools for "open disputes," "suggest resolution."

4. **Reporting & metrics**
   - DSO, aging, "expected cash" from open AR.
   - Dashboards using existing analytics/agent and views.

5. **Agentic layer**
   - AR questions (overdue, unapplied, DSO).
   - "Suggest allocation," "suggest next collection action," "list exceptions."
   - Orchestration of workflow actions (escalate, apply payment) with human-in-the-loop or automated where safe.

### Medium effort (new but aligned)

- **Remittance capture**: Reuse invoice-extractor pattern for remittance docs; new staging/model for extracted refs and amounts.
- **Post to ERP**: Add `createPayment` / `applyPayment` (and related) to connector interface; implement for Zoho Books, QuickBooks, then NetSuite.
- **Promise-to-pay / collection activity**: `collection_activity` model or invoice/workflow fields + UI.
- **Email reminders**: Template + email provider integration; trigger from workflow or cron.
- **Live bank/card feed (e.g. Plaid)**: Integrate Plaid (or similar) to pull transactions on a schedule; map to same `posting` model and reuse existing categorization. Complements current CSV/PDF import + AI extractors (which already post to ledger).

### Out of scope for "current codebase" (without significant new product work)

- **Dedicated collections CRM** UI at parity with Growfin (can mimic with views + workflows + agent).
- **Credit/collections scoring** (external data or ML); can later add "risk_score" and use in prioritization.

**Note**: "Full bank feed" in the sense of *live* connectivity is not built yet; **bank/credit card statement import via CSV or PDF with AI extractors is already in place**, and transactions are posted directly to the ledger. Plaid (or similar) would add automated/scheduled pull on top of that.

---

## 5. Suggested Build Order (AR in Fabriq)

1. **Aging + DSO + "overdue" in agent**  
   Use existing `invoice` + `payment_receipt` + `payment_terms`; add analytics prompt/views if needed. Agent answers "overdue by customer," "DSO," "unapplied payments."

2. **Collection workflow on invoice**  
   Add states (e.g. Current → Reminder 1 → Reminder 2 → Promise → Escalated) and actions; assign to AR role; optional "reminder due" date. Cron or job can advance state or trigger "send reminder" hook.

3. **Cash application service + agent tool**  
   Service: suggest matches (payment ↔ invoices) by reference/amount/customer; apply (create/update receipt, update balance). Agent tool: "suggestCashApplication(payment_id)" and "applyPayment(payment_id, invoice_id, amount)."

4. **Dispute model + workflow**  
   New model; workflow; link to invoice and credit_note; basic reporting and agent.

5. **Remittance capture (optional)**  
   Remittance doc type + extractor → staging table or payment_receipt draft; feed into cash application.

6. **Reverse sync: post payment to ERP**  
   New connector methods; call from workflow or after "apply" in Fabriq when org is ERP-led.

7. **Email reminders**  
   Template + provider; call from "send reminder" workflow action or cron.

This order gets you to "agentic AR that plugs into ERPs" (collections, cash app, disputes, reporting) with the current codebase and a small set of new models and integrations.

---

## 6. Overlap With Incumbents (Positioning)

- **HighRadius / Growfin**: They focus on enterprise AR suites with deep bank/remittance and collections CRM. Fabriq can position as:
  - **ERP-agnostic AR layer**: One place for AR data from NetSuite, QuickBooks, Zoho, Xero.
  - **Agentic O2C**: Same metadata + workflow + agent stack as procurement; AR as "sales side" of the same platform.
  - **SMB / mid-market**: Simpler than HighRadius; more "books on autopilot" (fabriqdata.com/books) than full enterprise CRM.
- **Differentiator**: Unified order-to-cash **and** purchase-to-pay on one platform, with one integration story (forward sync + optional reverse sync) and one agent that can answer and act across both.

---

*Doc version: 1.0. Based on BUSINESS_DOMAIN.md, INTEGRATIONS.md, AI_AGENT.md, and current Prisma/connector implementation.*
