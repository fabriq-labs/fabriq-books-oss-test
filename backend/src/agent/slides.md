---
theme: default
background: https://source.unsplash.com/1920x1080/?technology,code
class: text-center
highlighter: shiki
lineNumbers: false
info: |
  ## Agent Service Architecture
  
  Complete guide to the Agent Service from bottom-level components to top-level routes.
drawings:
  persist: false
transition: slide-left
title: Agent Service Architecture
mdc: true
---

# Agent Service Architecture

**LLM-Powered Natural Language Interaction with Data Models**

Complete Guide for New Team Members

<div class="pt-12">
  <span @click="$slidev.nav.next" class="px-2 py-1 rounded cursor-pointer" hover="bg-white bg-opacity-10">
    Press Space for next page <carbon:arrow-right class="inline"/>
  </span>
</div>

---

# Overview

The Agent Service enables **LLM-powered natural language interaction** with data models through three main endpoints:

<br>

<div class="grid grid-cols-3 gap-4">

<div class="border rounded-lg p-4">
  <div class="text-2xl font-bold text-blue-400">/chat</div>
  <div class="text-sm mt-2">Non-streaming chat endpoint</div>
</div>

<div class="border rounded-lg p-4">
  <div class="text-2xl font-bold text-green-400">/chat/stream</div>
  <div class="text-sm mt-2">Streaming chat endpoint</div>
</div>

<div class="border rounded-lg p-4">
  <div class="text-2xl font-bold text-purple-400">/extract</div>
  <div class="text-sm mt-2">File extraction endpoint</div>
</div>

</div>

<br>

**Architecture:** Bottom-up approach
- Reusable components → Middle orchestration → Top-level routes

---

# Architecture Layers

<div class="grid grid-cols-3 gap-8">

<div>
  <div class="text-xl font-bold mb-4">🔧 Bottom Level</div>
  <ul class="text-sm space-y-2">
    <li>Message Processor</li>
    <li>Model Registry</li>
    <li>Generic Functions</li>
    <li>Agent Tools</li>
    <li>Tool Manager</li>
    <li>Prompt Managers</li>
    <li>Model Service</li>
  </ul>
</div>

<div>
  <div class="text-xl font-bold mb-4">🎯 Middle Level</div>
  <ul class="text-sm space-y-2">
    <li>Agent Service</li>
    <li>prepareRequestSetup()</li>
    <li>createSystemPrompt()</li>
    <li>handleRequest()</li>
    <li>handleStreamingRequest()</li>
  </ul>
</div>

<div>
  <div class="text-xl font-bold mb-4">🌐 Top Level</div>
  <ul class="text-sm space-y-2">
    <li>/chat route</li>
    <li>/chat/stream route</li>
    <li>/extract route</li>
    <li>Request handlers</li>
    <li>Response formatting</li>
  </ul>
</div>

</div>

---

# 1. Message Processor

**Location:** `src/agent/utils/messageProcessor.ts`

**Purpose:** Converts frontend messages (base64 files) → AI SDK format (Uint8Array)

<div class="mt-6">

### Key Function
```typescript
processMessages(messages: RawMessage[]): ProcessedMessage[]
```

### Process Flow

```
Frontend (base64 string) 
  ↓
Message Processor
  ↓  
AI SDK (Uint8Array)
```

</div>

---

# Message Processor: Example

<div class="grid grid-cols-2 gap-4">

<div>
  <div class="text-sm font-bold mb-2">Input (from frontend)</div>
```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "Extract invoice"
    },
    {
      "type": "file",
      "data": "data:application/pdf;base64,JVBERi0...",
      "mimeType": "application/pdf"
    }
  ]
}
```
</div>

<div>
  <div class="text-sm font-bold mb-2">Output (for AI SDK)</div>
```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "Extract invoice"
    },
    {
      "type": "file",
      "data": Uint8Array([...]),
      "mimeType": "application/pdf"
    }
  ]
}
```
</div>

</div>

**Why?** JSON can't serialize Uint8Array/Buffer, so frontend sends base64 strings.

---

# 2. Model Registry

**Location:** `src/services/registry/ModelRegistry.ts`

**Purpose:** Central registry combining Prisma schema + business metadata

<div class="mt-6">

### Key Method
```typescript
getAccessibleModels(permissions: Record<string, any>): ModelMetadata[]
```

### Features

- 📋 **Schema Info:** Fields, types, relationships (from Prisma)
- 📝 **Business Metadata:** Descriptions, examples, synonyms (from JSON)
- 🔒 **Access Control:** Filters by user permissions
- ✅ **Required Fields:** Tracks mandatory fields

</div>

---

# Model Registry: Access Control

<div class="mt-4">

### Permission Format

```typescript
permissions[modelName]['*'] === 'read' | 'write'
```

### Filtering Logic

```typescript
// Returns only models user has access to
getAccessibleModels(permissions)
  .filter(model => 
    permissions[model.name]?.['*'] === 'read' || 
    permissions[model.name]?.['*'] === 'write'
  )
```

### Example Model Metadata

```json
{
  "name": "purchase_requisition",
  "description": "Create and manage purchase requisitions",
  "fields": [
    { "name": "requester", "type": "string", "isRequired": true },
    { "name": "total_amount", "type": "decimal" }
  ],
  "examples": ["Create a new PR", "Find my requisitions"],
  "synonyms": ["PR", "purchase request"]
}
```

</div>

---

# 3. Generic Functions & Schemas

**Location:** `src/agent/GenericFunctions.ts`

**Purpose:** Defines Zod schemas and function metadata for all tools

<div class="grid grid-cols-2 gap-4 mt-6">

<div>
  <div class="font-bold mb-2">Core Tools</div>
  <ul class="text-sm space-y-1">
    <li>createRecord</li>
    <li>updateRecord</li>
    <li>searchRecords</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">Relation Tools</div>
  <ul class="text-sm space-y-1">
    <li>createChildItem</li>
    <li>updateChildItem</li>
    <li>addChildrenToParent</li>
    <li>deleteRelation</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">Model-Specific Search</div>
  <ul class="text-sm space-y-1">
    <li>searchItems</li>
    <li>searchSuppliers</li>
    <li>searchDepartments</li>
    <li>... (12+ models)</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">Advanced</div>
  <ul class="text-sm space-y-1">
    <li>advancedSqlQuery</li>
    <li>extractInvoiceFromFile</li>
  </ul>
</div>

</div>

---

# Generic Functions: Schema Example

```typescript
// Zod schema for createRecord tool
export const createRecordSchema = z.object({
  modelName: z.string().describe('Name of the model'),
  data: z.object({
    dummy_field: z.string().optional()
  }).passthrough()  // Allows any additional fields
});

// Function definition
{
  name: "createRecord",
  description: "Create a new record in the specified model",
  parameters: createRecordSchema
}
```

<div class="mt-4">

### Why Zod Schemas?

- ✅ **Runtime Validation:** Ensures tool parameters are correct
- 📝 **LLM Understanding:** Descriptions help LLM choose tools
- 🔒 **Type Safety:** TypeScript + runtime validation

</div>

---

# 4. Agent Tools

**Location:** `src/agent/AgentTools.ts`

**Purpose:** Implements execution logic for each tool

<div class="mt-4">

### Tool Structure

```typescript
export function createRecordTool(auth: AuthContext) {
  return tool({
    parameters: createRecordSchema,
    description: getDescription('createRecord'),
    execute: async ({ modelName, data }, _options) => {
      // 1. Execute via ModelService
      const result = await modelService.create(modelName, auth, data);
      
      // 2. Enrich result for frontend
      const enriched = enrichRecordResult(result, modelName, 'createRecord');
      
      // 3. Return enriched result
      return enriched;
    }
  });
}
```

</div>

---

# Agent Tools: Result Enrichment

<div class="mt-4">

### Tool Results Include

```typescript
{
  tool: 'searchRecords',
  model: 'purchase_requisition',
  resultType: 'list',  // 'record' | 'list' | 'metrics'
  data: [...],         // Actual data
  columns: [           // Field metadata
    { field: 'requester', label: 'Requester' },
    { field: 'total_amount', label: 'Total Amount' }
  ],
  actions: [           // Available actions
    { type: 'view', urlTemplate: '/purchase_requisition/:id' },
    { type: 'edit', urlTemplate: '/purchase_requisition/:id/edit' }
  ],
  uiHint: 'table'      // Frontend display hint
}
```

**Why?** Provides frontend with everything needed for rich UI rendering.

</div>

---

# 5. Tool Manager

**Location:** `src/agent/ToolManager.ts`

**Purpose:** Manages which tools are available based on model context

<div class="mt-4">

### Model-Based Tool Selection

```typescript
getToolsForModel(modelName: string, auth: AuthContext): any
```

### Tool Sets by Model

| Model | Tools Available |
|-------|----------------|
| `default` | searchRecords, advancedSqlQuery, extractInvoiceFromFile |
| `purchase_requisition` | All CRUD + child items + all related searches + SQL |
| `invoice` | CRUD + invoice extraction + SQL |
| Other models | CRUD + SQL |

**Pattern:** Model context determines available capabilities.

</div>

---

# 6. Dynamic Prompt Manager

**Location:** `src/agent/prompt/DynamicPromptManager.ts`

**Purpose:** Generates system prompts from database templates or JSON files

<div class="mt-4">

### Data Source Selection

```typescript
// Based on USE_LOCAL_PROMPT environment variable
USE_LOCAL_PROMPT=true  → Reads from JSON files (prisma/metadata/prompt-templates/)
USE_LOCAL_PROMPT=false → Reads from database (prompt_template table)
```

### Process

```typescript
generateDynamicPrompt(permissions?: Record<string, any>): Promise<string>
```

#### Database Mode (default)
1. **Query** `prompt_template` table via Prisma
2. **Filter** by:
   - View (via `view.model_name` and `view.name`)
   - Prompt type (or 'default')
   - App name (from env var)
3. **Order** by: `is_default DESC, priority ASC, version DESC`
4. **Merge** multiple templates by priority
5. **Replace** placeholders

</div>

**Benefits:** Dynamic prompts without code changes!

---

# 8. Model Service

**Location:** `src/services/core/ModelService.ts`

**Purpose:** Core service for all database operations

<div class="grid grid-cols-2 gap-4 mt-4">

<div>
  <div class="font-bold mb-2">CRUD Operations</div>
  <ul class="text-sm space-y-1">
    <li>create()</li>
    <li>update()</li>
    <li>search()</li>
    <li>getById()</li>
    <li>delete()</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">Relations</div>
  <ul class="text-sm space-y-1">
    <li>updateChild()</li>
    <li>addChildrenToParent()</li>
    <li>deleteRelation()</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">Advanced</div>
  <ul class="text-sm space-y-1">
    <li>executeSqlQuery()</li>
    <li>parseDocument()</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">Used By</div>
  <ul class="text-sm space-y-1">
    <li>All Agent Tools</li>
    <li>Permission validation</li>
    <li>Data access layer</li>
  </ul>
</div>

</div>

---

# Middle Layer: Agent Service

**Location:** `src/agent/AgentService.ts`

**Purpose:** Main orchestrator coordinating all components

<div class="mt-4">

### Key Methods

1. **`prepareRequestSetup()`** - Common setup for all requests
2. **`createSystemPrompt()`** - Generates system prompt
3. **`handleRequest()`** - Non-streaming requests
4. **`handleStreamingRequest()`** - Streaming requests

</div>

---

# prepareRequestSetup()

**Purpose:** Common setup for both streaming and non-streaming requests

<div class="mt-4">

### Steps

```typescript
async prepareRequestSetup(message, auth, previousMessages, context)
```

1. **Get Accessible Models**
   ```typescript
   ModelRegistry.getInstance().getAccessibleModels(auth.permissions)
   ```

2. **Process Messages**
   ```typescript
   processMessages(allMessages)  // base64 → Uint8Array
   ```

3. **Determine Model Name**
   ```typescript
   context?.modelName || 'default'
   ```

4. **Create System Prompt**
   ```typescript
   createSystemPrompt(userId, accessibleModels, context)
   ```

5. **Get Tools**
   ```typescript
   ToolManager.getInstance().getToolsForModel(modelName, auth)
   ```

</div>

---

# createSystemPrompt()

**Purpose:** Creates system prompt with model context and route context

<div class="mt-4">

### Usage

```typescript
// Always use DynamicPromptManager (handles both database and JSON files)
const dynamicPromptManager = new DynamicPromptManager(
  orgId, 
  userId, 
  modelName, 
  viewName,      // optional
  promptTypes,   // optional
  context        // optional
);

// Internally checks USE_LOCAL_PROMPT to determine data source
prompt = await dynamicPromptManager.generateDynamicPrompt(permissions);
```

**Result:** Complete system prompt with:
- Model descriptions
- Tool descriptions  
- UI rendering instructions
- Context placeholders replaced

</div>

---

# handleRequest()

**Purpose:** Non-streaming chat requests

<div class="mt-4">

### Flow

```typescript
async handleRequest(message, auth, previousMessages, context)
```

1. **Setup**
   ```typescript
   const { processedMessages, systemPrompt, tools } = 
     await prepareRequestSetup(...)
   ```

2. **Call AI SDK**
   ```typescript
   const result = await generateText({
     model: google('gemini-2.0-flash-001'),
     messages: [
       { role: 'system', content: systemPrompt },
       ...processedMessages
     ],
     tools,
     maxSteps: 2  // Tool call → Result → Final response
   });
   ```

3. **Return**
   ```typescript
   return {
     content: result.text,
     toolResults: result.toolResults,
     steps: result.steps
   };
   ```

</div>

---

# handleStreamingRequest()

**Purpose:** Streaming chat requests

<div class="mt-4">

### Key Differences

```typescript
// Uses streamText instead of generateText
const result = streamText({
  model: google('gemini-2.0-flash-001'),
  system: systemPrompt,  // Separate system parameter
  messages: processedMessages,
  tools,
  maxSteps: 2
});

// Returns stream instead of final result
const streamResponse = result.toDataStreamResponse();
return streamResponse.body as ReadableStream;
```

### Frontend Receives

- **Server-Sent Events (SSE)** format
- **Chunks** as they're generated
- **Tool calls** streamed separately
- **Final chunk** indicates completion

</div>

---

# Tool Calling Flow

<div class="mt-6">

```
┌─────────────────────────────────────┐
│  1. LLM Receives                    │
│  - User message                     │
│  - System prompt                    │
│  - Available tools                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  2. LLM Decides to Call Tool        │
│  Example: searchRecords             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  3. Tool Executes                   │
│  - AgentTool function               │
│  - ModelService call                │
│  - Database query                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  4. Tool Result Returned            │
│  - Enriched with metadata           │
│  - Back to LLM                      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  5. LLM Generates Final Response    │
│  - Processes tool result            │
│  - Creates natural language answer  │
└─────────────────────────────────────┘
```

</div>

---

# Top Layer: Routes

**Location:** `src/agent/routes.ts`

<div class="mt-4">

### Route Setup

```typescript
export function createAgentRouter() {
  const router = Router();
  const agentService = new AgentService();
  const upload = multer({
    storage: multer.memoryStorage(),  // Files in memory only
    limits: { fileSize: 10 * 1024 * 1024 }  // 10MB limit
  });
  
  // Define routes...
  return router;
}
```

### Three Main Endpoints

1. **POST /chat** - Non-streaming
2. **POST /chat/stream** - Streaming  
3. **POST /extract** - File extraction

</div>

---

# /chat Endpoint

<div class="mt-4">

### Request Flow

```typescript
router.post('/chat', authMiddleware, async (req, res) => {
  // 1. Validate authentication
  if (!req.context?.auth?.user) return 401;
  
  // 2. Extract and validate messages
  const { messages, context } = req.body;
  const latestMessage = messages[messages.length - 1];
  
  // 3. Separate history from latest
  const previousMessages = messages.slice(0, -1);
  
  // 4. Call AgentService
  const response = await agentService.handleRequest(
    latestMessage.content,
    req.context.auth,
    previousMessages,
    context
  );
  
  // 5. Format response (OpenAI-compatible)
  res.json({
    choices: [{ message: { role: 'assistant', content: response.content } }],
    steps: response.steps
  });
});
```

</div>

---

# /chat/stream Endpoint

<div class="mt-4">

### Setup

```typescript
router.post('/chat/stream', authMiddleware, async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Get stream from AgentService
  const dataStream = await agentService.handleStreamingRequest(...);
  
  // Convert Web ReadableStream → Node Readable
  const reader = dataStream.getReader();
  const readable = new Readable({
    async read() {
      const { done, value } = await reader.read();
      done ? this.push(null) : this.push(value);
    }
  });
  
  // Pipe to response
  readable.pipe(res);
});
```

**Result:** Real-time streaming response to frontend.

</div>

---

# /extract Endpoint

<div class="mt-4">

### Purpose: File extraction with AI

```typescript
router.post('/extract', authMiddleware, upload.single('file'), async (req, res) => {
  // 1. Validate file
  if (!req.file) return 400;
  
  // 2. Convert file to base64 data URI
  const base64Data = req.file.buffer.toString('base64');
  const dataUri = `data:${req.file.mimetype};base64,${base64Data}`;
  
  // 3. Create multi-part message
  const fileMessage = {
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'file', data: dataUri, mimeType: req.file.mimetype }
    ]
  };
  
  // 4. Process with AgentService
  const response = await agentService.handleRequest(fileMessage, auth, [], context);
  
  // 5. Return extracted data
  res.json({
    content: response.content,
    toolResults: response.toolResults,
    fileInfo: { fileName, fileSize, mimeType }
  });
});
```

</div>

---

# Complete Request Flow

<div class="text-xs">

```
┌────────────────────────────────────────────────────────────┐
│                    Client Request                          │
│         POST /chat or /chat/stream or /extract             │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│                  Route Handler                             │
│  - Authentication (authMiddleware)                         │
│  - Request validation                                      │
│  - File upload (multer) if /extract                        │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│                AgentService                                │
│  handleRequest() or handleStreamingRequest()               │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│           prepareRequestSetup()                            │
│  1. ModelRegistry.getAccessibleModels()                    │
│  2. processMessages()                                      │
│  3. createSystemPrompt() → DynamicPromptManager │
│  4. ToolManager.getToolsForModel()                         │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│              Vercel AI SDK                                 │
│  generateText() or streamText()                            │
│  - model: Google Gemini                                    │
│  - messages: processedMessages                             │
│  - system: systemPrompt                                    │
│  - tools: tool functions                                   │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│               LLM Processing                               │
│  - Analyzes user message                                   │
│  - Decides to call tool(s)                                 │
│  - Generates tool parameters                               │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│            Tool Execution                                  │
│  AgentTools → ModelService → Database                      │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│              Tool Results                                  │
│  Returned to LLM as tool-result messages                   │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│           Final LLM Response                               │
│  - Processes tool results                                  │
│  - Generates final text response                           │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│            Route Response                                  │
│  - JSON response (/chat)                                   │
│  - SSE stream (/chat/stream)                               │
│  - JSON with toolResults (/extract)                        │
└────────────────────────────────────────────────────────────┘
```

</div>

---

# Key Concepts

<div class="grid grid-cols-2 gap-6 mt-4">

<div>
  <div class="font-bold mb-2">1. Tool Calling</div>
  <div class="text-sm">
    LLM receives tools → decides which to call → tool executes → result returned → LLM responds
  </div>
</div>

<div>
  <div class="font-bold mb-2">2. Message Processing</div>
  <div class="text-sm">
    Frontend sends base64 files → processor converts to Uint8Array → AI SDK ready
  </div>
</div>

<div>
  <div class="font-bold mb-2">3. Access Control</div>
  <div class="text-sm">
    ModelRegistry filters models by permissions → tools validate access → no access = error
  </div>
</div>

<div>
  <div class="font-bold mb-2">4. Prompt Management</div>
  <div class="text-sm">
    Local files or database templates → placeholders replaced → context-aware prompts
  </div>
</div>

<div>
  <div class="font-bold mb-2">5. Model-Specific Tools</div>
  <div class="text-sm">
    ToolManager provides different tool sets per model → purchase_requisition gets full CRUD + searches
  </div>
</div>

<div>
  <div class="font-bold mb-2">6. Streaming vs Non-Streaming</div>
  <div class="text-sm">
    Non-streaming: complete response at once. Streaming: chunks sent as generated (SSE)
  </div>
</div>

<div>
  <div class="font-bold mb-2">7. File Extraction</div>
  <div class="text-sm">
    Files uploaded → converted to base64 → AI SDK extracts → tool returns structured data
  </div>
</div>

<div>
  <div class="font-bold mb-2">8. Result Enrichment</div>
  <div class="text-sm">
    Tools enrich results with metadata (columns, actions, uiHint) for rich frontend rendering
  </div>
</div>

</div>

---

# Environment Variables

<div class="grid grid-cols-2 gap-6 mt-6">

<div>
  <div class="font-bold mb-2">LLM Configuration</div>
  <ul class="text-sm space-y-1">
    <li><code>LLM_MODEL</code> - Gemini model name (default: `gemini-2.0-flash-001`)</li>
    <li><code>LLM_PROVIDER</code> - Provider name (default: `vertex`)</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">Prompt Configuration</div>
  <ul class="text-sm space-y-1">
    <li><code>USE_LOCAL_PROMPT</code> - Use local files instead of DB (set to `'true'`)</li>
    <li><code>APP_NAME</code> - App name for filtering prompt templates</li>
  </ul>
</div>

</div>

<div class="mt-6 p-4 bg-blue-900 bg-opacity-50 rounded">
  <div class="font-bold mb-2">Example Configuration</div>
  <pre class="text-xs"><code>
LLM_MODEL=gemini-2.0-flash-001
LLM_PROVIDER=vertex
USE_LOCAL_PROMPT=false
APP_NAME=fabriq
  </code></pre>
</div>

---

# Testing Tips

<div class="grid grid-cols-2 gap-6 mt-4">

<div>
  <div class="font-bold mb-2">1. Tool Execution</div>
  <ul class="text-sm space-y-1">
    <li>Check <code>response.steps</code> for tool calls</li>
    <li>Verify tool results in <code>toolResults</code></li>
    <li>Inspect enriched metadata</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">2. Permissions</div>
  <ul class="text-sm space-y-1">
    <li>Test without access → should error early</li>
    <li>Check <code>accessibleModels</code> length</li>
    <li>Verify permission format</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">3. File Extraction</div>
  <ul class="text-sm space-y-1">
    <li>Upload PDF via <code>/extract</code></li>
    <li>Check <code>toolResults</code> for extracted data</li>
    <li>Verify 10MB file size limit</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">4. Streaming</div>
  <ul class="text-sm space-y-1">
    <li>Use <code>/chat/stream</code> endpoint</li>
    <li>Verify SSE format</li>
    <li>Check chunks arrive incrementally</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">5. Prompt Selection</div>
  <ul class="text-sm space-y-1">
    <li>Check which prompt manager used (env var)</li>
    <li>Verify placeholders replaced correctly</li>
    <li>Test conditional blocks with/without context</li>
  </ul>
</div>

<div>
  <div class="font-bold mb-2">6. Message Processing</div>
  <ul class="text-sm space-y-1">
    <li>Test base64 file conversion</li>
    <li>Verify data URI parsing</li>
    <li>Check Uint8Array conversion</li>
  </ul>
</div>

</div>

---

# Common Issues & Solutions

<div class="grid grid-cols-2 gap-6 mt-4">

<div>
  <div class="font-bold text-red-400 mb-2">❌ "No accessible models"</div>
  <ul class="text-sm space-y-1">
    <li>Check user permissions format</li>
    <li>Verify ModelRegistry has models registered</li>
    <li>Ensure permissions have 'read' or 'write' access</li>
  </ul>
</div>

<div>
  <div class="font-bold text-red-400 mb-2">❌ Tool not available</div>
  <ul class="text-sm space-y-1">
    <li>Check ToolManager logic for model</li>
    <li>Verify tool is in AgentTools</li>
    <li>Check model name in context</li>
  </ul>
</div>

<div>
  <div class="font-bold text-red-400 mb-2">❌ File upload fails</div>
  <ul class="text-sm space-y-1">
    <li>Check file size (10MB limit)</li>
    <li>Verify multer configuration</li>
    <li>Check base64 conversion logic</li>
  </ul>
</div>

<div>
  <div class="font-bold text-red-400 mb-2">❌ Prompt not found</div>
  <ul class="text-sm space-y-1">
    <li>Check DynamicPromptManager query logic</li>
    <li>Verify view exists in database</li>
    <li>Check APP_NAME filter</li>
  </ul>
</div>

<div>
  <div class="font-bold text-red-400 mb-2">❌ Streaming connection drops</div>
  <ul class="text-sm space-y-1">
    <li>Check SSE headers</li>
    <li>Verify proxy buffering disabled</li>
    <li>Check timeout settings</li>
  </ul>
</div>

<div>
  <div class="font-bold text-red-400 mb-2">❌ Tool result missing metadata</div>
  <ul class="text-sm space-y-1">
    <li>Check enrichment function called</li>
    <li>Verify ModelRegistry metadata available</li>
    <li>Check tool implementation</li>
  </ul>
</div>

</div>

---

# Architecture Benefits

<div class="grid grid-cols-3 gap-6 mt-6">

<div class="p-4 border rounded-lg">
  <div class="text-2xl mb-2">🔧</div>
  <div class="font-bold mb-2">Reusable Components</div>
  <div class="text-sm">Bottom-level components can be used independently or together</div>
</div>

<div class="p-4 border rounded-lg">
  <div class="text-2xl mb-2">🎯</div>
  <div class="font-bold mb-2">Clear Separation</div>
  <div class="text-sm">Each layer has distinct responsibilities and clean interfaces</div>
</div>

<div class="p-4 border rounded-lg">
  <div class="text-2xl mb-2">🚀</div>
  <div class="font-bold mb-2">Extensible</div>
  <div class="text-sm">Easy to add new tools, models, or prompt templates</div>
</div>

<div class="p-4 border rounded-lg">
  <div class="text-2xl mb-2">🔒</div>
  <div class="font-bold mb-2">Secure</div>
  <div class="text-sm">Permission validation at multiple layers</div>
</div>

<div class="p-4 border rounded-lg">
  <div class="text-2xl mb-2">📊</div>
  <div class="font-bold mb-2">Rich Metadata</div>
  <div class="text-sm">Tool results include everything needed for UI rendering</div>
</div>

<div class="p-4 border rounded-lg">
  <div class="text-2xl mb-2">🌐</div>
  <div class="font-bold mb-2">Flexible</div>
  <div class="text-sm">Supports streaming, non-streaming, and file extraction</div>
</div>

</div>

---

# Summary

<div class="grid grid-cols-2 gap-6 mt-6">

<div>
  <div class="font-bold text-xl mb-4">Bottom-Up Architecture</div>
  <ul class="space-y-2 text-sm">
    <li>✅ 8 reusable bottom-level components</li>
    <li>✅ 1 middle-level orchestrator (AgentService)</li>
    <li>✅ 3 top-level route endpoints</li>
    <li>✅ Clear separation of concerns</li>
    <li>✅ Extensible and maintainable</li>
  </ul>
</div>

<div>
  <div class="font-bold text-xl mb-4">Key Workflows</div>
  <ul class="space-y-2 text-sm">
    <li>📝 Message processing (base64 → Uint8Array)</li>
    <li>🔍 Model access control (permissions)</li>
    <li>🤖 Tool calling (LLM → tools → results)</li>
    <li>💬 Prompt generation (local or dynamic)</li>
    <li>📊 Result enrichment (UI metadata)</li>
  </ul>
</div>

</div>

<div class="mt-8 p-6 bg-gradient-to-r from-blue-900 to-purple-900 rounded-lg">
  <div class="text-2xl font-bold mb-2">Ready to Build!</div>
  <div class="text-sm opacity-90">
    The Agent Service architecture provides a solid foundation for LLM-powered applications.
    Each component is designed to be reusable, testable, and maintainable.
  </div>
</div>

---

# Q&A

<div class="flex items-center justify-center h-full">
  <div class="text-center">
    <div class="text-6xl mb-8">❓</div>
    <div class="text-2xl font-bold mb-4">Questions?</div>
    <div class="text-lg opacity-75">
      Open for discussion!
    </div>
  </div>
</div>

<div class="absolute bottom-10 left-0 right-0 text-center text-sm opacity-50">
  Press <kbd>ESC</kbd> to exit | Press <kbd>F</kbd> for fullscreen
</div>
