# Posting Analytics Prompt Test Report

**Generated**: 2026-06-26T15:20:07.182Z

## Configuration

- **User ID**: user_sanjay_gupta
- **Org ID**: org_indian_demo
- **Selected Account**: (none)
- **Selected Account Name**: (none)

## Summary

| Total | Passed | Failed |
|-------|--------|--------|
| 5 | 5 | 0 |

## Test Results

### ✅ Total spending query

**Question**: "How much did I spend in total?"

**Expected Behavior**: Should SUM all posting amounts on the selected credit card (credit_account_id = selectedAccountId). Should use analyticsQuery with SUM(amount).

**Classification**: analytical (maxSteps: 5)

**Steps Taken**: 3 | **Time**: 6584ms

#### Queries Generated

**1. getAnalyticsContext**

**2. analyticsQuery**
- Description: Calculate total spend across all postings for the organization.
- SQL:
```sql
SELECT SUM(p.amount) AS total_spend FROM posting p WHERE p.org_id = 'org_indian_demo' AND (p.posting_type IS NULL OR p.posting_type <> 'DUPLICATE') AND (p.description IS NULL OR p.description NOT ILIKE '%Closing%');
```
- Row Count: 1

#### Final Response

```
You have spent a total of **81,354,162.56**.
```

---

### ✅ Grocery spending with fuzzy match

**Question**: "How much did I spend on groceries?"

**Expected Behavior**: Should use ILIKE to fuzzy match account names containing "grocer". May need to JOIN account table to get account names. Should NOT use posting.account_name (does not exist).

**Classification**: analytical (maxSteps: 5)

**Steps Taken**: 3 | **Time**: 7545ms

#### Queries Generated

**1. getAnalyticsContext**

**2. analyticsQuery**
- Description: Calculate total spend on groceries from posting descriptions
- Reasoning: The user is asking for total spend on groceries, which can be identified by searching for 'groceries' in the posting description. This query sums the amount of all such postings.
- SQL:
```sql
SELECT SUM(p.amount) AS total_groceries_spend FROM posting p WHERE p.org_id = 'org_indian_demo' AND p.description ILIKE '%groceries%' AND (p.posting_type IS NULL OR p.posting_type <> 'DUPLICATE') AND (p.description IS NULL OR p.description NOT ILIKE '%Closing%');
```
- Row Count: 1

#### Final Response

```
I couldn't find any postings with "groceries" in the description. Is there another term you use for these purchases?
```

---

### ✅ Monthly spending breakdown

**Question**: "Show my spending by category this month"

**Expected Behavior**: Should GROUP BY account/category and SUM amounts. Expense = money going out = credit side for bank/cash accounts. Should filter by current month using value_date.

**Classification**: analytical (maxSteps: 5)

**Steps Taken**: 3 | **Time**: 8566ms

#### Queries Generated

**1. getAnalyticsContext**

**2. analyticsQuery**
- Description: Calculate total spending by category for the current month
- Reasoning: The user wants to see their spending categorized for the current month. This query joins the posting and account tables to group postings by the debit account's name (which represents the category for spending) and sums the amounts. It filters for the current month and excludes duplicate and closing entries.
- SQL:
```sql

SELECT
    a.name AS category,
    SUM(p.amount) AS total_spending
FROM
    posting p
JOIN
    account a ON p.account_id = a.id
WHERE
    p.org_id = 'org_indian_demo'
    AND (p.posting_type IS NULL OR p.posting_type <> 'DUPLICATE')
    AND (p.description IS NULL OR p.description NOT ILIKE '%Closing%')
    AND p.value_date >= '2026-05-31T18:30:00.000Z'
    AND p.value_date < '2026-06-30T18:30:00.000Z'
GROUP BY
    a.name
ORDER BY
    total_spending DESC;

```
- Row Count: 2
- Result: `[{"category":"Plaid Credit Card · 3333","total_spending":"600"},{"category":"Plaid Checking · 0000","total_spending":"80"}]`

#### Final Response

```
Here is your spending by category for this month:
```

---

### ✅ Store-level breakdown (needs account context)

**Question**: "Can you split my grocery spending by store?"

**Expected Behavior**: Without selectedAccountId: Should ask for clarification OR attempt broad query. Store names should come from posting.description field, grouped.

**Classification**: analytical (maxSteps: 5)

**Steps Taken**: 3 | **Time**: 8806ms

#### Queries Generated

**1. getAnalyticsContext**

**2. analyticsQuery**
- Description: Split grocery spending by store, assuming store names are in the posting description and cash/bank accounts are credit accounts for spending.
- Reasoning: To split grocery spending by store, I need to group postings by their description (assuming store names are in the description) and sum the amounts. I also need to filter for postings that represent spending from cash or bank accounts, which typically means these accounts are on the credit side of the transaction. I will exclude duplicate and closing postings.
- SQL:
```sql

SELECT p.description AS store,
       SUM(p.amount) AS total_spending
FROM posting p
WHERE p.org_id = 'org_indian_demo'
  AND (p.posting_type IS NULL OR p.posting_type <> 'DUPLICATE')
  AND (p.description IS NULL OR p.description NOT ILIKE '%Closing%')
  AND p.credit_account_id IN (
    SELECT a.id
    FROM account a
    WHERE a.org_id = 'org_indian_demo'
      AND a.name ILIKE '%Cash%' OR a.name ILIKE '%Bank%'
  )
GROUP BY p.description
ORDER BY total_spending DESC;

```
- Row Count: 0
- Result: `[]`

#### Final Response

```
I couldn't find any grocery spending to split by store. This might be because there are no postings that match the criteria for grocery spending, or the store names are not in the description field of the postings.

Would you like me to try searching for spending from a different type of account, or perhaps look for specific keywords in the description?
```

---

### ✅ Income query

**Question**: "How much income did I receive last month?"

**Expected Behavior**: Income = money coming in = debit side for bank/cash accounts. Should filter by last month dates and SUM amounts where account_id (debit) is an asset account.

**Classification**: analytical (maxSteps: 5)

**Steps Taken**: 3 | **Time**: 7768ms

#### Queries Generated

**1. getAnalyticsContext**

**2. analyticsQuery**
- Description: Calculate total income received last month
- Reasoning: To determine the total income received last month, I need to sum the 'amount' from all postings where the 'account_id' is classified as 'Income'. The date range for 'last month' is from April 30, 2026, 18:30:00.000Z to May 31, 2026, 18:30:00.000Z. I also need to filter out duplicate and closing postings and ensure the query is scoped to the user's organization.
- SQL:
```sql
SELECT SUM(p.amount) AS total_income FROM posting p WHERE p.org_id = 'org_indian_demo' AND p.account_id IN (SELECT id FROM account WHERE org_id = 'org_indian_demo' AND classification = 'Income') AND (p.posting_type IS NULL OR p.posting_type <> 'DUPLICATE') AND (p.description IS NULL OR p.description NOT ILIKE '%Closing%') AND p.value_date >= '2026-04-30T18:30:00.000Z' AND p.value_date < '2026-05-31T18:30:00.000Z'
```
- Row Count: 1

#### Final Response

```
You received **$0** in income last month.
```

---

## Feedback Template

Use this section to provide feedback for prompt improvements:

### Issues Found

1. [ ] Issue description...

### Suggested Prompt Changes

1. Change X to Y because...
