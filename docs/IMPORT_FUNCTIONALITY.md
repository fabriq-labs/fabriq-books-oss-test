# Import Functionality Documentation

## Overview

The Fabriq Books application provides two complementary import systems:

1. **Generic UI Import** — metadata-driven CSV and PDF import that works with any model/view combination, driven entirely by view metadata. Used from the browser.

2. **Bank Statement Import Pipeline** — a dedicated server-side pipeline for bulk importing bank statements (PDF or CSV) via a single combined API endpoint. Used by the CLI script, MCP clients, and automated workflows.

**Key Characteristics (Generic Import)**:
- **Metadata-Driven**: Field definitions, permissions, and validation rules come from view metadata
- **Generic**: Works with any model type (posting, account, category, etc.) without code changes
- **Flexible**: Supports custom data transformation via `updateCSVData` function
- **Relationship-Aware**: Handles lookup fields via frontend CSVMapper validation

**Key Characteristics (Bank Statement Import Pipeline)**:
- **Server-Side Pipeline**: All extraction, mapping, relationship resolution, and insert logic runs in-process — no client-side orchestration
- **SSE Streaming**: Streams real-time progress events back on the same HTTP connection
- **Double-Entry Correct**: Enforces standard bookkeeping conventions for debit/credit mapping
- **CSV + PDF**: Single endpoint handles both file types; routes internally by MIME type
- **AI Categorisation**: Optional LLM-predicted contra-accounts scoped to a Chart of Accounts

## Table of Contents

1. [Architecture](#architecture)
2. [Frontend Components](#frontend-components)
3. [Backend Services](#backend-services)
4. [Generic Import Flow](#generic-import-flow)
5. [Bank Statement Import Pipeline](#bank-statement-import-pipeline)
6. [API Endpoints](#api-endpoints)
7. [Field Mapping](#field-mapping)
8. [Lookup Fields and Relationship Resolution](#lookup-fields-and-relationship-resolution)
9. [Error Handling](#error-handling)
10. [Usage Examples](#usage-examples)

---

## Architecture

### Generic Import (Browser)

```
User → ImportPannel → CSVMapper / UploadManager
                           ↓
              POST /api/{model}/view/{viewId}/upload
                           ↓
                      UploadService (batch insert)
```

**Frontend** (`frontend-1/src/components/import/`):
- **ImportPannel**: Main import interface (works with any model)
- **CSVMapper**: CSV mapping and validation interface
- **UploadManager**: File upload modal with optional relationship selection

**Backend** (`backend/src/services/upload/`):
- **UploadService**: Generic singleton service; batch-inserts CSV data for any model

### Bank Statement Import Pipeline (Server-Side)

```
CLI / API client
       ↓
POST /api/posting/custom/import-bank-statement  (multipart + SSE)
       ↓
postingCustomActions.ts  (validates form fields, opens SSE)
       ↓
PostingImportService.importBankStatement()
   ├── PDF branch:
   │     ModelService.parseDocument('posting' | 'posting_with_categorization')
   │             ↓ LLM extraction
   │     applyCategorizations()  (optional — merges LLM predictions)
   │     mapPdfRow()             (debit/credit convention)
   │     UploadService.uploadCSV()
   │
   └── CSV branch:
         parseCsvBuffer()          (csv-parser, stream-wrapped)
         applyColumnMapping()      (rename CSV headers → posting fields)
         RelationshipResolverService.resolve()  (codes → DB IDs)
         mapCsvRow()               (debit/credit convention)
         UploadService.uploadCSV()
```

**New backend files**:
- `backend/src/rest/customActionRegistry.ts` — dispatch registry for `/:model/custom/:action` endpoints
- `backend/src/rest/postingCustomActions.ts` — SSE handler, registers `posting/import-bank-statement`
- `backend/src/services/posting/PostingImportService.ts` — combined pipeline service
- `backend/src/services/RelationshipResolverService.ts` — generic code/name → ID batch resolver

---

## Frontend Components

### ImportPannel Component

**Location**: `frontend-1/src/components/import/ImportPannel.tsx`

The main import interface that provides:

1. **File Upload Options**: CSV file upload, PDF file upload (with extraction), sample CSV download
2. **Key Features**:
   - Generates sample CSV templates based on field metadata
   - Handles CSV parsing and validation
   - Manages upload state and progress
   - Supports relationship fields (parent-child relationships)

3. **Props**:
   ```typescript
   {
     modelType: string;        // Any model type: "posting", "account", "category", etc.
     modelView: string;        // Corresponding view: "posting_view", "account_view", etc.
     relation?: string;        // Optional: Related model type for parent selection
     relationField?: string;   // Optional: Relationship field display name
     relationFieldId?: string; // Optional: Relationship field ID (e.g., "account_id")
     metaData: any;            // Field metadata from view
     onDiscard: () => void;
     onUploadComplete: (data: any) => void;
     updateCSVData?: (formattedData: any, relationId: any) => any;
     onList?: () => void;
   }
   ```

4. **`updateCSVData` — Custom Data Transformation**:

   Allows model-specific data transformation before sending to the backend. Receives data *after* field mapping and lookup resolution.

   ```typescript
   type UpdateCSVDataFunction = (
     formattedData: {
       data: Record<string, any>[];
       mapping: Record<string, string>;
       parentData?: Record<string, any>;
       isJSON: boolean;
     },
     relationId?: string
   ) => typeof formattedData
   ```

   **When to use**:
   - Converting field values to required types (e.g., comma-separated → arrays)
   - Adding computed fields or default values
   - Conditional logic based on parent record selection

   **Example** (for account import with type field):
   ```typescript
   const updateCSVData = (formattedData: any) => {
     formattedData.data = formattedData.data.map((record: any) => {
       if (record.type && typeof record.type === 'string') {
         record.type = record.type.split(',').map((t: string) => t.trim());
       }
       return record;
     });
     return formattedData;
   };
   ```

   > **Note for posting transactions**: The debit/credit to `account_id`/`credit_account_id` conversion is now handled server-side by `PostingImportService`. The `updateCSVData` hook is no longer needed for standard posting imports via the bank statement import endpoint.

### CSVMapper Component

**Location**: `frontend-1/src/components/import/CsvMapper.tsx`

1. **Maps CSV Columns to Database Fields**: Dropdown selectors, auto-matching by display name
2. **Data Validation**: Required field validation, lookup field validation ("Not Available" badges)
3. **Data Management**: Row selection, bulk operations, pagination
4. **Upload Process**: Validates required fields and lookup values, transforms data, sends to backend
5. **Posting Categorize Action**: For posting imports, the **Categorize** toolbar action now operates on **selected rows only**. If no rows are selected, the button is disabled and shows a tooltip hint to select rows first.

### UploadManager Component

**Location**: `frontend-1/src/components/import/UploadManager.tsx`

Modal component for file selection with optional parent record selection dropdown. When a record is selected, the full item object (including all fields like `legal_entity_id`) is passed to the parent — not just the ID.

For posting PDF imports, this modal now includes an **Advanced options** toggle with a processing mode selector:

- **Extract only** — calls `POST /api/parse-document/posting`, then categorization can be run later from the CSV mapper **Categorize** button.
- **Extract + Categorize** — calls `POST /api/parse-document/posting_with_categorization` during extraction, returning initial `categorizations[]` alongside `transactions[]`.

Default mode for posting PDF uploads is **Extract + Categorize**.

### Import Extension Hooks

Extensions can provide model-specific functionality without modifying generic components:

1. **`getPdfUploadOptions(context: PdfUploadContext)`**: Extracts options from UI context for PDF processing (e.g., `legalEntityId` from `relationSelection.item.legal_entity_id`)
2. **`handlePdfUpload(file, options)`**: Custom PDF processing logic
3. **`getColumns(context)`**: Provide additional columns for CSV mapper
4. **`renderToolbarActions(context)`**: Add toolbar buttons

**Location**: `frontend-1/src/features/import-extensions/types.ts` and `frontend-1/src/features/import-extensions/posting/index.tsx`

---

## Backend Services

### UploadService

**Location**: `backend/src/services/upload/UploadService.ts`

Generic singleton service that handles CSV data uploads for any model:

```typescript
class UploadService {
  async uploadCSV(
    modelName: string,   // Any model: "posting", "account", "category", etc.
    context: AuthContext,
    request: UploadRequest
  ): Promise<DataAccessResult<{ count: number }>>
}
```

- **Batch processing**: 1000 records per batch
- **Automatic metadata injection**: Adds `org_id`, `created_by`, `modified_by`
- **Transaction-based**: Ensures consistency
- **Model-agnostic**: Works with any Prisma model via `DataAccessLayer`

**Request format**:
```typescript
{
  data: Record<string, any>[];
  mapping: Record<string, string>;  // field → field (1:1 after prior transformation)
  parentData?: Record<string, any>;
}
```

### RelationshipResolverService

**Location**: `backend/src/services/RelationshipResolverService.ts`

Generic service that batch-resolves code/name values to database IDs before data reaches `UploadService`. Used by `PostingImportService` in the CSV branch to resolve account codes in imported CSVs.

**How it works**:

1. **Read selectProps from view's data_graph**: Finds all fields with `columnType: "select"` and extracts their `selectProps` (`instanceType`, `searchParams`, `instanceKey`, `instanceSourceKey`).

2. **One batch query per `(instanceType, searchField)` pair** — not one query per row. For example, if 100 CSV rows all reference account codes, a single `WHERE code IN (...)` query resolves them all.

3. **Scoped by `org_id`**: All lookups are filtered to the user's organisation.

4. **Fail-fast**: The first unresolvable value throws `RelationshipResolutionError` with the offending row and spec, so callers get actionable feedback without silently inserting bad data.

5. **Empty values pass through**: `null` / `""` in a row field means the relationship is optional — left untouched.

```typescript
const result = await RelationshipResolverService.getInstance().resolve({
  data: csvRows,
  viewName: 'posting_view',
  modelName: 'posting',
  context,
});
// result.data: rows with account codes rewritten to DB IDs
// result.resolvedFieldCount: how many fields were resolved
```

**SelectProps convention** (from view's `data_graph`):
```json
{
  "account_id": {
    "tableProps": {
      "columnType": "select",
      "selectProps": {
        "instanceType": "account",
        "searchParams": "code",
        "instanceKey": "id",
        "instanceSourceKey": "account_id"
      }
    }
  }
}
```

This service has no knowledge of the posting domain — it works with any view that follows the `selectProps` convention.

### PostingImportService

**Location**: `backend/src/services/posting/PostingImportService.ts`

Singleton service that owns the full bank statement import pipeline. Called by the SSE route handler with zero HTTP calls — all in-process.

**Interface**:

```typescript
export interface ImportBankStatementOptions {
  fileBuffer: Buffer;
  mimeType: string;
  fileSize: number;
  fileName: string;
  accountId: string;
  viewId?: string;          // default: 'posting_view'
  dryRun?: boolean;
  columnMapping?: Record<string, string>;  // required for CSV
  categorize?: boolean;     // PDF only
  legalEntityId?: string;   // required when categorize=true; accepts ID or name
  onProgress?: ProgressCallback;
}

export type ImportStep = 'extracting' | 'mapping' | 'importing' | 'complete' | 'error';

export interface ImportProgress {
  step: ImportStep;
  message: string;
  count?: number;
  error?: string;
}
```

**Exported pure helpers** (also used by tests):
- `parseCsvBuffer(buffer)` — wraps `csv-parser` in a Promise, returns rows
- `applyColumnMapping(rows, mapping)` — renames CSV headers, converts numerics, strips commas
- `mapPdfRow(row, accountId)` — applies debit/credit convention for PDF rows
- `mapCsvRow(row, accountId)` — applies debit/credit convention for CSV rows
- `applyCategorizations(transactions, categorizations)` — merges LLM predictions (confidence ≥ 0.5)

### CustomActionRegistry

**Location**: `backend/src/rest/customActionRegistry.ts`

Dispatch registry for `/:model/custom/:action` endpoints. Custom actions are registered at startup and dispatched by a single catch-all route in `routes.ts` that sits **before** the auto-generated model loops, preventing Express from misrouting these paths as `/:id/:relation` patterns.

```typescript
customActionRegistry.register('posting', 'import-bank-statement', handler);

// Dispatched from routes.ts:
router.all('/:model/custom/:action', authMiddleware, upload.any(), async (req, res) => {
  const handler = customActionRegistry.resolve(req.params.model, req.params.action);
  if (!handler) return res.status(404).json({ error: `No custom action: ...` });
  await handler(req, res);
});
```

To add a new custom action for any model, register it in a new `*CustomActions.ts` file and import that file from `src/index.ts`.

### Legacy Upload Service

**Location**: `backend/uploadService.ts`

An older upload service with streaming support (`uploadJSON`, `uploadFile`, `uploadPDF`). Still functional but not used by the bank statement import pipeline. The background-task PDF approach in `uploadPDF` is superseded by the synchronous SSE approach in `PostingImportService`.

---

## Generic Import Flow

The standard flow for any model via the browser UI:

1. **User Initiates Import**: Clicks "Import" on any list page → `ImportPannel` fetches view metadata
2. **Parent Record Selection** (optional): If `relation` prop is set, user can pick a parent record before uploading
3. **File Selection**: CSV or PDF, via `UploadManager`
4. **CSV Processing**: Parsed by `react-papaparse`, headers and rows extracted
5. **Field Mapping**: User maps CSV columns → database fields (only `permission: "update"` fields shown)
6. **Data Validation**: Required fields checked; lookup values validated against DB ("Not Available" badges)
7. **Data Transformation Pipeline**:
   - Field mapping: CSV column names → DB field names
   - Lookup resolution: display names resolved to IDs (via CSVMapper queries)
   - Parent data merging: `parentData: { [relationFieldId]: relationId }` merged with each record
   - Custom transformation: `updateCSVData(formattedData, relationId)` if provided
   - Metadata injection (backend): `org_id`, `created_by`, `modified_by`
8. **Upload**: `POST /api/{modelType}/view/{viewId}/upload`, batch processed (1000/batch)
9. **Completion**: Success message shown, list refreshed

### Upload Button Conditions

Enabled only when **all** of the following are met:

1. All fields with `required: true && permission: "update"` are mapped
2. No rows have unresolvable lookup values ("Not Available")

```typescript
const isUploadButtonEnabled = () => {
  const requiredFields = Object.entries(filedSets)
    .filter(([, value]: any) => value?.required === true && value?.permission === "update")
    .map(([key]) => key);
  const allRequiredFieldsMapped = requiredFields.every((field) => selectedValues.includes(field));
  const noNotAvailableRows = !hasNotAvailableRows();
  return allRequiredFieldsMapped && noNotAvailableRows;
};
```

### PDF Import via Generic Flow

When a PDF is uploaded through the generic `ImportPannel`:
1. `extension.getPdfUploadOptions()` extracts options from `relationSelection`
2. For posting imports, user can open **Advanced options** in the upload modal and choose:
   - **Extract only** → `POST /api/parse-document/posting`
   - **Extract + Categorize** → `POST /api/parse-document/posting_with_categorization`
   For non-posting imports, file is sent to `POST /api/parse-document/{modelName}`.
3. `ModelService.parseDocument` → extractor registry → `BaseDocumentExtractor`
4. LLM extracts transactions; response: `{ success, data: { transactions: [...] }, metaData }` (and for posting-with-categorization: `categorizations[]`)
5. Frontend converts extracted transactions to a CSV blob → kicks off the CSV mapping flow
6. User reviews field mappings and uploads via standard CSV path

This two-step flow (extract → review → upload) is distinct from the bank statement import pipeline, which is fully server-side and non-interactive.

---

## Bank Statement Import Pipeline

### Debit / Credit Convention

The pipeline uses **double-entry bookkeeping conventions**. Bank statement labelling and bookkeeping entries go in opposite directions:

```
Bank statement "Debit" (withdrawal — money LEAVING the account)
┌────────────────────────────────────────────────────────────────────────┐
│  DR  Expense / contra account  →  account_id                           │
│  CR  Bank account              →  credit_account_id  (asset decreases) │
└────────────────────────────────────────────────────────────────────────┘

Bank statement "Credit" (deposit — money ENTERING the account)
┌────────────────────────────────────────────────────────────────────────┐
│  DR  Bank account              →  account_id         (asset increases) │
│  CR  Revenue / contra account  →  credit_account_id                    │
└────────────────────────────────────────────────────────────────────────┘
```

**Practical rules**:
- A CSV row with `debit_amount` present → bank account goes in `credit_account_id`; expense contra-account (if known) goes in `account_id`
- A CSV row with `credit_amount` present → bank account goes in `account_id`; revenue contra-account (if known) goes in `credit_account_id`

**For CSV column_mapping**: contra-account columns should target:
- `"account_id"` → expense/debit side (money going out)
- `"credit_account_id"` → revenue/credit side (money coming in)

Never map any column to `"amount"` directly — use `"debit_amount"` or `"credit_amount"` to preserve directionality.

### SSE Progress Events

The endpoint streams `text/event-stream` progress events on the same HTTP connection. Each event is a JSON object:

```
data: {"step":"extracting","message":"Extracting transactions from PDF…"}

data: {"step":"mapping","message":"Mapping 12 transaction(s) to posting fields…","count":12}

data: {"step":"importing","message":"Uploading 12 transaction(s)…","count":12}

data: {"step":"complete","message":"Imported 12 transaction(s).","count":12}

data: {"type":"result","success":true,"count":12}
```

On failure:
```
data: {"step":"error","message":"Cannot resolve account_id value \"5999\": ...","error":"..."}
```

### PDF Import Branch

1. **Extract**: `ModelService.parseDocument('posting', context, buffer, options)` → `BankStatementExtractor` → LLM returns `{ transactions: [...] }`
2. **Apply categorizations** (if `categorize=true`): merge LLM predictions from `categorizations[]`
3. **Map**: `mapPdfRow(row, accountId)` applies the debit/credit convention
4. **Insert**: `UploadService.uploadCSV('posting', context, { data: mapped, mapping })`

### CSV Import Branch

1. **Validate** `columnMapping` is present; forbid mapping any column to `"amount"`; require at least one of `debit_amount`/`credit_amount`
2. **Parse**: `parseCsvBuffer(buffer)` — wraps `csv-parser` in a stream-based Promise
3. **Apply column mapping**: `applyColumnMapping(rows, columnMapping)` — renames headers, converts numeric strings (strips commas), drops rows where both `debit_amount` and `credit_amount` are zero/absent
4. **Resolve relationships**: `RelationshipResolverService.resolve({ data, viewName: 'posting_view', modelName: 'posting', context })` — batch-resolves account codes (e.g., `5201`) to DB IDs (e.g., `acco_org_xxx_5201`) using the view's `selectProps`
5. **Map**: `mapCsvRow(row, accountId)` applies the debit/credit convention
6. **Insert**: `UploadService.uploadCSV('posting', context, { data: mapped, mapping })`

### AI Categorisation (PDF only)

When `categorize=true` and `legalEntityId` is provided:

1. Service routes to `ModelService.parseDocument('posting_with_categorization', ...)` instead of `'posting'`
2. `BankStatementWithCategorizationExtractor` augments the LLM prompt with the full Chart of Accounts for the legal entity, asking it to predict the contra-account for each transaction
3. The extractor returns an additional `categorizations[]` array:
   ```json
   [
     { "transaction_index": 0, "account_id": "acco_xxx_5201", "confidence_score": 0.92 },
     { "transaction_index": 2, "account_id": "acco_xxx_4001", "confidence_score": 0.45 }
   ]
   ```
4. `applyCategorizations(transactions, categorizations)` merges predictions where `confidence_score >= 0.5`:
   - Debit rows: predicted `account_id` → expense side (debit)
   - Credit rows: predicted `account_id` → `credit_account_id` (revenue side)
5. Low-confidence predictions are silently ignored (rows remain with `account_id = null`)

**`legalEntityId` resolution**: If the value looks like a name (doesn't match `/^[a-z_]+[0-9_]+/`), the service does a DB lookup by `legal_name` in the `legal_entity` table scoped to `org_id`.

### CLI Script

**Location**: `backend/scripts/import-bank-statements.ts`

A thin CLI wrapper (~250 lines) that authenticates, discovers files in a folder, and POSTs each to the combined endpoint with SSE streaming. All extraction, mapping, and insert logic lives in the server.

```bash
# CSV import (no contra-account codes)
npx ts-node scripts/import-bank-statements.ts \
  -k fabriq-us-ca-demo-user_daniel_lee \
  -f test-data/us-ca-bank-import \
  -a acco_org_techflow_us_1102 \
  --column-mapping '{"Value Date":"value_date","Description":"description","Debit":"debit_amount","Credit":"credit_amount"}'

# CSV import with expense account codes resolved server-side
npx ts-node scripts/import-bank-statements.ts \
  -k fabriq-us-ca-demo-user_daniel_lee \
  -f ./statements \
  -a acco_org_techflow_us_1102 \
  --column-mapping '{"Date":"value_date","Desc":"description","Amount":"debit_amount","Expense Code":"account_id"}'

# PDF import with AI categorisation
npx ts-node scripts/import-bank-statements.ts \
  -k fabriq-us-ca-demo-user_daniel_lee \
  -f test-data/us-ca-bank-import/pdf-categorization-only \
  -a acco_org_techflow_us_1102 \
  --categorize --legal-entity-id le_org_techflow_us_001

# Dry run (parse and validate only, no DB insert)
npx ts-node scripts/import-bank-statements.ts ... --dry-run
```

---

## API Endpoints

### Bank Statement Import (Combined Pipeline)

**Endpoint**: `POST /api/posting/custom/import-bank-statement`

**Authentication**: Required (Bearer token or `X-API-Key`)

**Request**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | PDF or CSV bank statement |
| `account_id` | string | Yes | Bank/statement account ID |
| `view_id` | string | No | Default: `posting_view` |
| `dry_run` | boolean | No | Parse only, skip insert |
| `column_mapping` | JSON string | CSV only | CSV header → posting field mapping |
| `categorize` | boolean | PDF only | Enable AI categorisation |
| `legal_entity_id` | string | When categorize=true | Legal entity ID or name |

**Response**: `text/event-stream` (SSE)

```
data: {"step":"extracting","message":"Extracting transactions from PDF…"}
data: {"step":"mapping","message":"Mapping 12 transaction(s) to posting fields…","count":12}
data: {"step":"importing","message":"Uploading 12 transaction(s)…","count":12}
data: {"step":"complete","message":"Imported 12 transaction(s).","count":12}
data: {"type":"result","success":true,"count":12}
```

Pre-SSE validation errors (before `flushHeaders()`) are returned as JSON:
```json
{ "error": "account_id is required" }
```

### Upload CSV (Generic)

**Endpoint**: `POST /api/{modelType}/view/{viewId}/upload`

**Request Body**:
```json
{
  "data": [{ "column1": "value1" }],
  "mapping": { "column1": "field_name_1" },
  "parentData": { "parent_field": "parent_id" },
  "isJSON": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully created 150 records",
  "data": { "count": 150 },
  "metaData": { ... }
}
```

### PDF Extraction (Generic)

**Endpoint**: `POST /api/parse-document/{modelName}`

**Request**: `multipart/form-data` with `file` field (PDF, max 10MB)

**Response**:
```json
{
  "success": true,
  "data": {
    "transactions": [
      { "value_date": "2024-01-15", "description": "Office Supplies", "debit_amount": 150.00 }
    ]
  },
  "metaData": {
    "confidence": 85,
    "processingTime": 1234,
    "extractorType": "BankStatementExtractor"
  }
}
```

---

## Field Mapping

Field mapping is **completely metadata-driven** for the generic import flow.

1. **Available Fields**: Only fields with `permission === "update"` from view metadata
2. **Automatic Matching**: Case-insensitive match by `displayName`
3. **Mapping Format**: `{ "CSV Column Name": "database_field_name" }`
4. **Sample CSV Generation**: Based on view metadata field types (numbers: `0.00`, dates: ISO, booleans: `true`/`false`)

### Metadata-Driven Field Properties

- **`required: true`** — must be mapped for upload button to enable
- **`permission: "update"`** — field is available for mapping
- **`tableProps.columnType === "select"`** — triggers lookup validation (frontend) or relationship resolution (server-side)
- **`tableProps.selectProps`** — drives `RelationshipResolverService` (see below)

---

## Lookup Fields and Relationship Resolution

### Frontend Lookup Validation (Generic Import)

Used in `CSVMapper` during the interactive mapping flow:

1. Fields with `tableProps.columnType === "select"` are identified as lookup fields
2. Unique values from the CSV column are extracted and queried against the DB
3. Non-matching values are marked "Not Available" (red badge)
4. Upload button is disabled until all lookup values resolve

**Resolution**: CSV display values (e.g., `"Cash on Hand"`) → DB IDs (e.g., `"acco_123-456"`) using `instanceLabel` from `selectProps` (typically `"name"`).

### Server-Side Relationship Resolution (Bank Statement Import)

Used by `PostingImportService` in the CSV branch. Resolves codes (not display names) to DB IDs server-side, in bulk.

**`selectProps` configuration** (in view's `data_graph`):
```json
{
  "account_id": {
    "tableProps": {
      "columnType": "select",
      "selectProps": {
        "instanceType": "account",
        "searchParams": "code",
        "instanceKey": "id",
        "instanceSourceKey": "account_id"
      }
    }
  }
}
```

**How `RelationshipResolverService` uses this**:
- `instanceType` → Prisma model to query (`account`)
- `searchParams` → field to match the CSV value against (`code`, e.g., `"5201"`)
- `instanceKey` → field to use as the resolved ID (`id`, e.g., `"acco_org_techflow_us_1102"`)
- `instanceSourceKey` → field in the data row to rewrite (`account_id`)

**Batching**: all unique values for a given `(instanceType, searchField)` pair are resolved in one `WHERE code IN (...)` query, regardless of row count.

**Error**: `RelationshipResolutionError` — includes the offending row and spec for actionable feedback.

---

## Error Handling

### Frontend
- File validation (headers, data rows, file type)
- Mapping validation (required fields, no duplicates, lookup values must exist)
- Upload errors displayed inline

### Backend (Generic Upload)
- Missing required fields, invalid data types, foreign key violations
- Transaction errors, timeout errors (100 second limit)

### Backend (Bank Statement Import)
- Pre-SSE validation (missing `account_id`, missing `file`, missing `column_mapping` for CSV, invalid JSON in `column_mapping`) → JSON 400 response
- Post-SSE errors → `{"step":"error","message":"..."}` SSE event
- `RelationshipResolutionError` → describes exactly which code could not be resolved

### PDF Extraction Errors
- No extractor registered: `"No extractor found for model: {modelName}"`
- Wrong file type: `"Only PDF files are supported"`
- File too large: `"File size must be less than 10MB"`
- LLM failure: `"Document extraction failed: {details}"`
- Permission denied: `"No access permissions for model: {modelName}"`

---

## Usage Examples

### Example 1: Importing Posting Transactions (Generic CSV)

Standard browser-based CSV import without bank-statement specifics.

**Sample CSV**:
```csv
Value Date,Description,Account,Amount,Credit Account
2024-01-15,Office Supplies Purchase,Office Supplies,150.00,Cash on Hand
2024-01-16,Client Payment Received,Cash on Hand,5000.00,Accounts Receivable
```

**Field Mapping**:
- `Value Date` → `value_date` (required)
- `Description` → `description` (required)
- `Account` → `account_id` (lookup — resolved by display name)
- `Amount` → `amount`
- `Credit Account` → `credit_account_id` (lookup)

Upload via `POST /api/posting/view/posting_view/upload`.

### Example 2: Bank Statement CSV via Combined API

Using the bank statement import endpoint with a CSV file containing raw amounts and optional account codes.

**Plain CSV** (no contra-account codes):
```csv
Value Date,Description,Debit,Credit
2026-01-15,Office supplies,125.50,
2026-01-17,Monthly subscription,49.99,
2026-01-16,Client payment received,,2500.00
```

```bash
curl -N -X POST http://localhost:4000/api/posting/custom/import-bank-statement \
  -H "X-API-Key: fabriq-us-ca-demo-user_daniel_lee" \
  -F "file=@statement.csv" \
  -F "account_id=acco_org_techflow_us_1102" \
  -F 'column_mapping={"Value Date":"value_date","Description":"description","Debit":"debit_amount","Credit":"credit_amount"}'
```

**CSV with expense account codes** (resolved server-side via `RelationshipResolverService`):
```csv
Value Date,Description,Debit,Credit,Expense Account Code
2026-01-15,Office supplies,125.50,,5201
2026-01-17,Monthly subscription,49.99,,5203
2026-01-16,Client payment received,,2500.00,
```

```bash
-F 'column_mapping={"Value Date":"value_date","Description":"description","Debit":"debit_amount","Credit":"credit_amount","Expense Account Code":"account_id"}'
```

The service resolves `5201` → `acco_org_xxx_east_5201` using the `selectProps` in `posting_view`'s `data_graph`. The bank account (`acco_org_techflow_us_1102`) is placed on the `credit_account_id` side (asset decreases on withdrawal).

### Example 3: Bank Statement PDF with AI Categorisation

```bash
curl -N -X POST http://localhost:4000/api/posting/custom/import-bank-statement \
  -H "X-API-Key: fabriq-us-ca-demo-user_daniel_lee" \
  -F "file=@Chequing-Statement.pdf" \
  -F "account_id=acco_org_techflow_us_1102" \
  -F "categorize=true" \
  -F "legal_entity_id=le_org_techflow_us_001"
```

Streams SSE progress: `extracting` → `mapping` → `importing` → `complete`.

Transactions where the LLM predicts an expense account with confidence ≥ 0.5 will have `account_id` set to that expense account. The rest have `account_id = null` (to be categorised later).

### Example 4: Importing Chart of Accounts

```csv
Name,Classification,Parent Account,Code
Office Expenses,Expense,Expenses,6000
Rent,Expense,Expenses,6100
```

```typescript
<ImportPannel
  modelType="account"
  modelView="account_view"
  updateCSVData={(formattedData) => {
    formattedData.data = formattedData.data.map((record: any) => {
      if (record.type && typeof record.type === 'string') {
        record.type = record.type.split(',').map((t: string) => t.trim());
      }
      return record;
    });
    return formattedData;
  }}
/>
```

---

## Related Files

### Frontend
- `frontend-1/src/components/import/ImportPannel.tsx`
- `frontend-1/src/components/import/CsvMapper.tsx`
- `frontend-1/src/components/import/UploadManager.tsx`
- `frontend-1/src/features/import-extensions/types.ts`
- `frontend-1/src/features/import-extensions/posting/index.tsx`
- `frontend-1/src/api/api.ts` (`importAPI`)

### Backend — Generic Import
- `backend/src/services/upload/UploadService.ts`
- `backend/src/rest/RestService.ts` (`uploadCSV` method)
- `backend/src/rest/routes.ts`

### Backend — Bank Statement Import Pipeline
- `backend/src/rest/customActionRegistry.ts`
- `backend/src/rest/postingCustomActions.ts`
- `backend/src/services/posting/PostingImportService.ts`
- `backend/src/services/RelationshipResolverService.ts`
- `backend/src/lib/import/bankStatementImportClient.ts` (`buildPostingImportFieldMapping`)
- `backend/scripts/import-bank-statements.ts` (CLI wrapper)

### Backend — PDF Extraction
- `backend/src/lib/extractors/base-extractor.ts`
- `backend/src/lib/extractors/extractor-registry.ts`
- `backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts`
- `backend/src/lib/extractors/invoice-extractor.ts`
- `backend/src/lib/import-extensions/posting/index.ts`

### Test Fixtures
- `backend/test-data/us-ca-bank-import/sample-bank-statement.csv` — 3 rows (2 debits, 1 credit)
- `backend/test-data/us-ca-bank-import/sample-bank-statement-with-account-codes.csv` — same plus `Expense Account Code` column
- `backend/test-data/us-ca-bank-import/pdf-categorization-only/Chequing%20Statement-1113%202022-07-08.pdf` — real PDF fixture
- `backend/src/__tests__/import/posting-import-api.test.ts` — three-tier test suite
