# Posting Import Documentation

**Status**: Implemented  
**Created**: January 2025  
**Last Updated**: January 2026  
**Related docs**: [IMPORT_FUNCTIONALITY.md](./IMPORT_FUNCTIONALITY.md), [AI_AGENT.md](./AI_AGENT.md), [BUSINESS_DOMAIN.md](./BUSINESS_DOMAIN.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Posting Import Flow](#posting-import-flow)
3. [Posting-Specific Features](#posting-specific-features)
4. [AI Categorization Feature](#ai-categorization-feature)
5. [Architecture](#architecture)
6. [Backend Implementation](#backend-implementation)
7. [Frontend Implementation](#frontend-implementation)
8. [API Reference](#api-reference)
9. [Usage Guide](#usage-guide)
10. [Configuration](#configuration)
11. [Testing](#testing)

---

## Overview

### What is Posting Import?

Posting Import is a specialized import functionality for financial transactions (postings) that supports importing bank statements, CSV files, and PDF documents with intelligent field mapping, account selection, and AI-powered categorization.

### Business Context

Postings represent financial transactions in a double-entry bookkeeping system. Each posting has:
- **Account (Debit Side)**: The account being debited (e.g., Bank Account, Expense Account)
- **Credit Account (Credit Side)**: The account being credited (e.g., Bank Account, Income Account)
- **Amount**: Transaction amount
- **Description**: Transaction description
- **Value Date**: When the transaction occurred

### Import Formats Supported

1. **CSV Files**: Standard CSV format with customizable column mapping
2. **PDF Bank Statements**: Automatic extraction of transactions from bank statement PDFs
3. **PDF with AI Categorization**: Combined extraction and AI categorization in a single step

### Key Features

1. **Account Selection**: Pre-select a bank/credit card account for all transactions
2. **Debit/Credit Mapping**: Flexible mapping for debit and credit amounts
3. **Field Mapping**: Intelligent column-to-field mapping with auto-suggestions
4. **Lookup Field Resolution**: Automatic resolution of account names to IDs
5. **AI Categorization**: Automatic prediction of counter-accounts using LLM
6. **Batch Processing**: Efficient processing of large transaction files
7. **Data Validation**: Real-time validation of required fields and lookup values

---

## Posting Import Flow

### Overview

Posting import supports multiple workflows depending on the data source and user preferences:

1. **CSV Import with Account Selection**: Pre-select an account, use debit/credit format
2. **CSV Import without Account Selection**: Standard format with explicit account and credit account
3. **PDF Bank Statement Import**: Automatic extraction from bank statements
4. **PDF with AI Categorization**: Combined extraction and categorization

### CSV Import with Account Selection

When a user selects an account before uploading (via `relation="account"`), the import system expects a different CSV format optimized for single-account transactions.

#### CSV Format Requirements

```csv
Value Date,Description,Credit Account,Debit Amount,Credit Amount,Category
2024-01-15,Office Supplies,Office Expenses,150.00,0.00,Office Supplies
2024-01-16,Client Payment,Accounts Receivable,0.00,5000.00,Service Revenue
2024-01-17,Monthly Rent,Bank Account,2500.00,0.00,Rent
```

#### Field Mapping

| CSV Column | Database Field | Type | Required | Notes |
|------------|----------------|------|----------|-------|
| Value Date | `value_date` | Date | Yes | Transaction date |
| Description | `description` | String | Yes | Transaction description |
| Credit Account | `credit_account_id` | Lookup | Conditional | For debit transactions |
| Debit Amount | `amount` | Number | Conditional | When > 0, selected account is debited |
| Credit Amount | `amount` | Number | Conditional | When > 0, selected account is credited |
| Category | `category_id` | Lookup | No | Optional categorization |

#### Data Transformation Logic

When `updateCSVData` is called with a selected account:

```typescript
// Pseudo-code transformation
// Accounting logic: Statement debit/credit convention determines account placement
if (creditAmount > 0) {
  // Deposit/payment: Money credited to selected account
  // Selected account goes to debit side (asset increases or liability decreases)
  record.account_id = selectedAccountId;      // Selected account on debit side
  record.amount = creditAmount;
  record.credit_account_id = mappedContraAccount; // From CSV or AI categorization
} else if (debitAmount > 0) {
  // Withdrawal/spend: Money debited from selected account
  // Selected account goes to credit side (asset decreases or liability increases)
  record.account_id = mappedContraAccount;       // From CSV or AI categorization
  record.amount = debitAmount;
  record.credit_account_id = selectedAccountId;   // Selected account on credit side
}
```

**Note**: This logic works correctly for both bank accounts (assets) and credit cards (liabilities):
- **Bank deposit** (`credit_amount`): Bank account debited (asset ↑)
- **Bank withdrawal** (`debit_amount`): Bank account credited (asset ↓)
- **Credit card spend** (`debit_amount`): Credit card credited (liability ↑)
- **Credit card payment** (`credit_amount`): Credit card debited (liability ↓)

### CSV Import without Account Selection

When no account is pre-selected, the CSV must explicitly specify both accounts.

#### CSV Format Requirements

```csv
Value Date,Description,Account,Amount,Credit Account,Category
2024-01-15,Office Supplies,Office Supplies,150.00,Cash on Hand,Office Supplies
2024-01-16,Client Payment,Cash on Hand,5000.00,Accounts Receivable,Service Revenue
2024-01-17,Monthly Rent,Rent,2500.00,Checking Account,Rent
```

#### Field Mapping

| CSV Column | Database Field | Type | Required | Notes |
|------------|----------------|------|----------|-------|
| Value Date | `value_date` | Date | Yes | Transaction date |
| Description | `description` | String | Yes | Transaction description |
| Account | `account_id` | Lookup | Yes | Debit account |
| Amount | `amount` | Number | Yes | Transaction amount |
| Credit Account | `credit_account_id` | Lookup | Yes | Credit account |
| Category | `category_id` | Lookup | No | Optional categorization |

### PDF Bank Statement Import

PDF bank statements can be imported with automatic transaction extraction.

#### Supported Document Types

1. **Standard PDF Extraction**: `parseDocument` API
   - Extracts transactions from PDF
   - Returns structured CSV data
   - No categorization

2. **PDF with Categorization**: `parseDocumentWithCategorization` API
   - Extracts transactions AND categorizes each
   - Requires `legalEntityId` for Chart of Accounts lookup
   - Returns CSV data + categorizations array

#### PDF Processing Flow

```
User uploads PDF (optionally selects account first)
    ↓
ImportPannel checks for posting extension
    ↓
PostingImportExtension.getPdfUploadOptions() extracts legalEntityId
    ↓
PostingImportExtension.handlePdfUpload() invoked with options
    ↓
Backend: PostingImportExtension.customExtract()
    ↓
BankStatementWithCategorizationExtractor.prepareCategorizationContext()
    ↓
BankStatementWithCategorizationExtractor.extract() with augmented prompts
    ↓
Single LLM call: Extract + Categorize
    ↓
Returns: CSV data + categorizations
    ↓
Frontend displays in CsvMapper with AI Category column
```

---

## Posting-Specific Features

### Account Selection

The posting import supports pre-selecting an account before import, which enables a simplified CSV format.

**Configuration:**
```typescript
<ImportPannel
  modelType="posting"
  modelView="posting_view"
  relation="account"              // Enables account selection
  relationField="Account"         // Display label
  relationFieldId="account_id"   // Field to populate
  updateCSVData={transformPostingData}
/>
```

**Benefits:**
- Simplified CSV format (debit/credit amounts instead of explicit accounts)
- Faster data entry for single-account imports
- Consistent account assignment across all transactions

### Debit/Credit Mapping

When an account is pre-selected, the system automatically handles debit/credit logic based on bank statement conventions:

- **Credit Amount > 0** (deposit/payment): Selected account goes to `account_id` (debit side)
  - For bank accounts: Asset increases (money comes in)
  - For credit cards: Liability decreases (payment made)
  - Contra account (from CSV or AI categorization) goes to `credit_account_id`

- **Debit Amount > 0** (withdrawal/spend): Selected account goes to `credit_account_id` (credit side)
  - For bank accounts: Asset decreases (money goes out)
  - For credit cards: Liability increases (spending occurs)
  - Contra account (from CSV or AI categorization) goes to `account_id`

This logic is account-type agnostic and works correctly for both asset accounts (bank accounts) and liability accounts (credit cards) without requiring manual mapping adjustments.

### Field Mapping Generation

The system automatically generates field mappings based on:

1. **View Metadata**: Fields with `permission: "update"` are available
2. **Column Name Matching**: Auto-suggests matches based on display names
3. **Lookup Field Detection**: Identifies select fields and enables lookup resolution

### Lookup Field Resolution

For fields with `tableProps.columnType === "select"`:

1. System extracts unique values from CSV
2. Queries database using `instanceLabel` (typically "name")
3. Resolves account names to IDs
4. Marks unresolved values as "Not Available"
5. Disables upload until all lookups are resolved

### Data Validation

Before upload, the system validates:

- **Required Fields**: All fields with `required: true && permission: "update"` must be mapped
- **Lookup Values**: All lookup field values must resolve to valid IDs
- **Data Types**: Values are validated against field data types
- **No Not Available Rows**: Upload disabled if any rows have unresolved lookups

---

## AI Categorization Feature

### Overview

AI Categorization is an intelligent feature that automatically predicts and assigns the appropriate counter-account (category) for financial transactions. It uses Large Language Models (LLMs) to analyze transaction descriptions, amounts, and context to suggest the most appropriate account from the Chart of Accounts.

### Business Context

In the Simple Transactions view, users see transactions with:
- **Account**: The Bank or Credit Card account where the transaction occurred
- **Category**: The counter-account representing what the money was for/from

The Simple Transactions page is scoped by legal entity (default: HQ) and account: transactions are shown only after selecting an account. The account dropdown lists only bank-type accounts (saving, checking, credit card) for the selected legal entity. Amounts are displayed in the legal entity’s base currency.

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
3. **Import-Time Categorization**: Automatic categorization during PDF bank statement import
4. **Historical Matching**: Uses past approved transactions to skip LLM calls for similar descriptions
5. **Confidence Scoring**: Provides confidence levels (high/medium/low) for transparency
6. **Smart Filtering**: Only shows categorization options when appropriate

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  PostingForm     │  │  Transactions    │               │
│  │  - Single Cat    │  │  - Batch Cat     │               │
│  └────────┬─────────┘  └────────┬─────────┘               │
│           │                      │                          │
│           └──────────┬───────────┘                          │
│                      │                                      │
│              ┌───────▼────────┐                            │
│              │   agentAPI     │                            │
│              └───────┬────────┘                            │
│                      │                                      │
│  ┌───────────────────▼──────────────────┐               │
│  │  Import Components (Generic)            │               │
│  │  ┌──────────────┐  ┌──────────────┐    │               │
│  │  │ ImportPannel│  │  CsvMapper   │    │               │
│  │  └──────┬───────┘  └──────┬───────┘    │               │
│  │         │                  │            │               │
│  │         └────────┬─────────┘            │               │
│  │                  │                      │               │
│  │          ┌───────▼────────┐            │               │
│  │          │ ImportExtension │            │               │
│  │          │    Registry     │            │               │
│  │          └───────┬────────┘            │               │
│  │                  │                      │               │
│  │          ┌───────▼────────┐            │               │
│  │          │ PostingImport   │            │               │
│  │          │   Extension     │            │               │
│  │          │ - Categorize Btn│            │               │
│  │          │ - AI Category Col│          │               │
│  │          │ - PDF Upload    │            │               │
│  │          └─────────────────┘            │               │
│  └───────────────────────────────────────────┘               │
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
│  ┌───────────────────▼──────────────────┐                 │
│  │  Import Extensions (Model-Specific)   │                 │
│  │  ┌──────────────────────────────────┐ │                 │
│  │  │ ImportExtensionRegistry          │ │                 │
│  │  │  - getForModel()                 │ │                 │
│  │  │  - getByDocumentType()           │ │                 │
│  │  └──────────┬───────────────────────┘ │                 │
│  │             │                          │                 │
│  │  ┌──────────▼───────────────────────┐ │                 │
│  │  │ PostingImportExtension           │ │                 │
│  │  │  - customExtract()              │ │                 │
│  │  │  - PostingCategorizationFeature │ │                 │
│  │  └──────────┬───────────────────────┘ │                 │
│  └────────────┼─────────────────────────┘                 │
│                │                                            │
│  ┌─────────────▼─────────────────────────┐                 │
│  │  ERP Handlers                         │                 │
│  │  - categorizeTransaction              │                 │
│  │  - categorizeTransactionBatch          │                 │
│  └─────────────┬─────────────────────────┘                 │
└────────────────┼────────────────────────────────────────────┘
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

#### CSV Import Flow (Standard)
1. User navigates to posting list and clicks "Import"
2. `ImportPannel` renders with `modelType="posting"`
3. User selects CSV file
4. File parsed, `CsvMapper` rendered
5. User maps CSV columns to posting fields
6. System validates required fields and lookup values
7. On upload: Data transformed, sent to `/api/posting/view/{viewId}/upload`
8. Backend `UploadService` processes in batches
9. Records created in database
10. Success message shown, list refreshed

#### CSV Import Flow (With Account Selection)
1. User navigates to posting list and clicks "Import"
2. `UploadManager` modal shows account selection dropdown
3. User selects account (e.g., "Chase Business Checking")
4. User uploads CSV with debit/credit format
5. `CsvMapper` renders with field mapping
6. User maps columns (Credit Account, Debit Amount, Credit Amount)
7. On upload: `updateCSVData()` automatically transforms debit/credit amounts:
   - `credit_amount > 0`: Selected account → `account_id` (debit side)
   - `debit_amount > 0`: Selected account → `credit_account_id` (credit side)
8. Selected account ID automatically placed on correct side based on transaction type
9. Backend processes and creates postings
10. Success message shown

#### PDF Import Flow (With AI Categorization)
1. User uploads PDF bank statement
2. User optionally selects an account (which provides `legalEntityId`)
3. `ImportPannel` detects `modelType="posting"` and checks extension registry
4. `PostingImportExtension.getPdfUploadOptions()` extracts `legalEntityId` from selected account
5. `PostingImportExtension.handlePdfUpload()` invoked with options
6. Backend `PostingImportExtension.customExtract()` called
7. `BankStatementWithCategorizationExtractor`:
   - `prepareCategorizationContext()` fetches Chart of Accounts for legal entity
   - Uses augmentation hooks to inject accounts into extraction prompt
   - Single LLM call extracts transactions AND categorizes each
   - Returns CSV data + categorizations array
8. Frontend receives data, `CsvMapper` renders
9. AI Category column appears (from extension)
10. User reviews/edits categorizations
11. On upload: `transformDataForUpload()` injects predictions
12. Data imported with AI-predicted counter-accounts

#### AI Categorization Flow (Single Transaction)
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

#### AI Categorization Flow (Batch)
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
backend/src/
├── services/upload/
│   └── UploadService.ts                 # Generic upload service (works with any model)
├── services/core/
│   └── ModelService.ts                  # Model service with extension support
├── rest/
│   └── RestService.ts                   # REST API handlers, uses extension registry
├── lib/extractors/
│   ├── base-extractor.ts                # Base class with augmentation hooks
│   ├── types.ts                         # Extractor types including CategorizationExtractionOptions
│   ├── extractor-registry.ts            # ExtractorRegistry singleton
│   ├── bank-statement-extractor.ts      # Extraction-only bank statement extractor
│   └── bank-statement-with-categorization-extractor.ts  # Combined extraction + categorization
├── lib/import-extensions/
│   ├── index.ts                         # Extension registry initialization
│   ├── types.ts                         # Extension interfaces
│   ├── registry.ts                      # ImportExtensionRegistry singleton
│   └── posting/
│       └── index.ts                     # PostingImportExtension (uses BankStatementWithCategorizationExtractor)
└── agent/handlers/erp/
    ├── categorizeTransaction.ts          # Single transaction AI categorization
    ├── categorizeTransactionBatch.ts    # Batch transaction AI categorization
    └── utils/
        └── categorizationUtils.ts       # Shared AI categorization utilities + prompt formatting
```

### Core Components

#### 1. Upload Service (`services/upload/UploadService.ts`)

**Purpose**: Generic service for handling CSV uploads for any model, including postings.

**Key Functions:**
- `uploadCSV()`: Processes CSV data uploads
- `transformRecord()`: Transforms CSV records to database format

**Process:**
1. Receives upload request with `data`, `mapping`, and optional `parentData`
2. Gets view metadata/fieldsets if `viewName` provided
3. Transforms each record using field mapping
4. Merges parent data if provided
5. Processes in batches of 1000 records
6. Creates records via DataAccessLayer
7. Returns count of successfully created records

**Posting-Specific Behavior:**
- Handles `updateCSVData` transformation (debit/credit conversion)
- Merges selected account ID when `parentData` provided
- Validates required fields from view metadata

#### 2. Import Extension Registry (`lib/import-extensions/`)

**Purpose**: Provides model-specific import functionality without modifying generic components.

**Key Components:**

1. **ImportExtensionRegistry** (`registry.ts`)
   - Singleton registry for managing model-specific extensions
   - Maps extensions by model name and document type
   - Used by `RestService` and `ModelService` to check for extensions

2. **PostingImportExtension** (`posting/index.ts`)
   - Handles `posting_with_categorization` document type
   - Requires `legalEntityId` option for Chart of Accounts lookup
   - Provides `customExtract()` for PDF processing with categorization
   - Uses `BankStatementWithCategorizationExtractor` from the extractor framework

3. **BankStatementWithCategorizationExtractor** (`lib/extractors/bank-statement-with-categorization-extractor.ts`)
   - Extends `BaseDocumentExtractor` with categorization context
   - Uses augmentation hooks to inject Chart of Accounts into prompts
   - Provides `prepareCategorizationContext()` method for fetching accounts
   - Can be used directly via API/MCP without import extension context
   - Returns transactions with categorizations array

**Integration Points:**
- **RestService**: Checks registry during import to route to extension
- **ModelService**: Gets required options from extensions
- **ExtractorRegistry**: References extensions for document type routing

#### 3. AI Categorization Handlers (`agent/handlers/erp/`)

**Purpose**: Provide AI-powered categorization for individual and batch transactions.

##### 3.1 Single Transaction Handler (`categorizeTransaction.ts`)

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

##### 3.3 Categorization Utilities (`categorizationUtils.ts`)

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
├── components/import/
│   ├── ImportPannel.tsx                 # Main import panel (generic, works with any model)
│   ├── CsvMapper.tsx                     # CSV field mapping interface (generic)
│   ├── UploadManager.tsx                  # File upload modal with optional relation selection
│   │                                     # (passes full selection object for legalEntityId extraction)
│   └── utils/
│       └── upload.ts                    # Upload utility functions
├── features/import-extensions/
│   ├── index.ts                         # Extension registry exports
│   ├── init.ts                          # Extension initialization
│   ├── registry.ts                      # ImportExtensionRegistry singleton
│   ├── types.ts                         # Extension interfaces (includes PdfUploadContext)
│   └── posting/
│       ├── index.tsx                    # PostingImportExtension (includes getPdfUploadOptions)
│       ├── CategorizationButton.tsx     # AI categorization button
│       └── CategorizationColumn.tsx     # AI Category column component
├── components/forms/Masters/
│   └── PostingForm.tsx                 # Posting form with single categorization UI
├── pages/
│   └── Transactions.tsx                # Transactions list with batch categorization UI
└── api/
    └── api.ts                          # API client with agentAPI and importAPI
```

### Core Import Components

#### 1. ImportPannel (`components/import/ImportPannel.tsx`)

**Purpose**: Main import interface component that works with any model type, including postings.

**Key Features:**
- File upload (CSV or PDF)
- Account selection dropdown (when `relation="account"` provided)
- Extension registry integration for model-specific features
- PDF processing with extension support

**Posting-Specific Behavior:**
- Checks for `PostingImportExtension` when `modelType="posting"`
- Passes `legalEntityId` to PDF upload handler
- Receives categorizations from PDF extraction
- Passes categorizations to `CsvMapper`

#### 2. CsvMapper (`components/import/CsvMapper.tsx`)

**Purpose**: Generic CSV field mapping and validation interface.

**Key Features:**
- Column-to-field mapping dropdowns
- Lookup field validation
- Required field validation
- Extension column support (e.g., AI Category column)
- Extension toolbar actions (e.g., Categorize button)

**Posting-Specific Behavior:**
- Displays AI Category column when categorizations exist
- Shows Categorize button in toolbar (from extension)
- Transforms data using `extension.transformDataForUpload()` before upload
- Injects AI predictions into `credit_account_id` field

#### 3. PostingImportExtension (`features/import-extensions/posting/index.tsx`)

**Purpose**: Provides posting-specific import features without modifying generic components.

**Key Features:**
- `canActivate()`: Checks if extension should be active
- `getColumns()`: Returns AI Category column when categorizations exist
- `renderToolbarActions()`: Renders Categorize button
- `handlePdfUpload()`: Processes PDF with combined extraction + categorization
- `transformDataForUpload()`: Injects AI predictions into upload data

### API Client (`api/api.ts`)

**Import Methods:**

1. **`parseDocument()`**
   - Generic PDF parsing for any model
   - Returns extracted transactions

2. **`parseDocumentWithCategorization()`**
   - Posting-specific PDF parsing with AI categorization
   - Requires `legalEntityId` parameter
   - Returns transactions + categorizations array

3. **`uploadJSON()`**
   - Uploads transformed CSV data
   - Works with any model including postings

**AI Categorization Methods:**

1. **`categorizeTransaction()`**
   - Single transaction categorization
   - Supports `posting_id` or `posting_data`
   - Returns prediction with confidence and alternatives

2. **`categorizeTransactionBatch()`**
   - Batch transaction categorization
   - Supports `posting_ids` or `postings` array
   - Returns results array and summary

### Posting Form Component

**Location**: `src/components/forms/Masters/PostingForm.tsx`

**Purpose**: Form for creating/editing individual postings with AI categorization support.

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

### Transactions List Component

**Location**: `src/pages/Transactions.tsx`

**Purpose**: List view for postings with batch categorization support.

**Features:**
- "Categorize" button in bulk actions panel
- Button visibility conditions:
  - `selectedRows.length > 0`
  - No row has both accounts filled (`!hasAnyFullyCategorized()`)
- Confirmation modal before processing
- Shows summary toast with breakdown:
  - Categorized count
  - Applied count
  - Skipped count with reasons
  - Error count
- Refreshes table after completion

**Validation Functions:**
- `hasAnyFullyCategorized()`: Checks if any row has both accounts filled

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

### Scenario 5: Bank Statement Import with Categorization

**Input:**
- PDF bank statement uploaded via import panel
- User selects an account (which provides `legalEntityId` via `legal_entity_id` field)
- Document type: `posting_with_categorization`
- Options: `{ legalEntityId: "entity-uuid" }` (extracted from selected account)

**Process:**
1. Frontend calls `getPdfUploadOptions()` to extract `legalEntityId` from selected account
2. Frontend calls `handlePdfUpload()` from `PostingImportExtension` with options
3. Backend `PostingImportExtension.customExtract()` is invoked
4. `BankStatementWithCategorizationExtractor.prepareCategorizationContext()` fetches accounts
5. `BankStatementWithCategorizationExtractor.extract()` processes PDF with augmented prompts
6. Single LLM call extracts transactions AND categorizes each one
7. Returns CSV data with categorizations array

**Expected Output:**
```json
{
  "csvContent": "name,description,value_date,debit_amount,credit_amount\n...",
  "categorizations": [
    {
      "transaction_index": 0,
      "predicted_account_id": "acc-uuid",
      "predicted_account_name": "Cloud Infrastructure",
      "confidence_score": 0.92,
      "reasoning": "AWS transaction matches cloud infrastructure expense"
    }
  ]
}
```

**Frontend Processing:**
- Categorizations displayed in "AI Category" column
- User can review and modify before import
- `transformDataForUpload()` injects predictions into `credit_account_id` field

---

## Import Flow Integration

### Bank Statement Import with AI Categorization

The AI categorization feature integrates seamlessly with the generic import system through the Import Extensions Registry pattern.

#### Flow Overview

```
User uploads PDF bank statement (optionally selects account first)
    ↓
ImportPannel detects modelType='posting'
    ↓
Checks ImportExtensionRegistry for posting extension
    ↓
PostingImportExtension.getPdfUploadOptions() extracts legalEntityId from selected account
    ↓
PostingImportExtension.handlePdfUpload() invoked with options
    ↓
Backend: PostingImportExtension.customExtract()
    ↓
BankStatementWithCategorizationExtractor.prepareCategorizationContext()
    ↓
BankStatementWithCategorizationExtractor.extract() with augmented prompts
    ↓
Single LLM call: Extract transactions + Categorize each
    ↓
Returns: CSV data + categorizations array
    ↓
Frontend: Displays transactions in CsvMapper
    ↓
AI Category column appears (from extension.getColumns())
    ↓
Categorize button appears in toolbar (from extension.renderToolbarActions())
    ↓
User reviews/edits categorizations
    ↓
On upload: extension.transformDataForUpload() injects predictions
    ↓
Data imported with AI-predicted credit_account_id values
```

#### Key Integration Points

1. **Document Type Routing**
   - Document type `posting_with_categorization` or `bank_statement_categorized` routes to `PostingImportExtension`
   - Backend `ImportExtensionRegistry.getByDocumentType()` handles routing

2. **Required Options**
   - Extension requires `legalEntityId` option (for Chart of Accounts lookup)
   - Frontend extracts `legalEntityId` from selected account via `getPdfUploadOptions()`
   - `PdfUploadContext` provides access to `relationSelection.item.legal_entity_id`

3. **Combined Extraction + Categorization**
   - `BankStatementWithCategorizationExtractor` extends `BaseDocumentExtractor`
   - Uses augmentation hooks to inject Chart of Accounts into extraction prompt
   - Single LLM call extracts transaction data AND categorizes each transaction
   - Returns structured data with categorizations array

4. **Extractor Framework Integration**
   - `prepareCategorizationContext()` fetches and caches accounts by org/legalEntity
   - `augmentPromptWithContext()` adds categorization instructions and account list to prompt
   - `augmentSchemaWithContext()` adds categorization fields to expected schema
   - Extractor can be used directly via API/MCP without import extension context

5. **UI Integration**
   - Extension provides custom columns via `getColumns()` (AI Category column)
   - Extension provides toolbar actions via `renderToolbarActions()` (Categorize button)
   - Extension handles PDF upload via `handlePdfUpload()`
   - Extension provides upload options via `getPdfUploadOptions()` (legalEntityId)

6. **Data Transformation**
   - `transformDataForUpload()` injects AI predictions into CSV data
   - Maps categorizations to `credit_account_id` field
   - Only applies predictions with confidence ≥ 0.5

#### Benefits of Extension Pattern

- **No Generic Component Changes**: CsvMapper and ImportPannel remain generic
- **Easy to Extend**: New models can add import features without touching core code
- **Type Safety**: Full TypeScript support for extension interfaces
- **Separation of Concerns**: Model-specific logic isolated in extensions

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

1. **Navigate to Transactions List View**
   - Go to `/accounting/transactions`

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
- [ ] Button appears in Transactions page bulk actions
- [ ] Button hidden when any row has both accounts filled
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

### January 2026

**Document Restructure:**
- ✅ Restructured document to focus on posting import as primary topic
- ✅ Added comprehensive posting import flow documentation
- ✅ Documented account selection and debit/credit mapping features
- ✅ Moved AI categorization to feature section within posting import context
- ✅ Updated architecture diagrams to show posting import as primary focus

### January 2025

**Posting Import Implementation:**
- ✅ CSV import with account selection support
- ✅ Debit/credit amount transformation
- ✅ Field mapping and lookup resolution
- ✅ PDF bank statement import
- ✅ Generic import components (ImportPannel, CsvMapper)

**AI Categorization Feature:**
- ✅ Single transaction categorization
- ✅ Batch transaction categorization
- ✅ Historical matching optimization
- ✅ Bulk LLM processing
- ✅ Skipped reasons breakdown in summary
- ✅ Frontend integration in PostingForm and Transactions components

**Import Extensions Registry Pattern:**
- ✅ Created Import Extensions Registry pattern for backend (`lib/import-extensions/`)
- ✅ Created Import Extensions Registry pattern for frontend (`features/import-extensions/`)
- ✅ Implemented `PostingImportExtension` for posting-specific categorization
- ✅ Combined PDF extraction + categorization in single LLM call
- ✅ Removed hardcoded `modelType === 'posting'` checks from generic components
- ✅ Added extensible architecture for future model-specific import features
- ✅ Type-safe extension interfaces for both frontend and backend

**DRY Refactoring (January 2026):**
- ✅ Created `BankStatementWithCategorizationExtractor` extending `BaseDocumentExtractor`
- ✅ Added augmentation hooks (`augmentPromptWithContext`, `augmentSchemaWithContext`) to base extractor
- ✅ Consolidated prompt formatting utilities in `categorizationUtils.ts`:
  - `formatAccountsListForPrompt()` - shared account list formatting
  - `formatAllAccountsForPrompt()` - formats all account groups
  - `buildCategorizationInstructions()` - shared categorization instructions
  - `getCategorizationSchema()` - shared schema for categorization results
- ✅ Refactored `PostingImportExtension` to use `BankStatementWithCategorizationExtractor`
- ✅ Added `getPdfUploadOptions()` hook for frontend extensions to provide context
- ✅ `legalEntityId` now extracted from selected account via `PdfUploadContext`
- ✅ Extractor can be used directly via API/MCP without import extension context

---

**Last Updated**: January 2026  
**Maintained By**: Development Team
