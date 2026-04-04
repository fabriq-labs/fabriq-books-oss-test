# Agent Module for Dynamic GraphQL and REST API Framework

This module adds LLM-powered function calling capabilities to the framework, allowing natural language interaction with your data models.

## Architecture

### Core Components

1. **ModelRegistry** (`src/services/registry/ModelRegistry.ts`)
   - Maintains metadata about all available models
   - Combines schema information from Prisma with business metadata
   - Provides model access control based on user permissions
   - Handles field definitions, relationships, and required fields
   - Manages model synonyms and example queries for better LLM understanding

2. **GenericFunctions & AgentTools** (`src/agent/GenericFunctions.ts`, `src/agent/AgentTools.ts`)
   - Defines a set of generic CRUD operations that work across all models
   - These are exposed to the LLM as tools via the Vercel AI SDK
   - Core functions include:
     - `createRecord`: Create new records in any model
     - `updateRecord`: Update existing records
     - `searchRecords`: Search with filtering and pagination
     - `identifyModel`: Helper to determine relevant model from user intent (not yet implemented)

3. **AgentService** (`src/agent/AgentService.ts`)
   - Main orchestrator for agent interactions
   - Handles LLM function/tool calls and responses
   - Integrates with ModelService for CRUD operations
   - Manages user context and permissions
   - Validates data against model schemas
   - Formats responses for client consumption

4. **FunctionExecutor** (`src/agent/FunctionExecutor.ts`)
   - Handles backend execution of CRUD and workflow functions
   - Workflow actions are supported in the backend, but not yet exposed as LLM tools

### Data Flow

1. **Request Handling**
   ```
   Client Request
        ↓
   AgentService.handleRequest()
        ↓
   AgentService exposes tools (from AgentTools)
        ↓
   ModelService (CRUD, search, etc.)
   ```

2. **Model Resolution & Permissions**
   ```
   User Request
        ↓
   ModelRegistry.getAccessibleModels()
        ↓
   AgentService builds context and system prompt
        ↓
   LLM chooses tool and model
   ```

## Implementation Details

### Model Registry

The `ModelRegistry` combines two sources of information:
1. **Schema Information** (from Prisma)
   - Field definitions and types
   - Relationships
   - Required fields
   - System fields

2. **Business Metadata** (from model-registry.json)
   - Model descriptions
   - Business context
   - Example queries
   - Common synonyms

Example model metadata:
```json
{
  "expense_report": {
    "name": "expense_report",
    "description": "Used for tracking and managing expense claims",
    "businessContext": "Finance and expense management",
    "examples": [
      "Submit a new expense claim",
      "Check status of my expense report"
    ],
    "synonyms": ["expense claim", "reimbursement", "cost report"]
  }
}
```

### Generic Functions (LLM Tools)

The system exposes a static set of generic functions to the LLM via the Vercel AI SDK tool interface. These are not dynamically generated per model, but are designed to work across all models:

```typescript
{
  name: "createRecord",
  description: "Create a new record in the specified model",
  parameters: {
    modelName: string, // Name of the model
    data: object       // Data for the record
  }
}
```

Other tools include `searchRecords`, `updateRecord`, and `identifyModel` (the last is a placeholder for future intent resolution).

### Error Handling

The system implements comprehensive error handling:
- Permission validation errors
- Invalid function parameters
- Model validation errors
- Database operation errors
- LLM provider errors

### Security Considerations

1. **Permission Validation**
   - Validates user access through ModelRegistry
   - Enforces organization boundaries
   - Validates field-level access

2. **Input Validation**
   - Validates data against model schema
   - Type checking for all fields
   - Required field validation

3. **Context Management**
   - Maintains user context
   - Enforces organization isolation
   - Tracks audit information

## Usage Examples

### Basic CRUD Operation
```typescript
// Create expense report
const response = await agentService.handleRequest(
  "Create an expense report for $500 for office supplies",
  authContext
);
```

### Search Operation
```typescript
// Search expense reports
const response = await agentService.handleRequest(
  "Find all expense reports over $1000 from last month",
  authContext
);
```

## Configuration

### Environment Variables

The system supports different LLM providers. Here are the required environment variables based on the provider:

#### Vertex AI (Google)
```env
# Required
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64=<base64_encoded_service_account_json>

# Optional
GOOGLE_CLOUD_LOCATION=us-central1  # Defaults to us-central1
LLM_MODEL=gemini-2.0-flash-001     # Defaults to gemini-2.0-flash-001
```

### Provider Configuration

> **Note:** The `ModelProviderFactory` is available for custom provider instantiation (see `src/agent/models/ModelProviderFactory.ts`), but is not used in the main agent entry point. The agent uses the Vercel AI SDK directly for LLM integration, and only the Vertex AI provider is currently supported.

The agent service can be created with default configuration:

```typescript
// Create agent service with default configuration
const agentService = new AgentService();
```

The Vertex AI provider:
- Uses base64 encoded service account credentials for authentication
- Automatically manages credential file lifecycle
- Configures model parameters for optimal performance:
  - temperature: 0.2
  - topP: 0.95
  - topK: 40

## Future Improvements

1. **Workflow Support**
   - Workflow actions are supported in the backend (FunctionExecutor), but not yet exposed as LLM tools
   - Future: Add workflow action tools and state transitions

2. **Performance Optimization**
   - Implement model registry caching
   - Optimize permission checks
   - Add request batching

3. **Feature Enhancements**
   - Add support for complex queries
   - Implement conversation memory
   - Add streaming responses

4. **Security Enhancements**
   - Add rate limiting
   - Implement request validation
   - Add audit logging 