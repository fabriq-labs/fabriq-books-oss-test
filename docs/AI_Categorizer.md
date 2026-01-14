# AI Auto-Categorization Feature Documentation

**Status**: Implemented  
**Created**: January 2025  
**Last Updated**: January 2025  
**Related docs**: [AI_AGENT.md](./AI_AGENT.md), [BUSINESS_DOMAIN.md](./BUSINESS_DOMAIN.md), [AI_AUTO_CATEGORIZATION.md](./AI_AUTO_CATEGORIZATION.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Implementation](#frontend-implementation)
5. [API Reference](#api-reference)
6. [Usage Guide](#usage-guide)
7. [Configuration](#configuration)
8. [Testing](#testing)

---

## Overview

### What is AI Auto-Categorization?

AI Auto-Categorization is an intelligent feature that automatically predicts and assigns the appropriate counter-account (category) for financial transactions. It uses Large Language Models (LLMs) to analyze transaction descriptions, amounts, and context to suggest the most appropriate account from the Chart of Accounts.

### Business Context

In the Simple Transactions view, users see transactions with:
- **Account**: The Bank or Credit Card account where the transaction occurred
- **Category**: The counter-account representing what the money was for/from

Currently, when transactions are imported (e.g., from bank statements), they often lack proper categorization. The counter-account field may be empty or set to a generic placeholder. Users must manually assign the correct account head to complete the double-entry bookkeeping.

### Problem Statement

Manual categorization is:
- **Time-consuming**: Users spend significant time categorizing each transaction
- **Error-prone**: Inconsistent categorization leads to inaccurate financial reports
- **Requires expertise**: Users need to understand the Chart of Accounts to categorize correctly

### Solution

Implement an AI agent that:
1. Analyzes transaction context (description, amount, source account)
2. Predicts the appropriate counter-account from the available Chart of Accounts
3. Supports both single-transaction and batch categorization
4. Provides confidence scores and reasoning for transparency

### Business Value

- **Time Savings**: Reduces manual categorization time by 80%+
- **Accuracy**: Consistent categorization improves financial reporting accuracy
- **User Experience**: Similar to products like **Ramp.com** and **Kick.co**
- **Learning**: Uses historical patterns to improve predictions over time

### Key Features

1. **Single Transaction Categorization**: Categorize one transaction at a time from the posting detail view
2. **Batch Categorization**: Process multiple transactions simultaneously from the list view
3. **Historical Matching**: Uses past approved transactions to skip LLM calls for similar descriptions
4. **Confidence Scoring**: Provides confidence levels (high/medium/low) for transparency
5. **Smart Filtering**: Only shows categorization options when appropriate

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  PostingForm     │  │  Master (List)   │               │
│  │  - Single Cat    │  │  - Batch Cat     │               │
│  └────────┬─────────┘  └────────┬─────────┘               │
│           │                      │                          │
│           └──────────┬───────────┘                          │
│                      │                                      │
│              ┌───────▼────────┐                            │
│              │   agentAPI     │                            │
│              └───────┬────────┘                            │
└──────────────────────┼────────────────────────────────────┘
                        │ HTTP POST
                        │
┌───────────────────────▼────────────────────────────────────┐
│              Backend API Routes                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ /categorize-     │  │ /categorize-     │               │
│  │  transaction     │  │  transaction-    │               │
│  │                  │  │  batch           │               │
│  └────────┬─────────┘  └────────┬─────────┘               │
│           │                      │                          │
│           └──────────┬───────────┘                          │
│                      │                                      │
│              ┌───────▼────────┐                            │
│              │ ERP Handlers   │                            │
│              └───────┬────────┘                            │
└──────────────────────┼────────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────────┐
│         Categorization Utilities                            │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Account Fetch    │  │ Historical Match │               │
│  │ Direction Detect │  │ Fuzzy Matching   │               │
│  └────────┬─────────┘  └────────┬─────────┘               │
│           │                      │                          │
│           └──────────┬───────────┘                          │
│                      │                                      │
│              ┌───────▼────────┐                            │
│              │  LLM (Gemini)  │                            │
│              │  + Validation  │                            │
│              └───────┬────────┘                            │
│                      │                                      │
│              ┌───────▼────────┐                            │
│              │  Database      │                            │
│              │  (PostgreSQL)  │                            │
│              └────────────────┘                            │
└────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Single Transaction Flow
1. User clicks "Auto-Categorize" button in PostingForm
2. Frontend calls `agentAPI.categorizeTransaction()` with `posting_id`
3. Backend fetches posting data and available accounts
4. Determines transaction direction (money_in/money_out)
5. Builds LLM prompt with transaction context
6. Calls Google Gemini LLM for prediction
7. Validates predicted account
8. Updates posting record (if `apply: true`)
9. Returns result with confidence and reasoning
10. Frontend updates form field and shows toast

#### Batch Transaction Flow
1. User selects multiple postings in list view
2. User clicks "Categorize" button in bulk panel
3. Frontend validates selection (no fully categorized rows)
4. Frontend calls `agentAPI.categorizeTransactionBatch()` with `posting_ids`
5. Backend processes in three phases:
   - **Phase 1**: Skip already categorized (if enabled)
   - **Phase 2**: Historical matching (fuzzy match on descriptions)
   - **Phase 3**: Bulk LLM categorization (batches of 20)
6. Returns results with summary including skipped reasons
7. Frontend shows summary toast and refreshes table

---

## Backend Implementation

### File Structure

```
backend/src/agent/handlers/erp/
├── categorizeTransaction.ts          # Single transaction handler
├── categorizeTransactionBatch.ts    # Batch transaction handler
└── utils/
    └── categorizationUtils.ts       # Shared utilities
```

### Core Components

#### 1. Single Transaction Handler (`categorizeTransaction.ts`)

**Key Functions:**
- `validateParams()`: Validates input parameters
- `execute()`: Main handler logic

**Process:**
1. Fetch posting data (by ID or from params)
2. Fetch available accounts for categorization
3. Determine transaction direction
4. Build LLM prompts
5. Call LLM with structured output schema
6. Validate predicted account
7. Apply categorization (if requested)
8. Log AI activity

**Key Features:**
- Supports both `posting_id` and `posting_data` input modes
- Optional alternatives in response
- Configurable `apply` option for dry-run mode
- Comprehensive error handling

#### 2. Batch Transaction Handler (`categorizeTransactionBatch.ts`)

**Key Functions:**
- `validateParams()`: Validates batch input
- `execute()`: Optimized batch processing

**Optimization Strategies:**

1. **Historical Matching** (Lines 369-405)
   - Fetches past human-approved transactions
   - Uses fuzzy string matching (Levenshtein distance)
   - Threshold: 0.85 similarity
   - Confidence: 0.95 (high)
   - Skips LLM calls for matches

2. **Bulk LLM Processing** (Lines 147-212)
   - Processes up to 20 transactions per LLM call
   - Single prompt with all transactions
   - Reduces API calls and latency

**Process:**
1. Fetch all postings
2. Fetch available accounts
3. Fetch historical mappings
4. For each posting:
   - Skip if already categorized
   - Try historical match
   - Queue for LLM if no match
5. Bulk LLM categorization in batches
6. Validate and apply results
7. Calculate summary with skipped reasons

#### 3. Categorization Utilities (`categorizationUtils.ts`)

**Key Functions:**

- `fetchAccountsForCategorization()`: Groups accounts by classification
- `determineTransactionDirection()`: Detects money_in vs money_out
- `getFieldToUpdate()`: Returns which field to update
- `buildSystemPrompt()`: Creates LLM system prompt
- `buildUserPrompt()`: Creates transaction-specific prompt
- `buildBulkPrompt()`: Creates batch prompt
- `fetchHistoricalMappings()`: Gets past categorizations
- `findFuzzyMatch()`: Fuzzy string matching
- `updatePostingWithCategorization()`: Updates database

**Configuration Constants:**
```typescript
CATEGORIZATION_CONFIG = {
  BULK_LLM_BATCH_SIZE: 20,              // Transactions per LLM call
  FUZZY_MATCH_THRESHOLD: 0.85,          // Similarity threshold
  HISTORICAL_MATCH_CONFIDENCE: 0.95,    // Fixed confidence for matches
}
```

### Transaction Direction Logic

The system determines transaction direction based on which side has the Bank/Credit Card account:

```typescript
// Money OUT: Bank on credit side → Update account_id (debit side)
// Money IN: Bank on debit side → Update credit_account_id (credit side)

if (creditSideIsBank && !debitSideIsBank) {
  return 'money_out';  // Expense needed
}
if (debitSideIsBank && !creditSideIsBank) {
  return 'money_in';  // Income needed
}
```

### LLM Integration

**Model**: Google Gemini (`gemini-2.0-flash-001`)

**Prompt Structure:**
- **System Prompt**: Role definition, rules, common patterns
- **User Prompt**: Transaction details + available accounts list

**Structured Output** (Zod Schema):
```typescript
{
  predicted_account_id: string;
  confidence_score: number;  // 0.0 to 1.0
  reasoning: string;
  alternatives?: Array<{...}>;
}
```

**Confidence Mapping:**
- High: ≥ 0.8
- Medium: ≥ 0.5 and < 0.8
- Low: < 0.5

---

## Frontend Implementation

### File Structure

```
frontend-1/src/
├── api/
│   └── api.ts                          # API client with agentAPI
├── components/forms/Masters/
│   └── PostingForm.tsx                 # Single categorization UI
└── pages/
    └── Master.tsx                      # Batch categorization UI
```

### API Client (`api.ts`)

**Methods Added:**

1. **`categorizeTransaction()`**
   - Single transaction categorization
   - Supports `posting_id` or `posting_data`
   - Returns prediction with confidence and alternatives

2. **`categorizeTransactionBatch()`**
   - Batch transaction categorization
   - Supports `posting_ids` or `postings` array
   - Returns results array and summary

### PostingForm Component

**Location**: `src/components/forms/Masters/PostingForm.tsx`

**Features:**
- "Auto-Categorize" button appears near Save/Cancel buttons
- Button visibility conditions:
  - Posting ID exists (edit mode)
  - Exactly one account is filled (account_id OR credit_account_id)
  - Description exists
- Loading state with spinner
- Auto-updates form field based on `field_to_update`
- Shows success toast with confidence level
- Refreshes posting data after categorization

**Implementation:**
```typescript
const handleAutoCategorize = async () => {
  // Validation checks
  // API call
  // Update form field
  // Show toast
  // Refresh data
};
```

### Master Component (List View)

**Location**: `src/pages/Master.tsx`

**Features:**
- "Categorize" button in bulk panel (between Edit and Delete)
- Button visibility conditions:
  - `type === 'posting'`
  - `selectedRows.length > 1`
  - No row has both accounts filled (`!hasAnyFullyCategorized()`)
- Confirmation modal before processing
- Shows summary toast with breakdown:
  - Categorized count
  - Applied count
  - Skipped count with reasons
  - Error count
- Refreshes table after completion

**Validation Functions:**
- `hasAnyFullyCategorized()`: Checks if any row has both accounts
- `allHaveAtLeastOneAccount()`: Ensures all rows have at least one account

---

## Functional Requirements

### FR-1: Single Transaction Categorization

The system provides an agent handler to categorize a single posting.

#### Input Specification

The handler accepts either:
- `posting_id`: ID to fetch from database
- `posting_data`: Direct posting data object

#### Context Requirements

The agent considers:
1. **Transaction Details**
   - Description text and keywords
   - Transaction amount (magnitude and sign)
   - Transaction date

2. **Source Account Context**
   - Bank/Credit Card account name
   - Account type (helps determine if money is IN or OUT)
   - Account metadata if available

3. **Available Account Heads**
   - Chart of Accounts filtered by organization
   - Appropriate account types based on transaction direction:
     - Money OUT → Typically EXPENSE accounts
     - Money IN → Typically INCOME or ASSET accounts
   - Active accounts only

4. **Historical Patterns** (Implemented)
   - Previous categorizations for similar descriptions
   - Fuzzy matching on transaction descriptions

### FR-2: Batch Transaction Categorization

The system provides an agent handler to categorize multiple postings in a single call with optimizations:
- Historical matching to skip LLM calls
- Bulk LLM processing (20 transactions per call)
- Skip already categorized transactions

### FR-3: Apply Categorization

The system updates the posting record with the predicted counter-account based on transaction direction:

| Direction | Source Account Role | Field to Update | Value |
|-----------|---------------------|-----------------|-------|
| Money OUT | Bank/CC is credited | `account_id` (debit side) | Predicted account |
| Money IN  | Bank/CC is debited  | `credit_account_id` (credit side) | Predicted account |

#### Validation Requirements

Before applying:
1. Verify the predicted account exists and is active
2. Verify the account belongs to the same organization
3. Verify the account type is appropriate for the transaction direction
4. Ensure the posting is not in a locked period

---

## API Reference

### Single Transaction Categorization

**Endpoint**: `POST /api/agent/erp/categorize-transaction`

**Request:**
```typescript
{
  posting_id?: string;
  posting_data?: {
    id: string;
    description: string;
    amount: number;
    value_date: string;
    account_id: string;
    account_name?: string;
    account_type?: string[];
    credit_account_id?: string;
    credit_account_type?: string[];
    category_id?: string;
  };
  options?: {
    include_alternatives?: boolean;  // default: true
    max_alternatives?: number;       // default: 3
    apply?: boolean;                 // default: true
  };
}
```

**Response:**
```typescript
{
  success: boolean;
  data?: {
    posting_id: string;
    predicted_account_id: string;
    predicted_account_name: string;
    predicted_account_type: string;
    confidence: 'high' | 'medium' | 'low';
    confidence_score: number;
    reasoning: string;
    alternatives?: Array<{
      account_id: string;
      account_name: string;
      account_type: string;
      confidence_score: number;
      reasoning: string;
    }>;
    transaction_direction: 'money_in' | 'money_out';
    field_to_update: 'account_id' | 'credit_account_id';
    applied: boolean;
  };
  error?: string;
}
```

### Batch Transaction Categorization

**Endpoint**: `POST /api/agent/erp/categorize-transaction-batch`

**Request:**
```typescript
{
  posting_ids?: string[];
  postings?: Array<{
    id: string;
    description: string;
    amount: number;
    value_date: string;
    account_id: string;
    account_name?: string;
    account_type?: string[];
    credit_account_id?: string;
    credit_account_type?: string[];
  }>;
  options?: {
    skip_already_categorized?: boolean;  // default: true
    min_confidence?: 'high' | 'medium' | 'low';  // default: 'medium'
    dry_run?: boolean;                   // default: false
    use_historical_matching?: boolean;   // default: true
  };
}
```

**Response:**
```typescript
{
  success: boolean;
  data?: {
    results: Array<{
      posting_id: string;
      predicted_account_id: string | null;
      predicted_account_name: string | null;
      confidence: 'high' | 'medium' | 'low' | null;
      confidence_score: number | null;
      reasoning: string | null;
      applied: boolean;
      skipped_reason?: string;
      error?: string;
    }>;
    summary: {
      total_processed: number;
      categorized_count: number;
      historical_match_count: number;
      llm_categorized_count: number;
      applied_count: number;
      skipped_count: number;
      skipped_by_reason: Record<string, number>;  // e.g., {"Already categorized": 2, "Confidence below threshold": 1}
      error_count: number;
    };
  };
  error?: string;
}
```

### Skip Reasons

Transactions can be skipped for the following reasons:

1. **"Already categorized"**: Both `account_id` and `credit_account_id` are already filled
2. **"Confidence below threshold"**: Prediction confidence is below `min_confidence` setting

### API Examples

#### Example 1: Single Transaction - Clear Expense

**Request:**
```json
{
  "posting_id": "uuid-here",
  "options": {
    "include_alternatives": true,
    "max_alternatives": 3
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "posting_id": "uuid-here",
    "predicted_account_id": "acc-uuid",
    "predicted_account_name": "Cloud Infrastructure",
    "predicted_account_type": "EXPENSE",
    "confidence": "high",
    "confidence_score": 0.95,
    "reasoning": "AWS is a cloud computing service provider. Transaction matches software/infrastructure expenses.",
    "alternatives": [
      {
        "account_id": "acc-uuid-2",
        "account_name": "Software Subscriptions",
        "account_type": "EXPENSE",
        "confidence_score": 0.85,
        "reasoning": "AWS is also commonly categorized as software subscription"
      }
    ],
    "transaction_direction": "money_out",
    "field_to_update": "account_id",
    "applied": true
  }
}
```

#### Example 2: Batch Transaction

**Request:**
```json
{
  "posting_ids": ["uuid-1", "uuid-2", "uuid-3"],
  "options": {
    "skip_already_categorized": true,
    "min_confidence": "medium",
    "dry_run": false,
    "use_historical_matching": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "posting_id": "uuid-1",
        "predicted_account_id": "acc-uuid",
        "predicted_account_name": "Office Supplies",
        "confidence": "high",
        "confidence_score": 0.88,
        "reasoning": "Amazon purchase typically office supplies",
        "applied": true
      },
      {
        "posting_id": "uuid-2",
        "predicted_account_id": "acc-uuid-2",
        "predicted_account_name": "Travel & Transportation",
        "confidence": "low",
        "confidence_score": 0.35,
        "reasoning": "Description too vague to determine category",
        "applied": false,
        "skipped_reason": "Confidence below threshold"
      }
    ],
    "summary": {
      "total_processed": 3,
      "categorized_count": 2,
      "historical_match_count": 1,
      "llm_categorized_count": 1,
      "applied_count": 1,
      "skipped_count": 2,
      "skipped_by_reason": {
        "Already categorized": 1,
        "Confidence below threshold": 1
      },
      "error_count": 0
    }
  }
}
```

---

## Example Scenarios

### Scenario 1: Clear Expense Transaction

**Input:**
```json
{
  "description": "AMAZON WEB SERVICES aws.amazon.com",
  "amount": -150.00,
  "account_name": "Chase Business Credit Card",
  "account_type": ["CREDIT_CARD"]
}
```

**Expected Output:**
```json
{
  "predicted_account_name": "Cloud Infrastructure",
  "confidence": "high",
  "confidence_score": 0.95,
  "reasoning": "AWS is a cloud computing service provider. Transaction matches software/infrastructure expenses."
}
```

### Scenario 2: Ambiguous Transaction

**Input:**
```json
{
  "description": "UBER TRIP",
  "amount": -45.00,
  "account_name": "Wells Fargo Checking",
  "account_type": ["BANK"]
}
```

**Expected Output:**
```json
{
  "predicted_account_name": "Travel & Transportation",
  "confidence": "medium",
  "confidence_score": 0.65,
  "reasoning": "Uber is a transportation service. Could be business travel or commuting.",
  "alternatives": [
    {
      "account_name": "Employee Expenses",
      "confidence_score": 0.55,
      "reasoning": "Could be an employee expense reimbursement"
    },
    {
      "account_name": "Client Entertainment",
      "confidence_score": 0.40,
      "reasoning": "Might be client transportation"
    }
  ]
}
```

### Scenario 3: Income Transaction

**Input:**
```json
{
  "description": "PAYMENT FROM ACME CORP INV-2024-001",
  "amount": 5000.00,
  "account_name": "Business Savings Account",
  "account_type": ["BANK"]
}
```

**Expected Output:**
```json
{
  "predicted_account_name": "Accounts Receivable",
  "confidence": "high",
  "confidence_score": 0.90,
  "reasoning": "Payment received with invoice reference. Likely customer payment for outstanding invoice.",
  "transaction_direction": "money_in",
  "field_to_update": "credit_account_id"
}
```

### Scenario 4: Transfer Between Accounts

**Input:**
```json
{
  "description": "TRANSFER TO SAVINGS",
  "amount": -1000.00,
  "account_name": "Checking Account",
  "account_type": ["BANK"]
}
```

**Expected Output:**
```json
{
  "predicted_account_name": "Savings Account",
  "confidence": "high",
  "confidence_score": 0.88,
  "reasoning": "Description indicates inter-account transfer. The counter-account should be another bank account."
}
```

---

## Usage Guide

### Single Transaction Categorization

1. **Navigate to Posting Detail View**
   - Go to `/posting/{id}/view/{viewId}`

2. **Fill Required Fields**
   - Ensure posting has a description
   - Fill exactly one account (Debit OR Credit)

3. **Click "Auto-Categorize" Button**
   - Button appears between Cancel and Save buttons
   - Shows loading spinner during processing

4. **Review Result**
   - Form field updates automatically
   - Success toast shows predicted account and confidence
   - Posting data refreshes to show account names

### Batch Transaction Categorization

1. **Navigate to Posting List View**
   - Go to `/master/accounting/posting` or similar

2. **Select Multiple Transactions**
   - Check boxes for 2+ transactions
   - Bulk panel appears at top

3. **Verify Selection**
   - Ensure no selected transaction has both accounts filled
   - Categorize button only appears if valid

4. **Click "Categorize" Button**
   - Confirmation modal appears
   - Click "Yes, Categorize"

5. **Review Summary**
   - Toast shows:
     - Categorized count
     - Applied count
     - Skipped count with reasons
     - Error count
   - Table refreshes automatically

### Best Practices

1. **For Single Transactions**
   - Always add a clear description before categorizing
   - Review low-confidence predictions manually
   - Use alternatives if primary prediction seems wrong

2. **For Batch Processing**
   - Select transactions with similar patterns for better historical matching
   - Review skipped transactions to understand why they were skipped
   - Use `min_confidence: 'high'` for critical transactions

3. **Improving Accuracy**
   - Manually categorize transactions to build historical patterns
   - Use clear, descriptive transaction descriptions
   - Ensure Chart of Accounts has appropriate categories

---

## Configuration

### Backend Configuration

**Location**: `backend/src/agent/handlers/erp/utils/categorizationUtils.ts`

```typescript
export const CATEGORIZATION_CONFIG = {
  BULK_LLM_BATCH_SIZE: 20,              // Transactions per LLM call
  FUZZY_MATCH_THRESHOLD: 0.85,          // Similarity threshold for historical matching
  HISTORICAL_MATCH_CONFIDENCE: 0.95,    // Fixed confidence for historical matches
};
```

**Environment Variables:**
- `LLM_MODEL`: LLM model to use (default: `gemini-2.0-flash-001`)

### Frontend Configuration

**Default Options:**
- Single: `apply: true`, `include_alternatives: true`
- Batch: `skip_already_categorized: true`, `min_confidence: 'medium'`, `use_historical_matching: true`

---

## Testing

### Backend Tests

**Location**: `backend/src/__tests__/agent/handlers/categorization.test.ts`

**Test Coverage:**
- Utility functions (direction detection, confidence mapping)
- Prompt building
- Historical matching
- Fuzzy string matching
- Handler validation
- Integration tests with real LLM

**Run Tests:**
```bash
cd backend
npm test -- categorization.test.ts
```

### Manual Testing Checklist

**Single Transaction:**
- [ ] Button appears when conditions are met
- [ ] Button disabled when no description
- [ ] Button disabled when no posting ID
- [ ] Loading state shows during API call
- [ ] Form field updates correctly
- [ ] Toast shows confidence level
- [ ] Works for money_in transactions
- [ ] Works for money_out transactions

**Batch Transaction:**
- [ ] Button appears for posting type only
- [ ] Button hidden when any row has both accounts
- [ ] Confirmation modal appears
- [ ] Summary toast shows correct counts
- [ ] Skipped reasons are displayed
- [ ] Table refreshes after completion
- [ ] Selection clears after completion

---

## Performance Considerations

### Optimization Strategies

1. **Historical Matching**
   - Reduces LLM calls by ~30-50%
   - Uses fuzzy matching with 0.85 threshold
   - Only matches human-approved transactions

2. **Bulk LLM Processing**
   - Processes 20 transactions per call
   - Reduces API latency
   - Lower cost per transaction

3. **Skip Logic**
   - Skips already categorized transactions
   - Validates before LLM calls
   - Reduces unnecessary processing

### Performance Metrics

- **Single Transaction**: ~2-3 seconds
- **Batch of 50**: ~15-30 seconds
- **Batch of 100**: ~30-60 seconds
- **Historical Match**: < 100ms (no LLM call)

---

## Database Schema

### Posting Model Changes

The following fields were added to the `posting` model to support AI categorization:

```prisma
model posting {
  // ... existing fields ...

  ai_cat_score       Decimal?  @db.Decimal(5, 4)  // AI confidence (0.0000-1.0000)
  ai_categorized_at  DateTime?                    // When AI categorized
}
```

### AI Activity Log

All categorization activities are logged to the `ai_activity_log` table for audit and analytics:

```prisma
model ai_activity_log {
  id                String    @id
  created_at        DateTime  @default(now())
  org_id            String
  user_id           String?

  activity_type     String    // 'categorize_transaction', 'categorize_transaction_batch'
  model_name        String    // 'posting'
  record_id         String?

  llm_model         String    // 'gemini-2.0-flash-001'
  prompt_tokens     Int?
  completion_tokens Int?
  duration_ms       Int?
  steps_count       Int?      // Number of LLM calls
  tools_used        Json?     // Tool usage tracking

  confidence_score  Decimal?
  prediction        Json?
  applied           Boolean   @default(false)
  input_summary     String?
  reasoning         String?
  error             String?
}
```

---

## Error Handling

### Common Errors

1. **"No accounts available for categorization"**
   - Cause: No active accounts in Chart of Accounts
   - Solution: Ensure accounts exist and are active

2. **"Predicted account not found"**
   - Cause: LLM returned invalid account ID
   - Solution: Backend validates, but may indicate prompt issues

3. **"Cannot categorize: Already categorized"**
   - Cause: Transaction has both accounts filled
   - Solution: Deselect from batch or clear one account

4. **"Confidence below threshold"**
   - Cause: Prediction confidence too low
   - Solution: Review manually or lower `min_confidence`

### Error Recovery

- All errors are logged to `ai_activity_log` table
- Frontend shows user-friendly error messages
- Failed transactions don't block batch processing
- Individual errors are tracked in results array

---

## Success Criteria

### Accuracy Metrics

| Metric | Target |
|--------|--------|
| High confidence accuracy | > 90% |
| Medium confidence accuracy | > 75% |
| Overall useful suggestions | > 80% |
| False positive rate (wrong high-confidence) | < 5% |

### Performance Metrics

| Metric | Target |
|--------|--------|
| Single transaction response time | < 3 seconds |
| Batch of 50 transactions | < 30 seconds |
| Batch of 100 transactions | < 60 seconds |

### User Experience Metrics

| Metric | Target |
|--------|--------|
| User acceptance rate (high confidence) | > 85% |
| Time saved per transaction | > 80% reduction |
| User satisfaction score | > 4.0/5.0 |

---

## Future Enhancements

### Phase 2: Learning from Feedback

1. **Feedback Loop**
   - Track when users accept or reject suggestions
   - Use feedback to improve future predictions
   - Build organization-specific patterns

2. **Historical Pattern Matching** (Partially Implemented)
   - ✅ Learn from past categorizations (current)
   - 🔄 Suggest based on similar transactions (enhanced)
   - 🔄 Vendor/payee recognition (planned)

### Phase 3: Rules Engine

1. **User-Defined Rules**
   - Allow users to create categorization rules
   - "If description contains X, categorize as Y"
   - Priority-based rule execution

2. **Automatic Rule Suggestion**
   - Suggest rules based on patterns
   - "You've categorized NETFLIX as Entertainment 10 times. Create a rule?"

### Phase 4: Advanced Features

1. **Split Transaction Support**
   - Suggest splitting transactions across multiple categories
   - Handle partial categorization

2. **Recurring Transaction Detection**
   - Identify recurring transactions
   - Auto-categorize based on previous instance

3. **Anomaly Detection**
   - Flag unusual transactions
   - Alert on potential miscategorization

4. **Preview Modal**
   - Show prediction before applying
   - Allow user to choose alternatives
   - Better transparency

5. **Vendor Recognition**
   - Extract vendor names from descriptions
   - Build vendor → account mappings
   - Auto-categorize by vendor

6. **Amount-Based Heuristics**
   - Use amount ranges to improve categorization
   - Detect recurring transactions
   - Pattern recognition

---

## Appendix

### A. Account Type Reference

| Type | Description | Transaction Direction |
|------|-------------|----------------------|
| EXPENSE | Operating expenses | Money OUT |
| INCOME | Revenue accounts | Money IN |
| ASSET | Cash, receivables, inventory | Both |
| LIABILITY | Payables, credit cards | Both |
| EQUITY | Owner's equity | Rare |

### B. Common Categorization Patterns

| Description Pattern | Likely Category |
|--------------------|-----------------|
| AWS, Azure, GCP | Cloud Infrastructure |
| UBER, LYFT | Travel & Transportation |
| AMAZON | Office Supplies / Inventory |
| STRIPE, PAYPAL (credit) | Payment Processing Fees |
| STRIPE, PAYPAL (debit) | Accounts Receivable |
| Payroll, ADP, Gusto | Payroll Expenses |
| Rent, Lease | Rent Expense |
| Insurance | Insurance Expense |

### C. Technical Requirements Summary

#### TR-1: Agent Handler Implementation
- ✅ Implemented as ERP agent handlers in `backend/src/agent/handlers/erp/`
- ✅ Registered in handler registry
- ✅ Follows existing patterns

#### TR-2: Account Retrieval
- ✅ Utility function `fetchAccountsForCategorization()` implemented
- ✅ Groups accounts by classification (Expense, Income, Asset, Liability)
- ✅ Filters by organization and active status

#### TR-3: LLM Prompt Design
- ✅ System prompt defines role and rules
- ✅ User prompt includes transaction details and available accounts
- ✅ Structured output via Zod schema
- ✅ Common patterns included in system prompt

#### TR-4: Confidence Scoring
- ✅ Three-level system (high/medium/low)
- ✅ Score ranges: High (≥0.8), Medium (≥0.5), Low (<0.5)
- ✅ Factors: Description clarity, keyword matches, ambiguity

#### TR-5: Error Handling
- ✅ Handles empty descriptions
- ✅ Validates account existence
- ✅ Handles multiple likely categories
- ✅ Permission checks
- ✅ Database transaction error handling

---

## Related Documentation

- [AI_AGENT.md](./AI_AGENT.md) - AI agent architecture
- [BUSINESS_DOMAIN.md](./BUSINESS_DOMAIN.md) - Business domain context
- [AI_AUTO_CATEGORIZATION.md](./AI_AUTO_CATEGORIZATION.md) - Original requirements document
- [AI_CATEGORIZATION_FRONTEND_REVIEW.md](./AI_CATEGORIZATION_FRONTEND_REVIEW.md) - Frontend review
- [IMPORT_FUNCTIONALITY.md](./IMPORT_FUNCTIONALITY.md) - Import flow integration

---

## Changelog

### January 2025
- ✅ Initial implementation
- ✅ Single transaction categorization
- ✅ Batch transaction categorization
- ✅ Historical matching optimization
- ✅ Bulk LLM processing
- ✅ Skipped reasons breakdown in summary
- ✅ Frontend integration in PostingForm and Master components

---

**Last Updated**: January 2025  
**Maintained By**: Development Team
