# Prompt Management System

The prompt management system is responsible for managing system prompts for different models in the application. It provides intelligent prompt generation based on the context and available models.

## Architecture

### Key Components

1. **DynamicPromptManager** (`src/agent/prompt/DynamicPromptManager.ts`): Main class that manages prompt generation from database or JSON files
2. **Model Registry** (`src/config/model-registry.json`): Contains model definitions, descriptions, and metadata

### File Organization

```
src/
├── agent/
│   └── prompt/
│       └── DynamicPromptManager.ts    # Main prompt management logic
└── config/
    ├── model-registry.json    # Model definitions and metadata
    └── README.md             # This documentation
```

### Prompt Template Storage

Prompts are stored in two ways based on the `USE_LOCAL_PROMPT` environment variable:

- **JSON Files** (when `USE_LOCAL_PROMPT=true`): Located in `prisma/metadata/prompt-templates/`
  - Template metadata: `view_{view_id}_{prompt_type}.json`
  - Template text: `view_{view_id}_{prompt_type}.txt`
- **Database** (when `USE_LOCAL_PROMPT=false` or unset): Stored in `prompt_template` table

## Features

### Model Registry

The system uses a centralized model registry (`src/config/model-registry.json`) that contains:

- **Model descriptions**: Business context and purpose
- **Examples**: Common use cases and operations
- **Synonyms**: Alternative terms and names
- **Business context**: Domain-specific information

### Specialized Model Prompts

Each model can have its own specialized prompt that includes:

- Model-specific instructions and guidelines
- Domain-specific examples and use cases
- Tailored field validation rules
- Context-aware operations
- Related data search patterns

### Available Models

The system supports comprehensive models for procurement and financial management:

#### Core Models
- **supplier**: Supplier information and relationships
- **item_master**: Product and item information
- **item_category**: Item categorization
- **supplier_items**: Items associated with suppliers

#### Procurement Flow
- **purchase_requisition**: Purchase requests and approvals
- **item**: Junction model linking products to purchase requisitions
- **purchase_order**: Purchase orders from approved requisitions
- **purchase_order_item**: Items in purchase orders

#### Financial Management
- **invoice**: Supplier invoices and billing
- **invoice_item**: Line items in invoices
- **payment**: Payments to suppliers
- **receipt**: Goods receipts and delivery confirmations
- **receipt_item**: Items received

#### User Management
- **user**: System users and roles
- **department**: Organizational structure

## Usage

### Basic Usage

```typescript
import { DynamicPromptManager } from './agent/prompt/DynamicPromptManager';

const promptManager = new DynamicPromptManager(
    org_id, 
    user_id, 
    modelName, 
    viewName,      // optional
    promptTypes,   // optional
    context        // optional
);

// Generate prompt with permissions (async)
const prompt = await promptManager.generateDynamicPrompt(permissions);
```

### Environment Configuration

- **`USE_LOCAL_PROMPT=true`**: Reads prompts from JSON files in `prisma/metadata/prompt-templates/`
- **`USE_LOCAL_PROMPT=false` or unset**: Reads prompts from database `prompt_template` table

### Context-Aware Processing

The DynamicPromptManager supports context-aware processing:

```typescript
const context = {
    recordId: 'record-123',
    stateId: 'state-456',
    viewId: 'view-789'
};

const promptManager = new DynamicPromptManager(
    org_id, 
    user_id, 
    'purchase_requisition',
    'purchase_requisition_view',  // viewName
    ['default'],                   // promptTypes
    context
);
```

## Variable Substitution

The system supports dynamic variable substitution:

- `{{currentDate}}`: Current timestamp
- `{{userId}}`: Current user ID
- `{{modelName}}`: Current model name
- `{{viewName}}`: View name
- `{{promptType}}`: Prompt type(s)
- `{{context.recordId}}`: Record ID from context
- `{{context.stateId}}`: State ID from context
- `{{context.viewId}}`: View ID from context
- `{{accessibleModels}}`: Accessible models descriptions

## Conditional Blocks

The system supports conditional blocks for context-aware instructions:

```handlebars
{{#if context.recordId}}
- You are working with a specific record with ID: {{context.recordId}}
{{else}}
- You are working with records in general
{{/if}}
```

## Model Descriptions

For all models, the system automatically includes:

- Model descriptions from the registry
- Field information and requirements
- Examples and common terms
- Related model relationships

## Integration

The prompt management system integrates with:

- **AgentService**: Provides system prompts for AI agents
- **ModelRegistry**: Access to model definitions and metadata
- **Permission System**: Filters accessible models based on user permissions
- **Context System**: Provides record-specific context for operations

## Benefits

### Comprehensive Coverage
- **Procurement Flow**: Complete end-to-end procurement process
- **Financial Tracking**: Invoice processing and payment management
- **Inventory Management**: Goods receipt and order fulfillment
- **User Management**: User-based analytics and reporting

### Specialized Assistance
- Domain-specific knowledge for each model
- Context-aware operations and validations
- Business workflow understanding
- Related data relationship management

### Enhanced User Experience
- Natural language understanding
- Intelligent model selection
- Comprehensive error handling
- Rich, UI-friendly responses 