# Agent Service Architecture Documentation

## Overview

This document provides a comprehensive, step-by-step explanation of the Agent Service architecture. It's designed for new team members to understand how the system works from the bottom up, starting with reusable components and building to the top-level routes.

The Agent Service enables LLM-powered natural language interaction with data models through three main endpoints:
- `/chat` - Non-streaming chat endpoint
- `/chat/stream` - Streaming chat endpoint  
- `/extract` - File extraction endpoint

---

## Table of Contents

1. [Bottom-Level Reusable Components](#bottom-level-reusable-components)
   - [Message Processor](#1-message-processor)
   - [Model Registry](#2-model-registry)
   - [Generic Functions & Schemas](#3-generic-functions--schemas)
   - [Agent Tools](#4-agent-tools)
   - [Tool Manager](#5-tool-manager)
   - [Prompt Manager](#6-prompt-manager)
   - [Dynamic Prompt Manager](#7-dynamic-prompt-manager)
   - [Model Service](#8-model-service)

2. [Middle-Level Orchestration](#middle-level-orchestration)
   - [Agent Service](#agent-service)

3. [Top-Level Routes](#top-level-routes)
   - [Route Setup](#route-setup)
   - [/chat Endpoint](#chat-endpoint)
   - [/chat/stream Endpoint](#chatstream-endpoint)
   - [/extract Endpoint](#extract-endpoint)

---

## Bottom-Level Reusable Components

### 1. Message Processor

**Location:** `src/agent/utils/messageProcessor.ts`

**Purpose:** Converts frontend messages (with base64 file data) to AI SDK-compatible format (with Uint8Array).

**Key Function:** `processMessages(messages: RawMessage[]): ProcessedMessage[]`

**How it works:**
1. **Input Format (RawMessage):**
   - Frontend sends files as base64 strings (JSON can't serialize Uint8Array/Buffer)
   - Format: `{ role: 'user', content: [{ type: 'text', text: '...' }, { type: 'file', data: 'data:application/pdf;base64,...', mimeType: '...' }] }`

2. **Processing Steps:**
   - Filters out invalid messages
   - Converts string content → stays as string
   - Processes array content:
     - Text parts → pass through unchanged
     - File parts → base64 string → Uint8Array (required by AI SDK)
     - Handles data URI format: `data:mime/type;base64,actual_base64_string`
     - Handles plain base64 strings
     - Extracts MIME type from data URI if not provided

3. **Output Format (ProcessedMessage):**
   - Files are now Uint8Array instead of base64 strings
   - Ready for AI SDK consumption

**Example:**
```typescript
// Input (from frontend)
{
  role: 'user',
  content: [
    { type: 'text', text: 'Extract this invoice' },
    { type: 'file', data: 'data:application/pdf;base64,JVBERi0...', mimeType: 'application/pdf' }
  ]
}

// Output (for AI SDK)
{
  role: 'user',
  content: [
    { type: 'text', text: 'Extract this invoice' },
    { type: 'file', data: Uint8Array([...]), mimeType: 'application/pdf' }
  ]
}
```

---

### 2. Model Registry

**Location:** `src/services/registry/ModelRegistry.ts`

**Purpose:** Central registry for all data models, combining Prisma schema metadata with business metadata. Provides access control based on user permissions.

**Key Method:** `getAccessibleModels(permissions: Record<string, any>): ModelMetadata[]`

**How it works:**
1. **Registry Structure:**
   - Maintains a map of all available models
   - Each model entry contains:
     - Schema info (fields, types, relationships from Prisma)
     - Business metadata (description, examples, synonyms from model-registry.json)
     - Required fields
     - Examples and common terms

2. **Access Control:**
   - Filters models based on user permissions
   - Checks if user has `read` or `write` permission for each model
   - Permission format: `permissions[modelName]['*'] === 'read' | 'write'`
   - Returns only models the user has access to

3. **Usage in Agent Service:**
   - Called early in request processing
   - Validates user has access to at least one model
   - Passes accessible models to prompt generation

**Example Model Metadata:**
```typescript
{
  name: 'purchase_requisition',
  description: 'Used for creating and managing purchase requisitions',
  fields: [
    { name: 'requester', type: 'string', isRequired: true },
    { name: 'total_amount', type: 'decimal', isRequired: false }
  ],
  examples: ['Create a new purchase requisition', 'Find my PRs'],
  synonyms: ['PR', 'purchase request', 'requisition']
}
```

---

### 3. Generic Functions & Schemas

**Location:** `src/agent/GenericFunctions.ts`

**Purpose:** Defines Zod schemas and function metadata for all available tools. These schemas validate tool parameters and provide descriptions to the LLM.

**Key Components:**
1. **Zod Schemas:** Type-safe parameter validation for each tool
2. **GENERIC_FUNCTIONS Array:** Function definitions with names, descriptions, and parameter schemas

**Available Tools:**

1. **createRecord** - Create new records
   - Schema: `{ modelName: string, data: object }`
   
2. **updateRecord** - Update existing records
   - Schema: `{ modelName: string, id: string, data: object }`

3. **searchRecords** - Search with filtering
   - Schema: `{ modelName: string, search?: array, page?: number, pageSize?: number }`
   - Supports: date ranges, user filters, case-insensitive search

4. **Model-Specific Search Tools:**
   - `searchItems` (item_master)
   - `searchSuppliers` (supplier)
   - `searchDepartments` (department)
   - `searchCostCenters` (cost_center)
   - `searchLocations` (location)
   - `searchProjects` (project_master)
   - `searchBudgetPeriods` (budget_period)
   - `searchBudgetLines` (budget_line)
   - `searchCOA` (coa)
   - `searchOrganizations` (organization)
   - `searchEmployees` (employee_master)
   - `searchUsers` (user_master)

5. **Relation Tools:**
   - `createChildItem` - Create empty child items
   - `updateChildItem` - Update child items with product, quantity, date
   - `addChildrenToParent` - Link existing children to parent
   - `updateChildRelation` - Update child through parent relation
   - `deleteRelation` - Remove child from relation

6. **Advanced Tools:**
   - `advancedSqlQuery` - Execute custom SQL queries
   - `extractInvoiceFromFile` - Extract invoice data from files

**How it works:**
- Schemas use Zod for runtime validation
- Each function definition includes:
  - `name`: Tool identifier
  - `description`: Natural language description for the LLM
  - `parameters`: Zod schema for validation

---

### 4. Agent Tools

**Location:** `src/agent/AgentTools.ts`

**Purpose:** Implements the actual execution logic for each tool. Each tool function takes `AuthContext` and returns a Vercel AI SDK `tool` object.

**Tool Structure:**
```typescript
export function createRecordTool(auth: AuthContext) {
  return tool({
    parameters: createRecordSchema,
    description: getDescription('createRecord'),
    execute: async ({ modelName, data }, _options) => {
      // Execution logic
      const result = await modelService.create(modelName, auth, data);
      return enrichedResult;
    }
  });
}
```

**Key Tool Functions:**

1. **createRecordTool** - Creates records, handles special cases (e.g., auto-setting `requester` for purchase_requisition)

2. **updateRecordTool** - Updates existing records

3. **searchRecordsTool** - Searches records with pagination and filtering

4. **Model-Specific Search Tools** - Force specific model names (e.g., `searchItemsTool` always searches `item_master`)

5. **updateChildItemTool** - Complex logic:
   - Finds child item by `item_number` within parent's items relation
   - Validates product assignment (product must be set before quantity/date)
   - Searches for products by name if needed
   - Returns product selection UI if product not found
   - Updates child through parent relationship

6. **advancedSqlQueryTool** - Executes SQL queries:
   - Validates query syntax
   - Handles different UI hints (table, metrics, chart)
   - Creates column metadata for formatting
   - Converts BigInt to Number for JSON serialization

7. **extractInvoiceFromFileTool** - Receives extracted invoice data from AI SDK:
   - Looks up purchase order if PO number found
   - Returns structured invoice data with UI hints

**Result Enrichment:**
- Tools enrich results with metadata for frontend display:
  - `tool`: Tool name used
  - `model`: Model name
  - `resultType`: 'record', 'list', 'metrics', etc.
  - `columns`: Field metadata with labels, types, formats
  - `uiHint`: Frontend display hint ('card', 'table', 'metrics')
  - `actions`: Available actions (view, edit URLs)

---

### 5. Tool Manager

**Location:** `src/agent/ToolManager.ts`

**Purpose:** Manages which tools are available based on the model context. Different models get different tool sets.

**Key Method:** `getToolsForModel(modelName: string, auth: AuthContext): any`

**How it works:**
1. **Singleton Pattern:** Uses `getInstance()` for single instance
2. **Model-Based Tool Selection:**
   - **`default` model:** 
     - Only `searchRecords`, `advancedSqlQuery`, `extractInvoiceFromFile`
     - Read-only operations
   
   - **`purchase_requisition` model:**
     - All CRUD operations: `searchRecords`, `createRecord`, `updateRecord`
     - Child item operations: `createChildItem`, `updateChildItem`
     - All related model search tools (items, suppliers, departments, etc.)
     - `advancedSqlQuery`
   
   - **`invoice` model:**
     - CRUD operations: `searchRecords`, `createRecord`, `updateRecord`
     - Invoice-specific: `processInvoiceFromPdf`, `extractInvoiceFromFile`
     - `advancedSqlQuery`
   
   - **Other models:**
     - Default: `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery`

3. **Auth Context:** Each tool receives `auth` context for permission checks

**Example:**
```typescript
// For purchase_requisition model
const tools = toolManager.getToolsForModel('purchase_requisition', auth);
// Returns object with ~15+ tool functions

// For default model
const tools = toolManager.getToolsForModel('default', auth);
// Returns object with 3 tool functions (read-only)
```

---

### 6. Dynamic Prompt Manager

**Location:** `src/agent/prompt/DynamicPromptManager.ts`

**Purpose:** Generates system prompts from database templates or JSON files based on `USE_LOCAL_PROMPT` environment variable.

**Key Method:** `generateDynamicPrompt(permissions?: Record<string, any>): Promise<string>`

**How it works:**

1. **Initialization:**
   - Takes: `org_id`, `user_id`, `modelName`, optional `viewName`, optional `promptTypes`, optional `context`
   - Checks `USE_LOCAL_PROMPT` environment variable to determine data source

2. **Template Retrieval (Database Mode - default):**
   - Queries `prompt_template` table via Prisma
   - Filters by:
     - View (via `view.model_name` and `view.name`)
     - Prompt type (or defaults to 'default')
     - App name (from `APP_NAME` env var)
   - Orders by: `is_default DESC, priority ASC, version DESC`

3. **Template Retrieval (JSON File Mode - when `USE_LOCAL_PROMPT=true`):**
   - Reads from `prisma/metadata/prompt-templates/` directory
   - Finds view JSON file matching `model_name` and `viewName`
   - Gets `view_id` from view file
   - Finds matching template files: `view_{view_id}_{prompt_type}.json` and `.txt`
   - Reads metadata from JSON and prompt text from TXT file
   - Filters by `app_name` if specified

4. **Template Merging:**
   - If multiple templates match, merges them by priority
   - Default templates first
   - Higher priority templates first
   - Newer versions first

5. **Placeholder Replacement:**
   - `{{accessibleModels}}` → Model descriptions
   - `{{currentDate}}` → ISO date string
   - `{{userId}}` → User ID
   - `{{modelName}}` → Model name
   - `{{viewName}}` → View name
   - `{{promptType}}` → Prompt type(s)
   - `{{context.recordId}}` → Record ID if in context
   - Conditional blocks with `{{#if context.recordId}}...{{else}}...{{/if}}`

6. **Context Support:**
   - Can create/update prompt templates (database mode only)
   - Can get or create views automatically (database mode only)

**Database Schema:**
- `prompt_template`: Stores prompt templates linked to views
- `view`: Groups prompts by model and view name

---

### 8. Model Service

**Location:** `src/services/core/ModelService.ts`

**Purpose:** Core service for all database operations (CRUD, search, relations, SQL queries, document parsing). Used by agent tools.

**Key Methods Used by Agent Tools:**

1. **`create(modelName, auth, data)`** - Create records
2. **`update(modelName, auth, id, data)`** - Update records
3. **`search(modelName, auth, params)`** - Search with filters and pagination
4. **`getById(modelName, auth, id)`** - Get single record
5. **`updateChild(modelName, auth, parentId, relation, childId, data)`** - Update child through parent
6. **`addChildrenToParent(modelName, parentId, relation, auth, childIds)`** - Link children to parent
7. **`deleteRelation(auth, modelName, id, relation, childId)`** - Remove child relation
8. **`executeSqlQuery(query, auth)`** - Execute custom SQL
9. **`parseDocument(modelName, auth, buffer, options)`** - Extract data from PDFs/images

**Document Parsing:**
- Uses `ExtractorRegistry` to find appropriate extractor for model
- Extracts data without validation (read-only operation)
- Returns structured data matching model schema

**SQL Query Execution:**
- Validates user permissions
- Executes raw SQL queries
- Returns results with metadata

---

## Middle-Level Orchestration

### Agent Service

**Location:** `src/agent/AgentService.ts`

**Purpose:** Main orchestrator that coordinates all components. Handles both streaming and non-streaming requests.

**Key Methods:**

#### 1. `prepareRequestSetup()`

**Purpose:** Common setup for both streaming and non-streaming requests. Processes messages, validates access, and prepares AI SDK configuration.

**Steps:**
1. **Get Accessible Models:**
   ```typescript
   const accessibleModels = ModelRegistry.getInstance().getAccessibleModels(auth.permissions || {});
   ```
   - Validates user has access to at least one model
   - Throws error if no access

2. **Process Messages:**
   ```typescript
   const processedMessages = processMessages(allMessages);
   ```
   - Converts message format (base64 → Uint8Array)
   - Handles string messages, array content, file attachments

3. **Determine Model Name:**
   ```typescript
   const modelName = context?.modelName || 'default';
   ```
   - Gets from context or defaults to 'default'

4. **Create System Prompt:**
   ```typescript
   const systemPrompt = await this.createSystemPrompt(auth.user?.id, accessibleModels, {...context});
   ```
   - Always uses DynamicPromptManager (handles both database and JSON files based on USE_LOCAL_PROMPT)
   - Includes accessible models, permissions, org context

5. **Get Tools:**
   ```typescript
   const tools = toolManager.getToolsForModel(modelName, auth);
   ```
   - Gets model-specific tool set from ToolManager

6. **Return Configuration:**
   - Returns: `accessibleModels`, `processedMessages`, `modelName`, `systemPrompt`, `tools`

#### 2. `createSystemPrompt()`

**Purpose:** Creates the system prompt with model context and route context.

**Steps:**
1. **Initialize DynamicPromptManager:**
   - Always uses `DynamicPromptManager` which handles both database and JSON file modes
   - Checks `USE_LOCAL_PROMPT` environment variable internally
   - Passes: `org_id`, `user_id`, `modelName`, `viewName`, `promptTypes`, `context`

2. **Generate Prompt:**
   - If `USE_LOCAL_PROMPT=true`: Reads from JSON files in `prisma/metadata/prompt-templates/`
   - If `USE_LOCAL_PROMPT=false` or unset: Reads from database `prompt_template` table
   - Includes accessible models, permissions, placeholders replaced

3. **Return Complete Prompt:**
   - Ready for AI SDK consumption

#### 3. `handleRequest()`

**Purpose:** Handles non-streaming chat requests using Vercel AI SDK `generateText`.

**Steps:**
1. **Setup:**
   ```typescript
   const { processedMessages, systemPrompt, tools } = await this.prepareRequestSetup(...);
   ```

2. **Call AI SDK:**
   ```typescript
   const result = await generateText({
     model: google(process.env.LLM_MODEL || 'gemini-2.0-flash-001'),
     messages: [
       { role: 'system', content: systemPrompt },
       ...processedMessages
     ],
     tools,
     maxSteps: 2
   });
   ```
   - Uses Google Gemini model
   - Includes system prompt + user messages
   - Provides tools for function calling
   - Max 2 steps (LLM can call tools, get results, respond)

3. **Return Result:**
   ```typescript
   return {
     content: result.text,        // Final text response
     toolResults: result.toolResults,  // Tool execution results
     steps: result.steps          // All steps (tool calls + responses)
   };
   ```

**Tool Calling Flow:**
1. LLM receives user message + system prompt + available tools
2. LLM decides to call a tool (e.g., `searchRecords`)
3. Tool executes (searches database via ModelService)
4. Tool result returned to LLM
5. LLM processes result and generates final response (or calls another tool if `maxSteps > 1`)

#### 4. `handleStreamingRequest()`

**Purpose:** Handles streaming chat requests using Vercel AI SDK `streamText`.

**Steps:**
1. **Setup:** Same as `handleRequest()`

2. **Call AI SDK:**
   ```typescript
   const result = streamText({
     model: google(...),
     system: systemPrompt,
     messages: processedMessages,
     tools,
     maxSteps: 2
   });
   ```

3. **Convert to Stream:**
   ```typescript
   const streamResponse = result.toDataStreamResponse();
   return streamResponse.body as ReadableStream;
   ```
   - Returns Server-Sent Events (SSE) stream
   - Frontend receives chunks as they're generated

**Difference from Non-Streaming:**
- Uses `streamText` instead of `generateText`
- System prompt passed as `system` parameter (not in messages)
- Returns stream instead of final result
- Tool results streamed as they occur

---

## Top-Level Routes

### Route Setup

**Location:** `src/agent/routes.ts`

**Initialization:**
```typescript
export function createAgentRouter() {
  const router = Router();
  const agentService = new AgentService();
  const upload = multer({
    storage: multer.memoryStorage(), // Files in memory only
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });
  // ... define routes
  return router;
}
```

**Key Components:**
- `AgentService` instance
- `multer` for file uploads (memory storage, 10MB limit)
- `authMiddleware` for authentication

---

### /chat Endpoint

**Route:** `POST /chat`

**Purpose:** Non-streaming chat endpoint for conversational AI interactions.

**Request Flow:**

1. **Authentication:**
   ```typescript
   router.post('/chat', authMiddleware, async (req: Request, res) => {
     if (!req.context?.auth?.user) {
       return res.status(401).json({ error: "Unauthorized" });
     }
   ```
   - Validates user is authenticated
   - Auth context available in `req.context.auth`

2. **Request Validation:**
   ```typescript
   const { messages, context } = req.body;
   if (!messages || messages.length === 0) {
     return res.status(400).json({ error: "No messages provided" });
   }
   const latestMessage = messages[messages.length - 1];
   ```
   - Validates messages array exists
   - Extracts latest message for processing

3. **Message Processing:**
   ```typescript
   const previousMessages = messages
     .slice(0, -1)
     .map(msg => ({ role: msg.role, content: msg.content }))
     .filter(msg => msg.content && msg.content.trim() !== '');
   ```
   - Separates latest message from conversation history
   - Normalizes message format

4. **Agent Service Call:**
   ```typescript
   const response = await agentService.handleRequest(
     latestMessage.content,
     req.context.auth,
     previousMessages,
     context
   );
   ```
   - Passes: latest message content, auth context, previous messages, route context

5. **Response Format:**
   ```typescript
   res.json({
     choices: [{
       message: {
         id: req.body.id,
         role: 'assistant',
         content: response.content || ''
       }
     }],
     steps: response.steps  // Tool execution details
   });
   ```
   - Compatible with OpenAI API format
   - Includes tool execution steps for debugging

**Example Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Show me my purchase requisitions" },
    { "role": "assistant", "content": "Here are your PRs..." },
    { "role": "user", "content": "Create a new one" }
  ],
  "context": {
    "modelName": "purchase_requisition",
    "recordId": "...",
    "orgId": "..."
  }
}
```

**Example Response:**
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "I'll create a new purchase requisition for you..."
    }
  }],
  "steps": [
    {
      "type": "tool-call",
      "toolName": "createRecord",
      "args": { "modelName": "purchase_requisition", "data": {...} }
    },
    {
      "type": "tool-result",
      "result": { "id": "...", "data": {...} }
    }
  ]
}
```

---

### /chat/stream Endpoint

**Route:** `POST /chat/stream`

**Purpose:** Streaming chat endpoint for real-time response generation.

**Request Flow:**

1. **Authentication & Validation:** Same as `/chat`

2. **Stream Setup:**
   ```typescript
   res.setHeader('Content-Type', 'text/event-stream');
   res.setHeader('Cache-Control', 'no-cache');
   res.setHeader('Connection', 'keep-alive');
   res.setHeader('X-Accel-Buffering', 'no');
   ```
   - Sets Server-Sent Events (SSE) headers
   - Prevents buffering

3. **Get Stream:**
   ```typescript
   const dataStream = await agentService.handleStreamingRequest(
     latestMessage.content,
     req.context.auth,
     messages.slice(0, -1),
     context
   );
   ```
   - Returns ReadableStream from AI SDK

4. **Convert & Pipe:**
   ```typescript
   const reader = dataStream.getReader();
   const readable = new Readable({
     async read() {
       const { done, value } = await reader.read();
       if (done) {
         this.push(null);
       } else {
         this.push(value); // Stream chunks to client
       }
     }
   });
   readable.pipe(res);
   ```
   - Converts Web ReadableStream to Node.js Readable stream
   - Pipes chunks directly to HTTP response

**Stream Format:**
- SSE format: `data: {...}\n\n`
- Each chunk is a JSON object:
  ```json
  {
    "type": "text-delta",
    "textDelta": "I'll "
  }
  ```
- Tool calls streamed as separate events
- Final chunk indicates completion

**Error Handling:**
- If headers not sent: Return JSON error
- If headers sent: Send SSE error event

---

### /extract Endpoint

**Route:** `POST /extract`

**Purpose:** File extraction endpoint for processing documents (invoices, etc.) with AI.

**Request Flow:**

1. **Authentication & File Validation:**
   ```typescript
   router.post('/extract', authMiddleware, upload.single('file'), async (req: Request, res) => {
     if (!req.file) {
       return res.status(400).json({ error: "No file uploaded" });
     }
   ```
   - Validates file uploaded via `multer`
   - Checks file size (10MB limit)

2. **Parse Context:**
   ```typescript
   const prompt = req.body.prompt || 'Extract data from this file';
   let context = undefined;
   if (req.body.context) {
     context = typeof req.body.context === 'string'
       ? JSON.parse(req.body.context)
       : req.body.context;
   }
   ```
   - Extracts optional prompt and context from request

3. **Convert File to Message:**
   ```typescript
   const base64Data = req.file.buffer.toString('base64');
   const dataUri = `data:${req.file.mimetype};base64,${base64Data}`;
   
   const fileMessage = {
     role: 'user' as const,
     content: [
       { type: 'text' as const, text: prompt },
       {
         type: 'file' as const,
         data: dataUri,
         mimeType: req.file.mimetype,
         name: req.file.originalname
       }
     ]
   };
   ```
   - Converts file buffer to base64 data URI
   - Creates multi-part message (text + file)

4. **Process with Agent Service:**
   ```typescript
   const response = await agentService.handleRequest(
     fileMessage,
     req.context.auth,
     [], // No previous messages
     context
   );
   ```
   - AI SDK processes file and extracts data
   - Uses `extractInvoiceFromFile` tool if context suggests invoice

5. **Extract Tool Results:**
   ```typescript
   let toolResults = response.toolResults || [];
   if (!toolResults || toolResults.length === 0) {
     // Extract from steps
     for (const step of response.steps) {
       if (step.toolResults) {
         toolResults.push(...step.toolResults);
       }
     }
   }
   ```
   - Tool results may be in `toolResults` or `steps`

6. **Response Format:**
   ```typescript
   res.json({
     content: response.content,
     toolResults: toolResults,
     steps: response.steps,
     fileInfo: {
       fileName: req.file.originalname,
       fileSize: req.file.size,
       mimeType: req.file.mimetype,
       uploadedAt: new Date().toISOString()
     }
   });
   ```

**Example Request:**
```bash
POST /extract
Content-Type: multipart/form-data

file: <PDF file>
prompt: "Extract invoice data"
context: {"modelName": "invoice"}
```

**Example Response:**
```json
{
  "content": "I've extracted the invoice data...",
  "toolResults": [{
    "tool": "extractInvoiceFromFile",
    "resultType": "invoice_extraction",
    "data": {
      "invoice": {
        "invoice_number": "INV-001",
        "invoice_date": "2024-01-15",
        "supplier_name": "Acme Corp",
        ...
      },
      "line_items": [...]
    },
    "uiHint": "invoice map"
  }],
  "fileInfo": {
    "fileName": "invoice.pdf",
    "fileSize": 123456,
    "mimeType": "application/pdf",
    "uploadedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

**File Handling:**
- Files stored in memory only (not on disk)
- Max size: 10MB
- Supports PDF, images, and other file types supported by AI SDK
- File data converted to base64 for transmission to AI SDK

---

## Complete Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Request                           │
│  POST /chat or /chat/stream or /extract                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Route Handler                            │
│  - Authentication (authMiddleware)                               │
│  - Request validation                                            │
│  - File upload (multer) if /extract                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AgentService                               │
│  handleRequest() or handleStreamingRequest()                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  prepareRequestSetup()                          │
│  1. ModelRegistry.getAccessibleModels()                         │
│  2. processMessages()                                           │
│  3. createSystemPrompt()                                        │
│     - DynamicPromptManager (database or JSON files)             │
│  4. ToolManager.getToolsForModel()                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Vercel AI SDK                                 │
│  generateText() or streamText()                                 │
│  - model: Google Gemini                                         │
│  - messages: processedMessages                                  │
│  - system: systemPrompt                                         │
│  - tools: tool functions                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LLM Processing                             │
│  - Analyzes user message                                        │
│  - Decides to call tool(s)                                      │
│  - Generates tool parameters                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Execution                               │
│  AgentTools functions → ModelService                            │
│  - createRecordTool() → modelService.create()                   │
│  - searchRecordsTool() → modelService.search()                  │
│  - extractInvoiceFromFileTool() → AI extracts, returns data     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Results                                 │
│  Returned to LLM as tool-result messages                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Final LLM Response                              │
│  - Processes tool results                                       │
│  - Generates final text response                                │
│  - Returns to AgentService                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Route Response                               │
│  - JSON response (/chat)                                        │
│  - SSE stream (/chat/stream)                                    │
│  - JSON with toolResults (/extract)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts Summary

### 1. **Tool Calling**
- LLM receives user message + system prompt + available tools
- LLM decides which tool(s) to call based on user intent
- Tool executes (database operation, search, etc.)
- Tool result returned to LLM
- LLM generates final response

### 2. **Message Processing**
- Frontend sends base64 file data (JSON-safe)
- Message processor converts to Uint8Array (AI SDK requirement)
- Handles text-only, file-only, or mixed content

### 3. **Access Control**
- ModelRegistry filters models by user permissions
- Each tool validates permissions via ModelService
- No access = error returned

### 4. **Prompt Management**
- Two modes: JSON files or Database (both handled by DynamicPromptManager)
- Placeholders replaced with actual values (models, user, context)
- Conditional blocks for context-aware prompts

### 5. **Model-Specific Tools**
- ToolManager provides different tool sets per model
- Purchase requisition gets full CRUD + related searches
- Default model gets read-only tools

### 6. **Streaming vs Non-Streaming**
- Non-streaming: Complete response returned at once
- Streaming: Chunks sent as generated (SSE format)
- Both use same setup, different AI SDK methods

### 7. **File Extraction**
- Files uploaded via multipart/form-data
- Converted to base64 data URI
- Sent to AI SDK which extracts data using schema
- Tool returns structured data for frontend

---

## Environment Variables

- `LLM_MODEL`: Gemini model name (default: `gemini-2.0-flash-001`)
- `USE_LOCAL_PROMPT`: Use local prompt files instead of database (set to `'true'`)
- `APP_NAME`: App name for filtering prompt templates
- `LLM_PROVIDER`: Provider name (default: `'vertex'`)

---

## Testing Tips

1. **Test Tool Execution:**
   - Check `response.steps` to see tool calls
   - Verify tool results in `toolResults`

2. **Test Permissions:**
   - Request without access should return error early
   - Check `accessibleModels` length

3. **Test File Extraction:**
   - Upload PDF via `/extract`
   - Check `toolResults` for extracted data
   - Verify file size limit (10MB)

4. **Test Streaming:**
   - Use `/chat/stream` endpoint
   - Verify SSE format
   - Check chunks arrive incrementally

5. **Test Prompt Selection:**
   - Check which prompt manager is used (env var)
   - Verify placeholders replaced correctly
   - Test conditional blocks with/without context

---

## Common Issues & Solutions

1. **"No accessible models" error:**
   - Check user permissions
   - Verify ModelRegistry has models registered

2. **Tool not available:**
   - Check ToolManager logic for model
   - Verify tool is in AgentTools

3. **File upload fails:**
   - Check file size (10MB limit)
   - Verify multer configuration
   - Check base64 conversion

4. **Prompt not found:**
   - Check DynamicPromptManager query logic
   - Verify view exists in database
   - Check APP_NAME filter

5. **Streaming connection drops:**
   - Check SSE headers
   - Verify proxy buffering disabled
   - Check timeout settings

---

This document covers the complete Agent Service architecture from bottom-level components to top-level routes. Each component is designed to be reusable and follows clear patterns for extensibility.

