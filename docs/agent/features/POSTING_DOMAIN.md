# Fabriq Agent — Posting Domain Model

**Last Updated**: 2026-04-04  
**Related files**: `handlers/erp/utils/categorizationUtils.ts`, `frontend-1/src/pages/reports/SimpleTransactionList.tsx`

---

## What a "Posting" Is

A posting is one double-entry journal transaction:

| Field | Purpose |
|-------|---------|
| `account_id` | Debit account (FK to `account`) |
| `credit_account_id` | Credit account (FK to `account`) |
| `amount` | Transaction amount (always positive) |
| `posting_date` | Accounting date |
| `value_date` | When the transaction actually occurred |
| `description` | Transaction description |
| `org_id` | Multi-tenancy |

**Important**: The `category_id` / `category_name` fields on the `posting` model are **not used** in this codebase. Do not use them for spending/income breakdowns.

---

## Contra-Account as Category

The effective "category" for a posting is the **contra/counter account** — the other account head in the double entry.

```
Bank receives rent payment:
  debit  = HDFC Current Account (bank, asset)
  credit = Rental Income Account
  → "category" = Rental Income Account

Credit card purchase at Staples:
  debit  = Office Expenses Account (expense)
  credit = HDFC Credit Card (credit card, liability)
  → "category" = Office Expenses Account
```

This is implemented in:
- `backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts`
- `backend/src/agent/handlers/erp/utils/categorizationUtils.ts`
- `frontend-1/src/pages/reports/SimpleTransactionList.tsx` (`transformPostingData`)

In `transformPostingData`:
```typescript
category_name = creditAccount?.name  // when selected account is on debit side
               || debitAccount?.name  // when selected account is on credit side
               || posting.category?.name  // fallback only
```

---

## Money Direction Rules

### Money OUT (expense/spend)

Bank account is **credited** (asset decreases) or credit card is **credited** (liability increases):

```sql
-- Money out of bank:
SELECT amount FROM posting WHERE credit_account_id = '<bank_account_id>'
-- The debit account (account_id) is the "category" / expense account

-- Credit card spend:
SELECT amount FROM posting WHERE credit_account_id = '<credit_card_id>'
-- The debit account (account_id) is the "category" / expense account
```

### Money IN (income)

Bank account is **debited** (asset increases):

```sql
-- Income/deposit to bank:
SELECT amount FROM posting WHERE account_id = '<bank_account_id>'
-- The credit account (credit_account_id) is the "category" / income account
```

### SQL Pattern for "Spending by Category"

```sql
-- All expenses through HDFC Current, broken down by contra account (= category):
SELECT a.name as category, SUM(p.amount) as total
FROM posting p
JOIN account a ON a.id = p.account_id   -- debit account = expense category
WHERE p.credit_account_id = '<hdfc_account_id>'
  AND p.org_id = '<org_id>'
  AND p.value_date >= '2024-03-01' AND p.value_date < '2024-04-01'
GROUP BY a.name
ORDER BY total DESC;
```

**Do not** use the `category` table or `posting.category_id` for this.

---

## Account Types

The `account` model has `type` (array) and `classification` fields to distinguish account roles:

| Account Type | Examples | Direction for bank |
|---|---|---|
| Asset | Bank accounts, cash | Debit = money in, Credit = money out |
| Liability | Credit cards, loans | Debit = payment, Credit = spend |
| Income | Rental income, service revenue | Typically on credit side |
| Expense | Office expenses, rent, utilities | Typically on debit side |

Use `account.type` and `account.classification` for filtering when the user asks about "income accounts" or "expense accounts".

---

## Prompt Requirements for Posting Model

When writing prompts or SQL for the posting model, follow these rules:

1. **Category = contra account**: The "category" for a posting is the other account in the double entry (joined to `account` table). Never use `posting.category_id` or `category` table for income/expense analysis.

2. **SQL uses posting + account tables only**: For spending/income breakdowns, join `posting` to `account` on `account_id` or `credit_account_id`.

3. **Always filter by `org_id`**: `posting.org_id` and `account.org_id` must be in every query.

4. **Date fields**: Use `value_date` for "when the transaction happened"; `posting_date` for accounting cutoff.

5. **Reference account filtering**: When the user mentions a specific bank account or credit card, filter postings where that account appears on either side.

### Example Analytical SQL Patterns

**Total spending for March 2025**:
```sql
SELECT SUM(p.amount) as total_spend
FROM posting p
WHERE p.credit_account_id IN (
  SELECT id FROM account WHERE name ILIKE '%HDFC%' AND org_id = '<org_id>'
)
AND p.value_date >= '2025-03-01' AND p.value_date < '2025-04-01'
AND p.org_id = '<org_id>';
```

**Spending breakdown by category (contra account)**:
```sql
SELECT a.name as category, SUM(p.amount) as total
FROM posting p
JOIN account a ON a.id = p.account_id
WHERE p.credit_account_id = '<bank_account_id>'
AND p.org_id = '<org_id>'
GROUP BY a.name ORDER BY total DESC;
```

**Total income (bank deposits)**:
```sql
SELECT SUM(p.amount) as total_income
FROM posting p
WHERE p.account_id = '<bank_account_id>'
AND p.org_id = '<org_id>'
AND p.value_date >= '2025-01-01' AND p.value_date < '2026-01-01';
```

---

## Creating Postings via Chat

Conversational chat on posting pages uses **`createRecord`** (same tool as purchase requisition creation), not the workbench `create_posting` pending-action flow.

**Minimum fields**: `description`, `amount`, `posting_date` (required — agent must ask if omitted), plus both sides of the entry (`account_id`, `credit_account_id`) resolved via `searchRecords` on `account`.

**Expense paid from bank** (e.g. office supplies paid from ICICI): debit expense account, credit bank account.

Prompt text: `backend/prisma/metadata/prompt-templates/view_d8b6c832-62dd-48b4-b50d-20f24edbc969_default_fabriq.txt`. After editing, sync: `cd backend && npx ts-node prisma/sync-prompt-templates.ts`.

Harness: `npm run test:posting-prompt` (includes create-posting cases) or single question:
`npm run test:posting-prompt -- -q "Create a posting to record office stationary purchase which was paid from icici account"`.

---

## Prompt Template Setup

For posting-specific prompts:

1. **View**: `view.model_name = 'posting'`, `view.name = 'posting_view'`
2. **Default prompt** (`prompt_type = 'default'`): explains double-entry, contra-account-as-category, createRecord workflow, tool usage
3. **Analytics prompt** (`prompt_type = 'analytics'`): SQL patterns, table names, which fields to use

See [PROMPT_SYSTEM.md](../PROMPT_SYSTEM.md) for how prompts are loaded.

The key sections to include in a posting system prompt:
- Role: financial assistant for income/expense analysis
- Double-entry model explanation
- Contra-account = category (not the `category` table)
- SQL rules: `posting` + `account` tables only, always filter by `org_id`
- Date field usage: `value_date` vs `posting_date`

---

## Test Harness

Use the prompt test harness to verify posting analytics behaviour:

```bash
cd backend && npm run test:posting-prompt
# or with a custom question:
npm run test:posting-prompt -- -q "How much did I spend on office supplies last month?"
```

See [TESTING.md](../TESTING.md) for full workflow.
