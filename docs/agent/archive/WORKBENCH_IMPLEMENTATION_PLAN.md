# Fabriq Workbench — Implementation Plan

**Version**: 1.2
**Date**: 2026-03-30
**Based on**: [WORKBENCH_FUNCTIONAL_SPEC.md](./WORKBENCH_FUNCTIONAL_SPEC.md)

---

## Phase Status Summary

| Phase | What gets built | Status |
|-------|----------------|--------|
| **1** | Backend foundations: SSE, session completion, templates, categorize tool | ✅ Complete |
| **2** | Frontend foundations: new layout, routing, live view, GoalSetter v2 | ✅ Complete |
| **3** | End-to-end action type UI + Global Inbox | 🔲 Not started |
| **4** | Polish: inbox badge, deep links, cleanup | 🔲 Not started |

---

## Phase 1 — Backend Foundations ✅ Complete

### 1.1 Database Migration ✅

**`agent_template` table** — added to `backend/prisma/schema/data.prisma`

Fields: `id`, `org_id` (null = system template), `name`, `description`, `icon`, `goal_model`, `system_prompt` (Text), `user_hint`, `default_mode`, `is_active`, `sort_order`, `created_at`

**`agent_session` additions**:
- `name String?` — auto-generated 4-6 word title
- `template_id String?` — FK to `agent_template`

---

### 1.2 Seed System Templates ✅

File: `backend/prisma/seed-agent-templates.sql`

Five templates seeded: Book Transactions, Reconcile Transactions, Analyse Spending, Categorise Expenses, Custom.

Each template's `system_prompt` instructs the agent to use broad keyword search for account names rather than requiring exact matches. The "Categorise Expenses" prompt was revised after initial testing to be specific about Fabriq's double-entry model and the `categorizePostings` tool.

Apply: `psql $DATABASE_URL < backend/prisma/seed-agent-templates.sql`

---

### 1.3 Session Name Auto-Generation ✅

**Where**: `AgentService.ts`, `generateSessionName()` private method, called from `onStepFinish` when a `createPlan` tool call is detected.

**Logic**: `generateText` with `maxTokens: 20` to produce a 4-6 word title. Stored in `agent_session.name`.

---

### 1.4 Template Prompt Merging ✅

**Where**: Both `handleRequest` and `handleStreamingRequest` in `AgentService.ts`.

When a session has `template_id`, loads the template and prepends its `system_prompt` to the base system prompt. Merged prompt is NOT stored — always loaded fresh from DB.

---

### 1.5 Pending Action Completion Trigger ✅

**Where**: `PendingActionService.resolvePendingAction`

After resolving an action, checks if all pending actions for the session are resolved. If yes:
1. **Deterministic report exists** → writes report message, marks session `completed`, emits SSE event — no LLM call
2. **`shouldAutoContinue` is true** → transitions to `executing`, resumes agent via `setImmediate`
3. **No more steps** → marks session `completed`, emits SSE event

---

### 1.6 SessionEventBus ✅

**File**: `backend/src/agent/services/SessionEventBus.ts`

In-process singleton `EventEmitter`. Events emitted per-session and per-org. Events broadcast to SSE subscribers in the route handler.

Events emitted from:
- `AgentService` — `step_started`, `step_completed`, `tool_called` (via `onStepFinish`)
- `SessionService.updateAgentSession` — `session_status_changed`
- `sessionTools.ts queueActionTool/queueActionBatchTool` — `action_queued`, `inbox_count_changed`
- `PendingActionService.resolvePendingAction` — `session_status_changed` on completion

**Note**: AI SDK v4 does not provide `onStepStart` — `step_started` is emitted before each LLM call using the session's `current_step_index`.

---

### 1.7 SSE Endpoint ✅

**Route**: `GET /api/agent/sessions/:id/events` in `backend/src/agent/routes.ts`

Sends `snapshot` immediately on connect (current session state via `getSessionTrace`), then streams live events from `sessionEventBus`. Heartbeat every 30 seconds. Cleans up on client disconnect.

---

### 1.8 Paginated Pending Actions Endpoint ✅

**Route**: `GET /api/agent/pending-actions/paginated`

Supports: `page`, `pageSize`, `session_id`, `action_type`, `confidence`, `status` filters.
Returns: `{ items, total, page, pageSize, totalPages }`.

---

### 1.9 `create_posting` Executor ✅

**Where**: `backend/src/agent/executors/PendingActionExecutor.ts`, `CreatePostingExecutor`

Validates account belongs to org, creates `posting` record with status `booked`, sets `matched_reference` from `source_transaction_id`.

---

### 1.10 `categorizePostings` Agent Tool ✅

**File**: `backend/src/agent/tools/categorizePostings.ts`

New agent tool registered in the `posting` model tool set. When called with an `account_id`:
1. Queries postings where the counter-account side is null (uncategorized)
2. Calls `categorizeTransactionBatchHandler.execute` with `dry_run: true`
3. Returns structured predictions (posting details + predicted account + confidence + reasoning)

The tool makes no DB writes — it is purely a prediction tool. The agent then decides which predictions to queue as `categorize_transaction` actions.

---

### 1.11 `categorize_transaction` Executor ✅

**Where**: `backend/src/agent/executors/PendingActionExecutor.ts`, `CategorizeTransactionExecutor`

On approval, determines transaction direction (money_in/money_out) from the posting's account types, then calls `updatePostingWithCategorization` to write the predicted account ID and `ai_cat_score`.

---

### 1.12 ActionBuilderRegistry Context Fix ✅

**Problem found during testing**: `ReconciliationActionBuilder.matches` returned `true` for ANY action step on the posting model. When the categorise expenses flow had an action step, the reconciliation builder claimed it, found no `match_results` in context, created 0 actions, and the session slid to `completed` — skipping the `categorizePostings` tool entirely.

**Fix**: `ActionBuilderRegistry.get` now passes `accumulated_context` to `matches`. `ReconciliationActionBuilder.matches` only returns `true` when `accumulated_context.match_results` is a non-empty array. Without a matching builder, the dispatcher breaks out (LLM fallback), and the agent calls `categorizePostings` → `queueActionBatch` itself.

**Files changed**: `ActionBuilderRegistry.ts`, `ReconciliationActionBuilder.ts`, `sessionTools.ts`, `hybrid-execution.test.ts`

---

### Phase 1 Tests ✅

| Test | File | Status |
|------|------|--------|
| Book Transactions E2E | `v2-create-posting-e2e.test.ts` | ✅ Passes |
| Categorise Expenses E2E | `v2-categorise-expenses-e2e.test.ts` | ✅ Passes |
| ActionBuilderRegistry unit | `hybrid-execution.test.ts` | ✅ 16 tests pass |

Run E2E tests:
```bash
npx jest src/agent/__tests__/v2-create-posting-e2e.test.ts --runInBand --forceExit
npx jest src/agent/__tests__/v2-categorise-expenses-e2e.test.ts --runInBand --forceExit
```

Prerequisites: DB running with indian-demo data, LLM API key configured, seed-agent-templates.sql applied.

---

## Phase 2 — Frontend Foundations ✅ Complete

### 2.1 New Dependencies ✅

- `@microsoft/fetch-event-source` — SSE client with auth header + reconnection support

### 2.2 `useSessionEvents` Hook ✅

**File**: `frontend-1/src/hooks/useSessionEvents.ts`

Returns `snapshot` (latest full state), `events[]` (live events), `connectionStatus`. Reconnect backoff: 2s → 4s → 8s → 30s. Deduplicates by event `id`. `snapshot` event updates state but is not added to `events[]`.

### 2.3 `AgentSessionContext` Refactor ✅

Removed 3-second polling and `activeSession` from context. Context now manages session list only (`sessions[]`, `inboxCount`, 60s fallback poll). Per-session state lives in `SessionView` via SSE. `createSession` now accepts `templateId`.

### 2.4 Updated Routing ✅

```
/workbench                 → GoalSetter (index route)
/workbench/inbox           → InboxPage (stub, Phase 3)
/workbench/:sessionId      → SessionView
```

`inbox` declared before `:sessionId` to avoid collision.

### 2.5 WorkbenchPage Rewrite ✅

Two-column layout: `SessionsSidebar` (240px) + `<Outlet />`. `AgentSessionProvider` wraps all. `ConversationPanel` removed from routing.

### 2.6 `SessionHeader` Redesign ✅

**File**: `frontend-1/src/components/workbench/SessionHeader.tsx`

Receives `session` as prop (not from context). Shows session name (or goal), mode badge, and step progress bar with connecting lines. Dot states: completed (green check), current (amber spinner), future (gray circle).

### 2.7 New Components ✅

| Component | File | What it does |
|-----------|------|-------------|
| `SessionView` | `pages/workbench/SessionView.tsx` | Loads session from URL param, connects SSE, fires initial stream if planning, renders state-appropriate view |
| `ExecutingView` | `components/workbench/ExecutingView.tsx` | Live activity feed from SSE events, current step banner, connection status badge |
| `AwaitingApprovalView` | `components/workbench/AwaitingApprovalView.tsx` | Inline approve/reject per action, bulk approve high-confidence, link to inbox |
| `CompletedView` | `components/workbench/CompletedView.tsx` | Plan summary, duration, lazy-loaded full trace |
| `InboxPage` | `pages/workbench/InboxPage.tsx` | Stub for Phase 3 |

### 2.8 GoalSetter v2 ✅

**File**: `frontend-1/src/components/workbench/GoalSetter.tsx`

Two screens:
1. **Template grid** — loads templates from `GET /api/agent/templates`, shows icon + name + description cards
2. **Goal input** — shows after template selected; uses template's `user_hint` as placeholder; mode selector; submit navigates to `/workbench/:sessionId`

On submit: `createSession({ goal, mode, goalModel, templateId })` → navigate to session URL. Initial stream fires from `SessionView` on first render when `status === 'planning'` and no plan exists.

### 2.9 `SessionsSidebar` Updates ✅

- Shows session `name` (auto-generated) instead of full goal text
- Inbox button at top with pending count badge
- Navigate to `/workbench/:sessionId` (not old `/workbench/sessions/:sessionId`)

### Session Start Flow

```
User fills goal → GoalSetter.handleSubmit()
  → POST /api/agent/sessions (create session)
  → navigate('/workbench/:sessionId')
  → SessionView mounts, status='planning', no plan
  → SessionView fires POST /api/agent/chat/stream (fire-and-forget)
  → Agent runs server-side via setImmediate chain
  → SSE events stream in: step_started, tool_called, step_completed, etc.
  → SessionView renders ExecutingView when status='executing'
  → SessionView renders AwaitingApprovalView when status='awaiting_approval'
  → SessionView renders CompletedView when status='completed'
```

User can navigate away at any time — agent keeps running. Returning to `/workbench/:sessionId` re-loads session from backend and reconnects SSE.

---

## Phase 3 — Global Inbox + Action Type UI ✅ Complete

### 3.1 Action Type Registry ✅

**File**: `frontend-1/src/components/workbench/actions/registry.ts`

Each entry: `label`, `icon`, `badgeClass`, `renderRowSummary(action) → { primary, secondary?, amount? }`, `DetailComponent`.

Fallback: generic renderer showing title + raw JSON payload.

Registered types: `categorize_transaction` (full), `create_posting` (generic fallback), `reconcile_posting` (generic fallback).

### 3.2 Action Components ✅

| Action type | Row summary | Detail | Notes |
|-------------|-------------|--------|-------|
| `categorize_transaction` | Description + amount + `→ predicted account` | Transaction card + prediction card with confidence bar + reasoning | Full |
| `create_posting` | Description + amount + account | Generic JSON | Phase 4 |
| `reconcile_posting` | Title | Generic JSON | Phase 4 |

**`CategorizeTransactionDetail`** (`actions/CategorizeTransactionDetail.tsx`):
- Transaction card: description, formatted date, amount
- Prediction card: predicted account name, confidence bar (visual width + colour), score %, reasoning text
- Approve/Reject in drawer shell (not in this component)

### 3.3 Global Inbox Page ✅

**File**: `frontend-1/src/pages/workbench/InboxPage.tsx`

- Filter bar: type dropdown, confidence dropdown, status dropdown (default: pending)
- Table: checkbox, type badge, description (from registry `renderRowSummary`), amount, confidence badge, age, status badge
- Pagination: 25/page with prev/next
- Bulk action bar: appears on selection — "Approve selected", "Reject selected"
- High-confidence button: always visible when high-confidence pending items exist — "Approve N high-confidence" (no selection needed)
- Row click → opens drawer, URL updates to `/workbench/inbox/:actionId`

### 3.4 Action Detail Drawer ✅

**File**: `frontend-1/src/components/workbench/ActionDetailDrawer.tsx`

- Slides from right (420px), backdrop click to close, Escape key to close
- Header: type badge + action title + X button
- Body: scrollable, uses registry `DetailComponent`
- Resolved banner: shown for non-pending actions
- Footer: Approve + Reject buttons (pending only), loading state during processing
- URL: `/workbench/inbox/:actionId` on open, `/workbench/inbox` on close

### 3.5 AwaitingApprovalView updated ✅

Now uses registry `renderRowSummary` for consistent display: type badge, confidence badge, primary/secondary description, amount column.

---

## Phase 4 — Polish ✅ Complete

- Inbox count badge real-time update via `inbox_count_changed` SSE events ✅
  — `SessionView` now calls `refreshSessions()` on `inbox_count_changed`, keeping the sidebar badge in sync without waiting for the 60s fallback poll
- Connection status indicator (Live / Reconnecting / Offline) in `ExecutingView` ✅
  — `ConnectionBadge` component already present; hidden when connected, shows Reconnecting/Offline/Connecting states with appropriate icons
- Delete old components ✅ — Removed: `ConversationPanel`, `PendingActionsList`, `BatchSummaryCard`, `GenericBatchList`
- Remove old batch routes ✅ — `GET /pending-actions/batch/:batchId` removed (was only used by `GenericBatchList`). `POST /batch/:batchId/approve` kept (still used by InboxPage + SessionView).

## Phase 5 — Agent Template Admin UI ✅ Complete

### 5.1 Backend Admin Routes ✅

**File**: `backend/src/agent/routes.ts`

Four new routes under `/api/agent/admin/templates`:
- `GET /` — list all templates (active + inactive), no org filter
- `GET /:id` — single template by ID (used by edit form)
- `POST /` — create template (`org_id` defaults to null = system template)
- `PUT /:id` — update template (partial updates supported)
- `DELETE /:id` — delete template

### 5.2 Tabbed Settings Page ✅

**File**: `frontend-1/src/pages/settings/AITemplatesPage.tsx`

Combined page replacing the old standalone Prompt Templates list. Two tabs:
- **Prompt Templates** — renders the existing `<Master type="prompt_template" ...>` component unchanged
- **Agent Templates** — renders new `AgentTemplatesList`

Tab state persists in URL (`?tab=prompt` / `?tab=agent`). Both `/settings/ai-templates` and `/settings/prompt-templates` route here.

### 5.3 Agent Templates List ✅

**File**: `frontend-1/src/components/forms/Masters/AgentTemplatesList.tsx`

Custom inline table (not using Master/metadata pattern — agent_template has no view metadata configured). Shows: name, description, goal model, mode badge, active indicator, sort order. Edit/delete per row, create button at top.

### 5.4 Agent Template Form ✅

**File**: `frontend-1/src/components/forms/Masters/AgentTemplateForm.tsx`

Create/edit form with all fields:
- Name, Description, Icon (Lucide icon name), Goal Model (dropdown), Default Mode (dropdown)
- User Hint (placeholder text shown in GoalSetter), Sort Order, Is Active (switch)
- System Prompt — `CodeEditor` (Monaco, plaintext, 380px height)

Routes: `/settings/agent-templates/new` and `/settings/agent-templates/:id/edit`

### 5.5 Sidebar + Routing Updates ✅

- Sidebar entry renamed "Prompt Templates" → **"AI Templates"**, path → `/settings/ai-templates`
- `App.tsx`: new imports + routes for `AITemplatesPage`, `AgentTemplateForm`

---

## Open Questions — Resolved

| Question | Answer |
|----------|--------|
| Does session creation auto-trigger the first agent call? | No. The frontend makes a separate call to `handleStreamingRequest` after creating the session. GoalSetter makes 2 API calls: create session, then stream. |
| `onStepStart` in AI SDK? | Not available in v4. `step_started` emitted before each LLM call using session's `current_step_index`. |
| `create_posting` source linking field? | `posting.matched_reference` is used as `source:<transaction_id>`. No dedicated FK field. |

## Open Questions — Pending

| Question | Notes |
|----------|-------|
| Account picker in `CreatePostingDetail` | Need to confirm correct view ID for the account list endpoint |
| `waiting_for_input` session state | Agent clarification mid-run. Currently handled by broad search in prompts. Proper implementation deferred. |

---

*End of implementation plan.*
