# Posting Analytics Prompt Test Report

**Generated**: 2026-03-17T16:55:15.111Z

## Configuration

- **User ID**: user_rajesh_kumar
- **Org ID**: org_rajesh
- **Selected Account**: acco_org_rajesh_canada_2101
- **Selected Account Name**: (none)

## Summary

| Total | Passed | Failed |
|-------|--------|--------|
| 7 | 0 | 7 |

## Test Results

### ❌ Total spending query

**Question**: "How much did I spend in total?"

**Expected Behavior**: Should SUM all posting amounts on the selected credit card (credit_account_id = selectedAccountId). Should use analyticsQuery with SUM(amount).

**Classification**: unknown (maxSteps: 0)

**Steps Taken**: 0 | **Time**: 0ms

**Errors**:
- Error: Error: No prompt templates found for model: posting, view: posting_view, types: reconciliation, analytics, default

#### Final Response

```
(no response)
```

---

### ❌ Grocery spending with fuzzy match

**Question**: "How much did I spend on groceries?"

**Expected Behavior**: Should use ILIKE to fuzzy match account names containing "grocer". May need to JOIN account table to get account names. Should NOT use posting.account_name (does not exist).

**Classification**: unknown (maxSteps: 0)

**Steps Taken**: 0 | **Time**: 0ms

**Errors**:
- Error: Error: No prompt templates found for model: posting, view: posting_view, types: reconciliation, analytics, default

#### Final Response

```
(no response)
```

---

### ❌ Monthly spending breakdown

**Question**: "Show my spending by category this month"

**Expected Behavior**: Should GROUP BY account/category and SUM amounts. Expense = money going out = credit side for bank/cash accounts. Should filter by current month using value_date.

**Classification**: unknown (maxSteps: 0)

**Steps Taken**: 0 | **Time**: 0ms

**Errors**:
- Error: Error: No prompt templates found for model: posting, view: posting_view, types: reconciliation, analytics, default

#### Final Response

```
(no response)
```

---

### ❌ Store-level breakdown (needs account context)

**Question**: "Can you split my grocery spending by store?"

**Expected Behavior**: Without selectedAccountId: Should ask for clarification OR attempt broad query. Store names should come from posting.description field, grouped.

**Classification**: unknown (maxSteps: 0)

**Steps Taken**: 0 | **Time**: 0ms

**Errors**:
- Error: Error: No prompt templates found for model: posting, view: posting_view, types: reconciliation, analytics, default

#### Final Response

```
(no response)
```

---

### ❌ Income query

**Question**: "How much income did I receive last month?"

**Expected Behavior**: Income = money coming in = debit side for bank/cash accounts. Should filter by last month dates and SUM amounts where account_id (debit) is an asset account.

**Classification**: unknown (maxSteps: 0)

**Steps Taken**: 0 | **Time**: 0ms

**Errors**:
- Error: Error: No prompt templates found for model: posting, view: posting_view, types: reconciliation, analytics, default

#### Final Response

```
(no response)
```

---

### ❌ Store-level breakdown with account

**Question**: "Can you split my grocery spending by store?"

**Expected Behavior**: With selectedAccountId: Should use description field to extract store names. Should GROUP BY description (or parsed store name) and SUM amounts. Should filter by selected account and grocery-related category.

**Classification**: unknown (maxSteps: 0)

**Steps Taken**: 0 | **Time**: 0ms

**Errors**:
- Error: Error: No prompt templates found for model: posting, view: posting_view, types: reconciliation, analytics, default

#### Final Response

```
(no response)
```

---

### ❌ Category spending with selected card

**Question**: "How much did I spend on groceries using this card?"

**Expected Behavior**: With credit card selected: Expense means credit_account_id = card. Should match debit account (category) using ILIKE for "grocer". Should use TWO joins to account table.

**Classification**: unknown (maxSteps: 0)

**Steps Taken**: 0 | **Time**: 0ms

**Errors**:
- Error: Error: No prompt templates found for model: posting, view: posting_view, types: reconciliation, analytics, default

#### Final Response

```
(no response)
```

---

## Feedback Template

Use this section to provide feedback for prompt improvements:

### Issues Found

1. [ ] Issue description...

### Suggested Prompt Changes

1. Change X to Y because...
