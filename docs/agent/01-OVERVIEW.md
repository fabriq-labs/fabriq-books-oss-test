# Fabriq Agent — Overview

**Audience**: Anyone new to the agent system. Read this first.

---

## Why an Agent Layer?

Fabriq's core product is a metadata-driven CRUD system: Prisma models, auto-generated
REST APIs, permission-scoped views, dynamic forms. That's enough for a human
bookkeeper who knows exactly which screen to open and which filters to set.

The agent layer exists to close the gap between **what a user wants** ("reconcile
March's bank statement", "categorize my uncategorized expenses", "how much did I
spend on travel last quarter") and **the sequence of CRUD/SQL operations** needed
to get there. Instead of the user navigating to the Postings list, filtering by
date and account, cross-referencing the Receipts list, and manually linking rows,
they describe the goal in plain English and the agent plans and executes the
steps — surfacing anything financially consequential for human approval before
it touches the books.

Two delivery modes sit on top of the same LLM/tool infrastructure:

| Mode | What it is | Has a plan? | Persists history? |
|---|---|---|---|
| **Workbench session** | Goal-driven, multi-step, produces pending actions for review | Yes (`createPlan`, 3-5 steps) | Yes (`agent_session` + `agent_message`) |
| **Conversational chat** | Page-aware Q&A sidebar on every screen | No | No (React state only) |

This doc set focuses primarily on the workbench session machinery (docs 02-08),
with conversational chat covered separately once those concepts are established
(15-CONVERSATIONAL_CHAT.md).

---

## The Bookkeeping Domain Primer

Almost every example in this doc set uses Fabriq's accounting model. If you're
not familiar with double-entry bookkeeping or how Fabriq represents it, read this
section first — it's referenced throughout.

### A "Posting" Is a Double-Entry Journal Line

```
posting:
  account_id          — debit account  (FK to account)
  credit_account_id   — credit account (FK to account)
  amount               — always positive
  posting_date         — accounting date
  value_date           — date the transaction actually happened
  description          — free-text description (often a raw bank statement line)
  org_id               — multi-tenancy
```

Every posting has exactly two sides. There is no separate "amount in" / "amount
out" — direction is determined by which account is on the debit side and which
is on the credit side, combined with that account's type (asset, liability,
income, expense).

### Contra-Account = "Category"

Fabriq's UI talks about "categorizing" a transaction, but there is no meaningful
`category` table for this purpose — **the category of a posting is its contra
(counter) account**, i.e. the other side of the double entry.

```
Example 1 — Rent received into the bank:
  debit  = HDFC Current Account   (asset, bank)
  credit = Rental Income          (income)
  → "category" for this posting = Rental Income

Example 2 — Office supplies bought on a credit card:
  debit  = Office Expenses        (expense)
  credit = HDFC Credit Card        (liability)
  → "category" for this posting = Office Expenses
```

This single idea — **contra-account-as-category** — underlies both flagship
agent features:

- **Categorization**: a bank statement import creates postings with one side
  known (the bank/card account) and the other side `null`. The agent predicts
  the missing contra-account.
- **Reconciliation**: a bank statement posting (money in) is matched against an
  existing `payment_receipt` or `invoice` record so the posting can be linked
  to the source document instead of just an account guess.

### Money Direction Cheat Sheet

| Scenario | Bank/card side | Contra side ("category") |
|---|---|---|
| Money OUT of a bank account | `credit_account_id` = bank | `account_id` = expense/vendor account |
| Money IN to a bank account | `account_id` = bank | `credit_account_id` = income/customer account |
| Credit card spend | `credit_account_id` = card | `account_id` = expense account |
| Credit card payment | `account_id` = card | `credit_account_id` = funding bank account |

### Worked Example: A Single Bank Statement Line, End to End

A bank statement import creates this posting:

```
description:        "UPI/DR/987654321098/SWIGGY TECHNOLOGIES/swiggy@axisbank"
account_id:          acco_hdfc_current     (HDFC Current Account — bank, asset)
credit_account_id:   null                  (unknown — to be predicted)
amount:               420.00
value_date:           2025-03-14
reconciliation_status: null
```

This is the starting point for:

- **01-OVERVIEW** (this doc) — establishes that "category" = contra-account
- **05-TOOLS** — `categorizePostings` predicts `credit_account_id` (likely "Food
  & Dining" or similar expense account) with a confidence score
- **06-BUILDERS_AND_EXECUTORS** — the prediction becomes a `categorize_transaction`
  pending action; on approval, `CategorizeTransactionExecutor` writes
  `credit_account_id`
- **07-WORKED_EXAMPLES** — traces this exact posting through a full
  `atpl_categorise` session from goal to completed

A second posting from the same statement:

```
description:        "NEFT/TRF/.../ INV-006 payment"
account_id:          acco_hdfc_current     (debit — money IN)
credit_account_id:   null
amount:               60000.00
reconciliation_status: null
```

This one is a candidate for **reconciliation**, not categorization — the
description references invoice `INV-006`. `suggestReconciliationMatches` looks
for an open `invoice` with that number and a matching amount, producing a
`reconcile_posting` pending action that, on approval, creates/links a
`payment_receipt` and marks the posting `MATCHED`.

### Multi-Tenancy Preview

Every table above is scoped by `org_id`. Two organizations can both have an
account named "Office Expenses" with completely different IDs — the agent must
never let a query, prediction, or match cross an org boundary. See
[08-DATA_MODELS.md](./08-DATA_MODELS.md#multi-tenancy) for the enforcement
mechanisms (query-time filters, `getAnalyticsContext`, `analyticsQuery`
validation).

---

## What's Next

- **02-ARCHITECTURE.md** — the components that turn a goal into a plan into
  pending actions, and the file map of `backend/src/agent/`
- **03-SESSION_LIFECYCLE.md** — the state machine a session moves through
- **07-WORKED_EXAMPLES.md** — if you'd rather see the categorization and
  reconciliation examples above played out turn-by-turn before reading the
  layer docs, jump there after 02 and 03
