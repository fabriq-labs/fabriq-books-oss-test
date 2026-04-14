# Import Functionality Documentation

## Overview

The Fabriq Books application provides a **metadata-driven import system** for bulk importing data across all data models in the platform. The import functionality is generic and works with any model/view combination defined in the system metadata. It supports both CSV file uploads and PDF document processing, with intelligent field mapping, data validation, lookup field resolution, and customizable data transformation.

**Key Characteristics**:
- **Metadata-Driven**: Field definitions, permissions, and validation rules come from view metadata
- **Generic**: Works with any model type (posting, account, category, etc.) without code changes
- **Flexible**: Supports custom data transformation via `updateCSVData` function
- **Relationship-Aware**: Handles parent-child relationships and lookup fields automatically
- **Extensible**: Can be configured per model with custom transformation logic

**Example Use Cases**:
- Importing posting transactions (see detailed example throughout this document)
- Importing chart of accounts
- Importing categories, suppliers, customers
- Importing any master data defined in the system

## Table of Contents

1. [Architecture](#architecture)
2. [Frontend Components](#frontend-components)
3. [Backend Services](#backend-services)
4. [Import Flow](#import-flow)
5. [API Endpoints](#api-endpoints)
6. [Field Mapping](#field-mapping)
7. [Lookup Fields](#lookup-fields)
8. [Error Handling](#error-handling)
9. [Usage Examples](#usage-examples)

## Architecture

The import system is a **generic, metadata-driven architecture** that works with any model/view combination. It consists of:

### Frontend (`frontend-1/src/components/import/`)
- **ImportPannel**: Generic main import interface component (works with any model)
- **CSVMapper**: Generic CSV data mapping and validation interface
- **UploadManager**: Generic file upload modal component with optional relationship selection
- **TransactionImport**: Legacy transaction import component (currently commented out)

### Backend (`backend/src/services/upload/` and `backend/uploadService.ts`)
- **UploadService**: Modern generic service class for handling CSV uploads (any model)
- **uploadService.ts**: Legacy upload service with streaming support
- **RestService.uploadCSV**: Generic REST API endpoint handler (`/api/{modelType}/view/{viewId}/upload`)

### Metadata Integration

The system relies on **view metadata** to determine:
- Available fields for mapping (based on `permission: "update"`)
- Required fields (based on `required: true`)
- Field data types and validation rules
- Lookup field configurations (`tableProps.columnType === "select"`)
- Display names and field properties

**Example**: For `posting_view`, the metadata defines fields like `value_date`, `description`, `account_id`, `amount`, etc. The same import components work for `account_view`, `category_view`, or any other view without modification.

### Import Extension Hooks

Import extensions can provide model-specific functionality without modifying generic components:

1. **`getPdfUploadOptions(context: PdfUploadContext)`**: Extract options from UI context for PDF processing
   - Receives `PdfUploadContext` with `relationSelection` (full selected item from dropdown)
   - Returns options object (e.g., `{ legalEntityId: string }`)
   - Used by `ImportPannel` before calling PDF upload handler

2. **`handlePdfUpload(file, options)`**: Custom PDF processing logic
   - Receives file and options from `getPdfUploadOptions`
   - Can call specialized backend endpoints

3. **`getColumns(context)`**: Provide additional columns for CSV mapper
   - Returns column definitions for extension-specific data (e.g., AI Category column)

4. **`renderToolbarActions(context)`**: Add toolbar buttons to CSV mapper
   - Returns React elements for additional actions (e.g., Categorize button)

**Example: Posting Extension**:
```typescript
// frontend-1/src/features/import-extensions/posting/index.tsx
getPdfUploadOptions(context: PdfUploadContext) {
  const selected = context.relationSelection;
  return {
    legalEntityId: selected?.item?.legal_entity_id,
  };
}
```

## Frontend Components

### ImportPannel Component

**Location**: `frontend-1/src/components/import/ImportPannel.tsx`

The main import interface that provides:

1. **File Upload Options**:
   - CSV file upload
   - PDF file upload (with extraction)
   - Sample CSV download

2. **Key Features**:
   - Generates sample CSV templates based on field metadata
   - Handles CSV parsing and validation
   - Manages upload state and progress
   - Supports relationship fields (parent-child relationships)

3. **Props**:
   ```typescript
   {
     modelType: string;        // Any model type: "posting", "account", "category", etc.
     modelView: string;         // Corresponding view: "posting_view", "account_view", etc.
     relation?: string;         // Optional: Related model type for parent selection (e.g., "account")
     relationField?: string;    // Optional: Relationship field display name
     relationFieldId?: string;  // Optional: Relationship field ID (e.g., "account_id")
     metaData: any;            // Field metadata from view (defines available fields, permissions, etc.)
     onDiscard: () => void;    // Callback to close import
     onUploadComplete: (data: any) => void; // Upload success callback
     updateCSVData?: (formattedData: any, relationId: any) => any; // Custom data transformation
     onList?: () => void;       // Refresh list callback
   }
   ```

4. **Data Transformation with `updateCSVData`**:
   
   The `updateCSVData` prop allows custom data transformation before sending data to the backend. This is useful for:
   - Converting CSV format to match model requirements
   - Handling special cases (e.g., debit/credit amounts when account is pre-selected)
   - Transforming field values (e.g., splitting comma-separated values into arrays)
   - Adding computed fields or default values
   
   **Function Signature**:
   ```typescript
   updateCSVData?: (
     formattedData: {
       data: Record<string, any>[];      // Transformed CSV records
       mapping: Record<string, string>;   // Column to field mapping
       parentData?: Record<string, any>; // Parent record data (if relation selected)
       isJSON: boolean;
     },
     relationId?: string                  // Selected parent record ID (if any)
   ) => any
   ```
   
   **Example Implementation** (for posting transactions with account pre-selected):
   ```typescript
   const updateCSVData = (formattedData: any, relationId: any) => {
     if (!relationId) return formattedData; // No transformation if no account selected
     
     // Transform debit/credit amounts to account_id/credit_account_id
     formattedData.data = formattedData.data.map((record: any) => {
       const debitAmount = parseFloat(record.debit_amount || 0);
       const creditAmount = parseFloat(record.credit_amount || 0);
       
       if (debitAmount > 0) {
         // Selected account is debited
         record.account_id = relationId;
         record.credit_account_id = record.credit_account_id; // From CSV mapping
         record.amount = debitAmount;
       } else if (creditAmount > 0) {
         // Selected account is credited
         record.account_id = record.account_id; // From CSV mapping
         record.credit_account_id = relationId;
         record.amount = creditAmount;
       }
       
       // Remove temporary columns
       delete record.debit_amount;
       delete record.credit_amount;
       
       return record;
     });
     
     return formattedData;
   };
   ```
   
   **Example Implementation** (for account import with type field):
   ```typescript
   const updateCSVData = (formattedData: any, relationId: any) => {
     // Transform comma-separated type values to array
     formattedData.data = formattedData.data.map((record: any) => {
       if (record.type && typeof record.type === 'string') {
         record.type = record.type.split(',').map((t: string) => t.trim());
       }
       return record;
     });
     return formattedData;
   };
   ```

### CSVMapper Component

**Location**: `frontend-1/src/components/import/CsvMapper.tsx`

The CSV mapping interface that allows users to:

1. **Map CSV Columns to Database Fields**:
   - Dropdown selectors for each CSV column
   - Automatic field matching based on field names
   - Visual indicators for lookup fields

2. **Data Validation**:
   - Required field validation
   - Lookup field validation (checks if referenced records exist)
   - Visual indicators for invalid data (red badges for "Not Available" values)

3. **Data Management**:
   - Row selection and bulk operations
   - Individual row deletion
   - Pagination support
   - Bulk edit capabilities (commented out in current implementation)

4. **Upload Process**:
   - Validates all required fields are mapped
   - Ensures no "Not Available" lookup values exist
   - Transforms data with lookup field resolution
   - Sends formatted data to backend

### UploadManager Component

**Location**: `frontend-1/src/components/import/UploadManager.tsx`

Modal component for file selection:

1. **File Selection**:
   - CSV file picker
   - PDF file picker
   - File validation

2. **Relationship Support**:
   - Optional parent record selection dropdown
   - Used for importing child records (e.g., line items)
   - **Full Selection Object**: When a record is selected, the full item object (including all fields like `legal_entity_id`) is passed to the parent component, not just the ID

3. **File Processing**:
   - CSV: Parses file and extracts content
   - PDF: Uploads to backend for extraction

## Backend Services

### UploadService (Modern Implementation)

**Location**: `backend/src/services/upload/UploadService.ts`

A **generic singleton service class** that handles CSV data uploads for **any model type**:

```typescript
class UploadService {
  private BATCH_SIZE = 1000;
  
  async uploadCSV(
    modelName: string,        // Any model: "posting", "account", "category", etc.
    context: AuthContext,
    request: UploadRequest
  ): Promise<DataAccessResult<{ count: number }>>
}
```

**Features** (Generic for all models):
- **Batch processing**: 1000 records per batch (configurable)
- **Field mapping transformation**: Maps CSV columns to database fields
- **Automatic metadata injection**: Adds org_id, created_by, modified_by to all records
- **Transaction-based processing**: Ensures data consistency
- **Error handling and logging**: Comprehensive error tracking
- **Model-agnostic**: Works with any Prisma model without modification

**Request Format** (Generic):
```typescript
{
  data: Record<string, any>[];           // Array of records (after frontend transformation)
  mapping: Record<string, string>;      // CSV column -> DB field mapping
  parentData?: Record<string, any>;     // Optional parent record data (if relation selected)
}
```

**How It Works**:
1. Receives transformed data from frontend (after `updateCSVData` if provided)
2. Uses `DataAccessLayer` to create records (works with any model)
3. Merges `parentData` with each record if provided
4. Processes in batches within a database transaction
5. Returns count of successfully created records

### uploadService.ts (Legacy Implementation)

**Location**: `backend/uploadService.ts`

Legacy service with streaming support:

1. **uploadJSON**: Processes JSON data uploads
   - Batch processing (1000 records per batch)
   - Field transformation and validation
   - Relationship field resolution
   - Transaction timeout handling (100 seconds)

2. **uploadFile**: Streams CSV files directly
   - Uses `csv-parser` for streaming
   - Processes data in chunks
   - Handles large files efficiently

3. **uploadPDF**: Handles PDF document uploads
   - Creates background tasks for PDF processing
   - Stores files in temporary storage
   - Returns task ID for status tracking

## Import Flow

### Generic Import Process

The import process is generic and works the same way for any model type. The following describes the standard flow:

1. **User Initiates Import**:
   - User clicks "Import" button on any list page (e.g., `/accounting/transactions` for posting transactions)
   - `ImportPannel` component is rendered with `modelType` and `modelView` props
   - Component fetches view metadata to determine available fields

2. **Parent Record Selection (Optional)**:
   - If `relation` prop is provided (e.g., `relation="account"` for posting transactions):
     - `UploadManager` modal shows a dropdown to select a parent record
     - User can optionally select a parent before uploading the file
     - This selection is stored in `relationId` and affects data transformation
     - **Example**: For posting transactions, selecting an account allows using debit/credit format

3. **File Selection**:
   - User chooses to upload CSV or PDF
   - `UploadManager` modal opens (or is already open if parent selection is available)
   - User selects file from system

4. **CSV Processing** (if CSV selected):
   - File is read and parsed using `react-papaparse`
   - CSV headers and rows are extracted
   - CSV content is stored in state
   - `CSVMapper` component is rendered

5. **Field Mapping**:
   - System reads view metadata to determine available fields
   - Only fields with `permission: "update"` are available for mapping
   - User maps each CSV column to a database field via dropdown selectors
   - System auto-suggests matches based on field display names
   - Lookup fields (with `tableProps.columnType === "select"`) trigger validation queries

6. **Data Validation**:
   - Required fields are checked (fields with `required: true && permission: "update"`)
   - Lookup values are validated against database
   - Invalid values are marked with "Not Available" badges
   - Upload button is disabled until all required fields are mapped and all lookups are valid

7. **Data Transformation Pipeline**:
   
   The data goes through multiple transformation steps:
   
   a. **Field Mapping Transformation**:
      - CSV column names are replaced with database field names based on user mapping
      - Example: `"Value Date"` → `"value_date"`
   
   b. **Lookup Field Resolution**:
      - Lookup field values (e.g., account names) are resolved to IDs
      - Uses `instanceLabel` from metadata (typically "name") to match values
      - Example: `"Cash on Hand"` → `"acco_123-456-789"`
   
   c. **Parent Data Merging** (if parent selected):
      - If `relationId` is set and `relationFieldId` is configured:
        - `parentData: { [relationFieldId]: relationId }` is added to upload request
        - This data is merged with each record during backend processing
   
   d. **Custom Transformation** (if `updateCSVData` provided):
      - `updateCSVData(formattedData, relationId)` is called
      - Allows model-specific transformations
      - Can modify data structure, add computed fields, handle special cases
      - **Example**: For posting transactions with account pre-selected, converts debit/credit amounts to account_id/credit_account_id
   
   e. **Metadata Injection** (backend):
      - `org_id`: User's organization ID
      - `created_by`: User ID
      - `modified_by`: User ID

8. **Upload to Backend**:
   - Formatted data is sent to `/api/{modelType}/view/{viewId}/upload`
   - Request includes: `data`, `mapping`, `parentData` (if applicable), `isJSON: true`
   - Backend processes in batches (1000 records per batch)
   - Progress is tracked and displayed

9. **Completion**:
   - Success message is shown with count of imported records
   - Import panel closes
   - List is refreshed via `onList()` callback

### Parent Record Selection and Data Transformation

The import functionality supports **parent record selection** via the `relation` prop. This enables different CSV formats and data transformation patterns. The following example uses **posting transactions** to illustrate this behavior, but the same pattern applies to any model with relationships.

**Example: Posting Transactions with Account Selection**

For posting transactions, the `relation` prop can be set to `"account"` to allow pre-selecting an account before import. This enables a different CSV format optimized for importing transactions for a single account.

#### Scenario 1: Parent Record Selected (Example: Account Selected for Posting Transactions)

**When**: User selects a parent record (e.g., account) from the dropdown in the `UploadManager` modal before uploading the CSV file.

**Configuration**: 
- `relation="account"` 
- `relationField="Account"`
- `relationFieldId="account_id"`
- `updateCSVData` function provided to transform debit/credit amounts

**Expected CSV Format**:
- The selected account is used as a **fixed account** for all transactions
- CSV must contain **Debit Amount** and **Credit Amount** columns
- Each row represents a transaction where:
  - If Debit Amount > 0: The selected account is debited, and the amount goes to the credit account specified in the row
  - If Credit Amount > 0: The selected account is credited, and the amount comes from the debit account specified in the row

**Example CSV Format**:
```csv
Value Date,Description,Credit Account,Debit Amount,Credit Amount,Category
2024-01-15,Office Supplies,Office Expenses,150.00,0.00,Office Supplies
2024-01-16,Client Payment,Accounts Receivable,0.00,5000.00,Service Revenue
2024-01-17,Monthly Rent,Bank Account,2500.00,0.00,Rent
```

**Field Mapping**:
- `Value Date` → `value_date` (required)
- `Description` → `description` (required)
- `Credit Account` → `credit_account_id` (lookup field - for debit transactions)
- `Debit Amount` → `amount` (when > 0, selected account is debited)
- `Credit Amount` → `amount` (when > 0, selected account is credited)

**How It Works**:
1. Selected account ID is stored in `relationId` state via `handleSelectedState` callback
2. When CSV is uploaded and mapped, `handleOnServerUpload` is called
3. Data transformation pipeline:
   - Field mapping applied (CSV columns → database fields)
   - Lookup fields resolved (account names → IDs)
   - `updateCSVData(formattedData, relationId)` is called:
     ```typescript
     // Example updateCSVData for posting transactions
     const updateCSVData = (formattedData: any, relationId: any) => {
       if (!relationId) return formattedData;
       
       formattedData.data = formattedData.data.map((record: any) => {
         const debitAmount = parseFloat(record.debit_amount || 0);
         const creditAmount = parseFloat(record.credit_amount || 0);
         
         if (debitAmount > 0) {
           record.account_id = relationId; // Selected account is debited
           record.amount = debitAmount;
           // credit_account_id already set from CSV mapping
         } else if (creditAmount > 0) {
           record.credit_account_id = relationId; // Selected account is credited
           record.amount = creditAmount;
           // account_id already set from CSV mapping
         }
         
         delete record.debit_amount;
         delete record.credit_amount;
         return record;
       });
       
       return formattedData;
     };
     ```
4. Transformed data is sent to backend with `parentData` (if `relationFieldId` configured)

#### Scenario 2: No Parent Record Selected (Standard Import)

**When**: User uploads CSV file without selecting a parent record first.

**Configuration**: 
- No `relation` prop provided
- No `updateCSVData` function needed (or simple pass-through)

**Expected CSV Format**:
- CSV must contain **Account** and **Credit Account** columns
- Each row specifies both the debit and credit accounts explicitly
- CSV should have a single **Amount** column (not separate debit/credit columns)

**Example CSV Format**:
```csv
Value Date,Description,Account,Amount,Credit Account,Category
2024-01-15,Office Supplies,Office Supplies,150.00,Cash on Hand,Office Supplies
2024-01-16,Client Payment,Cash on Hand,5000.00,Accounts Receivable,Service Revenue
2024-01-17,Monthly Rent,Rent,2500.00,Checking Account,Rent
```

**Field Mapping**:
- `Value Date` → `value_date` (required)
- `Description` → `description` (required)
- `Account` → `account_id` (required, lookup field - debit account)
- `Amount` → `amount` (required)
- `Credit Account` → `credit_account_id` (required, lookup field - credit account)


**How It Works**:
1. Both `account_id` and `credit_account_id` are mapped directly from CSV columns
2. No `parentData` is included in the upload request
3. Standard field mapping and lookup resolution applies
4. If `updateCSVData` is provided, it receives `relationId = undefined` and can return data unchanged

#### Summary Table (Posting Transactions Example)

| Scenario | Parent Selection | CSV Format | Required Columns | Transformation |
|----------|------------------|------------|------------------|----------------|
| **Parent Selected** | Account selected before upload | Debit/Credit amounts | Value Date, Description, Credit Account, Debit Amount, Credit Amount | `updateCSVData` converts to account_id/credit_account_id |
| **No Parent Selected** | No parent selected | Account and Credit Account | Value Date, Description, Account, Amount, Credit Account | Standard mapping, no transformation needed |

#### Generic Pattern for Any Model

This pattern works for any model with relationships:

1. **Configure Import with Relation**:
   ```typescript
   <ImportPannel
     modelType="posting"           // or "invoice", "purchase_order", etc.
     modelView="posting_view"
     relation="account"            // Parent model type
     relationField="Account"       // Display name
     relationFieldId="account_id"   // Field ID in posting model
     updateCSVData={customTransformFunction}
   />
   ```

2. **Implement `updateCSVData` for Custom Logic**:
   - Receives `formattedData` (after field mapping and lookup resolution)
   - Receives `relationId` (selected parent record ID, or `undefined`)
   - Returns transformed data structure
   - Can handle any model-specific requirements

3. **Backend Processing**:
   - Receives transformed data
   - Merges `parentData` with each record (if provided)
   - Validates against model schema
   - Creates records in batches

### PDF Import Flow

The PDF extraction system uses **AI-powered document extraction** to convert PDF documents into structured data that can be imported into the system. The system supports multiple extraction approaches and uses an **extractor registry** to route documents to the appropriate extractor based on the target model.

#### Overview

PDF extraction works in two modes:

1. **Modern Approach (Recommended)**: Direct extraction using AI extractors with immediate response
2. **Legacy Approach**: Background task-based processing (for large files or async processing)

#### Modern PDF Extraction Flow

**Endpoint**: `POST /api/parse-document/{modelName}`

**Flow**:

1. **Frontend PDF Upload**:
   - User selects PDF file in `UploadManager` component
   - If an import extension exists for the model, `extension.getPdfUploadOptions()` is called
   - This hook receives `PdfUploadContext` with access to `relationSelection` (full selected item)
   - Extensions can extract model-specific options (e.g., `legalEntityId` from `relationSelection.item.legal_entity_id`)
   - File is converted to `FormData` with field name `"file"`
   - Request sent to `/api/parse-document/{modelName}` (e.g., `/api/parse-document/posting` for bank statements)
   - Uses `importAPI.parseDocument(modelName, file)` or extension's custom handler
   - **Location**: `frontend-1/src/components/import/ImportPannel.tsx`
   - **Extension Types**: `frontend-1/src/features/import-extensions/types.ts`

2. **Backend File Validation** (`RestService.parseDocument`):
   - Validates file is present
   - Validates file type is `application/pdf`
   - Validates file size (max 10MB)
   - Converts file buffer to `Buffer` format
   - **Location**: `backend/src/rest/RestService.ts` (line 664-730)

3. **Model Service Processing** (`ModelService.parseDocument`):
   - Validates user permissions for the target model
   - Finds appropriate extractor using `ExtractorRegistry.getExtractorForModel(modelName)`
   - Returns error if no extractor found for the model
   - **Location**: `backend/src/services/core/ModelService.ts` (line 513-604)

4. **Extractor Registry Lookup**:
   - Registry maintains mapping of models to extractors
   - Each extractor implements `getTargetModel()` method
   - Currently supported extractors:
     - `InvoiceExtractor` → `invoice` model
     - `BankStatementExtractor` → `bank_statement` model (or similar)
   - **Location**: `backend/src/lib/extractors/extractor-registry.ts`

5. **Document Extraction** (`BaseDocumentExtractor.extract`):
   - Validates document content (non-empty buffer)
   - Detects MIME type from file signature (PDF, PNG, JPEG)
   - Sends document to LLM service for extraction
   - Uses model-specific extraction prompt
   - Validates extracted data against expected schema
   - Calculates confidence score
   - **Location**: `backend/src/lib/extractors/base-extractor.ts`

6. **LLM-Based Extraction** (`BaseDocumentExtractor.extractWithLLM`):
   - Constructs system instruction with:
     - Model-specific extraction prompt
     - Expected output schema (JSON structure)
     - Extraction guidelines
   - For binary documents (PDFs):
     - Sends PDF buffer directly to LLM via `LLMService.generateContentFromBinary()`
     - Includes detected MIME type (`application/pdf`)
   - For text documents:
     - Uses text-based LLM generation
   - Parses LLM JSON response
   - **Location**: `backend/src/lib/extractors/base-extractor.ts` (line 99-151)

7. **Response Processing**:
   - Extracted data is validated against expected schema
   - Confidence score is calculated based on extraction quality
   - Metadata is added (processing time, page count, etc.)
   - Response returned to frontend:
     ```json
     {
       "success": true,
       "data": {
         "transactions": [
           {
             // Extracted transaction/record objects matching model schema
           }
         ],
         "accountContext": {
           // Additional context (e.g., account details for bank statements)
           // This is ignored by the frontend
         }
       },
       "metaData": {
         "confidence": 85,
         "processingTime": 1234,
         "extractorType": "BankStatementExtractor"
       }
     }
     ```
   - **Note**: For bank statements, the `BankStatementExtractor` returns transactions in a nested structure. The frontend extracts `res.data.transactions` array and ignores `accountContext`.

8. **Frontend CSV Conversion** (`ImportPannel.uploadPdf`):
   - Receives extraction response: `{ success: true, data: { transactions: [...], accountContext: {...} } }`
   - Validates extraction success (`res.success` flag)
   - Extracts `transactions` array from nested `res.data.transactions` structure
   - Validates that transactions array is not empty
   - Converts extracted data to CSV format:
     - Extracts headers from first transaction object keys
     - Converts each transaction to CSV row
     - Handles null/undefined values (converts to empty strings)
     - Converts all values to strings first
     - Removes newlines and commas from values to prevent CSV parsing issues
   - Creates CSV blob and File object (`extracted-data.csv`)
   - Sets CSV content in state to trigger CSV mapping flow
   - Closes upload modal
   - Shows success toast notification with transaction count
   - **Location**: `frontend-1/src/components/import/ImportPannel.tsx` (line 90-198)

9. **CSV Import Flow**:
   - Process continues as standard CSV import
   - `CSVMapper` component is rendered with extracted CSV data
   - User maps fields and validates data
   - Upload proceeds as normal CSV import

#### Legacy PDF Extraction Flow (Background Tasks)

**Endpoint**: Uses `uploadService.uploadPDF()` (legacy)

**Flow**:

1. **PDF Upload**:
   - File is uploaded to backend
   - PDF buffer is written to temporary storage: `data/pdf/input/{timestamp}_{type}.pdf`
   - **Location**: `backend/uploadService.ts` (line 70-113)

2. **Task Creation**:
   - Creates background task record:
     ```typescript
     {
       type: "file operations",
       sub_type: "pdf",
       config: {
         input_file_path: upload_path
       },
       org_id: user.org_id,
       created_by: user.id,
       status: "pending",
       data: instanceData,
       output: {}
     }
     ```
   - Task is stored in database for async processing

3. **Background Processing**:
   - Task processor picks up pending tasks
   - Extracts data from PDF
   - Updates task status and output
   - Frontend polls task status (commented out in current implementation)

#### Extractor Architecture

**Extractor Registry**:
- Singleton pattern for managing extractors
- Maps document types to extractor instances
- Maps model names to extractors (1:1 relationship)
- **Location**: `backend/src/lib/extractors/extractor-registry.ts`

**Base Extractor** (`BaseDocumentExtractor`):
- Abstract base class for all extractors
- Handles common extraction logic:
  - Document validation
  - LLM communication
  - Schema validation
  - Confidence calculation
- Subclasses implement:
  - `getSupportedTypes()`: Document types this extractor handles
  - `getTargetModel()`: Target model name (e.g., "invoice")
  - `getExtractionPrompt()`: Model-specific extraction instructions
  - `getExpectedSchema()`: Expected JSON schema for extracted data
- **Augmentation Hooks** (for subclasses to extend prompts/schemas):
  - `augmentPromptWithContext(basePrompt, options)`: Add context to extraction prompt
  - `augmentSchemaWithContext(baseSchema, options)`: Add fields to expected schema
- **Location**: `backend/src/lib/extractors/base-extractor.ts`

**Bank Statement with Categorization Extractor** (`BankStatementWithCategorizationExtractor`):
- Extends `BaseDocumentExtractor` with AI categorization
- Uses augmentation hooks to inject Chart of Accounts context
- Key methods:
  - `prepareCategorizationContext({ orgId, legalEntityId })`: Fetches and caches accounts
  - `augmentPromptWithContext()`: Adds categorization instructions and account list
  - `augmentSchemaWithContext()`: Adds categorization fields to schema
- Can be used directly via API/MCP without import extension context
- **Location**: `backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts`

**Example Extractor** (`InvoiceExtractor`):
- Extracts invoice header and line items
- Maps to `invoice` model and `invoice_line_item` model
- Extraction prompt includes:
  - Invoice header fields (number, date, supplier, etc.)
  - Line item fields (name, quantity, price, tax, etc.)
- Expected schema matches invoice model structure
- **Location**: `backend/src/lib/extractors/invoice-extractor.ts`

#### Supported Models

Currently, extractors are available for:
- **Invoice**: `InvoiceExtractor` → `invoice` model
- **Bank Statement**: `BankStatementExtractor` → bank statement models

To add support for a new model:
1. Create new extractor class extending `BaseDocumentExtractor`
2. Implement required abstract methods
3. Register extractor in `ExtractorRegistry.initializeExtractors()`

#### API Endpoints

**Modern Extraction Endpoint**:
```
POST /api/parse-document/{modelName}
Content-Type: multipart/form-data

Body:
  file: <PDF file>

Example:
  POST /api/parse-document/posting
  POST /api/parse-document/invoice
```

**Response**:
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        // Extracted transaction/record objects matching model schema
      }
    ],
    "accountContext": {
      // Additional context (ignored by frontend)
    }
  },
  "metaData": {
    "confidence": 85,
    "processingTime": 1234,
    "extractorType": "BankStatementExtractor"
  }
}
```

**Note**: The frontend extracts the `transactions` array from `res.data.transactions` and ignores `accountContext`. For bank statements, the extractor returns transactions in a format that can be directly mapped to the `posting` model.

**Legacy Task Endpoint** (if using background processing):
- Uses `uploadService.uploadPDF()` which creates a task
- Returns task ID for status polling

#### Error Handling

**Common Errors**:
1. **No Extractor Found**: Model doesn't have an extractor registered
   - Error: `"No extractor found for model: {modelName}. Available models: {list}"`
   - Solution: Register extractor for the model

2. **Invalid File Type**: File is not a PDF
   - Error: `"Only PDF files are supported"`
   - Solution: Upload valid PDF file

3. **File Too Large**: Exceeds 10MB limit
   - Error: `"File size must be less than 10MB"`
   - Solution: Use smaller file or compress PDF

4. **Extraction Failure**: LLM fails to extract data
   - Error: `"Document extraction failed: {error details}"`
   - Solution: Check PDF quality, ensure it contains extractable text

5. **Permission Denied**: User lacks access to model
   - Error: `"No access permissions for model: {modelName}"`
   - Solution: Grant appropriate permissions

#### Performance Considerations

- **Processing Time**: Typically 2-5 seconds per PDF (depends on size and complexity)
- **File Size Limit**: 10MB maximum
- **LLM Costs**: Each extraction uses LLM API calls (costs vary by provider)
- **Confidence Threshold**: Extractors can set minimum confidence (default: 70%)
- **Batch Processing**: Legacy approach supports async processing for large files

#### Future Enhancements

Potential improvements:
1. **More Extractors**: Add extractors for purchase orders, receipts, contracts
2. **Multi-page Support**: Better handling of multi-page documents
3. **Table Extraction**: Enhanced table detection and extraction
4. **Image Support**: Extract data from scanned images (OCR)
5. **Template Matching**: Use document templates for faster extraction
6. **Confidence Scoring**: More sophisticated confidence calculation
7. **Validation Rules**: Model-specific validation after extraction

## API Endpoints

### Upload CSV Data

**Endpoint**: `POST /api/{modelType}/view/{viewId}/upload`

**Authentication**: Required (Bearer token)

**Request Body**:
```json
{
  "data": [
    {
      "column1": "value1",
      "column2": "value2"
    }
  ],
  "mapping": {
    "column1": "field_name_1",
    "column2": "field_name_2"
  },
  "parentData": {
    "parent_field": "parent_id"
  },
  "isJSON": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully created 150 records",
  "data": {
    "count": 150
  },
  "metaData": {
    // View metadata including data_graph
  }
}
```

### Upload PDF for Extraction

**Endpoint**: `POST /api/parse-document/{modelName}`

**Authentication**: Required (Bearer token)

**Request**: FormData with PDF file
- Field name: `file`
- Content-Type: `multipart/form-data` (automatically set by browser)
- Max file size: 10MB

**Response**:
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "value_date": "2024-01-15",
        "description": "Office Supplies",
        "amount": 150.00,
        "account_name": "Office Expenses",
        // ... other extracted fields
      }
    ],
    "accountContext": {
      // Additional context (ignored by frontend)
    }
  },
  "metaData": {
    "confidence": 100,
    "processingTime": 13446,
    "extractorType": "BankStatementExtractor"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Error message description"
}
```

## Field Mapping

Field mapping is **completely metadata-driven** and works generically for any model. The system reads view metadata to determine available fields, their types, and validation rules.

### Mapping Process (Generic)

1. **CSV Column Detection**:
   - System reads CSV headers from uploaded file
   - Creates dropdown selector for each CSV column

2. **Available Fields** (from view metadata):
   - System reads view metadata (e.g., `posting_view`, `account_view`)
   - Only fields with `permission === "update"` are available for mapping
   - Fields can be filtered by `isColumnShow === true` (optional)
   - Additional fields can be specified via `additionalFileds` prop (optional)
   - **Example**: For `posting_view`, available fields include `value_date`, `description`, `account_id`, `amount`, `credit_account_id`
   - **Example**: For `account_view`, available fields include `name`, `classification`, `code`, `parent_id`

3. **Mapping Creation**:
   - User selects a field from dropdown for each CSV column
   - Mapping is stored as: `{ "CSV Column Name": "database_field_name" }`
   - **Example (posting transactions)**:
     ```typescript
     {
       "Value Date": "value_date",
       "Description": "description",
       "Account": "account_id",
       "Amount": "amount",
       "Credit Account": "credit_account_id"
     }
     ```
   - **Example (accounts)**:
     ```typescript
     {
       "Name": "name",
       "Classification": "classification",
       "Code": "code",
       "Parent": "parent_id"
     }
     ```

4. **Automatic Matching**:
   - System attempts to match CSV columns to fields by display name
   - Case-insensitive matching
   - Partial matching for similar names
   - Uses `displayName` from metadata for matching
   - **Example**: CSV column "Value Date" auto-matches to field with `displayName: "Value Date"`

### Metadata-Driven Field Properties

Each field in the mapping has properties from metadata that affect processing:

- **Data Type**: Determines validation and transformation (`datatype` or `dataType`)
- **Required**: Fields with `required: true` must be mapped
- **Lookup Fields**: Fields with `tableProps.columnType === "select"` trigger lookup validation
- **Display Name**: Used for auto-matching and UI display (`displayName`)
- **Permissions**: Only fields with `permission: "update"` are available

### Sample CSV Generation

The system can generate sample CSV files with:
- All available fields as headers
- Sample data based on field data types
- Proper formatting for different data types:
  - Numbers: `0.00`
  - Dates: ISO format (`YYYY-MM-DD`)
  - Booleans: `true`/`false`
  - Strings: `Sample {FieldName}`

## Lookup Fields

### Lookup Field Resolution

Lookup fields (select/relationship fields) require special handling:

1. **Detection**:
   - Fields with `tableProps.columnType === "select"` are lookup fields
   - System identifies these during mapping

2. **Validation**:
   - When a lookup field is mapped, system extracts unique values from CSV
   - Queries database to find matching records
   - Uses `instanceLabel` field for matching (typically "name")

3. **Resolution**:
   - CSV values are matched to database records
   - Matching records get their IDs assigned
   - Non-matching values are marked as "Not Available"

4. **Data Transformation**:
   ```typescript
   // Before transformation
   { "Account": "Cash Account" }
   
   // After transformation
   { "account_id": "uuid-123-456" }
   ```

5. **Error Handling**:
   - Rows with "Not Available" lookup values cannot be uploaded
   - System highlights these rows in red
   - User must fix or remove invalid rows

### Lookup Field Configuration

Lookup fields are configured in metadata:
```json
{
  "account_id": {
    "displayName": "Account",
    "datatype": "uuid",
    "tableProps": {
      "columnType": "select",
      "selectProps": {
        "instanceType": "account",
        "instanceLabel": "name",
        "instanceKey": "id"
      }
    }
  }
}
```

## Required Fields for Upload Button

The upload button in the CSV mapping interface is enabled only when **all** of the following conditions are met. This validation is **generic** and works for any model based on its view metadata.

### Conditions for Upload Button Enablement

1. **All Required Fields Mapped**: 
   - Fields with `required: true` AND `permission: "update"` must be mapped
   - The system reads these requirements from view metadata
   - **Example (posting_view)**: 
     - `value_date` (Value Date) - Required, Date field
     - `description` (Description) - Required, Text field
   - **Example (account_view)**: 
     - `name` (Name) - Required, Text field
     - `classification` (Classification) - Required, Enum field

2. **No Invalid Lookup Values**:
   - No rows can have "Not Available" lookup field values
   - All lookup fields (fields with `tableProps.columnType === "select"`) must resolve to valid database records
   - System validates lookup values in real-time during mapping

### Validation Logic (Generic)

The validation is implemented generically in `CSVMapper` component:

```typescript
const isUploadButtonEnabled = () => {
  // Get all fields that are both required AND have update permission
  // This works for any model - reads from metadata
  const requiredFields = Object.entries(filedSets)
    .filter(
      ([, value]: any) =>
        value?.required === true && value?.permission === "update"
    )
    .map(([key]) => key);
  
  // Check if all required fields are mapped
  const allRequiredFieldsMapped = requiredFields.every((field) => 
    selectedValues.includes(field)
  );
  
  // Check if there are any invalid lookup values
  const noNotAvailableRows = !hasNotAvailableRows();
  
  return allRequiredFieldsMapped && noNotAvailableRows;
};
```

**Note**: The validation is completely metadata-driven. For any model, the system:
1. Reads view metadata to determine required fields
2. Checks if all required fields are mapped
3. Validates lookup field values
4. Enables upload button only when all conditions are met

### Validation Logic

```typescript
const isUploadButtonEnabled = () => {
  // Get all fields that are both required AND have update permission
  const requiredFields = Object.entries(filedSets)
    .filter(
      ([, value]: any) =>
        value?.required === true && value?.permission === "update"
    )
    .map(([key]) => key);
  
  // Check if all required fields are mapped
  const allRequiredFieldsMapped = requiredFields.every((field) => 
    selectedValues.includes(field)
  );
  
  // Check if there are any invalid lookup values
  const noNotAvailableRows = !hasNotAvailableRows();
  
  return allRequiredFieldsMapped && noNotAvailableRows;
};
```

## Error Handling

### Frontend Error Handling

1. **File Validation**:
   - CSV must have headers
   - CSV must contain data rows
   - File type validation

2. **Mapping Validation**:
   - All required fields must be mapped
   - No duplicate field mappings
   - Lookup values must exist

3. **Data Validation**:
   - Required field values must be present
   - Data type validation
   - Lookup field validation

### Backend Error Handling

1. **Validation Errors**:
   - Missing required fields
   - Invalid data types
   - Foreign key violations

2. **Transaction Errors**:
   - Database constraint violations
   - Timeout errors (100 second limit)
   - Batch processing errors

3. **Error Response Format**:
   ```json
   {
     "success": false,
     "error": "Error message description"
   }
   ```

## Usage Examples

### Example 1: Importing Posting Transactions (Standard Format)

This example demonstrates importing posting transactions without pre-selecting an account.

1. **Navigate to Transactions Page**:
   ```
   https://books.fabriqdata.com/accounting/transactions
   ```

2. **Click Import Button**:
   - Import button is in the page header
   - Opens `ImportPannel` component with `modelType="posting"` and `modelView="posting_view"`

3. **Select CSV Upload**:
   - Click "UPLOAD A NEW CSV" card
   - Select CSV file from system

4. **Map Fields**:
   - System reads `posting_view` metadata to determine available fields
   - Map CSV columns to transaction fields:
     - `Value Date` → `value_date` (required)
     - `Description` → `description` (required)
     - `Account` → `account_id` (required, lookup field)
     - `Amount` → `amount`
     - `Credit Account` → `credit_account_id` (optional, lookup field)
     - `Category` → `category_id` (optional, lookup field)

5. **Validate Data**:
   - System validates lookup fields (account names must exist)
   - Fix any "Not Available" values
   - Ensure required fields are mapped

6. **Upload**:
   - Click "Upload CSV" button
   - Wait for processing
   - View success message

**Sample CSV Format**:
```csv
Value Date,Description,Account,Amount,Credit Account,Category
2024-01-15,Office Supplies Purchase,Office Supplies,150.00,Cash on Hand,Office Supplies
2024-01-16,Client Payment Received,Cash on Hand,5000.00,Accounts Receivable,Service Revenue
2024-01-17,Monthly Rent Payment,Rent,2500.00,Checking Account,Rent
```

### Example 2: Importing Posting Transactions (With Account Pre-selected)

This example demonstrates importing transactions for a specific account using debit/credit format.

1. **Navigate to Transactions Page** and click Import

2. **Select Account** (before file upload):
   - `UploadManager` shows account dropdown (because `relation="account"` is configured)
   - Select an account (e.g., "Cash on Hand")
   - This sets `relationId` state

3. **Upload CSV with Debit/Credit Columns**:
   ```csv
   Value Date,Description,Credit Account,Debit Amount,Credit Amount,Category
   2024-01-15,Office Supplies,Office Expenses,150.00,0.00,Office Supplies
   2024-01-16,Client Payment,Accounts Receivable,0.00,5000.00,Service Revenue
   ```

4. **Map Fields**:
   - `Value Date` → `value_date`
   - `Description` → `description`
   - `Credit Account` → `credit_account_id`
   - `Debit Amount` → `debit_amount` (temporary field)
   - `Credit Amount` → `credit_amount` (temporary field)

5. **Data Transformation**:
   - `updateCSVData` function transforms the data:
     - If `Debit Amount > 0`: Sets `account_id = relationId`, `credit_account_id = mapped value`, `amount = debit_amount`
     - If `Credit Amount > 0`: Sets `credit_account_id = relationId`, `account_id = mapped value`, `amount = credit_amount`
   - Temporary `debit_amount` and `credit_amount` fields are removed

6. **Upload**: Same as Example 1

### Example 3: Importing Chart of Accounts

This example shows importing a different model type (accounts).

1. **Navigate to Chart of Accounts** page

2. **Click Import**:
   - `ImportPannel` rendered with `modelType="account"` and `modelView="account_view"`

3. **Upload CSV**:
   ```csv
   Name,Classification,Parent Account,Code
   Office Expenses,Expense,Expenses,6000
   Rent,Expense,Expenses,6100
   Utilities,Expense,Expenses,6200
   ```

4. **Map Fields**:
   - System reads `account_view` metadata
   - Map: `Name` → `name`, `Classification` → `classification`, etc.

5. **Custom Transformation** (if needed):
   - If `type` field needs to be an array:
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

6. **Upload**: Standard process applies

### Generic Pattern for Any Model

The import process works identically for any model:

1. **Configure Import** in your list page:
   ```typescript
   <Master
     type="your_model"           // e.g., "category", "supplier", "customer"
     view="your_model_view"
     listConfig={{
       importConfig: {
         updateCSVData: yourTransformFunction,  // Optional
         relation: "parent_model",              // Optional
         relationFieldId: "parent_id"          // Optional
       }
     }}
   />
   ```

2. **CSV Format**: Based on your model's metadata
   - Include columns for fields with `permission: "update"`
   - Use display names or field names as headers
   - Lookup fields should use the `instanceLabel` value (typically "name")

3. **Field Mapping**: System automatically shows available fields from metadata

4. **Data Transformation**: Implement `updateCSVData` for any custom logic

### Programmatic Usage

The import functionality can be used programmatically for any model:

```typescript
// Frontend API call (generic for any model)
import { importAPI } from '@/api/api';

// Example: Import posting transactions
const formattedData = {
  data: csvRecords,  // Array of records after transformation
  mapping: {
    "Value Date": "value_date",
    "Description": "description",
    "Account": "account_id",
    "Amount": "amount",
    "Credit Account": "credit_account_id"
  },
  parentData: {      // Optional: if parent record selected
    account_id: "selected_account_id"
  },
  isJSON: true
};

const result = await importAPI.uploadJSON(
  "posting",         // modelType: any model name
  "posting_view",    // modelView: corresponding view
  formattedData
);

// Example: Import accounts
const accountData = {
  data: accountRecords,
  mapping: {
    "Name": "name",
    "Classification": "classification",
    "Code": "code"
  },
  isJSON: true
};

const accountResult = await importAPI.uploadJSON(
  "account",
  "account_view",
  accountData
);
```

## Technical Details

### Batch Processing

- **Batch Size**: 1000 records per batch
- **Transaction Timeout**: 100 seconds
- **Processing**: Sequential batch processing within transaction

### Data Transformation

1. **Field Mapping**: CSV columns → Database fields
2. **Type Conversion**: Automatic type conversion based on field metadata
3. **Metadata Injection**: Automatic addition of:
   - `org_id`: User's organization ID
   - `created_by`: User ID
   - `modified_by`: User ID
4. **Parent Data Merging**: Optional parent record data

### Performance Considerations

- Large files are processed in batches
- Streaming support for very large CSV files
- Transaction-based processing ensures data consistency
- Timeout handling prevents hanging operations

## Future Enhancements

Potential improvements identified in code:

1. **Bulk Edit**: Commented out bulk edit functionality could be enabled
2. **Progress Tracking**: Real-time progress updates during upload
3. **Error Reporting**: Detailed error reports for failed rows
4. **Template Management**: Save and reuse mapping templates
5. **Validation Rules**: Custom validation rules per field
6. **Import History**: Track and view import history

## Related Files

### Frontend
- `frontend-1/src/components/import/ImportPannel.tsx`
- `frontend-1/src/components/import/CsvMapper.tsx`
- `frontend-1/src/components/import/UploadManager.tsx`
- `frontend-1/src/components/import/TransactionImport.tsx`
- `frontend-1/src/components/import/utils/upload.tsx`
- `frontend-1/src/features/import-extensions/types.ts` (PdfUploadContext, ImportExtension interfaces)
- `frontend-1/src/features/import-extensions/posting/index.tsx` (PostingImportExtension)
- `frontend-1/src/pages/Import.tsx`
- `frontend-1/src/pages/Master.tsx`
- `frontend-1/src/api/api.ts` (importAPI)

### Backend
- `backend/src/services/upload/UploadService.ts`
- `backend/src/rest/RestService.ts` (uploadCSV method)
- `backend/src/rest/routes.ts` (route definitions)
- `backend/src/lib/extractors/base-extractor.ts` (BaseDocumentExtractor with augmentation hooks)
- `backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts`
- `backend/src/lib/import-extensions/posting/index.ts` (PostingImportExtension)
- `backend/uploadService.ts` (legacy implementation)

## Data Transformation with `updateCSVData`

The `updateCSVData` function is a powerful mechanism for customizing import behavior per model. It receives data after field mapping and lookup resolution, allowing you to:

### When to Use `updateCSVData`

1. **Format Conversion**: Convert CSV format to match model requirements
   - Example: Debit/Credit amounts → account_id/credit_account_id

2. **Data Type Transformation**: Convert field values to required types
   - Example: Comma-separated strings → arrays
   - Example: Date format conversion

3. **Computed Fields**: Add fields based on other fields
   - Example: Calculate totals, set default values

4. **Conditional Logic**: Apply different transformations based on data
   - Example: Different logic when parent record is selected vs. not selected

5. **Field Merging**: Combine multiple CSV columns into one field
   - Example: First Name + Last Name → Full Name

### Function Signature

```typescript
type UpdateCSVDataFunction = (
  formattedData: {
    data: Record<string, any>[];        // Records after field mapping
    mapping: Record<string, string>;     // Column → field mapping
    parentData?: Record<string, any>;   // Parent record data (if relation selected)
    isJSON: boolean;
  },
  relationId?: string                    // Selected parent ID (if any)
) => {
  data: Record<string, any>[];
  mapping: Record<string, string>;
  parentData?: Record<string, any>;
  isJSON: boolean;
}
```

### Implementation Examples

**Example 1: Posting Transactions with Account Pre-selected**
```typescript
const updateCSVData = (formattedData: any, relationId: any) => {
  if (!relationId) return formattedData; // No transformation if no account selected
  
  formattedData.data = formattedData.data.map((record: any) => {
    const debitAmount = parseFloat(record.debit_amount || 0);
    const creditAmount = parseFloat(record.credit_amount || 0);
    
    if (debitAmount > 0) {
      record.account_id = relationId;
      record.amount = debitAmount;
      // credit_account_id already set from CSV mapping
    } else if (creditAmount > 0) {
      record.credit_account_id = relationId;
      record.amount = creditAmount;
      // account_id already set from CSV mapping
    }
    
    delete record.debit_amount;
    delete record.credit_amount;
    return record;
  });
  
  return formattedData;
};
```

**Example 2: Account Import with Type Array**
```typescript
const updateCSVData = (formattedData: any) => {
  formattedData.data = formattedData.data.map((record: any) => {
    // Convert comma-separated type string to array
    if (record.type && typeof record.type === 'string') {
      record.type = record.type
        .split(',')
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);
    }
    return record;
  });
  return formattedData;
};
```

**Example 3: Adding Computed Fields**
```typescript
const updateCSVData = (formattedData: any) => {
  formattedData.data = formattedData.data.map((record: any) => {
    // Add computed field
    if (record.quantity && record.unit_price) {
      record.total = parseFloat(record.quantity) * parseFloat(record.unit_price);
    }
    // Set default value
    if (!record.status) {
      record.status = 'active';
    }
    return record;
  });
  return formattedData;
};
```

**Example 4: Conditional Transformation Based on Parent**
```typescript
const updateCSVData = (formattedData: any, relationId: any) => {
  formattedData.data = formattedData.data.map((record: any) => {
    if (relationId) {
      // Parent selected: apply special logic
      record.parent_id = relationId;
      record.category = 'child';
    } else {
      // No parent: different logic
      record.category = 'standalone';
    }
    return record;
  });
  return formattedData;
};
```

## Notes

- The import system is **fully generic** and works with any model/view combination
- **Metadata-driven**: Field definitions, permissions, and validation come from view metadata
- The `TransactionImport` component exists but is currently commented out in favor of `ImportPannel`
- PDF extraction uses the extractor framework with AI-powered document processing
- Lookup field validation happens in real-time during mapping
- The system supports both direct CSV uploads and JSON-formatted data uploads
- `updateCSVData` is optional but recommended for complex transformations
- Parent record selection (`relation` prop) is optional and model-specific
- **Import Extensions**: Model-specific behavior can be added via import extensions:
  - Frontend extensions provide `getPdfUploadOptions()`, `getColumns()`, `renderToolbarActions()`
  - Backend extensions provide `customExtract()` for specialized document processing
  - Extensions receive full context (selected items, user info) via typed interfaces
- **Extractor Augmentation**: Subclasses can extend base extractor via hooks without modifying core logic

