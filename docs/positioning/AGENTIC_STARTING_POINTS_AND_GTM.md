# Agentic Starting Points on the Fabriq Platform — Potential & GTM Fit

**Purpose**: Besides AR, what else is a strong starting point on top of the Fabriq platform? Rate by potential and map to **direct GTM** vs **partner-based GTM**.

**Basis**: [AGENTIC_AR_RESEARCH.md](./AGENTIC_AR_RESEARCH.md), Fabriq's existing stack (multi-ERP sync, posting/ledger, bank/CC import + AI extractors, workflow engine, agent, invoice/payment_receipt/customers, reverse-sync pattern).

---

## 1. Starting Points (Beyond AR)

| # | Starting point | What it is | Platform fit (what you already have) |
|---|----------------|------------|--------------------------------------|
| **A** | **AR (collections + cash application)** | Agentic receivables: overdue, DSO, who to chase, suggest payment match, apply payment, optional workflow. | Invoice (SALES), payment_receipt, customers, terms, sync from QB/Xero/Zoho; workflow; agent. Strong fit. |
| **B** | **Bank / ledger reconciliation** | Match bank & CC transactions (posting) to invoices, payments, or other postings. Agent: "Reconcile this account," "Match these lines," "Explain this transaction." | Posting, bank/CC import (CSV/PDF + AI), invoice, payment_receipt, categorization. Strong fit. |
| **C** | **Multi-entity / multi-ERP visibility** | One view across multiple books (e.g. QB company + Xero org + Zoho). Reporting, aging, trial balance "across my entities." | source_system, lineage, same normalized model across ERPs. Strong fit. |
| **D** | **Financial close / reporting acceleration** | Agent answers "What's unreconciled?", "Aging by entity?", "Trial balance by source?" Faster close with cross-ERP view. | Posting, invoice, workflows, sync. Strong fit. |
| **E** | **Spend visibility (P2P, no cards)** | Where is my spend? Top suppliers, open POs, unpaid invoices. Analytics + workflow on existing data; no card issuance. | PO, invoice (PURCHASE), supplier, sync. Strong fit. |
| **F** | **Transaction categorization at scale** | Batch "suggest category" or "categorize these postings" using existing AI; extend beyond bank-statement import. | Posting, category, BankStatementWithCategorizationExtractor pattern. Strong fit. |
| **G** | **Compliance / audit readiness** | Audit trail: "Show me all changes to invoices," "Payments by source," lineage for regulators. | Lineage (source_*, ingest_batch_id), workflow_history. Medium fit (need clear audit UX). |

---

## 2. Rating: Potential (1–5)

Criteria: **market need**, **platform fit**, **differentiation**, **monetization**, **time to value**.

| Starting point | Score | Why |
|----------------|-------|-----|
| **B. Bank / ledger reconciliation** | **5** | Universal need; every company reconciles. Agentic "match and explain" is differentiated. Platform ready (posting, bank import, matching). Clear ROI (hours saved). |
| **A. AR** | **4–5** | Strong need and platform fit. Market is crowded (Growfin, Gaviti, etc.); differentiation = multi-ERP + one agent for AR + rest of platform. High potential if wedge is clear. |
| **C. Multi-entity / multi-ERP visibility** | **4** | Strong for segment (holdcos, multi-subsidiary). Few tools give "one layer across QB + Xero + Zoho." Niche but high value per customer. |
| **D. Financial close / reporting** | **4** | Clear buyer (controller); accelerates close and reporting. Overlaps with C; can bundle. |
| **E. Spend visibility (P2P)** | **3** | Good platform fit, but "spend visibility" is crowded (Ramp, Brex, dashboards). Best as part of a broader "finance layer" rather than standalone wedge. |
| **F. Categorization at scale** | **3** | Strong technically; often bought as a **feature** (of reconciliation or import) not a standalone product. Good add-on or partner feature. |
| **G. Compliance / audit** | **3** | Need is real but buyer is often partner (auditor/firm). Longer cycle; better as module for partner-led deals. |

**Top by potential**: **B (Reconciliation)** then **A (AR)** then **C/D (Multi-entity / Close)**. Reconciliation has broad demand and a clear agentic angle ("match and explain"); AR is strong but competitive; multi-entity/close is strong in a narrower segment.

---

## 3. Direct GTM vs Partner-Based GTM

**Direct GTM** = you sell to the end customer (finance, AR, controller). Product-led or sales-led.  
**Partner GTM** = accounting firms, bookkeepers, ERP resellers, consultants sell or implement for their clients.

| Starting point | Direct GTM fit | Partner GTM fit | Notes |
|----------------|----------------|-----------------|--------|
| **A. AR** | ✅ High | ✅ High | Direct: AR manager / CFO in SMB/mid-market. Partner: bookkeepers, fractional CFOs, firms offering "AR as a service." |
| **B. Reconciliation** | ✅ High | ✅ Very high | Direct: accountant, controller, "reconcile faster." Partner: **accounting firms do recs for clients**; white-label or "we run your recs" is a natural fit. |
| **C. Multi-entity visibility** | ✅ High | ✅ High | Direct: CFO / controller of multi-entity company. Partner: firms that manage multiple client entities or holdcos. |
| **D. Close / reporting** | ✅ High | ✅ High | Direct: controller. Partner: firms that do month-end close for clients. |
| **E. Spend visibility** | ✅ Medium | ✅ Medium | Direct: procurement / finance. Partner: consultants. Less "partner-native" than recs or AR. |
| **F. Categorization** | ⚠️ Low (as product) | ✅ High | As standalone product, buyer is fuzzy. As **partner tool** (e.g. "categorize your clients' transactions"), bookkeepers and firms value it. |
| **G. Compliance / audit** | ⚠️ Low | ✅ High | Buyer is often auditor or firm doing audit prep. Partner-led (firms, audit practices). |

**Best for direct GTM**: **A (AR)**, **B (Reconciliation)**, **C (Multi-entity)**, **D (Close)**. Clear buyer, demo-friendly, "I get this in 10 minutes."  
**Best for partner-based GTM**: **B (Reconciliation)** (firms do recs daily), **A (AR)** (firms do AR for clients), **F (Categorization)** (firms categorize client data), **G (Compliance)** (audit firms).

---

## 4. Summary: What to Lead With

| If you want… | Lead with | Why |
|--------------|-----------|-----|
| **Highest potential, direct GTM** | **B. Reconciliation** or **A. AR** | Reconciliation: universal need, strong agentic story, platform ready. AR: same, but market more crowded. |
| **Highest potential, partner GTM** | **B. Reconciliation** | Accounting firms already do reconciliation for clients; "agentic recs" or "reconciliation layer on your clients' ERPs" fits their workflow. |
| **Clear direct wedge, less crowded** | **B. Reconciliation** or **C. Multi-entity** | Reconciliation has many tools but fewer "agentic match + explain" plays. Multi-entity is niche but under-served. |
| **Stick with AR first** | **A. AR** | Still a strong starting point; differentiate with multi-ERP + agent + "same platform as P2P/recs." |
| **Partner-first motion** | **B. Reconciliation** then **F. Categorization** | Recs = core partner use case; categorization = natural add-on for bookkeepers/firms. |

---

## 5. Recommendation

- **AR** remains a **good** starting point: platform fit is strong, and the Fabriq differentiator (multi-ERP + agent + one platform for O2C and P2P) is real.
- **Bank/ledger reconciliation** is an **equally strong or stronger** starting point on the same platform: same data (posting, bank import, invoice, payment_receipt), universal need, clear agentic hook ("match and explain"), and **very** partner-friendly (firms do recs for clients).
- For **direct GTM**: lead with either **AR** or **Reconciliation** (or both in one "finance operations" story).  
- For **partner-based GTM**: lead with **Reconciliation**, then AR and categorization; compliance/audit as a later module.

So: **AR is a good starting point; Reconciliation is another top option** (and may edge ahead on potential and partner fit). Multi-entity/close is strong for a more focused segment. The doc above gives you a single place to compare and choose.
