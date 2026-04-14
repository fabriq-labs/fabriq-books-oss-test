# Bookkeeping Domain - Fabriq Financial Suite

**When to read**: Understanding multi-entity bookkeeping, chart of accounts, consolidation features
**Related docs**: [BUSINESS_DOMAIN.md](./BUSINESS_DOMAIN.md), [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Overview

Fabriq implements a **double-entry bookkeeping system** with support for **multi-entity group structures**. A single tenant can operate multiple legal entities (organizations), with one designated as HQ. Each entity maintains its own chart of accounts and journal entries, while the HQ account mapping enables group-level consolidation.

---

## Core Data Model

### 1. Entity (Legal Entity)

**Model**: `entity` (zeiv.prisma)

Each organization represents a legal entity within the tenant's group structure.

| Field | Purpose |
|-------|---------|
| `organization_name` | Display name |
| `legal_name` | Registered legal name |
| `is_it_headquartres` | `"Yes"` for HQ entity, `"No"` for subsidiaries |
| `is_it_a_groupcompany` | Whether part of a group |
| `group_company_name` | Name of the parent group |
| `basecurrency_id` | FK to `currency_master` — entity's functional currency |
| `org_id` | Tenant-level isolation (all entities share the same `org_id`) |

**Key relationships**:
- `account[]` — all accounts belonging to this entity
- `general_ledger[]` — GL entries for this entity
- `business_unit[]`, `department[]`, `cost_center[]` — organizational hierarchy

**Multi-entity rules**:
- One tenant (`org_id`) can have **multiple entities**
- Exactly **one entity** has `is_it_headquartres = "Yes"` — this is the HQ
- Each entity can have a **different base currency**
- All entities share master data (items, suppliers, customers) via `org_id`

### 2. Account (Chart of Accounts)

**Model**: `account` (data.prisma)

The account model serves dual purposes: it represents bank/financial accounts AND chart-of-accounts (COA) entries.

| Field | Purpose |
|-------|---------|
| `name` | Account name |
| `code` | Account code (e.g., "1000", "2100") |
| `account_number` | Numeric account number for ordering |
| `classification` | Enum: `Assets`, `Liabilities`, `Income`, `Expense`, `Equity` |
| `type[]` | Array of account types (flexible categorization) |
| `sub_type` | Further sub-classification |
| `balance` | Current balance (Decimal 19,4) |
| `currency` | Account currency |
| `is_active` | Soft delete / activation flag |
| `legal_entity_id` | FK to `entity` — which entity owns this account |
| `parent_account_id` | FK to self — builds account hierarchy (tree) |
| `hq_account_id` | FK to self — maps this entity account to the corresponding HQ account |

**Hierarchy relationships**:

```
HQ Account (parent)
├── HQ Sub-Account 1
│   ├── Entity A → Account mapped via hq_account_id
│   └── Entity B → Account mapped via hq_account_id
└── HQ Sub-Account 2
    ├── Entity A → Account mapped via hq_account_id
    └── Entity C → Account mapped via hq_account_id
```

**Two distinct hierarchies exist**:
1. **Parent-Child hierarchy** (`parent_account_id`): Builds the tree structure within an entity's own COA (e.g., Assets → Current Assets → Cash & Bank)
2. **HQ mapping** (`hq_account_id`): Maps entity-level accounts to the corresponding HQ-level account for consolidation purposes

**Self-relations**:
- `parent_account` / `child_accounts` — parent-child tree within COA
- `hq_account` / `hq_mapped_accounts` — entity-to-HQ mapping for consolidation

### 3. Posting (Journal Entries)

**Model**: `posting` (data.prisma)

Each posting represents a **single journal entry** in the double-entry system.

| Field | Purpose |
|-------|---------|
| `account_id` | FK to `account` — **debit account** |
| `credit_account_id` | FK to `account` — **credit account** |
| `amount` | Entry amount (Decimal 19,4) — same for both debit and credit |
| `posting_date` | When the entry is recorded |
| `value_date` | Economic date of the transaction |
| `posting_type` | Type classification |
| `description` | Entry description |
| `notes` | Additional notes |
| `status` | `ACTIVE`, `REVERSED`, etc. |
| `reversal_of_posting_id` | FK to original posting when this is a reversal |
| `reversed_at` | Timestamp of reversal |
| `category_id` | FK to `category` — transaction categorization |
| `invoice_id` | FK to `invoice` — source document reference |
| `reconciliation_status` | `UNMATCHED`, `SUGGESTED`, `MATCHED`, `CONFIRMED` |

**Double-entry mechanics**:
- Each posting has exactly one debit account and one credit account
- The `amount` field represents the value flowing from credit to debit
- For compound entries (multiple debits/credits), multiple posting records are created
- Debits increase Assets/Expenses, decrease Liabilities/Income/Equity
- Credits decrease Assets/Expenses, increase Liabilities/Income/Equity

**Posting relationships**:
- `account` (debit) / `credit_account` (credit) — the two sides of the entry
- `category` — for reporting categorization
- `trade` — one-to-one link when posting originates from a trade
- `holding` — reference to investment holding for income postings
- `payment_receipt` — one-to-one link for bank reconciliation

---

## Account Classification

The `account_classification` enum defines the five standard accounting categories:

| Classification | Normal Balance | Examples |
|---------------|---------------|----------|
| `Assets` | Debit | Cash, Bank Accounts, Receivables, Inventory |
| `Liabilities` | Credit | Payables, Loans, Accrued Expenses |
| `Equity` | Credit | Owner's Capital, Retained Earnings |
| `Income` | Credit | Revenue, Interest Income, Dividends |
| `Expense` | Debit | Operating Expenses, COGS, Depreciation |

---

## Multi-Entity Structure

### Tenant → Entity Hierarchy

```
Tenant (org_id: "org_xyz")
├── HQ Entity (is_it_headquartres: "Yes")
│   ├── HQ Chart of Accounts (consolidated view)
│   └── HQ Postings (HQ-level transactions + consolidated)
├── Entity A (is_it_headquartres: "No")
│   ├── Entity A Chart of Accounts
│   │   └── Each account has hq_account_id → maps to HQ COA
│   └── Entity A Postings (entity-level transactions)
├── Entity B (is_it_headquartres: "No")
│   ├── Entity B Chart of Accounts
│   │   └── Each account has hq_account_id → maps to HQ COA
│   └── Entity B Postings (entity-level transactions)
└── Shared Master Data (items, suppliers, customers, categories)
```

### HQ Account Mapping

The `hq_account_id` field on `account` creates a mapping from entity-level accounts to HQ-level accounts:

- **HQ accounts**: `hq_account_id` is NULL (they ARE the HQ accounts)
- **Entity accounts**: `hq_account_id` points to the corresponding HQ account
- **Multiple entity accounts** can map to the **same HQ account** (many-to-one)
- This mapping is the foundation for **consolidation** — summing entity balances at the HQ level

### Multi-Currency Considerations

- Each `entity` has a `basecurrency_id` (functional currency)
- Each `account` has a `currency` field
- The `exchange_rate` model stores rates with `from_currency`, `to_currency`, `effective_date`
- Rate types: `SPOT`, `CLOSING`, `AVERAGE`
- Consolidation requires currency translation when entity currency differs from HQ currency

---

## Supporting Models

### Category & Category Group

Used for transaction classification and reporting:
- `category_group` → groups related categories
- `category` → individual transaction categories with color coding
- Postings reference categories for financial reporting

### General Ledger

**Model**: `general_ledger` (zeiv.prisma)
- Links GL codes to accounts and legal entities
- `gl_code`, `gl_name`, `description`
- FK to both `account` and `emtity`

### Currency & Exchange Rates

**Model**: `currency` (data.prisma) — ISO 4217 currency reference
**Model**: `exchange_rate` (data.prisma) — historical exchange rates
- Unique per `[org_id, from_currency, to_currency, effective_date, rate_type]`
- Supports spot, closing, and average rates

---

## Key Business Rules

### Double-Entry Integrity
- Every posting must have both a debit account (`account_id`) and credit account (`credit_account_id`)
- The `amount` is always positive and represents the value transferred
- Debit total must equal credit total across all postings (enforced by the single-amount model)

### Account Hierarchy Rules
- An account can have at most one parent (`parent_account_id`)
- An account can have at most one HQ mapping (`hq_account_id`)
- HQ accounts should not have `hq_account_id` set (they are the target)
- Parent-child hierarchy is independent of HQ mapping

### Multi-Entity Rules
- All data is isolated by `org_id` (tenant level)
- Entity-specific data is further filtered by `legal_entity_id`
- Postings belong to an entity via their accounts' `legal_entity_id`
- Cross-entity transactions require inter-company postings (debit in one entity, credit in another)

### Reversal Rules
- Reversals create a new posting with `reversal_of_posting_id` pointing to the original
- Original posting's `status` changes to `REVERSED`
- `reversed_at` timestamp is set on the original

---

## Data Flow: Transaction Lifecycle

```
1. Transaction occurs (purchase, sale, payment, trade)
       ↓
2. Posting created with debit + credit accounts + amount
       ↓
3. Category assigned (manual or AI-categorized)
       ↓
4. Bank reconciliation matches posting to bank statement
       ↓
5. Posting confirmed (reconciliation_status = 'CONFIRMED')
       ↓
6. Available for financial reporting and consolidation
```

---

## Consolidation Feature

### Business Context

This app is used primarily as a **consolidation platform**. Subsidiary organizations do NOT maintain their bookkeeping in Fabriq — their books are kept in external systems. To consolidate at the HQ level, subsidiary trial balances are **imported** into Fabriq as postings, and the HQ trial balance is then computed by rolling up entity-level balances via the `hq_account_id` mapping.

### How It Works

```
Subsidiary (external bookkeeping)
    → Export Trial Balance as Excel
    → Upload to Fabriq (via chat agent or dedicated import page)
    → Python/Pandas parses Excel server-side → structured JSON
    → LLM sees ONLY a sample (~20 rows) to identify column mapping
    → Code applies mapping to ALL rows programmatically
    → Code matches accounts to existing entity accounts in Fabriq
    → Code flags unmatched accounts → user reviews / creates new accounts
    → Code generates CSV of balance postings
    → CSV imported via existing upload API
    → Repeat for each subsidiary
    → HQ consolidated trial balance computed by querying all entities
        (rolling up via hq_account_id, translating currency at query time)
```

### Trial Balance Excel Format

The input Excel varies by subsidiary but always contains:
- **Account name** (or code)
- **Debit balance** and **Credit balance** columns (for a specific period)
- Period is **specified by the user** (not extracted from the Excel)

Format variations handled: different column names, header row positions, subtotal rows, merged cells, multiple sheets, etc.

### Posting Logic: Balance Postings

Each line in the trial balance becomes **one posting** in Fabriq:

| TB Line | Posting Debit Account | Posting Credit Account | Amount |
|---------|----------------------|----------------------|--------|
| Account with **debit balance** | The subsidiary account | Consolidation Clearing account | Debit balance amount |
| Account with **credit balance** | Consolidation Clearing account | The subsidiary account | Credit balance amount |

**Consolidation Clearing Account**: Provided by the calling service/UI — not auto-created. The caller passes the clearing account ID as a parameter. This account nets to zero after all TB lines are imported (because total debits = total credits in a trial balance).

**Posting dates**: All postings use the period end date specified by the user as both `posting_date` and `value_date`.

### Currency Handling

- Postings are imported in the **subsidiary's original currency** (the account's `currency` field)
- **No currency conversion during import**
- Currency translation happens **at query time** when computing the consolidated HQ trial balance
- Translation uses `exchange_rate` model rates (CLOSING for Balance Sheet items, AVERAGE for P&L items)
- The `exchange_rate` table stores rates per `[org_id, from_currency, to_currency, effective_date, rate_type]`

### Account Matching

The service matches TB account names to existing accounts using the same pattern as the CSV import's lookup field resolution (`CsvMapper.tsx` lines 244-276):

1. **Collect unique account names** from the parsed trial balance rows
2. **Query via search API** with `in` operator — `viewAPI.search('account', 'account_view', ...)` filtering on `name` field with all unique names, scoped to the subsidiary's `legal_entity_id`
3. **Match results**: names found in the DB are resolved to their account IDs
4. **Flag unmatched**: names not returned by the query are flagged for user review (same `isNotAvailable` pattern as CsvMapper)

**Output when unmatched accounts exist**: Two JSON payloads are prepared:
1. **Accounts payload** — new accounts to create first (with suggested `hq_account_id` mapping, classification, parent)
2. **Postings payload** — the balance postings (created after accounts exist)

The service creates accounts first via `UploadService` / `dal.createMany`, then creates the postings. No intermediate CSV is needed — `UploadService.uploadCSV()` already accepts JSON arrays despite its name.

### Agent Implementation

The consolidation agent is available through **two interfaces**:

#### 1. Chat-Based (Agent Tool)
- User uploads Excel in the AI chat sidebar
- Agent analyzes the file, shows a summary of what it found
- Agent presents matched/unmatched accounts for review
- Agent produces downloadable CSV(s) for import
- User triggers import via the existing upload API

#### 2. Dedicated Import Page
- A consolidation import page/modal with:
  - Entity selection (which subsidiary)
  - Period date input
  - Excel upload
  - Agent analysis results display
  - Account matching review
  - Import trigger

Both interfaces use the **same backend agent tool/endpoint** underneath.

### Excel Processing Architecture

**Key Constraint**: Excel workbooks can be large (hundreds of rows, multiple sheets). Sending the entire binary to an LLM is impractical and wasteful. Excel files are already structured data — the LLM is only needed to understand the *format*, not to read every row.

#### Two-Phase Approach: Parse Programmatically, LLM for Intelligence Only

```
Phase 1: Server-side parsing (Python/Pandas child process)
    Input:  Excel file path
    Output: JSON to stdout
    {
      "sheets": ["Sheet1", "Trial Balance"],
      "headers": ["Particulars", "Dr. Amount (Rs.)", "Cr. Amount (Rs.)"],
      "sample_rows": [...first ~20 data rows...],
      "total_rows": 547,
      "all_rows": [...every row as arrays...]
    }
    ↓
Phase 2: LLM column mapping (small payload — only sample rows)
    Input:  headers + ~20 sample rows (~2-3KB of text)
    Output: column mapping + filter rules
    {
      "header_row": 3,
      "account_name_column": "Particulars",
      "debit_column": "Dr. Amount (Rs.)",
      "credit_column": "Cr. Amount (Rs.)",
      "skip_patterns": ["Total", "Grand Total", "---"],
      "currency_detected": "INR"
    }
    ↓
Phase 3: Apply mapping programmatically to ALL rows (pure code, no LLM)
    → Filter out subtotal/header rows using skip_patterns
    → Extract account name, debit, credit from mapped columns
    → Account matching (exact + fuzzy) against DB
    → Generate CSVs
```

#### Why Python/Pandas?

Pandas handles messy Excel files naturally — multi-sheet workbooks, merged cells, inconsistent headers, mixed data types, subtotal rows. Doing this in Node.js requires significant boilerplate.

#### Integration: Node.js ↔ Python Child Process

- Node spawns `python3 backend/scripts/parse_trial_balance.py <file_path>`
- Python script reads Excel with Pandas, outputs JSON to stdout
- Node captures stdout, parses JSON, continues with LLM + code pipeline
- Python + Pandas are added to the Docker image (minimal footprint)
- No separate service to deploy — fits the single-container Cloud Run setup

#### What the LLM Does vs. What Code Does

| Task | Who | Why |
|------|-----|-----|
| Parse Excel binary → structured rows | **Python/Pandas** | Structured data parsing, not an LLM task |
| Identify which column is account name, debit, credit | **LLM** | Format varies, needs intelligence to interpret headers |
| Detect header row position, subtotals to skip | **LLM** | Heuristic pattern recognition from sample |
| Apply column mapping to all 500+ rows | **Code** | Deterministic, no LLM needed |
| Match account names to DB accounts | **Code** | Exact + fuzzy string matching (Levenshtein) |
| Suggest HQ account mapping for new accounts | **LLM** (optional) | Can infer classification/mapping from account name |
| Generate posting CSVs | **Code** | Deterministic transformation |

### Leveraging Existing Infrastructure

| Capability | Existing Feature | How It's Reused |
|-----------|-----------------|-----------------|
| Excel parsing | New Python/Pandas script | `backend/scripts/parse_trial_balance.py` |
| Column mapping intelligence | LLM via existing `LLMService` | Small sample payload, structured output |
| Account matching | Search API with `in` operator (same as CsvMapper lookup resolution) | Query `account` model by `name` with `in` filter, scoped to `legal_entity_id` |
| Batch record creation | `UploadService.uploadCSV()` / `dal.createMany()` | Accepts JSON arrays directly — no CSV intermediate needed. Handles batching (1000/batch), metadata injection (org_id, created_by), and field transformation |
| Agent tool framework | `ToolManager` + agent tool factories | New `consolidationImport` tool registered in ToolManager |
| Chat UI with file upload | `ChatUI` file attachment + `ToolResponseRenderer` | Agent responds with analysis + download links |
| Import extensions | `ImportExtensionRegistry` pattern | New `ConsolidationImportExtension` for dedicated page |

### Data Model Support (Already Exists)

The existing data model fully supports this feature:

- **`entity.is_it_headquartres`** — identifies the HQ entity
- **`account.legal_entity_id`** — ties accounts to their entity
- **`account.hq_account_id`** — maps entity accounts to HQ accounts for roll-up
- **`account.classification`** — determines P&L vs BS for currency translation rate selection
- **`account.currency`** — stores the account's currency for translation
- **`posting.account_id` / `credit_account_id`** — double-entry with clearing account
- **`posting.posting_date`** — period end date for the trial balance
- **`exchange_rate`** — CLOSING/AVERAGE rates for currency translation at query time

### Consolidated Trial Balance Query

The HQ consolidated trial balance is computed by:

1. For each HQ account, sum all entity account balances where `hq_account_id` = HQ account ID
2. For accounts in a different currency than HQ:
   - **Balance Sheet** (Assets, Liabilities, Equity): Use CLOSING rate for the period end date
   - **P&L** (Income, Expense): Use AVERAGE rate for the period
3. Present the consolidated balances grouped by HQ account hierarchy

```sql
-- Conceptual query (simplified)
SELECT
  hq.id AS hq_account_id,
  hq.name AS hq_account_name,
  hq.classification,
  SUM(
    CASE
      WHEN a.currency = hq_org.base_currency THEN balance
      ELSE balance * er.rate  -- translate using appropriate rate
    END
  ) AS consolidated_balance
FROM account a
JOIN account hq ON a.hq_account_id = hq.id
LEFT JOIN exchange_rate er ON ...  -- match currency pair + date + rate_type
WHERE a.org_id = :tenant_org_id
GROUP BY hq.id, hq.name, hq.classification
ORDER BY hq.account_number;
```

### Service Architecture

Each service is independent, has a clear contract (input → output), and is testable in isolation with sample JSON — no database or LLM required for unit tests.

```
┌─────────────────────────────────────────────────────────────┐
│  Calling Layer (Agent Tool / API Endpoint / Import Page)    │
│  Provides: file, legalEntityId, clearingAccountId,          │
│            periodEndDate, orgId                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────▼──────────────┐
         │  ConsolidationOrchestrator  │
         │  Coordinates the pipeline   │
         └─────────────┬──────────────┘
                       │
        ┌──────────────┼──────────────────┐
        ▼              ▼                  ▼
┌──────────────┐ ┌───────────────┐ ┌──────────────────┐
│ ExcelParser  │ │ ColumnMapper  │ │ TrialBalanceSvc  │
│ (Python/     │ │ (LLM-based)   │ │ (pure logic)     │
│  Pandas)     │ │               │ │                  │
│              │ │ Input: headers│ │ Input: mapped    │
│ Input: file  │ │ + sample rows │ │ rows + accounts  │
│ Output: JSON │ │ Output: column│ │ + clearingAcctId │
│ (sheets,     │ │ mapping       │ │ Output: postings │
│  headers,    │ │               │ │ JSON array       │
│  all rows)   │ │               │ │                  │
└──────────────┘ └───────────────┘ └──────────────────┘
                                          │
                              ┌───────────┼────────────┐
                              ▼           ▼            ▼
                     ┌──────────┐ ┌────────────┐ ┌──────────┐
                     │ Account  │ │ Posting    │ │ Unmatched│
                     │ Matcher  │ │ Builder    │ │ Reporter │
                     │          │ │            │ │          │
                     │ Input:   │ │ Input:     │ │ Input:   │
                     │ names[]  │ │ TB rows +  │ │ names not│
                     │ + entity │ │ matched    │ │ found    │
                     │ Output:  │ │ accounts + │ │ Output:  │
                     │ matched/ │ │ clearing   │ │ accounts │
                     │ unmatched│ │ acct ID    │ │ JSON for │
                     │ map      │ │ Output:    │ │ review/  │
                     │          │ │ posting[]  │ │ creation │
                     └──────────┘ └────────────┘ └──────────┘
```

#### Service Contracts

**1. ExcelParser** (`backend/scripts/parse_trial_balance.py`)
```
Input:  file path (string)
Output: JSON to stdout
{
  "sheets": ["Sheet1", "Trial Balance"],
  "headers": ["Particulars", "Dr. Amount (Rs.)", "Cr. Amount (Rs.)"],
  "sample_rows": [...first ~20 rows...],
  "total_rows": 547,
  "all_rows": [[row1_col1, row1_col2, ...], ...]
}
```
- Pure Python/Pandas — no DB, no LLM
- Testable with any Excel file

**2. ColumnMapper** (`backend/src/services/consolidation/ColumnMapper.ts`)
```
Input:  { headers: string[], sampleRows: any[][] }
Output: {
  accountNameColumn: string,
  debitColumn: string,
  creditColumn: string,
  skipPatterns: string[],     // e.g., ["Total", "Grand Total"]
  currencyDetected?: string
}
```
- Uses LLM to interpret column structure from a small sample
- Testable with mock LLM responses

**3. AccountMatcher** (`backend/src/services/consolidation/AccountMatcher.ts`)
```
Input:  { accountNames: string[], legalEntityId: string }
Output: {
  matched: Map<string, { id: string, name: string, hqAccountId?: string }>,
  unmatched: string[]
}
```
- Uses search API with `in` operator (same pattern as CsvMapper)
- Testable with mock search results

**4. PostingBuilder** (`backend/src/services/consolidation/PostingBuilder.ts`)
```
Input:  {
  rows: { accountName: string, debit: number, credit: number }[],
  accountMap: Map<string, { id: string }>,
  clearingAccountId: string,
  periodEndDate: string
}
Output: {
  postings: {
    account_id: string,
    credit_account_id: string,
    amount: number,
    posting_date: string,
    value_date: string,
    description: string
  }[]
}
```
- **Pure function** — no DB, no LLM, no side effects
- Testable with sample JSON input directly

**5. UnmatchedReporter** (`backend/src/services/consolidation/UnmatchedReporter.ts`)
```
Input:  { unmatchedNames: string[], legalEntityId: string }
Output: {
  accounts: {
    name: string,
    legal_entity_id: string,
    classification?: string,    // suggested by LLM (optional)
    hq_account_id?: string      // suggested by LLM (optional)
  }[]
}
```
- Generates account creation payloads for unmatched TB lines
- LLM suggestion of classification/HQ mapping is optional (Phase 2)
- Testable with plain string arrays

**6. ConsolidationOrchestrator** (`backend/src/services/consolidation/ConsolidationOrchestrator.ts`)
```
Input:  {
  filePath: string,
  legalEntityId: string,
  clearingAccountId: string,
  periodEndDate: string,
  orgId: string
}
Output: {
  summary: { totalRows, matchedAccounts, unmatchedAccounts, postingsCreated },
  unmatchedAccounts?: { name, suggestedClassification }[],
  status: 'complete' | 'needs_review'
}
```
- Orchestrates: ExcelParser → ColumnMapper → AccountMatcher → PostingBuilder → UploadService
- If unmatched accounts exist: returns `needs_review` with unmatched list
- If all matched: creates postings via `UploadService` / `dal.createMany()`, returns `complete`

### Test Plan

#### Unit Tests (No DB, No LLM)

**`PostingBuilder.test.ts`** — the core pure-logic service
```typescript
// Test with sample JSON — no mocks needed
const input = {
  rows: [
    { accountName: "Cash", debit: 50000, credit: 0 },
    { accountName: "Revenue", debit: 0, credit: 30000 },
    { accountName: "Rent Expense", debit: 30000, credit: 0 },
    { accountName: "Equity", debit: 0, credit: 50000 },
  ],
  accountMap: new Map([
    ["Cash", { id: "acco_001" }],
    ["Revenue", { id: "acco_002" }],
    ["Rent Expense", { id: "acco_003" }],
    ["Equity", { id: "acco_004" }],
  ]),
  clearingAccountId: "acco_clearing_001",
  periodEndDate: "2026-03-31",
};
// Assert: 4 postings, debits use account_id, credits use credit_account_id
// Assert: clearing account on opposite side of each posting
// Assert: total debits = total credits (TB balances)
// Assert: all postings have correct dates and descriptions
```

Test cases:
- TB with all accounts matched → postings array generated correctly
- Debit balance account → debit account_id = entity account, credit_account_id = clearing
- Credit balance account → debit account_id = clearing, credit_account_id = entity account
- Zero balance rows → skipped
- Amounts are positive decimals (Decimal 19,4 compatible)
- Description includes account name and period reference
- Empty input → empty output

**`AccountMatcher.test.ts`** — mock search API
```typescript
// Mock viewAPI.search to return known accounts
// Test: all names found → all in matched map, unmatched is empty
// Test: some names not found → split correctly between matched/unmatched
// Test: no names found → all in unmatched
// Test: duplicate names in input → deduplicated
// Test: case sensitivity handling
```

**`UnmatchedReporter.test.ts`** — pure transformation
```typescript
// Test: generates account creation payloads with correct legal_entity_id
// Test: empty unmatched list → empty output
```

**`ColumnMapper.test.ts`** — mock LLM response
```typescript
// Test: standard headers ["Account", "Debit", "Credit"] → correct mapping
// Test: non-English headers → LLM maps correctly (mock response)
// Test: LLM returns invalid column name → error handled
```

**`ExcelParser` (Python)** — `test_parse_trial_balance.py`
```python
# Test: standard Excel with single sheet → correct JSON structure
# Test: multi-sheet workbook → all sheets listed, data from correct sheet
# Test: Excel with merged cells → handled gracefully
# Test: Excel with empty rows → included in output (filtering is done later)
# Test: large file (1000+ rows) → all rows in output
# Test: file not found → error JSON on stderr
```

#### Integration Tests (With DB, Mock LLM)

**`ConsolidationOrchestrator.integration.test.ts`**
```typescript
// Test: full pipeline with sample Excel → postings created in DB
// Test: unmatched accounts → returns needs_review status
// Test: after creating unmatched accounts, re-run → completes
// Test: clearing account ID is invalid → error
// Test: legal entity ID is invalid → error
```

#### End-to-End Tests

**`consolidation-agent.e2e.test.ts`**
```typescript
// Test: upload Excel via chat agent → postings created
// Test: upload Excel with unmatched accounts → agent reports unmatched
```

### What Needs to Be Built

1. **`parse_trial_balance.py`** — Python/Pandas script (child process, JSON to stdout)
2. **`ColumnMapper`** — LLM-based column identification from sample rows
3. **`AccountMatcher`** — search API with `in` operator, returns matched/unmatched map
4. **`PostingBuilder`** — pure function: TB rows + account map + clearing account ID → postings array
5. **`UnmatchedReporter`** — generates account creation payloads for unmatched names
6. **`ConsolidationOrchestrator`** — coordinates the full pipeline, calls `UploadService` for DB writes
7. **Consolidation agent tool** — new tool in `ToolManager` for chat-based flow
8. **Docker image update** — add Python 3 + Pandas to the container
9. **Tests** — unit tests for each service, integration test for orchestrator, e2e for agent tool
10. **Dedicated import page** (Phase 2) — UI for consolidation workflow
11. **Consolidated TB query** (Phase 2) — analytics query for HQ consolidated trial balance with currency translation
