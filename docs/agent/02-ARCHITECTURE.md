# Fabriq Agent — Architecture

**Audience**: Anyone implementing or debugging agent backend/frontend code.
**Prerequisite**: [01-OVERVIEW.md](./01-OVERVIEW.md)

---

## What the Workbench Does

The Workbench lets a user describe a financial goal in plain English ("reconcile
all unmatched HDFC transactions for March") and delegates execution to an
LLM-driven agent. The agent:

1. Breaks the goal into a 3–5 step plan (`createPlan`)
2. Executes each step using tools (SQL queries, ML predictions, record lookups)
3. Proposes financial actions (categorizations, reconciliations, bookings) as
   **pending actions** for human review
4. Waits for approval, runs approved actions, and writes results to the database

The Workbench is **not a chatbot**. Each session has a defined goal and a
structured plan, and the LLM is guided by precise directives at every turn —
see [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md) for the state
machine and [04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md) for how those
directives are assembled.

---

## System Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│  GoalSetter → POST /sessions → POST /chat/stream → SSE listener            │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTP / SSE
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                           routes.ts  (Express)                               │
│  POST /chat/stream   POST /sessions   GET /sessions/:id/events              │
│  GET /sessions       POST /pending-actions/:id/resolve   GET /templates      │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                           AgentService.ts                                    │
│                                                                               │
│  handleStreamingRequest()         handleRequest()                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. createSystemPrompt()  →  DynamicPromptManager                   │    │
│  │  2. Load session + messages (if sessionId)                          │    │
│  │  3. buildSessionContextBlock() + SESSION_DIRECTIVE                  │    │
│  │  4. ToolManager.getUnifiedTools() → tools                           │    │
│  │  5. streamText() / generateText() with messages + tools             │    │
│  │  6. onStepFinish → emit events, persist messages                    │    │
│  │  7. shouldAutoContinue() → recursive handleRequest()                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└───────┬──────────────────┬─────────────────────────────┬────────────────────┘
        │                  │                              │
┌───────▼──────┐  ┌────────▼────────┐       ┌────────────▼──────────┐
│ ToolManager  │  │SessionEventBus  │       │  PendingActionService  │
│              │  │                 │       │                         │
│ Model tools  │  │ step_started    │       │  create / resolve       │
│ Analytics    │  │ tool_called     │       │  PendingActionExecutor  │
│ Session tools│  │ step_completed  │       │  (reconcile, create,    │
│ (createPlan, │  │ action_queued   │       │   categorize)           │
│  completeStep│  │ status_changed  │       └─────────────────────────┘
│  queueActions│  └─────────────────┘
└──────────────┘
        │
┌───────▼────────────────────────────────────────────────────────────┐
│                    LLM Provider (abstracted)                         │
│   Vercel AI SDK getModel() — Vertex / OpenAI / OpenRouter /          │
│   custom OpenAI-compatible (see 10-LIBRARIES_AND_PROVIDERS.md)       │
│   Receives: system prompt + message history + tools                 │
│   Returns: text + tool_calls (in steps)                             │
└────────────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────────────┐
│                   PostgreSQL                                         │
│  agent_session  agent_message  agent_template                        │
│  pending_action  llm_trace  llm_trace_step                          │
└────────────────────────────────────────────────────────────────────┘
```

---

## File Map: `backend/src/agent/`

| File / Directory | Purpose |
|---|---|
| `AgentService.ts` | Main orchestrator — `handleRequest`, `handleStreamingRequest`, auto-continuation, event emission |
| `ToolManager.ts` | Tool set construction per model and template |
| `AgentTools.ts` | CRUD + search tool implementations (`createRecord`, `searchRecords`, `updateRecord`, etc.) plus `erpConnectorTool` dispatch — see [05-TOOLS.md](./05-TOOLS.md) |
| `GenericFunctions.ts` | Zod parameter schemas for generic CRUD tools |
| `routes.ts` | All `/api/agent/*` Express routes including SSE endpoint |
| `index.ts` | Package exports |
| `invoiceMatching.ts` | Invoice-to-PO matching utility |
| **`tools/`** | Specialised tool implementations — full catalog in [05-TOOLS.md](./05-TOOLS.md) |
| `tools/sessionTools.ts` | `createPlan`, `completeStep`, `queueActions`, `requestClarification` (implemented — see [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md#awaiting_input)); also exports deprecated `queueAction`/`queueActionBatch` (unused, see [14-SHORTFALLS_AND_ROADMAP.md](./14-SHORTFALLS_AND_ROADMAP.md)) |
| `tools/analyticsQuery.ts` | `analyticsQuery` — read-only SQL with org_id enforcement |
| `tools/analyticsContext.ts` | `getAnalyticsContext` — schema + multi-tenancy rules for SQL writing |
| `tools/categorizePostings.ts` | `categorizePostings` — ML prediction tool (posting model only) |
| `tools/suggestReconciliationMatches.ts` | `suggestReconciliationMatches` — posting → receipt/invoice matching |
| `tools/index.ts` | Exports all tool factories |
| **`prompt/`** | Prompt assembly — see [04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md) |
| `prompt/DynamicPromptManager.ts` | Loads and merges prompt templates from DB or local files |
| `prompt/constants.ts` | `buildSessionContextBlock`, `shouldAutoContinue`, `SESSION_DIRECTIVE`, `TOOL_RESPONSE_HANDLING_GUIDELINE` |
| **`services/`** | Supporting services |
| `services/SessionService.ts` | Session CRUD + status change event emission |
| `services/PendingActionService.ts` | Pending action lifecycle + completion trigger |
| `services/SessionEventBus.ts` | Singleton in-process event emitter for SSE |
| `services/SessionTimeoutService.ts` | Watchdog (default 5 min, `AGENT_SESSION_TIMEOUT_MS`); marks stuck sessions `failed` |
| `services/SessionTraceService.ts` | LLM trace logging to `llm_trace` table — see [11-OBSERVABILITY.md](./11-OBSERVABILITY.md) |
| `services/reconciliation/` | `reconcileImportedPostings.ts`, `confirmReconciliation.ts` — see [07-WORKED_EXAMPLES.md](./07-WORKED_EXAMPLES.md) |
| **`builders/`** | Deterministic action and report generation — see [06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md) |
| `builders/ActionBuilderRegistry.ts` | Maps (goal_model, step) → builder |
| `builders/ReconciliationActionBuilder.ts` | Creates `reconcile_posting` pending actions from match results |
| `builders/ReportFormatterRegistry.ts` | Maps (goal_model) → report formatter |
| `builders/ReconciliationReportFormatter.ts` | Formats reconciliation session summary |
| `builders/index.ts` | Registers all builders and formatters |
| **`executors/`** | Approval side-effect runners — see [06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md) |
| `executors/PendingActionExecutor.ts` | Registry of executors keyed by `action_type` |
| **`handlers/erp/`** | ERP-style handlers dispatched via `erpConnectorTool` or called directly by specific tools — full registry table in [05-TOOLS.md](./05-TOOLS.md#erp-handler-registry) |
| `handlers/erp/registry.ts` | `getHandler`, `getAllMethodNames`, `hasHandler` — 5 registered methods |
| `handlers/erp/categorizeTransaction.ts` | Single-transaction categorization |
| `handlers/erp/categorizeTransactionBatch.ts` | Batch categorization |
| `handlers/erp/utils/categorizationUtils.ts` | Account prediction logic, contra-account mapping |
| **`utils/`** | Utilities |
| `utils/aiActivityLogger.ts` | Logs AI tool usage decisions |
| `utils/questionClassifier.ts` | Classifies conversational chat queries (analytical / transactional / cross-module) — see [04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md#question-routing) |
| `utils/messageProcessor.ts` | `processMessages()` — decodes base64 file parts into `FilePart`s for the AI SDK |
| **`slack/`** | Slack integration — **functional**, mounted at `/api/slack`, handles `app_mention` / `assistant_thread_started` / `message` events. Treated as an experimental entrypoint: it reuses the conversational chat path but is not covered by the Workbench session UI. |
| **`schema/`** | `SchemaGenerator.ts` — derives Zod schemas for `createRecord`/`updateRecord` tool params from Prisma model metadata |
| **`__tests__/`** | Test suite — see [12-TESTING.md](./12-TESTING.md) |

---

## Request Flow: Session Start to Completion

```
1. User selects template + types goal in GoalSetter
   → POST /api/agent/sessions  { goal, templateId, mode, goalModel }
   → creates agent_session { status: 'planning' }

2. Frontend calls POST /api/agent/chat/stream  { message, sessionId }
   + opens SSE connection GET /api/agent/sessions/:id/events

3. AgentService.handleStreamingRequest() [Turn 1]:
   a. Load session, load template
   b. Build system prompt (DynamicPromptManager + template.system_prompt + session context block)
   c. Get tools (ToolManager.getUnifiedTools with template.allowed_tools)
   d. Call streamText() → LLM
   e. LLM calls createPlan({ goal, steps }) → session status: 'executing'
   f. onStepFinish: emit step_started, trigger session name generation
   g. shouldAutoContinue → true → setImmediate(handleRequest("Continue step 1..."))

4. AgentService.handleRequest() [Turn 2..N] (auto-continuation):
   → LLM uses tools (analyticsQuery, categorizePostings, etc.)
   → LLM calls completeStep({ step_index, result_summary, accumulated_context_update })
     → Hybrid dispatcher checks next step:
       - action step with registered builder → builder creates pending_actions → 'awaiting_approval'
       - report step with registered formatter → formatter writes report → 'completed'
       - other step → LLM handles via next auto-continuation turn
   → If still 'executing' and step advanced → setImmediate next turn

5. User reviews pending actions in Inbox or session view
   → POST /api/agent/pending-actions/:id/resolve { status: 'approved' }
   → PendingActionExecutor runs (categorize, reconcile, create posting...)
   → When all resolved: check for report formatter or resume agent → 'completed'
```

See [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md) for the full state
machine, including the `awaiting_input` branch when `requestClarification`
is called.

---

## The Three Execution Modes

| Mode | Behaviour |
|------|-----------|
| `supervised` | Agent prepares all actions and waits for user approval before executing. Default. |
| `semi_auto` | Agent auto-approves high-confidence actions; surfaces uncertain ones for review. |
| `autonomous` | Agent executes everything without approval. Use only for low-risk tasks. |

Mode is set at session creation from the template's `default_mode`,
overridable by the user. It affects `shouldAutoContinue` and whether the
approval step is skipped.

---

## LLM Provider

The agent does **not** call a single hardcoded model. All LLM calls go
through `getModel(task?)` / `getModelId(task?)` in
`backend/src/lib/ai/modelProvider.ts`, which abstracts over:

- Google Vertex AI (`@ai-sdk/google-vertex`)
- OpenAI (`@ai-sdk/openai`)
- OpenRouter
- Any custom OpenAI-compatible endpoint

Provider and model selection are controlled by environment variables:

| Env var | Purpose |
|---|---|
| `LLM_PROVIDER` | `vertex` / `openai` / `openrouter` / `custom` |
| `LLM_MODEL` | Default model ID for the selected provider |
| `LLM_MODEL_{TASK}` | Per-task override (e.g. `LLM_MODEL_CATEGORIZE`, `LLM_MODEL_PLAN`) — falls back to `LLM_MODEL` if unset |

- **SDK**: Vercel AI SDK (`generateText` / `streamText`)
- **Config**: temperature 0.2, topP 0.95, topK 40 (determinism-optimised, where supported by the provider)
- **Token budget**: `maxSteps = 20` per session LLM call (prevents runaway loops)

See [10-LIBRARIES_AND_PROVIDERS.md](./10-LIBRARIES_AND_PROVIDERS.md) for the
full provider matrix and package versions.

---

## Frontend File Map

Key files in `frontend-1/src/`:

| File | Role |
|------|------|
| `pages/workbench/SessionView.tsx` | Per-session page — connects SSE, routes to view components based on status |
| `components/workbench/ExecutingView.tsx` | Live activity feed + `ConnectionBadge` (shows Reconnecting/Offline) |
| `components/workbench/AwaitingApprovalView.tsx` | Inline approve/reject UI per pending action |
| `components/workbench/CompletedView.tsx` | Plan summary + session report |
| `components/workbench/SessionsSidebar.tsx` | Session list + inbox count badge |
| `pages/workbench/InboxPage.tsx` | Global inbox — all pending actions across sessions |
| `components/workbench/ActionDetailDrawer.tsx` | Slide-in drawer for a single pending action |
| `components/workbench/actions/registry.ts` | Per-action-type label, icon, row summary, detail component |
| `components/workbench/GoalSetter.tsx` | Template picker + goal input (two-screen flow) |
| `hooks/useSessionEvents.ts` | SSE hook — `snapshot`, `events[]`, `connectionStatus` |
| `contexts/AgentSessionContext.tsx` | Session list, inbox count, approve/reject/bulkApprove actions |
| `pages/settings/AITemplatesPage.tsx` | Settings page — Prompt Templates + Agent Templates tabs |
| `components/forms/Masters/AgentTemplatesList.tsx` | Inline table for agent templates (name, goal model, mode, active) |
| `components/forms/Masters/AgentTemplateForm.tsx` | Create/edit form for agent templates — `system_prompt` uses Monaco editor |

---

## Agent Template Management

Templates are the pre-defined task types shown in GoalSetter. See
[05-TOOLS.md](./05-TOOLS.md) for the `allowed_tools` filter mechanics.

### Template Fields

| Field | Type | Purpose |
|-------|------|---------|
| `name` | String | Display name on the GoalSetter card |
| `description` | String | One-sentence card subtitle |
| `icon` | String | Lucide icon name (e.g. `tag`, `arrow-right-left`) |
| `goal_model` | String? | Prisma model the agent focuses on — determines default tool set. `null` = general purpose |
| `system_prompt` | Text | Prepended to the base system prompt for every session using this template |
| `user_hint` | String | Placeholder text shown in the goal input box |
| `default_mode` | String | `supervised` / `semi_auto` / `autonomous` |
| `is_active` | Boolean | `false` = hidden in GoalSetter, still visible in admin UI |
| `sort_order` | Int | Display order in GoalSetter (lower = first) |
| `org_id` | String? | `null` = system template available to all orgs |
| `focus_models` | String[] | Model schemas included in the system prompt. Empty = fall back to `RELATED_MODELS[goal_model]`, then all |
| `allowed_tools` | String[] | Tools the LLM may call besides the always-present `createPlan` + `completeStep`. Empty = full tool set |

### Current Template Inventory

| Template | `focus_models` | `allowed_tools` |
|---|---|---|
| `atpl_categorise` | posting, account, category, category_group | getAnalyticsContext, analyticsQuery, categorizePostings, queueActions |
| `atpl_reconcile` | posting, account, payment_receipt, invoice | getAnalyticsContext, analyticsQuery, suggestReconciliationMatches, queueActions |
| `atpl_book_transactions` | posting, account, category_group | getAnalyticsContext, analyticsQuery, queueActions |
| `atpl_spending_analysis` | posting, account, category, category_group | getAnalyticsContext, analyticsQuery |
| `atpl_custom` | *(empty — all accessible)* | *(empty — full fallback)* |

### Admin API

Routes under `/api/agent/admin/templates` (all require `authMiddleware`):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/templates` | List all templates (active + inactive) |
| `GET` | `/admin/templates/:id` | Fetch single template |
| `POST` | `/admin/templates` | Create template (`org_id` always set to `null`) |
| `PUT` | `/admin/templates/:id` | Partial update |
| `DELETE` | `/admin/templates/:id` | Hard delete |

Access is controlled by frontend routing guard (`allowedRoles: ['Super Admin']`) — the backend does not enforce a role check on these routes.

### Seeding New Templates

Templates are not seeded via Prisma migrations. To add one:

1. Open **Settings → AI Templates → Agent Templates tab**
2. Set `focus_models` to the minimal set the agent needs (fewer = sharper prompt, ~1,400 fewer tokens)
3. Set `allowed_tools` to exactly the tools needed. Leave empty only for `atpl_custom`-style free-form templates
4. Set `is_active = true` and `sort_order` to control position
5. Template is live immediately — no restart needed

---

## Frontend Component Rendering Optimization

**File**: `frontend-1/src/components/workbench/ExecutingViewV2.tsx` and related session components

The Workbench step pane receives a high volume of SSE events during execution
(step started, tool called, step completed, status changed, heartbeat). To
prevent unnecessary re-renders and visual flicker:

### Pattern 1: Stable Array References in useMemo

When grouping immutable events into derived data structures (e.g.,
`eventsByStep: Map<number, SessionEvent[]>`), use a ref-backed preservation
strategy:

```typescript
const stableStepArraysRef = useRef<Map<number, SessionEvent[]>>(new Map());

const eventsByStep = useMemo(() => {
  const tempMap = new Map<number, SessionEvent[]>();
  // ... build tempMap from events ...

  // Restore stable references if array length unchanged
  for (const [idx, newArr] of tempMap) {
    const prevArr = stableStepArraysRef.current.get(idx);
    if (prevArr?.length === newArr.length) {
      tempMap.set(idx, prevArr);  // reuse old reference
    }
  }

  stableStepArraysRef.current = tempMap;
  return tempMap;
}, [events]);
```

This allows child components to skip re-renders when event counts are stable
(even if new events arrived), reducing thrashing during SSE storms.

### Pattern 2: Memoization with Field-Level Equality

For components receiving composite props (e.g., `session: AgentSession`), use
`React.memo()` with a custom equality function that only checks mutable
fields:

```typescript
export const SessionHeader = React.memo(SessionHeaderInner, (prev, next) => {
  const a = prev.session, b = next.session;
  if (a === b) return true;  // object identity — skip render
  // Only re-render if these specific fields changed:
  return !(
    a.name !== b.name || a.goal !== b.goal || a.status !== b.status ||
    a.current_step_index !== b.current_step_index || a.plan !== b.plan
  );
});
```

Ignoring callback props and shallow object mutations prevents re-renders when
parents re-create props but data is unchanged.

### Pattern 3: SSE as Notification, Not State

SSE events (e.g., `session_status_changed`) are **signals** that the server
state has changed, not the source of truth. Do not attempt optimistic local
patching:

```typescript
// ❌ BAD: Races with fresh API call
if (eventType === 'session_status_changed') {
  setSnapshot(prev => ({ ...prev, session: { ...prev.session, status } }));
}

// ✅ GOOD: Let consumer fetch fresh data
// SessionView watches for 'session_status_changed' and calls sessionAPI.get()
```

See [03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md#frontend-session-state-synchronization)
for details.

---

## What's Next

- **03-SESSION_LIFECYCLE.md** — the full state machine, auto-continuation
  rules, and the `awaiting_input` clarification flow
- **04-PROMPT_SYSTEM.md** — how the system prompt seen by the LLM is assembled
- **05-TOOLS.md** — the tool catalog and ERP handler registry referenced
  throughout the file map above
