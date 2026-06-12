# Fabriq Agent — Conversational Chat

**Audience**: Anyone working on the in-app chat panel (`frontend-1/src/components/chat/`)
or debugging why a chat answer used the wrong tools/prompt.
**Primary files**:
- Frontend: `frontend-1/src/components/chat/ChatUI.tsx`, `ChatContext.tsx`, `chatUtils.ts`, `ToolResponseRenderer.tsx`
- Backend: `backend/src/agent/routes.ts`, `backend/src/agent/AgentService.ts`

---

## Overview

Every page in the app — including the dashboard — has an AI chat panel. This
is the **conversational chat**: a stateless, page-aware assistant that
answers questions, queries data, and creates records using the same LLM and
tool infrastructure as the workbench agent (see
[02-ARCHITECTURE.md](./02-ARCHITECTURE.md)).

It is **not** a workbench session. It has no plan, no pending actions, no
auto-continuation (see [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md)
for what a session adds). The conversation is ephemeral — messages live only
in the browser's React state and are gone when you navigate away.

Both conversational chat and workbench sessions share the same HTTP endpoint,
[`POST /api/agent/chat/stream`](./09-API_REFERENCE.md#post-apiagentchatstream).
The presence or absence of `sessionId` in the request body determines which
code path runs inside `AgentService.handleStreamingRequest`.

---

## Conversation vs Session: Comparison

| | Conversational Chat | Workbench Session |
|---|---|---|
| **Entry point** | `POST /api/agent/chat/stream` (no `sessionId`) | `POST /api/agent/chat/stream` (with `sessionId`) |
| **History storage** | React state — lost on navigate/close | DB `agent_message` table — permanent |
| **History mechanism** | Frontend sends all messages in every request | Backend loads message history (see [08-DATA_MODELS.md](./08-DATA_MODELS.md)) |
| **Structured plan** | None | Yes — `createPlan` tool, see [05-TOOLS.md](./05-TOOLS.md#createplan) |
| **Session tools** | Not available | `createPlan`, `completeStep`, `queueActions`, `requestClarification` |
| **Auto-continuation** | No | Yes — `setImmediate` recursive calls, see [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md) |
| **Pending actions** | No | Yes — `awaiting_approval` flow, executor registry (see [06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md)) |
| **Persistence** | `llm_trace` only (observability) | `agent_session` + `agent_message` + `llm_trace` |
| **Question classification / `maxSteps`** | `classifyQuestion()` decides `maxSteps` (2 or 8) and `promptTypes`, see [04-PROMPT_SYSTEM.md — Question Routing](./04-PROMPT_SYSTEM.md#question-routing-conversational-chat) | Fixed `SESSION_MAX_STEPS` (default 20), see [10-LIBRARIES_AND_PROVIDERS.md](./10-LIBRARIES_AND_PROVIDERS.md#maxsteps) |
| **`agent_template`** | Not used | Used when session has `template_id` |
| **`prompt_template`** | Used (via `DynamicPromptManager`) | Used (via `DynamicPromptManager`) |
| **Tool set** | Model tools + analytics tools, see [05-TOOLS.md](./05-TOOLS.md#tool-selection-toolmanagergetunifiedtools) | Model tools + analytics tools + session tools |
| **Triggered by** | User types in the chat panel | User picks a template + goal in the workbench |
| **UI location** | Chat panel on every page | Dedicated workbench session view |

The rest of this doc covers the conversational-chat-specific pieces: the
frontend `useChat` integration, `PageContext`, in-memory history, and UI
placement. For prompt assembly, tool selection, model invocation, and
logging, see the cross-linked reference docs above — those describe the
unified session/non-session behavior and are not repeated here.

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
  context: PageContext,  // Current page context, see below
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

The `messages` array includes **all previous turns** plus the latest message.
The backend doesn't store any history for conversational chat — the frontend
is the source of truth for the conversation so far.

### File attachments

Files are handled by `buildFileParts()` in `chatUtils.ts`:
1. File is read as a data URL (base64)
2. Sent as a message part: `{ type: 'file', data: 'data:image/png;base64,...', mimeType: 'image/png', mediaType: 'image/png' }`
3. Backend's `messageProcessor.ts` decodes base64 back to `Uint8Array` before passing to the LLM

### Tool invocations

When the backend calls a tool (e.g. `createRecord`, `analyticsQuery`), the
result comes back in the message's `toolInvocations` array.
`ToolResponseRenderer.tsx` processes these and:
- Renders structured tool results (tables, record cards) inline in the chat
- When `createRecord` succeeds, updates `pageContext.recordId` with the new record's ID

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

  On mount (chat panel opens):
    setMessages(messagesAi)    ← restore from context into useChat

  On every response:
    setMessagesAi(messages)    ← sync back to context
```

### What "lost" means in practice

| Event | History outcome |
|-------|----------------|
| Close chat panel and reopen (same page) | Restored — context survives |
| Navigate to a different page | **Lost** — context resets |
| Refresh the browser | **Lost** |
| Close the browser | **Lost** |

This is by design — conversational chat is meant for quick contextual
queries. Long-lived task sequences belong in a workbench session, where
history is persisted to `agent_message` (see
[08-DATA_MODELS.md](./08-DATA_MODELS.md)).

---

## `PageContext`

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

`PageContext` is the bridge between "what page is the user on" and prompt/
tool selection on the backend — see
[04-PROMPT_SYSTEM.md — Layer 2](./04-PROMPT_SYSTEM.md#layer-2-base-prompt-from-dynamicpromptmanager-prompt_template)
for how `recordId`, `viewName`, and `modelContext` placeholders are resolved
into the prompt, and
[05-TOOLS.md — Model → Default Tool Set](./05-TOOLS.md#model--default-tool-set)
for how `modelName` determines which model-specific tools load.

### `modelContext` examples

| Page | `modelContext` content |
|------|----------------------|
| Posting list with account selected | `{ selectedAccountId: 'acc_...' }` |
| Invoice form | `{ supplierId: 'sup_...' }` |
| Dashboard | *(empty or omitted)* |

### How each page sets `PageContext`

Every page that wants the chat to be context-aware calls `setPageContext()`
inside a `useEffect`:

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

### Pages that set `PageContext`

- All form components (`PostingForm`, `InvoiceDetails`, `PromptTemplateForm`, etc.)
- Dashboard (`AIDashboard.tsx`)
- `ToolResponseRenderer.tsx` — updates `recordId` dynamically when a new record is created via tool

Pages that don't call `setPageContext` leave it `null` — the chat falls back
to a generic state with no model-specific tools or prompt tailoring.

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

For the full request/response contract (including how `sessionId` changes
the shape), see
[09-API_REFERENCE.md — `POST /api/agent/chat/stream`](./09-API_REFERENCE.md#post-apiagentchatstream).

When `sessionId` is absent, `AgentService.handleStreamingRequest` skips all
session-related logic: no session loading, no `agent_message` writes, no
auto-continuation.

---

## Backend Handling

The backend treats a conversational-chat request the same as a session
request, minus the session-specific steps. Rather than duplicate that here,
this section is a map to where each piece is documented:

| Concern | Where it's documented |
|---|---|
| Prompt assembly (`DynamicPromptManager`, placeholders, `{{#if}}` blocks) | [04-PROMPT_SYSTEM.md — Layer 2](./04-PROMPT_SYSTEM.md#layer-2-base-prompt-from-dynamicpromptmanager-prompt_template) |
| `promptTypes` selection for chat (`classifyQuestion`, `maxSteps`) | [04-PROMPT_SYSTEM.md — Question Routing](./04-PROMPT_SYSTEM.md#question-routing-conversational-chat) |
| Tool selection (`ToolManager.getUnifiedTools`, no session tools) | [05-TOOLS.md — Tool Selection](./05-TOOLS.md#tool-selection-toolmanagergetunifiedtools) |
| `streamText` invocation, `maxSteps`, model provider | [10-LIBRARIES_AND_PROVIDERS.md](./10-LIBRARIES_AND_PROVIDERS.md) |
| `llm_trace` / `llm_trace_step` logging | [11-OBSERVABILITY.md](./11-OBSERVABILITY.md) |

One conversational-chat-specific note: `PageContext.promptTypes`, if set by
the page (e.g. the dashboard sets `['analytics', 'default']`), takes
precedence over `classifyQuestion()`'s suggestion — see
[04-PROMPT_SYSTEM.md — Question Routing](./04-PROMPT_SYSTEM.md#question-routing-conversational-chat)
for the exact precedence.

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

## Chat Placement in the UI

| Component | Where | Width |
|-----------|-------|-------|
| `AppLayout.tsx` | Main app layout — right sidebar | 20.666% of viewport |
| `PageLayout.tsx` | Alternative layout — right sidebar | max(30vw, 420px) |
| `ChatDrawer.tsx` | Slide-in drawer overlay | Full right panel |

The chat is hidden by default. `toggleChat()` from `ChatContext` controls
visibility. On dashboard pages, the sidebar is not rendered — the dashboard
has its own layout.

The `isChatOpen` flag persists in `ChatContext` for the lifetime of the React
app (resets on full page refresh).

---

## What's Next

This is the final doc in the agent documentation set. See
[README.md](./README.md) for the full index and reading order, and
[14-SHORTFALLS_AND_ROADMAP.md](./14-SHORTFALLS_AND_ROADMAP.md) for known gaps.
