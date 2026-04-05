# Fabriq — Conversational Chat

**Last Updated**: 2026-04-05  
**Primary files**:  
- Frontend: `frontend-1/src/components/chat/ChatUI.tsx`, `ChatContext.tsx`, `chatUtils.ts`  
- Backend: `backend/src/agent/routes.ts`, `backend/src/agent/AgentService.ts`

---

## Overview

Every page in the app — including the dashboard — has an AI chat panel. This is the **conversational chat**, a stateless, page-aware assistant that answers questions, queries data, and creates records using the same LLM and tool infrastructure as the workbench agent.

It is **not** the same as a workbench session. It has no plan, no pending actions, no auto-continuation. The conversation is ephemeral — messages live only in the browser's React state and are gone when you navigate away.

Both conversational chat and workbench sessions share the same HTTP endpoint (`POST /api/agent/chat/stream`). The presence or absence of a `sessionId` in the request body determines which code path runs.

---

## Architecture

```
User types a message
        ↓
ChatUI.tsx (useChat hook from @ai-sdk/react)
  - Prepends Bearer token header
  - Includes all previous messages in request body
  - Includes PageContext (modelName, viewId, recordId, ...)
        ↓
POST /api/agent/chat/stream
  { messages: [...], context: PageContext }   ← no sessionId
        ↓
routes.ts
  - authMiddleware → derives auth context
  - Extracts latestMessage + previousMessages + context
        ↓
AgentService.handleStreamingRequest(message, auth, previousMessages, context)
  - Calls createSystemPrompt() → DynamicPromptManager
      Queries prompt_template WHERE model_name=context.modelName
        AND view.name=context.viewName
        AND prompt_type IN promptTypes
      Replaces {{context.recordId}}, {{context.modelContext.*}}, etc.
  - Calls ToolManager.getUnifiedTools(modelName, auth, context)
      → model-specific tools + analytics tools (NO session tools)
  - Calls streamText({ model, messages, tools, maxSteps })
        ↓
toDataStreamResponse() → SSE stream → browser
        ↓
useChat hook processes stream tokens in real time
  onFinish: processes tool invocations (ToolResponseRenderer)
```

---

## Conversation History: In-Memory Only

**History is NOT persisted.** It is stored exclusively in React state.

### Mechanism

```
ChatContext.tsx
  messagesAi: any[]        ← stored in useState
  setMessagesAi(messages)  ← updated whenever useChat.messages changes

ChatUI.tsx (useChat hook)
  messages ← useChat manages this locally
  
  On mount (chat drawer opens):
    setMessages(messagesAi)    ← restore from context into useChat

  On every response:
    setMessagesAi(messages)    ← sync back to context
```

### What "lost" means in practice

| Event | History outcome |
|-------|----------------|
| Close chat drawer and reopen (same page) | Restored — context survives |
| Navigate to a different page | **Lost** — context resets |
| Refresh the browser | **Lost** |
| Close the browser | **Lost** |

The backend has no history state. On every request, the frontend sends the **full message array** (all turns so far) in the request body. The backend treats each request as stateless, rebuilding the conversation from the messages array.

This is by design — conversational chat is meant for quick contextual queries. Long-lived task sequences belong in a workbench session, where history is persisted to `agent_message`.

---

## Frontend: Vercel AI SDK (`useChat`)

**File**: `frontend-1/src/components/chat/ChatUI.tsx`  
**Hook**: `useChat` from `@ai-sdk/react`

```typescript
const {
  messages,          // Current conversation (managed by useChat)
  setMessages,       // Used to restore history from context on mount
  input,             // Controlled input field value
  handleInputChange, // Input onChange handler
  append,            // Add a message and trigger API call
  stop,              // Cancel in-flight request
  reload,            // Retry last message
  isLoading,         // True while awaiting response
  status,            // 'idle' | 'streaming' | 'submitted' | 'error'
  setInput,
} = useChat({
  api: `${VITE_API_BASE_URL}/api/agent/chat/stream`,

  headers: {
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${token}`,   // Token from __session cookie via js-cookie
  },

  body: {
    stream: true,
    context: pageContext || undefined,     // PageContext from ChatContext
  },

  experimental_prepareRequestBody: ({ id, messages, requestBody }) => {
    // Transforms message parts (text + file attachments) into standard format
    // Explicitly includes context in the body
    // Returns { id, messages: transformedMessages, context, stream: true }
  },

  onResponse: (response) => {
    // Handles non-2xx HTTP responses (shows error to user)
  },

  onFinish: (message) => {
    // Processes tool invocations in the completed message
    // Passes results to ToolResponseRenderer
  },

  onError: (error) => {
    // Logs streaming errors
  },
});
```

### Message structure sent to backend

```typescript
{
  id: string,            // Auto-generated by useChat
  stream: true,
  context: PageContext,  // Current page context
  messages: Array<{
    role: 'user' | 'assistant',
    content: string | ContentPart[],
    parts?: Array<{
      type: 'text' | 'file',
      text?: string,
      data?: string,       // Base64-encoded file data
      mimeType?: string,
      mediaType?: string,
    }>
  }>
}
```

### Tool invocations

When the backend calls a tool (e.g. `createRecord`, `analyticsQuery`), the result comes back in the message's `toolInvocations` array. `ToolResponseRenderer.tsx` processes these and:
- Renders structured tool results (tables, record cards) inline in the chat
- When `createRecord` succeeds, updates `pageContext.recordId` with the new record's ID

---

## PageContext

**File**: `frontend-1/src/contexts/ChatContext.tsx`

```typescript
export interface PageContext {
  modelName: string;                   // Prisma model, e.g. 'posting', 'invoice', 'dashboard'
  viewName: string;                    // View name, e.g. 'posting_view', 'invoice_view'
  recordId?: string | null;            // ID of the record currently open (edit forms)
  stateId?: string | null;             // Workflow state ID (transactional models)
  viewId?: string | null;              // View ID for the current form view
  modelDisplayName?: string | null;    // Human label, e.g. 'Posting' (used in input placeholder)
  currentPath?: string;                // React Router pathname
  promptTypes?: string[];              // Override prompt type selection, e.g. ['analytics']
  modelContext?: Record<string, any>;  // Model-specific extras (see below)
}
```

### `modelContext` examples

| Page | `modelContext` content |
|------|----------------------|
| Posting list with account selected | `{ selectedAccountId: 'acc_...' }` |
| Invoice form | `{ supplierId: 'sup_...' }` |
| Dashboard | *(empty or omitted)* |

### How each page sets PageContext

Every page that wants the chat to be context-aware calls `setPageContext()` inside a `useEffect`:

```typescript
// Example: PostingForm.tsx
useEffect(() => {
  setPageContext({
    modelName: 'posting',
    viewName: getViewName('posting'),     // e.g. 'posting_view'
    recordId: id || null,                 // from useParams()
    stateId: null,
    viewId: viewId || null,               // from useParams()
    modelDisplayName: 'Posting',
    currentPath: location.pathname,
  });

  return () => setPageContext(null);      // Clear on unmount
}, [id, viewId, location.pathname, setPageContext]);
```

```typescript
// Example: Dashboard (AIDashboard.tsx)
setPageContext({
  modelName: 'dashboard',
  viewName: 'dashboard_view',
  modelDisplayName: 'Dashboard',
  currentPath: '/',
  promptTypes: ['analytics', 'default'],
});
```

### Pages that set PageContext

- All form components (`PostingForm`, `InvoiceDetails`, `PromptTemplateForm`, etc.)
- Dashboard (`AIDashboard.tsx`)
- `ToolResponseRenderer.tsx` — updates `recordId` dynamically when a new record is created via tool

Pages that don't call `setPageContext` leave it `null` — the chat falls back to a generic state with no model-specific tools or prompt tailoring.

---

## Request Flow: Frontend to Backend

### Headers
```
POST /api/agent/chat/stream
Content-Type: application/json
Accept: text/event-stream
Authorization: Bearer <token>         ← JWT from __session cookie
```

### Request body
```json
{
  "stream": true,
  "context": {
    "modelName": "posting",
    "viewName": "posting_view",
    "recordId": "post_abc123",
    "modelContext": { "selectedAccountId": "acc_xyz" }
  },
  "messages": [
    { "role": "user",      "content": "Show me unmatched transactions" },
    { "role": "assistant", "content": "Here are the 12 unmatched postings..." },
    { "role": "user",      "content": "Which ones are over ₹50,000?" }
  ]
}
```

The `messages` array includes **all previous turns** plus the latest message. The backend doesn't store any history — the frontend is the source of truth for the conversation so far.

### File attachments

Files are handled by `buildFileParts()` in `chatUtils.ts`:
1. File is read as a data URL (base64)
2. Sent as a message part: `{ type: 'file', data: 'data:image/png;base64,...', mimeType: 'image/png', mediaType: 'image/png' }`
3. Backend's `messageProcessor.ts` decodes base64 back to `Uint8Array` before passing to the LLM

---

## Backend: Route Handler

**File**: `backend/src/agent/routes.ts` (lines 132–243)

```
POST /api/agent/chat/stream
  ↓ authMiddleware
    → JWT verification
    → User + permissions lookup → req.context.auth
  ↓ Extract from req.body:
    messages[]         ← full conversation history
    context            ← PageContext from frontend
    sessionId?         ← absent for conversational chat
  ↓ latestMessage = messages[messages.length - 1]
    previousMessages  = messages.slice(0, -1)
  ↓ Set SSE response headers
  ↓ agentService.handleStreamingRequest(
      latestMessage.content,
      req.context.auth,
      previousMessages,
      context,
      sessionId         ← undefined for conversational chat
    )
  ↓ Convert ReadableStream → Node.js stream → pipe to res
```

When `sessionId` is absent, `handleStreamingRequest` skips all session-related logic: no session loading, no `agent_message` writes, no auto-continuation.

---

## Backend: Prompt Selection

`AgentService` creates the system prompt by calling `DynamicPromptManager` with values derived from the frontend `PageContext`:

```typescript
new DynamicPromptManager(
  auth.user.org_id,         // org_id
  auth.user.id,             // user_id
  context.modelName,        // e.g. 'posting'
  context.viewName,         // e.g. 'posting_view'
  promptTypes,              // e.g. ['analytics', 'default']
  {
    recordId:     context.recordId,
    stateId:      context.stateId,
    viewId:       context.viewId,
    modelContext: context.modelContext,   // e.g. { selectedAccountId: 'acc_...' }
    focusModels:  context.focusModels,
  }
)
```

### Prompt type selection (non-session)

```typescript
// Non-session: no template, no reconciliation detection
promptTypes = context.promptTypes ?? ['analytics', 'default']
```

The frontend can override `promptTypes` directly (e.g. dashboard sets `['analytics', 'default']`). If not set, the default applies.

### DB query executed

```sql
SELECT pt.*
FROM prompt_template pt
JOIN view v ON pt.view_id = v.id
WHERE v.model_name = 'posting'
  AND v.name       = 'posting_view'
  AND pt.prompt_type IN ('analytics', 'default')
  AND pt.app_name  = 'books'            -- APP_NAME env var
ORDER BY pt.is_default DESC, pt.priority DESC, pt.version DESC;
```

Matched rows are merged and placeholders are substituted:

| Placeholder | Resolved from |
|-------------|--------------|
| `{{context.recordId}}` | `context.recordId` |
| `{{context.modelContext.selectedAccountId}}` | `context.modelContext.selectedAccountId` |
| `{{currentDate}}` | Server timestamp |
| `{{accessibleModels}}` | Models user has permission to see, filtered by `focusModels` |

Conditional blocks in the prompt text are resolved first:
```
{{#if context.recordId}}
  You are viewing posting {{context.recordId}}.
{{else}}
  You are viewing the postings list.
{{/if}}
```

---

## Backend: Tool Selection

**File**: `backend/src/agent/ToolManager.ts`

```typescript
ToolManager.getUnifiedTools(
  modelName,     // from context.modelName
  auth,
  context,
  sessionId,     // undefined → no session tools injected
  allowedTools   // [] for non-session (no template)
)
```

**Tool set for non-session chat:**

| Tool group | Tools | Always included? |
|-----------|-------|-----------------|
| Model-specific | `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery`, + model extras | Yes (based on modelName) |
| Analytics | `getAnalyticsContext`, `analyticsQuery` | Always |
| Session | `createPlan`, `completeStep`, `queueActions`, `requestClarification` | **No** — only when sessionId present |

The `modelName` value from `PageContext` determines which model-specific tools load. `modelName: 'posting'` adds `suggestReconciliationMatches` and `categorizePostings`. `modelName: 'dashboard'` or `'default'` gives basic search + SQL tools.

---

## Backend: Vercel AI SDK (`streamText`)

**File**: `backend/src/agent/AgentService.ts` — `handleStreamingRequest()`

```typescript
const result = streamText({
  model: getModel('agent'),        // Gemini via Vertex AI
  messages: allMessages,           // [system prompt, ...previousMessages, latestMessage]
  tools,                           // From ToolManager
  maxSteps: parseInt(
    process.env.AGENT_MAX_STEPS || '', 10
  ) || 5,                          // Default 5 for non-session (vs 20 for sessions)
  
  onStepFinish: async ({ text, toolCalls }) => {
    // Emits tool_called events to SessionEventBus (if sessionId present)
    // For non-session: nothing persisted
  },
  
  onFinish: async ({ text, usage, steps }) => {
    // Fire-and-forget: log to llm_trace table
    llmTraceLogger.logTrace({
      org_id, user_id, model_name, view_name, record_id,
      question: latestMessage,
      response_text: text,
      tools_called: [...],
      prompt_tokens, completion_tokens,
      duration_ms, status,
    });
    // No agent_message writes for non-session
  },
});

return result.toDataStreamResponse().body as ReadableStream;
```

`toDataStreamResponse()` converts the Vercel AI SDK stream into the SSE wire format that `useChat` on the frontend understands. Tokens stream token-by-token; tool call results stream as structured data chunks.

---

## What IS Stored: `llm_trace`

Even though conversation messages are not persisted, every LLM call is logged to `llm_trace` + `llm_trace_step` for observability.

| Column | What's stored |
|--------|--------------|
| `org_id`, `user_id` | Who made the request |
| `model_name`, `view_name`, `record_id` | From PageContext |
| `question` | The user's latest message |
| `response_text` | The full LLM response |
| `tools_called` | Array of tool names called this turn |
| `prompt_tokens`, `completion_tokens` | Token usage |
| `duration_ms` | Time from request to completion |
| `status` | `'success'` or `'error'` |
| `error_message` | If the call failed |

`llm_trace_step` stores per-step detail: tool call args, tool results, SQL queries executed.

See [OBSERVABILITY.md](./OBSERVABILITY.md) for diagnostic queries.

---

## Context-Aware UI Features

**File**: `frontend-1/src/components/chat/chatUtils.ts`

### Input placeholder

```typescript
// If page has a named model: "Ask about this Posting"
// Otherwise: "Ask anything"
placeholder = modelDisplayName
  ? `Ask about this ${modelDisplayName}`
  : 'Ask anything'
```

### Suggested prompts

Suggestions shown when chat opens (vary by page context):

| Page context | Suggestions |
|---|---|
| Dashboard (`modelName: 'dashboard'`) | Procurement-focused: "Show pending purchase orders", "Outstanding invoices", etc. |
| Posting with `selectedAccountId` | Reconciliation-focused: "Show unmatched transactions", "Reconcile this account" |
| Other model pages | Generic form-related: "Create a new record", "Search for..." |
| No context | Generic analytics prompts |

---

## Conversation vs Session: Comparison

| | Conversational Chat | Workbench Session |
|---|---|---|
| **Entry point** | `POST /api/agent/chat/stream` (no sessionId) | `POST /api/agent/chat/stream` (with sessionId) |
| **History storage** | React state — lost on navigate/close | DB `agent_message` table — permanent |
| **History mechanism** | Frontend sends all messages in every request | Backend loads last 50 `agent_message` rows |
| **Structured plan** | None | Yes — `createPlan` tool, 3–5 steps |
| **Session tools** | Not available | `createPlan`, `completeStep`, `queueActions`, `requestClarification` |
| **Auto-continuation** | No | Yes — `setImmediate` recursive calls |
| **Pending actions** | No | Yes — `awaiting_approval` flow, executor registry |
| **Persistence** | `llm_trace` only (observability) | `agent_session` + `agent_message` + `llm_trace` |
| **Max LLM steps** | `AGENT_MAX_STEPS` (default 5) | `SESSION_MAX_STEPS` (default 20) |
| **agent_template** | Not used | Used when session has `template_id` |
| **prompt_template** | Used (via DynamicPromptManager) | Used (via DynamicPromptManager) |
| **Tool set** | Model tools + analytics | Model tools + analytics + session tools |
| **Triggered by** | User types in chat panel | User picks template + goal in GoalSetter |
| **UI location** | Right sidebar on every page | Dedicated workbench session view |

---

## Chat Placement in the UI

| Component | Where | Width |
|-----------|-------|-------|
| `AppLayout.tsx` | Main app layout — right sidebar | 20.666% of viewport |
| `PageLayout.tsx` | Alternative layout — right sidebar | max(30vw, 420px) |
| `ChatDrawer.tsx` | Slide-in drawer overlay | Full right panel |

The chat is hidden by default. `toggleChat()` from `ChatContext` controls visibility. On dashboard pages, the sidebar is not rendered — the dashboard has its own layout.

The `isChatOpen` flag persists in `ChatContext` for the lifetime of the React app (resets on full page refresh).
