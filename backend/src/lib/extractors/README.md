# AI-Powered Document Extraction System

This document extractor system provides a modular, extensible way to extract structured data from various document types using AI/LLM technology. The system includes a sophisticated document extraction framework that uses AI to parse PDF documents and extract structured data mapped to your database models.

## Key Features

- 🤖 **AI-Powered Extraction**: Uses Google's Gemini AI for intelligent document parsing
- 📄 **PDF Support**: Direct PDF processing without text extraction
- 🎯 **Model-Specific Extraction**: Each extractor maps to a specific database model
- 🔄 **1:1 Mapping**: Clean architecture with one extractor per model
- 🛡️ **Permission Integration**: Full integration with existing RBAC system
- 📊 **Structured Output**: Returns data ready for database insertion

## Architecture Overview

The document extraction system follows a clean, modular architecture:

```
ModelService.parseDocument()
    ↓
ExtractorRegistry.getExtractorForModel()
    ↓
BankStatementExtractor.extract()
    ↓
LLMService.generateContentFromBinary()
    ↓
Returns model-ready data
```

## Core Components

### 1. ModelService
The main service that orchestrates document parsing:

```typescript
// Parse a PDF document for a specific model
const result = await modelService.parseDocument(
  'posting',           // Target model
  authContext,         // User context with permissions
  pdfBuffer,           // PDF file buffer
  { extractorOptions: { /* optional config */ } }
);

if (result.success) {
  console.log('Extracted data:', result.data);
  console.log('Confidence:', result.metaData.confidence);
}
```

### 2. Document Extractors
Each extractor is responsible for a specific model and document type:

```typescript
// BankStatementExtractor maps to 'posting' model
export class BankStatementExtractor extends BaseDocumentExtractor {
  getTargetModel(): string {
    return 'posting'; // Maps to posting model only
  }
  
  getSupportedTypes(): string[] {
    return ['bank_statement', 'account_statement', 'credit_card_statement'];
  }
  
  getExtractionPrompt(): string {
    return `Extract bank statement transaction data...`;
  }
  
  getExpectedSchema(): Record<string, any> {
    return {
      transactions: [{
        name: 'string',
        account_name: 'string',
        value_date: 'date',
        posting_date: 'date',
        amount: 'number',
        posting_type: 'string',
        notes: 'string',
        description: 'string'
      }]
    };
  }
}
```

### 3. ExtractorRegistry
Manages extractor instances and provides model-based lookup:

```typescript
const registry = ExtractorRegistry.getInstance();

// Find extractor for a specific model
const extractor = registry.getExtractorForModel('posting');

// Get all available models
const models = registry.getAvailableModels(); // ['posting', 'invoice', ...]
```

## API Endpoints

### Parse Document
**POST** `/api/parse-document/:modelName`

Upload and parse a PDF document for a specific model.

**Parameters:**
- `modelName` (path): Target model name (e.g., "posting", "invoice")

**Request:**
```bash
curl -X POST \
  "https://api.example.com/api/parse-document/posting" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@bank-statement.pdf"
```

**Response (Bank Statement):**
```json
{
  "success": true,
  "data": [
    {
      "name": "NEFT-HDFCN52025092693558514-ADITYA BIRLA FINANCE",
      "account_name": "611901080478",
      "value_date": "2025-09-26",
      "posting_date": "2025-09-26",
      "amount": 1,
      "posting_type": "CREDIT",
      "notes": "NEFT-HDFCN52025092693558514-ADITYA BIRLA FINANCE",
      "description": "NEFT-HDFCN52025092693558514-ADITYA BIRLA FINANCE"
    }
  ],
  "metaData": {
    "confidence": 60,
    "modelName": "posting",
    "processingTime": 6470,
    "extractorType": "BankStatementExtractor",
    "fileName": "bank-statement.pdf",
    "fileSize": 164963,
    "uploadedAt": "2025-10-08T17:32:59.823Z"
  },
  "error": undefined
}
```

**Response (Invoice):**
```json
{
  "success": true,
  "data": {
    "invoice": {
      "invoice_number": "INV-2024-001",
      "invoice_date": "2024-01-15",
      "invoice_version": 1,
      "invoice_status": "PENDING",
      "invoice_type": "PURCHASE",
      "supplier_name": "ABC Supply Company",
      "supplier_remarks": "Payment due within 30 days",
      "shipping_terms": "FOB Destination",
      "shipping_method": "Ground Shipping",
      "payment_terms": "Net 30",
      "remit_to": "ABC Supply Company, 123 Business St, City, State 12345",
      "bill_to": "Your Company, 456 Corporate Ave, City, State 67890",
      "deliver_to": "Your Company Warehouse, 789 Storage Rd, City, State 67890",
      "requester_name": "John Doe",
      "requester_email": "john.doe@company.com",
      "po_number": "PO-2024-001",
      "coa": "COA-001",
      "additional_tax": 0,
      "shipping_cost": 25.00,
      "tax_on_shipping": 2.50,
      "handling_cost": 5.00,
      "tax_on_handling": 0.50,
      "misc_cost": 0,
      "tax_on_misc": 0,
      "invoice_net_total": 1000.00,
      "shipping_handling_misc_total": 30.00,
      "invoice_total": 1033.00,
      "balance_amount": 1033.00,
      "terms_and_conditions": "Standard terms apply"
    },
    "line_items": [
      {
        "item_name": "Office Supplies",
        "item_number": "OS-001",
        "item_description": "Premium office supplies package",
        "item_type": "SUPPLIES",
        "rate": 100.00,
        "ordered_quantity": 10,
        "ordered_amount": 1000.00,
        "invoice_qty": 10,
        "line_total": 1000.00,
        "invoiced_amount": 1000.00,
        "tax_type": "SALES_TAX",
        "tax_rate": 8.5,
        "tax_rate_intra": 0,
        "line_tax_amount": 85.00,
        "po_number": "PO-2024-001",
        "need_by_date": "2024-01-20"
      }
    ],
    "context": {
      "currency": "USD",
      "language": "en",
      "documentType": "invoice",
      "pageCount": 1,
      "extractedAt": "2024-01-15T10:30:00Z"
    }
  },
  "metaData": {
    "confidence": 85,
    "modelName": "invoice",
    "processingTime": 8500,
    "extractorType": "InvoiceExtractor",
    "fileName": "invoice.pdf",
    "fileSize": 245760,
    "uploadedAt": "2024-01-15T10:30:00Z"
  },
  "error": undefined
}
```

## Supported Models and Extractors

| Model | Extractor | Document Types | Description |
|-------|-----------|----------------|-------------|
| `posting` | `BankStatementExtractor` | `bank_statement`, `account_statement`, `credit_card_statement` | Extracts transaction data from bank statements |
| `invoice` | `InvoiceExtractor` | `invoice`, `bill`, `vendor_invoice`, `supplier_invoice`, `purchase_invoice` | Extracts invoice header and line item data from invoices |
| `expense_report` | `ReceiptExtractor` | `receipt`, `expense` | Extracts expense data from receipts (planned) |

## Frontend Integration

### React/JavaScript Example

```javascript
const parsePDFDocument = async (file, modelName, token) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`/api/parse-document/${modelName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Extracted data:', result.data);
      console.log('Confidence:', result.metaData.confidence);
      return result.data;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Parse failed:', error);
    throw error;
  }
};

// Usage
const postingData = await parsePDFDocument(pdfFile, 'posting', authToken);
const invoiceData = await parsePDFDocument(invoiceFile, 'invoice', authToken);
```

### Vue.js Example

```javascript
// Vue component method
async parseDocument(file, modelName) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.$http.post(
      `/api/parse-document/${modelName}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${this.$store.state.auth.token}`
        }
      }
    );

    if (response.data.success) {
      this.extractedData = response.data.data;
      this.confidence = response.data.metaData.confidence;
      this.showSuccessMessage('Document parsed successfully!');
    } else {
      this.showErrorMessage(response.data.error);
    }
  } catch (error) {
    this.showErrorMessage('Failed to parse document');
    console.error('Parse error:', error);
  }
}
```

## Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "data": null,
  "metaData": null,
  "error": "Error message describing what went wrong"
}
```

**Common Error Scenarios:**
- `400 Bad Request`: Invalid file type, file too large, or missing file
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions for the target model
- `404 Not Found`: Model not found or no extractor available
- `500 Internal Server Error`: Processing failed

## Performance Considerations

- **Processing Time**: Typically 6-8 seconds for bank statements
- **File Size Limit**: 10MB maximum
- **Confidence Scores**: Range from 0-100%, typically 60-80% for well-formatted documents
- **Rate Limiting**: Consider implementing rate limiting for production use

## Security Features

- **Authentication Required**: All endpoints require valid JWT tokens
- **Permission Integration**: Uses existing RBAC system for model access control
- **File Validation**: Validates file type and size before processing
- **Secure Processing**: Files are processed in memory without permanent storage

## Adding New Extractors

To add support for a new document type:

1. **Create Extractor Class:**
```typescript
export class InvoiceExtractor extends BaseDocumentExtractor {
  getTargetModel(): string {
    return 'invoice';
  }
  
  getSupportedTypes(): string[] {
    return ['invoice', 'bill', 'vendor_invoice', 'supplier_invoice', 'purchase_invoice'];
  }
  
  getExtractionPrompt(): string {
    return `Extract invoice data from the provided document...`;
  }
  
  getExpectedSchema(): Record<string, any> {
    return {
      invoice: {
        invoice_number: 'string',
        invoice_date: 'date',
        supplier_name: 'string',
        invoice_total: 'number',
        // ... other invoice fields
      },
      line_items: [{
        item_name: 'string',
        rate: 'number',
        ordered_quantity: 'number',
        // ... other line item fields
      }]
    };
  }
}
```

2. **Register in ExtractorRegistry:**
```typescript
// In extractor-registry.ts
private initializeExtractors(): void {
  // Initialize invoice extractor
  const invoiceExtractor = new InvoiceExtractor();
  
  // Register invoice extractor by its supported types
  invoiceExtractor.getSupportedTypes().forEach(type => {
    this.extractors.set(type, invoiceExtractor);
  });
}
```

3. **Test the Integration:**
```bash
curl -X POST \
  "https://api.example.com/api/parse-document/invoice" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@invoice.pdf"
```

## Configuration

The system uses environment variables for AI service configuration:

```env
# Required for AI processing
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64=base64-encoded-service-account-key
```

## Best Practices

1. **File Preparation**: Ensure PDFs are clear and well-formatted for better extraction accuracy
2. **Model Selection**: Choose the correct model name based on your data structure
3. **Error Handling**: Always check the `success` flag and handle errors gracefully
4. **Confidence Scores**: Use confidence scores to validate extraction quality
5. **Batch Processing**: For multiple documents, process them sequentially to avoid rate limits

---

# Document Extractor System (Technical Implementation)

This section covers the technical implementation details for developers working with the extractor system.

## Architecture

The system follows the same pattern as `reports.ts` and `actions.ts` in the lib folder:

- **Main Entry Point**: `extractors.ts` - Similar to `reports.ts` and `actions.ts`
- **Modular Extractors**: Individual extractors in `extractors/` folder
- **Registry Pattern**: Central registry to map document types to extractors
- **Base Classes**: Common functionality in base classes

## Usage

### Basic Document Extraction

```typescript
import { extract_document } from '../lib/extractors';

// Extract from text content
const result = await extract_document(
  context, 
  'bank_statement', 
  'Bank Statement\nAccount: ****1234\nBalance: $1,000.00'
);

// Extract from binary content (PDF, images)
const pdfBuffer = fs.readFileSync('bank-statement.pdf');
const result = await extract_document(context, 'bank_statement', pdfBuffer);
```

### Get Supported Document Types

```typescript
import { get_supported_document_types } from '../lib/extractors';

const types = await get_supported_document_types(context);
console.log(types); // Array of DocumentType objects
```

### Batch Processing

```typescript
import { batch_extract_documents } from '../lib/extractors';

const documents = [
  { id: '1', type: 'bank_statement', content: bankStatementText },
  { id: '2', type: 'account_statement', content: accountStatementBuffer },
  { id: '3', type: 'credit_card_statement', content: creditCardStatementText }
];

const results = await batch_extract_documents(context, documents);
```

## Supported Document Types

- **Bank Statement**: Bank and credit card statements

## Adding New Document Types

1. Create a new extractor class extending `BaseDocumentExtractor`:

```typescript
export class CustomExtractor extends BaseDocumentExtractor {
  getSupportedTypes(): string[] {
    return ['custom_document'];
  }

  getExtractionPrompt(): string {
    return 'Extract custom document information...';
  }

  getExpectedSchema(): Record<string, any> {
    return {
      field1: 'string',
      field2: 'number',
      // ... other fields
    };
  }
}
```

2. Register the extractor in `ExtractorRegistry`:

```typescript
const registry = ExtractorRegistry.getInstance();
const customExtractor = new CustomExtractor();
registry.registerExtractor('custom_document', customExtractor);
```

## Configuration

Each extractor can be configured with:

- **Confidence Threshold**: Minimum confidence score for extraction
- **Custom Fields**: Specific fields to extract
- **Language**: Document language for better extraction
- **Metadata**: Include processing metadata in results

## Error Handling

The system provides comprehensive error handling:

- **Validation**: Document content validation
- **Processing Errors**: Graceful handling of processing failures
- **LLM Errors**: Fallback for AI extraction failures
- **Batch Processing**: Individual document error isolation

## Performance Considerations

- **Caching**: Extractor instances are cached in the registry
- **Batch Processing**: Parallel processing for multiple documents
- **Confidence Scoring**: Automatic confidence calculation
- **Resource Management**: Efficient memory usage for large documents
