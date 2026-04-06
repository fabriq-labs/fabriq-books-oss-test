# Fabriq Books
### Put your books on self-drive.

*Application to The Forge — McMaster University*

---

## The Problem

**North American SMBs have good accounting software. What they don't have is software that does the work.**

QuickBooks, Xero, and Zoho are excellent systems of record. They store every transaction, invoice, and payment accurately. Ask them a question — "what's my DSO?" or "show me overdue invoices" — and they'll answer it.

But ask them to *do something* — "clear my unmatched bank transactions," "work through this batch of overdue accounts," "figure out which invoices this payment applies to and apply it" — and they stop. That work still falls on a person.

Every month, controllers and bookkeepers at 5–500 person companies spend the majority of their time on three workflows that are entirely repeatable:

- **Bank reconciliation** — matching hundreds of bank and credit card lines to invoices and payments, one by one, every month, for every account.
- **Cash application** — receiving a payment and manually hunting down which open invoices it covers, then applying it.
- **Collections follow-up** — working through an aging report, deciding who to chase, drafting follow-ups, tracking responses.

The tools they have can *show* them the problem. None of them can *work through* it.

The most advanced AI in this space — being built right now, with hundreds of millions in venture capital — requires companies to replace their accounting system entirely to access it. That's not an option for the 7 million SMBs already running on QuickBooks, Xero, or Zoho with years of history, certified accountants, and embedded workflows.

> **The gap isn't information. It's execution. SMB finance teams know exactly what needs to be done — they just have to do all of it themselves.**

---

## The Market

**7 million North American SMBs run on QuickBooks, Xero, or Zoho. None of them are switching.**

The North American SMB accounting software market is structured in a clear pyramid:

```
────────────────────────────────────────────────────────
  NetSuite / Dynamics / Sage Intacct        ~25K businesses
  Enterprise ERP — powerful, but requires
  10+ specialists and months to implement
────────────────────────────────────────────────────────
  QuickBooks Enterprise / Sage 50           ~300K businesses  ◀ Fabriq Books primary
  Mid-market — ERP-capable teams,
  but heavily manual on reconciliation & AR
────────────────────────────────────────────────────────
  QuickBooks Online / Xero / Zoho Books     ~2M+ businesses   ◀ Fabriq Books in scope
  SMB core — cloud-first, accountant-managed,
  deeply embedded, not switching
────────────────────────────────────────────────────────
  FreshBooks / Wave / spreadsheets          ~5M+ businesses
  Micro / freelancer — below addressable market
────────────────────────────────────────────────────────
```

Our addressable market is the **~2.3M businesses** in the middle two tiers — already on a modern ERP, already working with an accountant or bookkeeper, already feeling the pain of manual reconciliation and AR workflows every single month.

The accounting automation software market in North America is valued at **$6.8B today, growing toward $11B+ by 2030**. The winner in the SMB intelligence layer hasn't emerged yet. The tools that exist are either single-ERP add-ons (narrow), enterprise platforms (expensive and complex), or full ERP replacements (non-starter for this segment).

That's the gap Fabriq Books is built for.

---

## Our Solution

**Fabriq Books connects to the accounting system you already use — and handles the work your team currently does by hand.**

We sync with QuickBooks, Xero, or Zoho, and pull in your bank and credit card statements. Everything lands in one place — invoices, payments, bank lines, customers — normalized across sources.

Then, instead of a finance team member sitting down to work through the backlog, Fabriq Books works through it with them.

**Here's what that looks like in practice:**

**Reconciliation**
Your bookkeeper tells Fabriq Books: *"Clear the unmatched transactions on the operating account for October."*

Fabriq Books pulls the unmatched lines, finds the most likely match for each one — the right invoice, the right payment, the right reference — and brings back a full list of proposals. The bookkeeper reviews each one, approves the ones that look right, adjusts or rejects the ones that don't. Fabriq Books applies the confirmed matches. The account is reconciled.

No hunting. No cross-referencing spreadsheets. No toggling between windows. The bookkeeper stays in control — Fabriq Books does the legwork.

**Accounts Receivable**
Your controller says: *"Work through the overdue accounts and tell me what to do about each one."*

Fabriq Books surfaces the aging picture, identifies which customers are overdue and by how much, and proposes a prioritized action for each — follow up, escalate, apply a payment that came in. The controller reviews, approves the actions they agree with, overrides the ones they don't. Fabriq Books executes.

**That's not a chatbot answering a question. That's an AI agent that takes a task, breaks it into steps, does the analysis, and brings a concrete set of proposed actions back for human sign-off before touching anything in the books.**

Same agent. Same data. One platform. Your ERP stays exactly where it is.

**No rip-and-replace. No new system of record. No months-long implementation.**

---

## Why Now

Three things converged to make this the right moment:

1. **AI can now execute finance workflows, not just answer questions about them.** The most well-funded teams in fintech are rebuilding finance infrastructure from scratch to take advantage of this. That's the right diagnosis — and strong proof that the market is ready. But their solution requires replacing your accounting system. For 7 million SMBs that's not on the table. The opportunity is delivering the same capability without the replacement.

2. **ERP APIs matured.** QuickBooks, Xero, and Zoho all have robust, well-documented APIs. Syncing, normalizing, and reasoning across multiple ERPs is a solved engineering problem today — not a research project. Building a reliable multi-ERP intelligence layer is now a product challenge, not an infrastructure one.

3. **SMB finance teams are actively looking.** Post-pandemic pressure on lean finance teams accelerated demand for automation. Bookkeepers and controllers aren't asking "should we automate?" anymore — they're asking "what actually works for a team our size, without blowing up what we already have?"

---

## Business Model

**Partner-led distribution with SaaS economics.**

Our primary channel is accounting firms and bookkeepers — the trusted advisors who already manage the books for SMB clients. They're doing reconciliation and AR manually for dozens of clients every month. We give them a platform that lets them do it in a fraction of the time, and offer it to their clients as a value-added service.

- **Revenue model**: Monthly SaaS subscription per organization, with a partner tier for firms managing multiple client orgs.
- **Why partners**: Accounting firms provide distribution leverage without a direct sales team. One firm = multiple client orgs. They also provide retention — when the firm is embedded, churn is low.
- **Why this works**: Reconciliation and AR are not discretionary — they happen every month, on deadline. Once embedded in a firm's workflow, we become infrastructure.

---

## What We've Built

Fabriq Books is a working MVP built on the Fabriq platform — a metadata-driven, multi-tenant architecture designed from the ground up for this use case.

**Core capabilities live today:**
- Multi-ERP sync: QuickBooks, Xero, Zoho Books (forward sync with reverse-sync pattern)
- Bank and credit card statement import: CSV and PDF with AI extraction
- Double-entry ledger and chart of accounts
- Invoice and payment management (both AR and AP)
- AI agent with natural language querying, analytics, and search
- Workflow engine for approval and human-in-the-loop steps
- Role-based access control and multi-tenant org isolation

**What we're building toward (demo milestone):**
- Clean reconciliation demo: unreconciled list → suggest match → confirm → explain
- Clean AR demo: overdue list → DSO → who to follow up → suggest cash application → apply
- Seed data pipeline so demos are repeatable and shareable

The architecture was deliberately built for extensibility: adding new ERP connectors, new agentic workflows, and new modules (multi-entity, financial close, spend visibility) is incremental, not a rebuild.

---

## Differentiation

| | Fabriq Books | QuickBooks / Xero / Zoho | Point AR tools (Growfin, Gaviti) | Enterprise (HighRadius) |
|---|---|---|---|---|
| Sits on top of existing ERP | ✅ | ❌ (is the ERP) | Partial | Partial |
| Multi-ERP (QB + Xero + Zoho) | ✅ | ❌ | ❌ (single ERP) | ✅ |
| Answers finance questions | ✅ | ✅ | ✅ | ✅ |
| Executes multi-step finance tasks | ✅ | ❌ | ❌ | Partial |
| Proposes actions for human sign-off before execution | ✅ | ❌ | ❌ | ❌ |
| Reconciliation + AR in one platform | ✅ | ❌ | ❌ | ✅ |
| SMB/mid-market price point | ✅ | ✅ | ✅ | ❌ |
| Partner-ready (multi-client) | ✅ | ❌ | ❌ | ❌ |

The critical row is **"executes multi-step finance tasks"**. Every tool in this space can answer a question. Fabriq Books is the only one in the SMB segment that takes a task, works through it, and brings proposed actions back for approval — without asking you to change your accounting system.

Our core differentiation is **execution + trust**: AI that does the work, with the human retaining final say on every action that touches the books.

---

## The Team

**[Founder Name] — Technical Co-Founder**
*[Brief bio: relevant engineering/product background, why this problem, what you've built]*

We are a lean, technical founding team with a working product. We are actively seeking a GTM/finance domain co-founder or advisor — someone with relationships in the accounting firm ecosystem who can accelerate the partner channel.

**What we know we don't have yet:** We are engineers who built a platform. We have not yet had the external conversations — with accounting firms, with SMB finance teams, with potential partners — that will tell us whether the product we built is the product the market wants. Finding product-market fit is the explicit next milestone. That's why we're here.

---

## Why The Forge

We're not looking for capital. We're looking for the thing capital can't buy in a check: **structured mentorship from people who've navigated the gap between working product and first real customers.**

Specifically, we need help with:

1. **GTM strategy for partner-led distribution**: How do you get the first 5 accounting firms to pilot a new tool with their clients? What does that conversation look like? Who do you call?

2. **PMF process**: How do we run discovery with SMB finance teams and accounting firms in a way that generates signal, not just validation? What are the right questions?

3. **Positioning and narrative**: We have a product story that we think is compelling. We need external pressure-testing from people who've sold to SMBs and finance teams before.

The Forge's network — particularly any connections to the accounting, bookkeeping, or SMB finance ecosystem in the Hamilton-Toronto corridor — would be directly useful to where we are right now.

---

## What We're Asking For

- **Admission to The Forge program**
- Access to mentors with GTM, finance domain, or B2B SaaS experience
- Introductions to accounting firms or bookkeepers willing to be early pilot partners
- A structured environment to run PMF discovery over the program duration

**Our commitment**: We show up with a working product, clear hypotheses, and a willingness to be wrong. We will use this program to find out whether our assumptions about the partner channel and the SMB reconciliation/AR problem are correct — and pivot if they're not.

---

## One Line

**Fabriq Books handles the finance work your team currently does by hand — reconciliation, collections, cash application — on top of the accounting system you already use, with your team signing off on every action before it touches the books.**

---

*Contact: [email] | [website] | [github/demo link if applicable]*
