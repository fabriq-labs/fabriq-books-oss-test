# Fabriq Agent — Conversational Chat

**Audience**: Anyone working on the in-app chat panel (`frontend-1/src/components/chat/`)
or debugging why a chat answer used the wrong tools/prompt.

**Primary files**:
- Frontend: `ChatUI.tsx`, `ChatShell.tsx`, `ChatContext.tsx`, `chatUtils.ts`, `postingChatContext.ts`, `ToolResponseRenderer.tsx`
- Backend: `backend/src/agent/routes.ts`, `backend/src/agent/AgentService.ts`, `backend/src/lib/chat-store.ts`

**Companion docs**:
- [CHAT_THREADS.md](../CHAT_THREADS.md) — thread sidebar, DB schema, API
- [frontend-1/src/components/chat/README.md](../../frontend-1/src/components/chat/README.md) — detailed how-it-works (suggestions, `promptTypes`, posting vs account)

---

## Overview

Every page in the app — including the dashboard — has an AI chat panel. This is the
**conversational chat**: a page-aware assistant that answers questions, queries data,
and creates records using the same LLM and tool infrastructure as the workbench agent
(see [02-ARCHITECTURE.md](./02-ARCHITECTURE.md)).

It is **not** a workbench session. It has no plan, no pending actions, no
auto-continuation (see [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md)).

**History** is handled in two ways:
- **`ChatShell` + `chatId`** (default in `AppLayout`, dashboards): messages persist to
  the `chat_thread` table via `/api/chat/*` and survive refresh/navigation when you
  reopen the same thread from the sidebar.
- **Bare `ChatUI` without `chatId`** (legacy): in-memory only via `ChatContext.messagesAi`.

Both paths stream through the same agent endpoint:
[`POST /api/agent/chat/stream`](./09-API_REFERENCE.md#post-apiagentchatstream).
The presence or absence of `sessionId` in the request body determines whether
`AgentService.handleStreamingRequest` runs the workbench session path.

---

## Conversation vs Session: Comparison

| | Conversational Chat | Workbench Session |
|---|---|---|
| **Entry point** | `POST /api/agent/chat/stream` (no `sessionId`) | `POST /api/agent/chat/stream` (with `sessionId`) |
| **History storage** | `chat_thread` table (via `ChatShell`) or React state (`messagesAi`) | DB `agent_message` table — permanent |
| **History mechanism** | Frontend sends all messages in every stream request; `ChatShell` also saves to DB | Backend loads message history (see [08-DATA_MODELS.md](./08-DATA_MODELS.md)) |
| **Structured plan** | None | Yes — `createPlan` tool, see [05-TOOLS.md](./05-TOOLS.md#createplan) |
| **Session tools** | Not available | `createPlan`, `completeStep`, `queueActions`, `requestClarification` |
| **Auto-continuation** | No | Yes — `setImmediate` recursive calls, see [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md) |
| **Pending actions** | No | Yes — `awaiting_approval` flow, executor registry (see [06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md)) |
| **Persistence** | `chat_thread` + `llm_trace` | `agent_session` + `agent_message` + `llm_trace` |
| **`maxSteps`** | `AGENT_MAX_STEPS` env (default 5) | `SESSION_MAX_STEPS` (default 20) |
| **`classifyQuestion()`** | Observability/logging only — does **not** switch tools or `promptTypes` | Not consulted |
| **`promptTypes`** | From `PageContext` (page or `enrichFinanceChatContext` defaults) | From session template + context |
| **`agent_template`** | Not used | Used when session has `template_id` |
| **`prompt_template`** | Used (via `DynamicPromptManager`) | Used (via `DynamicPromptManager`) |
| **Tool set** | Model tools + analytics tools, see [05-TOOLS.md](./05-TOOLS.md#tool-selection-toolmanagergetunifiedtools) | Model tools + analytics tools + session tools |
| **Triggered by** | User types in the chat panel | User picks a template + goal in the workbench |
| **UI location** | Chat panel on every page | Dedicated workbench session view |

---

## Frontend: Vercel AI SDK (`useChat`)

**File**: `frontend-1/src/components/chat/ChatUI.tsx`
**Hook**: `useChat` from `@ai-sdk/react`

### Building API context

`ChatUI` does **not** send raw `pageContext` directly. It builds enriched `chatContext`:

```typescript
const chatContext = useMemo(() => {
  const base = pageContext ?? buildDefaultPostingChatContext(currentEntity, entities, currencyById);
  return enrichFinanceChatContext(base, currentEntity, entities, currencyById);
}, [pageContext, currentEntity, entities, currencyById, ...]);
```

On each request, `experimental_prepareRequestBody` also adds:
- `userQuestion` — text of the latest user message
- `searchAllEntities` — `true` when the user says "all entities" / "across all entities"

```typescript
useChat({
  api: `${VITE_API_BASE_URL}/api/agent/chat/stream`,
  body: { stream: true, chatId, context: chatContext },
  experimental_prepareRequestBody: ({ messages, ... }) => ({
    messages: transformedMessages,
    context: {
      ...chatContextRef.current,
      userQuestion,
      searchAllEntities: userRequestedAllEntities(userQuestion),
    },
    stream: true,
    chatId,
  }),
  // onResponse, onFinish (persist thread), onError
});
```

### Message structure sent to backend

```typescript
{
  stream: true,
  chatId?: string,       // Present when wrapped in ChatShell
  context: PageContext,  // Enriched — see PageContext section
  messages: Array<{
    role: 'user' | 'assistant',
    content: string | ContentPart[],
    parts?: Array<{ type: 'text' | 'file', ... }>
  }>
}
```

The `messages` array includes **all previous turns** plus the latest message.
The agent stream endpoint does not store chat history; the frontend (and optionally
`chat_thread`) is the source of truth.

### File attachments

Files are handled by `buildFileParts()` in `chatUtils.ts`:
1. File is read as a data URL (base64)
2. Sent as a message part: `{ type: 'file', data: '...', mimeType, mediaType }`
3. Backend's `messageProcessor.ts` decodes base64 before passing to the LLM

### Tool invocations

When the backend calls a tool (`createRecord`, `analyticsQuery`, `searchRecords`,
`runFinancialReport`, …), results arrive in `message.toolInvocations`.
`ToolResponseRenderer.tsx` processes these and:
- Renders structured tool results (tables, ledgers, financial reports) inline
- Shows legal-entity scope labels on scoped results (`ToolLegalEntityScopeLabel`)
- Formats currency using the header entity's currency (`useCurrencies` / `entityCurrency.ts`)
- On `createRecord` success, updates `pageContext.recordId` with the new record ID

#### Tool invocation rendering (`uiHint`)

| `uiHint` | Component | Used for |
|---|---|---|
| `card` / `table` | generic record/list rendering | `createRecord`, `updateRecord`, plain `searchRecords` |
| `account_ledger` | `AccountLedgerDisplay` | `searchRecords` on `posting` scoped to one focus account |
| `posting_journal` | `PostingJournalDisplay` | `searchRecords` on `posting` without single focus account |
| `posting_dual` | `PostingDualDisplay` | `searchRecords` on `posting` dual debit/credit columns |
| `financial_report` | `FinancialReportDisplay` | `runFinancialReport` (trial balance, monthly trial balance, income statement) |

Posting-specific hints come from `enrichPostingSearchResult()` — see
[05-TOOLS.md — `searchRecords` posting enrichment](./05-TOOLS.md#searchrecords-posting-enrichment--enrichpostingsearchresult).

---

## Conversation history

### Thread persistence (`chat_thread`) — primary path

**Full doc**: [CHAT_THREADS.md](../CHAT_THREADS.md)

- `ChatShell` wraps `ChatThreadSidebar` + `ChatUI` with a client-generated `chatId` (`chat_<uuid>`).
- On first message: `POST /api/chat/threads` creates the row; on `onFinish`: `PUT /api/chat/:chatId` saves full `messages[]` + metadata.
- `GET /api/chat` lists threads for the current user (only those with messages).
- Rows are scoped by **`org_id` + `user_id`** (standard DAL org filter since 2026-06-16).
  Migration: `backend/prisma/migration/2026-06-16/add_chat_thread_org_id.sql`.

When `chatId` is set, messages are **not** synced through `ChatContext.messagesAi` (avoids cross-thread overwrites).

### Legacy in-memory path (no `chatId`)

`ChatContext.messagesAi` still used for bare `ChatUI` without `ChatShell`:

| Event | History outcome |
|-------|----------------|
| Close chat panel and reopen (same page) | Restored from `messagesAi` |
| Navigate away / refresh | **Lost** |

Long-lived multi-step work belongs in a workbench session (`agent_message` table).

---

## `PageContext`

**File**: `frontend-1/src/contexts/ChatContext.tsx`

`ChatContext` **stores** `pageContext` — it does not decide `posting` vs `account`.
Each page calls `setPageContext()` in a `useEffect` on mount and clears on unmount.

```typescript
export interface PageContext {
  modelName: string;                   // e.g. 'posting', 'account', 'invoice'
  viewName: string;                    // e.g. 'posting_view'
  recordId?: string | null;
  stateId?: string | null;
  viewId?: string | null;
  modelDisplayName?: string | null;
  currentPath?: string;
  promptTypes?: string[];              // e.g. ['analytics', 'default']
  focusModels?: string[];              // e.g. ['posting', 'account'] on finance chat
  modelContext?: Record<string, any>;  // legalEntityId, selectedAccountId, accountName, …
  searchAllEntities?: boolean;         // set per-request in ChatUI
  userQuestion?: string;               // set per-request in ChatUI
}
```

### Who sets `modelName`

| Page | `modelName` | Set by |
|------|-------------|--------|
| Account list `/accounting/accounts` | `account` | `AccountList` → `Master type="account"` |
| Transactions / posting list | `posting` | `Master type="posting"` |
| Posting form | `posting` | `PostingForm.tsx` (hardcoded) |
| Account form | `account` | `AccountForm.tsx` (hardcoded) |
| Bank Transactions | `posting` | `BankTransactions.tsx` + `selectedAccountId` |
| Dashboard | `posting` | `FabriqDashboard` → `buildDefaultPostingChatContext()` |
| Options Income (position modal) | `holding` | `OptionPositionDetailModal.tsx` — `recordId=holding_id`, `promptTypes=['options_analysis']` |
| No page context | `posting` | `ChatUI` fallback via `buildDefaultPostingChatContext()` |

**Dashboard does not infer model from typed text.** `modelName` is pre-set to `posting`;
`focusModels: ['posting', 'account']` lets the LLM query either model in tool calls.

### `modelContext` examples

| Page | `modelContext` |
|------|----------------|
| Dashboard / finance chat | `{ legalEntityId, legalEntityName, currencyCode, currencyId }` from header entity selector |
| Bank Transactions | `{ selectedAccountId, selectedAccountName, legalEntityId, … }` |
| Account form (edit) | `{ accountName, accountCode, legal_entity_id, currencyCode }` |
| Posting list | `{ legalEntityId, legalEntityName }` |
| Options Income position modal | Position + live Greeks (`symbol`, `delta`, `theta`, …); no tools — quotes fetched once by the FE |

### `promptTypes` — default vs analytics

`promptTypes` controls which `prompt_template` rows `DynamicPromptManager` loads and merges.

| `prompt_type` | Purpose |
|---------------|---------|
| `default` | CRUD, list filters, `createRecord` / `searchRecords` rules |
| `analytics` | `analyticsQuery` SQL patterns, aggregates, trial balance via `runFinancialReport` |
| `reconciliation` | Bank reconciliation (Bank Transactions page) |
| `options_analysis` | Theta persona for open option holdings (Options Income detail modal) |

**Defaults in this project:**

| Context | `promptTypes` |
|---------|---------------|
| Dashboard / finance chat | `['analytics', 'default']` via `buildDefaultPostingChatContext` or `enrichFinanceChatContext` |
| Bank Transactions | `['reconciliation', 'analytics', 'default']` |
| Options Income position modal | `['options_analysis']` on `holding_view` |
| Posting/account pages (no explicit set) | `['analytics', 'default']` via enrichment |
| Backend fallback (if empty) | `['analytics', 'default']` in `AgentService` |

Posting templates: `backend/prisma/metadata/prompt-templates/view_d8b6c832-*` (`posting_view`).
Options analysis: `view_d63012d4_*_options_analysis_fabriq.*` (`holding_view`).

`PageContext.promptTypes` from the frontend **wins** over any `classifyQuestion()` suggestion.
`classifyQuestion()` is used for `llm_trace.query_type` logging only.

### Example: dashboard

```typescript
// FabriqDashboard.tsx
setPageContext({
  ...buildDefaultPostingChatContext(currentEntity, entities, currencyById),
  currentPath: '/',
});
// → modelName: 'posting', promptTypes: ['analytics','default'],
//   focusModels: ['posting','account']
```

### Example: posting form

```typescript
// PostingForm.tsx
setPageContext({
  modelName: 'posting',
  viewName: getViewName('posting'),
  recordId: id || null,
  viewId: viewId || null,
  modelDisplayName: getModelDisplayName('posting'),
  currentPath: location.pathname,
  modelContext: buildPostingModelContext(currentEntity, entities),
});
```

Pages that don't call `setPageContext` leave it `null` — `ChatUI` falls back to
`buildDefaultPostingChatContext()` (finance assistant with posting as primary model).

---

## Context-aware UI features

**File**: `frontend-1/src/components/chat/chatUtils.ts`

### Input placeholder (`getInputPlaceholder`)

| Context | Placeholder |
|---------|-------------|
| `modelName === 'account'` + `recordId` | "Ask about this account (balance, activity, updates)" |
| `modelName === 'account'` (list) | "Ask about chart of accounts and balances" |
| `modelName === 'posting'` | "Ask about transactions and postings" |
| Other model | "Ask about this {modelDisplayName}" |
| Fallback | "Ask about postings and accounts" |

### Suggestion chips (`getContextSuggestions`)

Shown only in the **empty state** (no messages). Clicking a chip calls `append()` — same as typing.

| Context | Suggestions |
|---------|-------------|
| Dashboard / finance focus (`currentPath === '/'` or `focusModels` has posting + account) | Combined posting + account finance prompts |
| `posting` + `selectedAccountId` | Reconciliation: "Which transactions are unreconciled?", … |
| `modelName === 'posting'` | Posting list prompts |
| `modelName === 'account'` + `recordId` | Account detail prompts |
| `modelName === 'account'` (list) | Account list prompts |
| Other models | Generic form prompts |

Constants: `POSTING_CHAT_SUGGESTIONS`, `ACCOUNT_CHAT_SUGGESTIONS` in `chatUtils.ts`.

---

## Request flow: frontend to backend

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
  "chatId": "chat_<uuid>",
  "context": {
    "modelName": "posting",
    "viewName": "posting_view",
    "promptTypes": ["analytics", "default"],
    "focusModels": ["posting", "account"],
    "modelContext": {
      "legalEntityId": "lega_…",
      "legalEntityName": "Acme Corp",
      "currencyCode": "INR"
    },
    "userQuestion": "How much did I spend last month?"
  },
  "messages": [
    { "role": "user", "content": "List postings from yesterday" },
    { "role": "assistant", "content": "Here are the postings…" },
    { "role": "user", "content": "How much did I spend last month?" }
  ]
}
```

When `sessionId` is absent, `AgentService.handleStreamingRequest` skips session loading,
`agent_message` writes, and auto-continuation.

Full contract: [09-API_REFERENCE.md](./09-API_REFERENCE.md#post-apiagentchatstream).

---

## Backend handling

| Concern | Document |
|---|---|
| Prompt assembly (`DynamicPromptManager`, placeholders) | [04-PROMPT_SYSTEM.md — Layer 2](./04-PROMPT_SYSTEM.md#layer-2-base-prompt-from-dynamicpromptmanager-prompt_template) |
| `promptTypes` and template files | [04-PROMPT_SYSTEM.md — Question Routing](./04-PROMPT_SYSTEM.md#question-routing-conversational-chat) |
| Tool selection (`ToolManager.getUnifiedTools`) | [05-TOOLS.md — Tool Selection](./05-TOOLS.md#tool-selection-toolmanagergetunifiedtools) |
| `streamText`, `maxSteps`, model provider | [10-LIBRARIES_AND_PROVIDERS.md](./10-LIBRARIES_AND_PROVIDERS.md) |
| `llm_trace` logging | [11-OBSERVABILITY.md](./11-OBSERVABILITY.md) |
| Chat thread CRUD | [CHAT_THREADS.md](../CHAT_THREADS.md) |

---

## Chat placement in the UI

All main placements render `ChatShell` (thread sidebar + `ChatUI`):

| Component | Where | Mode |
|-----------|-------|------|
| `AppLayout.tsx` | Right sidebar | `compact` + `sidebarMode` |
| `PageLayout.tsx` | Right sidebar | `compact` + `sidebarMode` |
| `FabriqDashboard`, `RequestDashboard`, `ProcurementDashboardApproval` | Full-page when `isChatOpen` | `fullPage` — nav collapses to icon rail |
| `ChatDrawer.tsx` | Drawer overlay | Not wired in main `App.tsx` |

`toggleChat()` from `ChatContext` controls visibility.
`resetChat()` increments `chatSessionId` and clears state — wired via `chatSessionBridge.ts`.

On dashboards, opening chat switches to **full-page mode**
(`isChatFullPage = isChatOpen && isDashboard` in `AppLayout.tsx`).

---

## Debugging checklist

1. **Wrong suggestions?** — Check `pageContext` in React devtools; trace which page called `setPageContext`.
2. **Wrong tools?** — Network tab → `context.modelName`, `context.viewName`, `context.promptTypes`.
3. **Account question on dashboard?** — Expected: `modelName` stays `posting`; LLM should pass `modelName: 'account'` in tool args.
4. **Thread not listed?** — Only threads with messages appear; check `chat_thread` filtered by `org_id` + `user_id`.
5. **Prompt changes not applied?** — Edit `backend/prisma/metadata/prompt-templates/*.txt` → `npm run sync-prompt-templates`.

---

## What's next

See [README.md](./README.md) for the full agent doc index and
[14-SHORTFALLS_AND_ROADMAP.md](./14-SHORTFALLS_AND_ROADMAP.md) for known gaps.
