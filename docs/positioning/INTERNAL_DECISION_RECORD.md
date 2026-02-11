# Internal Decision Record: Agentic FinOps Starting Points and GTM

**Document type**: Long-form internal record of decision-making.  
**Audience**: Internal (product, leadership, future team).  
**Purpose**: Capture why we chose our starting points (Reconciliation + AR), what we evaluated, what we deferred, and how we plan to show and sell it.

---

## 1. Context and Scope

### 1.1 What we were deciding

- **Where to focus** the first agentic “product” built on the Fabriq platform (ERP sync, ledger, workflows, agent, bank/CC import).
- **How to go to market**: direct (sell to finance/AR/controller) vs partner (accounting firms, bookkeepers).
- **How to prove value quickly**: build for a **clean demo** with proper data first, then expand.

### 1.2 Constraints

- We do **not** have corporate cards or payment issuance (so we are not competing with Ramp/Brex on cards).
- We **do** have: multi-ERP forward sync (QB, Xero, Zoho), posting/ledger, bank & credit card statement import (CSV/PDF + AI extractors), workflow engine, and an AI agent with analytics and search.
- We want a path that works for **SMB / mid-market** “on top of existing accounting system” and, later, can extend toward **enterprise** (customization, HighRadius-style).

---

## 2. Options we considered

### 2.1 Starting point options

We evaluated seven possible “first product” angles on top of the same platform:

| Option | What it is | Why we considered it |
|--------|------------|----------------------|
| **A. AR (collections + cash application)** | Agentic receivables: overdue, DSO, who to chase, suggest payment match, apply payment. | Strong platform fit (invoice, payment_receipt, customers, sync). Clear buyer (AR/CFO). Aligns with “books on autopilot” and O2C. |
| **B. Bank / ledger reconciliation** | Match bank & CC lines to invoices/payments; agent “reconcile,” “suggest match,” “explain.” | Universal need; platform has posting, bank import, categorization. Strong partner fit (firms do recs for clients). |
| **C. Multi-entity / multi-ERP visibility** | One view across QB + Xero + Zoho (or multiple entities). | We have source_system and lineage; few tools do true multi-ERP. Niche but high value. |
| **D. Financial close / reporting** | Agent: unreconciled, aging by entity, trial balance by source. | Clear buyer (controller); overlaps with B and C. |
| **E. Spend visibility (P2P, no cards)** | Where is my spend, top suppliers, open POs. | We have PO, invoice (PURCHASE), supplier. Crowded space (Ramp, Brex). |
| **F. Categorization at scale** | Batch “suggest category” for postings. | We have AI categorization for bank statements; could extend. Often a feature, not a standalone product. |
| **G. Compliance / audit readiness** | Audit trail, lineage, “show changes.” | We have lineage; buyer is often partner/auditor. Longer cycle. |

### 2.2 Market reality check

- **AR**: We initially assumed “fewer dedicated agentic AR tools” and “many still use QB/Xero + manual.” Research showed the SMB AR automation space is **crowded** (Growfin, Gaviti, Bill360, Paidnice, Upflow, etc.) and many already plug into QB/Xero. So our wedge must be **differentiation** (multi-ERP + one agent + same platform for recs and P2P), not “we’re the only option.”
- **Reconciliation**: Universal need; many tools exist but fewer with a clear **agentic “match and explain”** angle. Strong fit for **partner GTM** (accounting firms do recs daily for clients).
- **AP / cards**: We explicitly did **not** choose AP as the first wedge because we don’t have cards and the SMB AP space is dominated by Ramp/Brex/Bill.com. We can add “AP intelligence” later as part of a broader finance layer.

### 2.3 GTM dimension

- **Direct GTM**: Sell to AR manager, controller, CFO. Requires clear demo, fast “I get it” moment, and a product that works with their existing ERP/books.
- **Partner GTM**: Accounting firms, bookkeepers, resellers implement or resell for clients. Requires use cases that map to what partners already do (reconciliation, AR, categorization) and preferably a repeatable implementation pattern.

We wanted a plan that supports **both** direct and partner, with the option to lead with one.

---

## 3. Decisions made

### 3.1 Primary starting points: Reconciliation + AR

We decided to **double down on two starting points**, not one:

1. **Bank / ledger reconciliation**  
   - **Rationale**: Highest potential score in our evaluation (universal need, agentic “match and explain,” platform ready, very partner-friendly).  
   - **Demo story**: “I have bank transactions in Fabriq; I ask the agent what’s unreconciled and to suggest matches; I confirm and it explains the transaction.”

2. **AR (collections + cash application)**  
   - **Rationale**: Strong platform fit and buyer clarity; differentiator is multi-ERP + one agent + same platform as reconciliation.  
   - **Demo story**: “I have receivables and payments; I ask what’s overdue and who to chase; the agent suggests payment allocation and I apply.”

We did **not** choose “AR only” or “Reconciliation only” because: (a) both use the same data (posting, invoice, payment_receipt) and same agent; (b) one demo can show both stories and position “agentic finance operations” more broadly; (c) we can lead with either story depending on audience (direct vs partner).

### 3.2 Focus on demo-ready build and data first

We decided that the **first milestone** is not “full feature set” but:

- **A clean, repeatable demo** with **proper data** (one demo org, consistent invoices, payments, bank lines).
- **Just enough build** to support that demo: agent answers (overdue, DSO, unreconciled, who to follow up), suggest match (reconciliation and cash application), apply payment, and “explain this transaction.”
- A **unified 5–7 minute script**: reconciliation segment → AR segment → “runs on top of your existing books” hook.

Rationale: Faster time to presentable value; forces clarity on narrative and data; screenshots and slides can be produced from one source of truth.

### 3.3 Direct and partner GTM both in scope

We decided to **support both** direct and partner GTM from the same product base:

- **Direct**: Same demo for AR manager / controller / CFO; positioning = “agentic layer on your QB/Xero/Zoho (and bank data); one place for reconciliation and AR.”
- **Partner**: Same demo, with emphasis on “your firm can run recs and AR for clients on this platform” or “white-label / implement for clients.” Lead with reconciliation for partner-heavy motions.

We did **not** choose “direct only” or “partner only” so we can test both and shift emphasis by segment.

### 3.4 Enterprise (HighRadius-style) deferred

We explicitly **deferred** the enterprise / HighRadius-style market to a **later phase**:

- That segment requires customization, multi-entity, deep integrations, and possibly compliance/on-prem.
- We documented it as a **separate game plan** (in [AGENTIC_STARTING_POINTS_AND_GTM.md](./AGENTIC_STARTING_POINTS_AND_GTM.md)) but with **no build commitment** for now. When we “get to it later,” we have a scope and differentiation narrative.

### 3.5 Content and packaging

We decided to produce:

1. **Long-form internal doc**: This document — internal decision record so future readers understand why we chose Reconciliation + AR, and why demo-first.
2. **Roadmap**: [DEMO_ROADMAP.md](./DEMO_ROADMAP.md) — data foundation, reconciliation demo path, AR demo path, unified script, build checklist.
3. **Slides**: [SLIDES_DECK.md](./SLIDES_DECK.md) (and actual slide deck with screenshots) — presentable narrative for internal and external use.

---

## 4. What we are not doing (yet)

- **AP / cards as first wedge**: No card product; no “we replace Ramp/Brex” for SMB. AP may appear later as “spend visibility” or “AP intelligence” on top of existing data.
- **Full reconciliation product**: No full “bank vs ledger” reconciliation UI in v1; only what’s needed for the demo (unreconciled list, suggest match, mark matched, explain).
- **Remittance capture, post to ERP, email reminders, dispute model**: All in roadmap for later; not in “clean demo” scope.
- **Enterprise customization**: Documented as future game plan; no build in current phase.
- **Multi-entity / close as lead story**: Can be a “next” slide or partner pitch; not the first demo.

---

## 5. Success criteria for the first milestone

- **Demo**: One script (5–7 min) that shows reconciliation + AR with the agent, using one demo org and one dataset.
- **Data**: Seed or script that recreates the demo dataset so the demo is repeatable and screenshots stay valid.
- **Content**: Internal decision record (this doc), demo roadmap, and slide deck with placeholders (then screenshots) so we can present the plan and the product consistently.

---

## 6. References

- [AGENTIC_AR_RESEARCH.md](./AGENTIC_AR_RESEARCH.md) — AR feasibility and build order.  
- [AGENTIC_STARTING_POINTS_AND_GTM.md](./AGENTIC_STARTING_POINTS_AND_GTM.md) — Options, ratings, direct vs partner GTM.  
- [DEMO_ROADMAP.md](./DEMO_ROADMAP.md) — Data, reconciliation path, AR path, build checklist.  
- [SLIDES_DECK.md](./SLIDES_DECK.md) — Slide structure and screenshot placeholders.

---

*Document version: 1.0. Reflects decisions as of the creation of the positioning folder and demo roadmap.*
