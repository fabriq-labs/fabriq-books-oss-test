# Fabriq Agentic Upgrade — Work In Progress Plan

**Status**: Ready for coding agent  
**Version**: 0.7  
**Context**: Built from design conversation. Covers session-aware, multi-step planning, human-in-the-loop agent upgrade on top of existing Fabriq platform.  
**Starting wedge**: Reconciliation (per INTERNAL_DECISION_RECORD — score 5/5, strongest platform fit, strongest partner GTM fit)

---

## Instructions for the Coding Agent

Read this entire document before writing a single line of code.

Build in phase order. Do not start Phase N+1 until Phase N passes its verification checklist. Verification for Phases 1-3 is done by running test files directly against the database — no running server needed, no curl commands. Follow the existing test harness pattern in `src/agent/__tests__/posting-prompt.test.ts`.

Phases 4-5 require a running browser for manual walkthrough — perform these yourself in the dev environment.

When a verification step fails, fix it before proceeding.

Reference files listed in Section 14 before touching any existing file.

---

## 1. What We Are Building and Why

The current Fabriq agent is a reactive, single-turn query processor. Each request is stateless — `AgentService` gets messages, calls the LLM, executes tools, returns a response. There is no memory of what the agent was doing between turns, no multi-turn goal execution, and no way for the agent to queue actions for human review.

The upgrade transforms the agent into a **session-aware, multi-step planning agent with human-in-the-loop approval**, modelled on OpenClaw-style agentic frameworks but designed for a multi-tenant enterprise FinOps platform.

The three pillars are:

1. **Session state** — the agent remembers its goal, its plan, and what it has done across multiple HTTP requests
2. **Multi-step planning** — the agent decomposes a goal into typed steps and executes them sequentially
3. **Human-in-the-loop** — actions with financial consequences are queued for human review before execution, with a structured approve/reject/edit flow

### V1 scope — reconciliation only

V1 delivers one complete end-to-end agentic flow: **bank/ledger reconciliation**. This is the right starting point because:

- `suggestReconciliationMatches` tool already exists in the codebase
- `confirmReconciliation` service already exists in `routes.ts`
- Universal need — every company reconciles
- Entire V1 flow uses existing tools; new code is purely the orchestration layer

All other action types (`invoice_match`, `send_email`, `escalate_collection`) are defined in the schema for future use but not built end-to-end in V1.

### The V1 agentic session flow — reconciliation run

```
User: "Reconcile all unmatched transactions for the HDFC current account"
         ↓
Agent calls createPlan:
  Step 1 (query):    Find unmatched postings for HDFC account
  Step 2 (analysis): Run suggestReconciliationMatches for each posting
  Step 3 (action):   Queue matches for human review
  Step 4 (report):   Summarise results
         ↓
Step 1: agent calls searchRecords / analyticsQuery
        → finds 23 unmatched postings
        → calls completeStep (step advances automatically)
         ↓
Step 2: agent calls suggestReconciliationMatches (already exists)
        → calls completeStep
         ↓
Step 3: agent calls queueActionBatch
        → 23 pending_action rows created, shared batch_id
        → BatchSummaryCard appears in workbench
        → session transitions to 'awaiting_approval'
         ↓
User reviews in workbench, approves/rejects rows
        → ReconcilePostingExecutor calls confirmReconciliation for each approved row
         ↓
Step 4: agent posts summary → session 'completed'
```

---

## 2. Two Surfaces, Clear Separation

| Surface | Purpose | Where |
|---------|---------|-------|
| **Sidebar chat** | Conversational queries — "what's my DSO?", "show overdue invoices", quick lookups | Existing chat panel, unchanged |
| **Workbench** | Agentic sessions — multi-step goal execution, pending action review, session management | New dedicated page |

The sidebar chat stays exactly as it is. The workbench is the new surface for everything agentic. The entry point to a new agent session is always through the workbench.

---

## 3. Design Decisions — All Resolved

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **UI surface** | Workbench-first, no enhanced chat phase | Agent sessions have 2D structure (plan × actions). Sidebar chat is 1D. |
| **Session creation** | Explicit — user states goal consciously | Appropriate friction for financial actions. |
| **Session mode default** | `supervised` | Users earn autonomy over time. |
| **Session storage** | Postgres primary | Multi-tenant, audit trail, existing permission model. Redis cache optional later. |
| **Batch actions** | Separate `pending_action` rows sharing `batch_id` | Individually resolvable. Partial batch approval works. |
| **Detail component** | One component per `action_type`, work zone overlay | No duplication between views. |
| **System prompt injection** | Compact header every turn; full plan on first turn and after `createPlan` | ~50 tokens normally. Full plan only when agent needs full structure. |
| **`queueAction`** | Explicit tool call by agent | Agent knows it is deferring to human. Auto-intercept harder to debug. |
| **Session expiry** | 7d awaiting_approval, 30d completed archive, 24h planning inactive | Prevents stale queue buildup. |
| **Email provider** | Placeholder only — `SendEmailExecutor` logs intent, does not send | Does not block V1. |
| **Conversation panel endpoint** | Reuses existing `/api/agent/chat` with `sessionId` in request body | Minimal backend change. One chat endpoint. |
| **V1 action type** | `reconcile_posting` only, end-to-end | Everything needed already exists in codebase. |
| **Session directive location** | Hardcoded constant in `src/agent/prompt/constants.ts` alongside `TOOL_RESPONSE_HANDLING_GUIDELINE`. Appended by `buildSessionContextBlock()`. Not a database template in V1. | No `view` record needed. Can be moved to database templates later for tunability. |
| **Auto-continuation mechanism** | `setImmediate()` fire-and-forget. Same pattern as `src/agent/slack/handle-app-mention.ts`. | No background job infrastructure needed in V1. |
| **maxSteps** | Session turns: 10 (`SESSION_MAX_STEPS` env). Non-session: 5 (`AGENT_MAX_STEPS` env, unchanged). | Analysis steps need more tool call budget. |
| **Verification approach** | Direct service/AgentService calls in test files (Phases 1-3). Manual browser walkthrough (Phases 4-5). | Faster, no running server needed, follows existing test harness pattern. |

---

## 4. Database Schema

### 4.1 `agent_session`

```prisma
model agent_session {
  id              String   @id @default(dbgenerated("'ses_' || gen_random_uuid()"))
  org_id          String
  user_id         String

  goal            String
  goal_model      String?

  // Array of PlanStep — see TypeScript type in Section 4.4
  plan            Json?

  status          String   @default("planning")
  // 'planning' | 'awaiting_approval' | 'executing'
  // | 'paused' | 'completed' | 'failed' | 'abandoned'

  current_step_index Int?

  // Summaries only — e.g. { unmatched_postings: 23, high_confidence_matches: 14 }
  accumulated_context Json?

  pending_actions_count   Int @default(0)
  completed_actions_count Int @default(0)

  mode            String   @default("supervised")
  // 'supervised' | 'semi_auto' | 'autonomous'

  started_at      DateTime @default(now())
  last_active_at  DateTime @updatedAt
  completed_at    DateTime?
  expires_at      DateTime?

  messages        agent_message[]
  pending_actions pending_action[]

  @@map("agent_session")
}
```

### 4.2 `agent_message`

```prisma
model agent_message {
  id           String   @id @default(dbgenerated("'msg_' || gen_random_uuid()"))
  session_id   String
  role         String   // 'user' | 'assistant' | 'tool'
  content      String
  tool_calls   Json?
  tool_results Json?
  step_index   Int?
  created_at   DateTime @default(now())

  session      agent_session @relation(fields: [session_id], references: [id])

  @@map("agent_message")
}
```

### 4.3 `pending_action`

```prisma
model pending_action {
  id              String   @id @default(dbgenerated("'pa_' || gen_random_uuid()"))
  org_id          String
  session_id      String?
  created_by      String   // 'agent' or user_id
  assigned_to     String?
  assigned_role   String?

  action_type     String
  // V1: 'reconcile_posting'
  // Future: 'invoice_match' | 'send_email' | 'escalate_collection'

  batch_id        String?
  batch_total     Int?

  title           String
  description     String?

  payload         Json

  confidence      String   // 'high' | 'medium' | 'low'
  confidence_score Float?

  status          String   @default("pending")
  // 'pending' | 'approved' | 'approved_with_edits'
  // 'rejected' | 'deferred' | 'executed' | 'expired'

  resolved_by     String?
  resolved_at     DateTime?
  resolution_note String?

  on_approve      String
  // 'execute_immediately' | 'queue_for_batch' | 'notify_only'

  executed_at      DateTime?
  execution_result Json?
  execution_error  String?

  defer_until     DateTime?
  expires_at      DateTime?

  created_at      DateTime @default(now())
  modified_at     DateTime @updatedAt

  session         agent_session? @relation(fields: [session_id], references: [id])

  @@map("pending_action")
}
```

### 4.4 TypeScript types

```typescript
type PlanStep = {
  index: number
  type: 'query' | 'analysis' | 'action' | 'report'
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed'
  requires_approval: boolean
  result_summary?: string
  completed_at?: string
}

type AgentSessionSummary = {
  id: string
  goal: string
  status: string
  pending_actions_count: number
  started_at: string
  completed_at?: string
}
```

---

## 5. Pending Action Payload Types

Every payload carries a `preview` object — static snapshot for list rendering without API calls. Detail component fetches fresh data using IDs when opened, falls back to `preview` if fetch fails.

### 5.1 `reconcile_posting` (V1 — built end-to-end)

```typescript
{
  posting_id: string
  match_type: 'payment_receipt' | 'invoice'
  match_id: string
  match_reference: string
  confidence_detail: string
  other_candidates?: Array<{
    id: string
    reference: string
    confidence: string
    amount: number
  }>
  preview: {
    posting: { description: string, amount: number, date: string, account: string }
    match:   { reference: string, amount: number, customer: string, date: string }
  }
}
```

### 5.2 Future action types (schema defined, no executor or detail component in V1)

```typescript
// invoice_match
{
  payment_receipt_id: string, invoice_id: string, amount_to_apply: number,
  match_basis: string[], confidence_detail: string,
  preview: {
    payment: { reference: string, amount: number, customer: string, date: string }
    invoice: { number: string, total: number, balance: number, due_date: string }
  }
}

// send_email (blocked on email provider decision)
{
  template_type: string, recipient_email: string, recipient_name: string,
  invoice_ids: string[], draft: { subject: string, body: string },
  after_send: { update_workflow_state?: { instance_id: string, target_state: string } },
  preview: { customer: string, invoice_number: string, amount: number,
             days_overdue: number, subject_preview: string }
}

// escalate_collection
{
  invoice_id: string, current_state: string, target_state: string,
  escalate_to_user_id?: string, reason: string,
  preview: {
    invoice: { number: string, balance: number, days_overdue: number, customer: string }
    history: string[]
  }
}
```

---

## 6. Human Gestures on a Pending Action

Universal across all `action_type`s:

| Gesture | API | What happens |
|---------|-----|--------------|
| **Approve** | `PATCH /pending-actions/:id` `{ status: 'approved' }` | Executor runs with original payload |
| **Approve with edits** | `PATCH /pending-actions/:id` `{ status: 'approved_with_edits', edited_payload: {...} }` | Executor runs with merged payload; both versions stored |
| **Reject** | `PATCH /pending-actions/:id` `{ status: 'rejected', resolution_note: string }` | No execution; reason stored |
| **Defer** | `PATCH /pending-actions/:id` `{ status: 'deferred', defer_until: DateTime }` | Re-surfaces at `defer_until` |

---

## 7. Pending Action Views

Three views. All render inside the workbench center pane.

### 7.1 Batch summary card

```
┌────────────────────────────────────────────────────┐
│ 📋 23 reconciliation matches suggested             │
│ 14 high confidence · 6 medium · 3 low              │
│                                                    │
│ [Review all 23]    [Auto-approve high (14)]        │
└────────────────────────────────────────────────────┘
```

After auto-approve:

```
┌────────────────────────────────────────────────────┐
│ ✓ 14 matches confirmed automatically               │
│ 9 still need review  (6 medium · 3 low)            │
│                                                    │
│ [Review remaining 9]                               │
└────────────────────────────────────────────────────┘
```

When a step produces exactly one action, a single row renders directly — no batch card.

### 7.2 Batch list view (`GenericBatchList`)

```
┌────────────────────────────────────────────────────┐
│ ← Back    Reconciliation matches — 23 to review   │
│ [Approve all]    [Approve high confidence (14)]    │
├────────────────────────────────────────────────────┤
│ ○ NEFT CR ACME ↔ REC-DEMO-001  $4,500  ●●● HIGH  │
│   Acme Corp · 10 Mar 2026                          │
│   [Approve]  [Reject]  [Detail →]                 │
├────────────────────────────────────────────────────┤
│ ○ NEFT CR GLOBEX ↔ REC-DEMO-002  $12,000  ●● MED │
│   Globex Corp · 8 Mar 2026                         │
│   [Approve]  [Reject]  [Detail →]                 │
└────────────────────────────────────────────────────┘
```

### 7.3 Single action detail (`ReconciliationDetail` in V1)

Full detail view. Fetches fresh data using IDs from payload. Shows both sides of match, confidence basis, other candidates. Approve/reject/edit controls. Renders as full-width overlay in work zone. URL updates for deep-linking.

### 7.4 Component registry

```typescript
const ACTION_DETAIL_COMPONENTS: Record<string, React.ComponentType<any>> = {
  reconcile_posting:    ReconciliationDetail,  // V1 — built
  invoice_match:        PlaceholderDetail,
  send_email:           PlaceholderDetail,
  escalate_collection:  PlaceholderDetail,
}

// GenericBatchList covers all types in V1
const ACTION_BATCH_COMPONENTS: Record<string, React.ComponentType<any>> = {
  reconcile_posting:    GenericBatchList,
  invoice_match:        GenericBatchList,
  send_email:           GenericBatchList,
  escalate_collection:  GenericBatchList,
}
```

---

## 8. System Prompt Injection — Session Context

### 8.1 Compact header (every turn, ~50 tokens)

```
## Active Session Context
Goal: Reconcile all unmatched transactions for the HDFC current account
Mode: supervised
Status: executing — Step 2 of 4: Suggest reconciliation matches
Pending actions: 0 awaiting your review
Accumulated: { "unmatched_postings": 23 }
```

### 8.2 Full plan (first turn and after `createPlan` only, ~300-500 tokens)

```json
[
  { "index": 0, "type": "query",    "title": "Find unmatched postings",          "status": "completed", "result_summary": "Found 23 unmatched postings" },
  { "index": 1, "type": "analysis", "title": "Suggest reconciliation matches",   "status": "in_progress" },
  { "index": 2, "type": "action",   "title": "Queue matches for human review",   "status": "pending", "requires_approval": true },
  { "index": 3, "type": "report",   "title": "Summarise reconciliation results", "status": "pending" }
]
```

### 8.3 Implementation

```typescript
function buildSessionContextBlock(
  session: agent_session,
  isFirstTurn: boolean,
  justCreatedPlan: boolean
): string {
  const currentStep = session.plan?.[session.current_step_index ?? 0]

  const header = `
## Active Session Context
Goal: ${session.goal}
Mode: ${session.mode}
Status: ${session.status}${currentStep
    ? ` — Step ${(session.current_step_index ?? 0) + 1} of ${session.plan?.length}: ${currentStep.title}`
    : ''}
Pending actions: ${session.pending_actions_count} awaiting your review
Accumulated: ${JSON.stringify(session.accumulated_context ?? {})}
`
  if (isFirstTurn || justCreatedPlan) {
    return header + `\n## Full Plan\n${JSON.stringify(session.plan ?? [], null, 2)}\n`
  }

  return header
}

// isFirstTurn: session.messages.length === 0 before current message appended
// justCreatedPlan: previous LLM response contained a createPlan tool call result
```

---

## 9. Agent Loop

### 9.1 Overview

The agent loop is the sequence of LLM turns that executes a session from goal to completion. Two mechanisms work together: the **session directive** (tells the agent what to do next based on state) and the **session tools** (tell the agent how to do it).

The session directive is a hardcoded constant in `src/agent/prompt/constants.ts` alongside `TOOL_RESPONSE_HANDLING_GUIDELINE`. It is appended to the system prompt by `buildSessionContextBlock()`. It is **not** a database prompt template in V1 — no `view` record is needed. It can be migrated to the database template system later for tunability without any schema changes.

### 9.2 Session states and what the agent does in each

```
State 1: status = 'planning', no plan yet
  → Agent MUST call createPlan immediately
  → Do not ask the user questions
  → Do not use any other tools first

State 2: status = 'executing', current step type = 'query' or 'analysis'
  → Agent uses existing tools (searchRecords, analyticsQuery,
    suggestReconciliationMatches, etc.) to complete the step
  → Calls completeStep when done
  → Session auto-advances to next step

State 3: status = 'executing', current step type = 'action'
  → Agent calls queueActionBatch (or queueAction for single items)
  → In supervised mode: ALWAYS queue, never execute directly
  → Calls completeStep after queuing
  → Session transitions to 'awaiting_approval'

State 4: status = 'executing', current step type = 'report'
  → Agent reads accumulated_context and step summaries
  → Posts concise plain-text summary
  → Calls completeStep → session transitions to 'completed'
```

### 9.3 Session directive constant

Add to `src/agent/prompt/constants.ts`:

```typescript
export const SESSION_DIRECTIVE = `

#### SESSION AGENT DIRECTIVE

You are operating inside an active agent session. Follow this decision tree exactly on every turn:

IF status is 'planning' AND no plan exists:
  → Call createPlan IMMEDIATELY. Decompose the goal into 3-5 steps.
    Do NOT ask the user anything. Do NOT call any other tool first.
    Step types: 'query' (gather data), 'analysis' (process data),
    'action' (queue items for human review), 'report' (summarise).
    Always end with a 'report' step.

IF status is 'executing' AND current step type is 'query' or 'analysis':
  → Use the appropriate existing tools to complete this step.
    When the step is fully done, call completeStep with a clear result_summary.
    Include key numbers. E.g. "Found 23 unmatched postings for HDFC account".
    Pass accumulated_context_update with any counts or facts needed by later steps.

IF status is 'executing' AND current step type is 'action':
  → Call queueActionBatch to create pending actions for human review.
    In supervised mode you MUST use queueActionBatch or queueAction.
    NEVER execute financial actions directly in supervised mode.
    After queuing all actions, call completeStep.

IF status is 'executing' AND current step type is 'report':
  → Read the accumulated_context and each step's result_summary.
    Write a concise plain-text summary for the user covering what was done
    and what the outcomes were. Then call completeStep.

RULES:
- NEVER skip steps
- NEVER combine steps
- ONE step at a time
- NEVER call queueAction or queueActionBatch outside of an 'action' step
- NEVER include IDs in user-facing responses — use names and references
`;
```

### 9.4 Session tools

Four new tools. Added to `ToolManager.getUnifiedTools()` only when `sessionId` is present. Non-session requests never see these tools.

#### `createPlan`

```typescript
{
  name: 'createPlan',
  description: `Decompose the session goal into a sequence of steps and save the plan.
    Call this FIRST when status is 'planning'. Do not call any other tool before this.
    Use 3-5 steps. Always end with a 'report' step.`,
  parameters: z.object({
    goal: z.string().describe('The goal as understood — restate it clearly'),
    steps: z.array(z.object({
      type: z.enum(['query', 'analysis', 'action', 'report']),
      title: z.string().describe('Short title, max 8 words'),
      description: z.string().describe('What this step does and why'),
      requires_approval: z.boolean()
        .describe('True for action steps — these create pending actions for human review')
    }))
  })
}
// Executor:
//   persist plan to agent_session.plan
//   set status = 'executing', current_step_index = 0
//   return plan to agent
```

#### `completeStep`

```typescript
{
  name: 'completeStep',
  description: `Signal that the current plan step is complete and advance to the next step.
    Call this after finishing any step — query, analysis, action, or report.
    Provide a clear result_summary so future steps and the final report can reference it.`,
  parameters: z.object({
    step_index: z.number().describe('Index of the step being completed (0-based)'),
    result_summary: z.string()
      .describe('What was found or done. Include key numbers.'),
    accumulated_context_update: z.record(z.any()).optional()
      .describe('Key facts to carry forward. E.g. { "unmatched_postings": 23 }')
  })
}
// Executor:
//   plan[step_index].status = 'completed'
//   plan[step_index].result_summary = result_summary
//   plan[step_index].completed_at = now()
//   session.accumulated_context = merge(existing, accumulated_context_update)
//   session.current_step_index = step_index + 1
//   if all steps complete → session.status = 'completed', session.completed_at = now()
//   emit SSE: session.step_completed
```

#### `queueAction`

```typescript
{
  name: 'queueAction',
  description: `Create a single pending action for human review.
    Use this when a step produces exactly one action.
    For multiple actions, use queueActionBatch instead.`,
  parameters: z.object({
    action_type: z.string(),
    title: z.string(),
    description: z.string().optional(),
    payload: z.record(z.any()),
    confidence: z.enum(['high', 'medium', 'low']),
    confidence_score: z.number().min(0).max(1).optional(),
    batch_id: z.string().optional(),
    on_approve: z.enum(['execute_immediately', 'queue_for_batch', 'notify_only'])
  })
}
```

#### `queueActionBatch`

```typescript
{
  name: 'queueActionBatch',
  description: `Create multiple pending actions of the same type in a single call.
    All actions share a batch_id and appear as one batch card in the workbench.
    Prefer this over calling queueAction in a loop.`,
  parameters: z.object({
    action_type: z.string(),
    batch_id: z.string()
      .describe('Unique ID for this batch. Use format: {sessionId}-step-{stepIndex}'),
    actions: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
      payload: z.record(z.any()),
      confidence: z.enum(['high', 'medium', 'low']),
      confidence_score: z.number().min(0).max(1).optional()
    })),
    on_approve: z.enum(['execute_immediately', 'queue_for_batch', 'notify_only'])
  })
}
// Executor:
//   create N pending_action rows sharing batch_id, batch_total = N
//   apply mode logic per action
//   increment session.pending_actions_count by queued count
//   emit SSE: session.pending_count_changed
```

### 9.5 Mode logic

```typescript
async function applyModeLogic(
  actionParams: QueueActionParams,
  session: agent_session,
  auth: AuthContext
): Promise<'queued' | 'executed'> {
  if (session.mode === 'autonomous') {
    await PendingActionExecutor.execute(actionParams, auth)
    return 'executed'
  }
  if (session.mode === 'semi_auto' && actionParams.confidence === 'high') {
    await PendingActionExecutor.execute(actionParams, auth)
    return 'executed'
  }
  await createPendingActionRow(actionParams, session, auth)
  return 'queued'
}
```

### 9.6 Auto-continuation

The agent auto-continues through all step types — `query`, `analysis`, `action`, and `report` — without user input. The pause happens naturally when an `action` step completes: `completeStep` sees pending actions require approval and transitions the session to `awaiting_approval`. At that point `shouldAutoContinue` returns `false` because `session.status !== 'executing'`. The status transition is the pause mechanism, not the step type.

Auto-continuation uses `setImmediate()` — same fire-and-forget pattern as `src/agent/slack/handle-app-mention.ts`. No background job infrastructure needed in V1.

```typescript
function shouldAutoContinue(session: agent_session): boolean {
  if (session.status !== 'executing') return false
  const currentStep = session.plan?.[session.current_step_index ?? 0]
  if (!currentStep) return false
  if (currentStep.requires_approval) return false  // explicit approval gate
  return true
}

// In AgentService, after saving session state:
if (shouldAutoContinue(updatedSession)) {
  const nextStep = updatedSession.plan[updatedSession.current_step_index]
  const continuationMessage =
    `Continue with step ${nextStep.index + 1}: "${nextStep.title}". ${nextStep.description}`
  setImmediate(() => {
    agentService.handleRequest(
      continuationMessage, auth, [], context, sessionId
    ).catch(err => logger.error('Auto-continuation failed', err))
  })
}
```

When all pending actions are resolved, trigger report step:

```typescript
// In pending action resolve handler, after executor runs:
const allResolved = await checkAllPendingActionsResolved(session.id)
if (allResolved && session.status === 'awaiting_approval') {
  await updateSessionStatus(session.id, 'executing')
  const reportStep = session.plan?.find(s => s.type === 'report')
  if (reportStep) {
    setImmediate(() => {
      agentService.handleRequest(
        `All pending actions resolved. Continue with step ${reportStep.index + 1}: "${reportStep.title}".`,
        auth, [], context, session.id
      ).catch(err => logger.error('Report continuation failed', err))
    })
  }
}
```

### 9.7 Complete turn sequence — reconciliation example

```
TURN 1
  Input:  "Reconcile all unmatched transactions for the HDFC current account"
  State:  status='planning', no plan
  Prompt: compact header + SESSION_DIRECTIVE → "call createPlan immediately"
  Agent:  calls createPlan({ goal: "...", steps: [4 steps] })
  Result: plan persisted, status='executing', step 0 active
  Auto-continue: YES (step 0 is type 'query')

TURN 2  [auto-continuation]
  Input:  "Continue with step 1: Find unmatched postings..."
  State:  status='executing', step 0 (query)
  Agent:  calls analyticsQuery → finds 23 unmatched postings
          calls completeStep({ step_index: 0,
            result_summary: "Found 23 unmatched postings",
            accumulated_context_update: { unmatched_postings: 23 } })
  Result: step 0 complete, step 1 active
  Auto-continue: YES (step 1 is type 'analysis')

TURN 3  [auto-continuation]
  Input:  "Continue with step 2: Suggest reconciliation matches..."
  State:  status='executing', step 1 (analysis)
  Agent:  calls suggestReconciliationMatches
          calls completeStep({ step_index: 1,
            result_summary: "Generated 23 suggestions: 14 high, 6 med, 3 low",
            accumulated_context_update: { high: 14, medium: 6, low: 3 } })
  Result: step 1 complete, step 2 active
  Auto-continue: YES (step 2 is type 'action', but status is still 'executing')

TURN 4  [auto-continuation]
  Input:  "Continue with step 3: Queue matches for human review..."
  State:  status='executing', step 2 (action)
  Agent:  calls queueActionBatch({
            action_type: 'reconcile_posting',
            batch_id: 'ses_abc-step-2',
            actions: [23 reconcile_posting payloads],
            on_approve: 'execute_immediately'
          })
          calls completeStep({ step_index: 2, result_summary: "Queued 23 matches" })
  Result: 23 pending_action rows, session → 'awaiting_approval'
  Auto-continue: NO (status is 'awaiting_approval')

[User approves 18, rejects 5 in workbench]
[All pending actions resolved → report continuation triggered]

TURN 5  [triggered when all pending actions resolved]
  State:  status='executing', step 3 (report)
  Agent:  reads accumulated_context, posts summary
          calls completeStep({ step_index: 3 })
  Result: session → 'completed'
```

### 9.8 maxSteps per turn type

```typescript
const maxSteps = sessionId
  ? parseInt(process.env.SESSION_MAX_STEPS  || '10')
  : parseInt(process.env.AGENT_MAX_STEPS    || '5')
```

---

## 10. Backend Architecture Changes

### 10.1 AgentService modifications

```typescript
async handleRequest(
  message: string | any,
  auth: AuthContext,
  previousMessages: any[],
  context?: any,
  sessionId?: string        // NEW — optional, fully backward compatible
): Promise<any>
```

When `sessionId` is provided:

1. Load `agent_session` + last N `agent_message` rows
2. Determine `isFirstTurn` and `justCreatedPlan`
3. Call `buildSessionContextBlock()` → prepend to system prompt
4. Append `SESSION_DIRECTIVE` constant
5. Add session tools to tool set
6. Call LLM with `maxSteps = SESSION_MAX_STEPS`
7. Parse response for session tool call side effects
8. Persist messages to `agent_message`
9. Update `agent_session` state
10. Emit SSE events
11. Evaluate `shouldAutoContinue()` — fire `setImmediate` if true

When no `sessionId`: zero changes to existing flow.

### 10.2 PendingActionExecutor service

```typescript
interface PendingActionHandler {
  actionType: string
  execute(action: pending_action, auth: AuthContext): Promise<ExecutionResult>
}

const EXECUTORS: Record<string, PendingActionHandler> = {
  reconcile_posting:    ReconcilePostingExecutor,
  invoice_match:        PlaceholderExecutor,
  send_email:           PlaceholderExecutor,
  escalate_collection:  PlaceholderExecutor,
}

class ReconcilePostingExecutor implements PendingActionHandler {
  actionType = 'reconcile_posting'
  async execute(action: pending_action, auth: AuthContext): Promise<ExecutionResult> {
    const result = await confirmReconciliation(action.payload.posting_id, auth)
    return { success: result.success, data: result.data, error: result.error }
  }
}
```

### 10.3 New API endpoints

```
POST   /api/agent-sessions
GET    /api/agent-sessions
GET    /api/agent-sessions/:id
PATCH  /api/agent-sessions/:id
GET    /api/agent-sessions/:id/messages

GET    /api/pending-actions
GET    /api/pending-actions/:id
GET    /api/pending-actions/batch/:batchId
PATCH  /api/pending-actions/:id
POST   /api/pending-actions/batch/:batchId/approve
```

### 10.4 SSE session state events

```typescript
type SessionSSEEvent =
  | { type: 'session.pending_count_changed', sessionId: string, count: number }
  | { type: 'session.step_completed',        sessionId: string, stepIndex: number, summary: string }
  | { type: 'session.status_changed',        sessionId: string, status: string }
  | { type: 'pending_action.resolved',       sessionId: string, actionId: string, status: string }
```

---

## 11. Frontend Architecture

### 11.1 Context separation

**`AgentSessionContext`** — owns the work

```typescript
type AgentSessionContextValue = {
  activeSession: {
    id: string
    goal: string
    status: string
    plan: PlanStep[]
    currentStepIndex: number | null
    pendingActionsCount: number
    completedActionsCount: number
    mode: 'supervised' | 'semi_auto' | 'autonomous'
    accumulatedContext: Record<string, any>
  } | null
  sessions: AgentSessionSummary[]
  pendingActions: PendingAction[]

  createSession: (goal: string, mode: string) => Promise<string>
  loadSession: (sessionId: string) => void
  approvePendingAction: (id: string) => void
  approveWithEdits: (id: string, editedPayload: any) => void
  rejectPendingAction: (id: string, reason: string) => void
  deferPendingAction: (id: string, until: Date) => void
  bulkApprove: (batchId: string, confidenceFilter?: 'high' | 'medium' | 'low') => void
}
```

**`ChatContext`** (minimal modification)

```typescript
type ChatContextValue = {
  messages: Message[]
  isStreaming: boolean
  currentSessionId: string | null  // reference only, not ownership
  sendMessage: (content: string) => void
}
```

### 11.2 Workbench component tree

```
WorkbenchPage  (/workbench)
└── AgentSessionContext.Provider
    ├── SessionsSidebar
    │   ├── SessionListItem (× N, pending count badge)
    │   └── NewSessionButton
    │
    └── WorkbenchCenterPane
        ├── SessionHeader (goal · status · step text · mode badge)
        │
        ├── WorkZone
        │   ├── GoalSetter              (no active session)
        │   ├── PendingActionsList      (default — active session)
        │   │   ├── BatchSummaryCard
        │   │   └── PendingActionRow
        │   ├── GenericBatchList        (/batch/:batchId)
        │   └── PendingActionDetail     (/actions/:id overlay)
        │       └── ReconciliationDetail
        │
        └── ConversationPanel (collapsible)
            └── ChatContext.Provider (sessionId = activeSession?.id)
                ├── MessageList
                └── MessageInput
```

### 11.3 Routing

All routes render `WorkbenchPage`. Only work zone content changes.

```
/workbench                                         → GoalSetter
/workbench/sessions/:sessionId                     → PendingActionsList
/workbench/sessions/:sessionId/batch/:batchId      → GenericBatchList
/workbench/sessions/:sessionId/actions/:id         → PendingActionDetail overlay
```

---

## 12. Build Order and Verification

---

### Phase 1 — Database and API

**Build:**
- [ ] Prisma models: `agent_session`, `agent_message`, `pending_action` + migration
- [ ] Run `npx prisma db push && npx prisma generate`
- [ ] All session and pending action endpoints (Section 10.3)

**Test file:** `src/agent/__tests__/session-api.test.ts`

Follow the setup pattern in `src/agent/__tests__/posting-prompt.test.ts` — `dotenv.config()`, real Prisma client, real test org/user from DB. Call service functions directly, not HTTP.

```typescript
import * as dotenv from 'dotenv'
import * as path from 'path'
import prisma from '../../lib/prisma'

dotenv.config({ path: path.join(__dirname, '../../../.env.test') })
dotenv.config()

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_rajesh_kumar',
  orgId:  process.env.TEST_ORG_ID  || 'org_rajesh',
}

describe('Session API — Phase 1', () => {

  let sessionId: string
  let pendingActionId: string

  // --- agent_session ---

  test('creates a session with correct defaults', async () => {
    const session = await createAgentSession({
      org_id:  TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal:    'Reconcile HDFC current account transactions',
      mode:    'supervised',
    })
    sessionId = session.id
    expect(session.id).toMatch(/^ses_/)
    expect(session.status).toBe('planning')
    expect(session.pending_actions_count).toBe(0)
    expect(session.plan).toBeNull()
  })

  test('retrieves a session by id', async () => {
    const session = await getAgentSession(sessionId)
    expect(session.id).toBe(sessionId)
    expect(session.goal).toBe('Reconcile HDFC current account transactions')
  })

  test('lists sessions for user', async () => {
    const sessions = await listAgentSessions(TEST_CONFIG.userId, TEST_CONFIG.orgId)
    expect(sessions.length).toBeGreaterThanOrEqual(1)
    expect(sessions.some(s => s.id === sessionId)).toBe(true)
  })

  test('updates session status', async () => {
    const updated = await updateAgentSession(sessionId, { status: 'executing' })
    expect(updated.status).toBe('executing')
  })

  // --- pending_action ---

  test('creates a pending action', async () => {
    const action = await createPendingAction({
      org_id:      TEST_CONFIG.orgId,
      session_id:  sessionId,
      action_type: 'reconcile_posting',
      title:       'Match NEFT CR ACME to REC-DEMO-001',
      payload: {
        posting_id:       'post_test_001',
        match_type:       'payment_receipt',
        match_id:         'rec_test_001',
        match_reference:  'REC-DEMO-001',
        confidence_detail: 'Exact amount and customer match',
        preview: {
          posting: { description: 'NEFT CR ACME', amount: 4500, date: '2026-03-10', account: 'HDFC' },
          match:   { reference: 'REC-DEMO-001', amount: 4500, customer: 'Acme Corp', date: '2026-03-10' },
        },
      },
      confidence:  'high',
      on_approve:  'execute_immediately',
      created_by:  'agent',
    })
    pendingActionId = action.id
    expect(action.id).toMatch(/^pa_/)
    expect(action.status).toBe('pending')
  })

  test('retrieves pending action by id', async () => {
    const action = await getPendingAction(pendingActionId)
    expect(action.id).toBe(pendingActionId)
    expect(action.action_type).toBe('reconcile_posting')
  })

  test('lists pending actions for session', async () => {
    const actions = await listPendingActions({ session_id: sessionId })
    expect(actions.length).toBe(1)
    expect(actions[0].id).toBe(pendingActionId)
  })

  test('approves a pending action', async () => {
    const resolved = await resolvePendingAction(pendingActionId, {
      status:      'approved',
      resolved_by: TEST_CONFIG.userId,
    })
    expect(resolved.status).toBe('approved')
    expect(resolved.resolved_at).not.toBeNull()
  })

  test('rejects a pending action with reason', async () => {
    // Create a second action to reject
    const action2 = await createPendingAction({
      org_id:      TEST_CONFIG.orgId,
      session_id:  sessionId,
      action_type: 'reconcile_posting',
      title:       'Match NEFT CR GLOBEX to REC-DEMO-002',
      payload: {
        posting_id: 'post_test_002', match_type: 'payment_receipt',
        match_id: 'rec_test_002', match_reference: 'REC-DEMO-002',
        confidence_detail: 'Amount match only',
        preview: {
          posting: { description: 'NEFT CR GLOBEX', amount: 12000, date: '2026-03-08', account: 'HDFC' },
          match:   { reference: 'REC-DEMO-002', amount: 12000, customer: 'Globex Corp', date: '2026-03-08' },
        },
      },
      confidence: 'medium', on_approve: 'execute_immediately', created_by: 'agent',
    })
    const rejected = await resolvePendingAction(action2.id, {
      status:          'rejected',
      resolved_by:     TEST_CONFIG.userId,
      resolution_note: 'Wrong customer',
    })
    expect(rejected.status).toBe('rejected')
    expect(rejected.resolution_note).toBe('Wrong customer')
  })

  test('creates a batch of pending actions with shared batch_id', async () => {
    const batchId = `${sessionId}-step-2`
    const actions = await createPendingActionBatch(
      [
        { title: 'Match 1', payload: { posting_id: 'p1', match_id: 'm1', match_type: 'payment_receipt', match_reference: 'REC-001', confidence_detail: 'test', preview: { posting: { description: 'x', amount: 100, date: '2026-01-01', account: 'HDFC' }, match: { reference: 'REC-001', amount: 100, customer: 'A', date: '2026-01-01' } } }, confidence: 'high' as const },
        { title: 'Match 2', payload: { posting_id: 'p2', match_id: 'm2', match_type: 'payment_receipt', match_reference: 'REC-002', confidence_detail: 'test', preview: { posting: { description: 'y', amount: 200, date: '2026-01-01', account: 'HDFC' }, match: { reference: 'REC-002', amount: 200, customer: 'B', date: '2026-01-01' } } }, confidence: 'medium' as const },
      ],
      {
        org_id:      TEST_CONFIG.orgId,
        session_id:  sessionId,
        action_type: 'reconcile_posting',
        batch_id:    batchId,
        on_approve:  'execute_immediately',
        created_by:  'agent',
      }
    )
    expect(actions).toHaveLength(2)
    expect(actions.every(a => a.batch_id === batchId)).toBe(true)
    expect(actions.every(a => a.batch_total === 2)).toBe(true)

    const batchActions = await listPendingActions({ batch_id: batchId })
    expect(batchActions).toHaveLength(2)
  })

  test('bulk approves high confidence actions in a batch', async () => {
    const batchId = `${sessionId}-step-2`
    await bulkApproveByConfidence(batchId, 'high', TEST_CONFIG.userId)
    const actions = await listPendingActions({ batch_id: batchId })
    const approved = actions.filter(a => a.status === 'approved')
    const pending  = actions.filter(a => a.status === 'pending')
    expect(approved).toHaveLength(1)  // only the 'high' one
    expect(pending).toHaveLength(1)   // the 'medium' one remains
  })

  afterAll(async () => {
    // Clean up test data
    await prisma.pending_action.deleteMany({ where: { session_id: sessionId } })
    await prisma.agent_session.delete({ where: { id: sessionId } })
    await prisma.$disconnect()
  })
})
```

**Gate**: All tests pass. Do not proceed to Phase 2 until green.

---

### Phase 2 — Agent service modifications

**Build:**
- [ ] `SESSION_DIRECTIVE` constant in `src/agent/prompt/constants.ts`
- [ ] `buildSessionContextBlock()` helper
- [ ] `AgentService.handleRequest()` — optional `sessionId`
- [ ] Session load/save around LLM call
- [ ] `createPlan`, `completeStep`, `queueAction`, `queueActionBatch` tools
- [ ] Session tools in `ToolManager.getUnifiedTools()` when `sessionId` present
- [ ] Mode logic in queue executors
- [ ] `shouldAutoContinue()` with `setImmediate()` continuation
- [ ] Report continuation trigger in pending action resolve handler
- [ ] SSE session state events
- [ ] `SESSION_MAX_STEPS` env var (default 10)

**Test file:** `src/agent/__tests__/session-agent.test.ts`

Follow the exact pattern of `src/agent/__tests__/posting-prompt.test.ts` — same auth context setup, same `agentService.handleRequest()` call, same `result.steps` inspection. Read that file before writing this one.

```typescript
import { AgentService } from '../AgentService'
import { PermissionService } from '../../services/permissions/PermissionService'
import { AuthContext } from '../../auth/types'
import prisma from '../../lib/prisma'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../../../.env.test') })
dotenv.config()

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_rajesh_kumar',
  orgId:  process.env.TEST_ORG_ID  || 'org_rajesh',
}

async function buildAuth(): Promise<AuthContext> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: TEST_CONFIG.userId } })
  const permissions = await PermissionService.getUserPermissions(TEST_CONFIG.userId)
  return { user: { id: user.id, email: user.email || '', name: user.name, org_id: user.org_id || TEST_CONFIG.orgId }, permissions }
}

describe('Session Agent — Phase 2', () => {

  let agentService: AgentService
  let auth: AuthContext
  let sessionId: string

  beforeAll(async () => {
    agentService = new AgentService()
    auth = await buildAuth()
  })

  // --- Backward compatibility ---

  test('non-session chat still works (backward compatibility)', async () => {
    const result = await agentService.handleRequest(
      'What is 2 + 2?',
      auth,
      [],
      { modelName: 'default' }
      // no sessionId
    )
    expect(result.content).toBeDefined()
    expect(result.content.length).toBeGreaterThan(0)
    // Confirm no session tools were called
    const toolNames = result.steps
      .flatMap((s: any) => s.toolCalls ?? [])
      .map((t: any) => t.toolName)
    expect(toolNames).not.toContain('createPlan')
    expect(toolNames).not.toContain('completeStep')
    expect(toolNames).not.toContain('queueAction')
    expect(toolNames).not.toContain('queueActionBatch')
  })

  // --- Session creation and planning ---

  test('agent calls createPlan on first session turn', async () => {
    // Create session
    const session = await createAgentSession({
      org_id:  TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal:    'Reconcile unmatched transactions for HDFC current account',
      mode:    'supervised',
    })
    sessionId = session.id

    const result = await agentService.handleRequest(
      'Reconcile unmatched transactions for HDFC current account',
      auth,
      [],
      { modelName: 'posting' },
      sessionId
    )

    // Verify createPlan was called
    const toolNames = result.steps
      .flatMap((s: any) => s.toolCalls ?? [])
      .map((t: any) => t.toolName)
    expect(toolNames).toContain('createPlan')

    // Verify plan was persisted
    const updated = await getAgentSession(sessionId)
    expect(updated.plan).not.toBeNull()
    expect(Array.isArray(updated.plan)).toBe(true)
    expect((updated.plan as any[]).length).toBeGreaterThanOrEqual(2)
  })

  test('plan has correct structure — types and required fields', async () => {
    const session = await getAgentSession(sessionId)
    const plan = session.plan as any[]
    plan.forEach((step: any, i: number) => {
      expect(step.index).toBe(i)
      expect(['query', 'analysis', 'action', 'report']).toContain(step.type)
      expect(typeof step.title).toBe('string')
      expect(typeof step.requires_approval).toBe('boolean')
      expect(step.status).toBe(i === 0 ? 'in_progress' : 'pending')
    })
    // Last step should be a report step
    expect(plan[plan.length - 1].type).toBe('report')
  })

  test('session status advanced from planning to executing', async () => {
    const session = await getAgentSession(sessionId)
    expect(session.status).toBe('executing')
    expect(session.current_step_index).toBe(0)
  })

  test('messages were persisted to agent_message table', async () => {
    const messages = await listAgentMessages(sessionId)
    expect(messages.length).toBeGreaterThanOrEqual(1)
    expect(messages.some((m: any) => m.role === 'user')).toBe(true)
    expect(messages.some((m: any) => m.role === 'assistant')).toBe(true)
  })

  // --- completeStep ---

  test('completeStep advances current_step_index', async () => {
    const before = await getAgentSession(sessionId)
    const initialIndex = before.current_step_index ?? 0

    // Simulate completeStep being called by executing it directly
    await executeCompleteStep({
      sessionId,
      step_index: initialIndex,
      result_summary: 'Found 23 unmatched postings',
      accumulated_context_update: { unmatched_postings: 23 },
    })

    const after = await getAgentSession(sessionId)
    expect(after.current_step_index).toBe(initialIndex + 1)
    expect(after.accumulated_context).toMatchObject({ unmatched_postings: 23 })
    const plan = after.plan as any[]
    expect(plan[initialIndex].status).toBe('completed')
    expect(plan[initialIndex].result_summary).toBe('Found 23 unmatched postings')
  })

  // --- queueAction mode logic ---

  test('queueAction creates pending_action row in supervised mode', async () => {
    const before = await getAgentSession(sessionId)
    const beforeCount = before.pending_actions_count

    await executeQueueAction({
      sessionId,
      auth,
      action_type: 'reconcile_posting',
      title:       'Match NEFT CR ACME to REC-DEMO-001',
      payload: {
        posting_id: 'post_test_a', match_type: 'payment_receipt',
        match_id: 'rec_test_a', match_reference: 'REC-001',
        confidence_detail: 'Exact match',
        preview: {
          posting: { description: 'NEFT CR ACME', amount: 4500, date: '2026-03-10', account: 'HDFC' },
          match:   { reference: 'REC-001', amount: 4500, customer: 'Acme Corp', date: '2026-03-10' },
        },
      },
      confidence:   'high',
      on_approve:   'execute_immediately',
    })

    const after = await getAgentSession(sessionId)
    expect(after.pending_actions_count).toBe(beforeCount + 1)

    const actions = await listPendingActions({ session_id: sessionId, status: 'pending' })
    expect(actions.some((a: any) => a.title === 'Match NEFT CR ACME to REC-DEMO-001')).toBe(true)
  })

  test('queueActionBatch creates N rows with shared batch_id', async () => {
    const batchId = `${sessionId}-step-batch-test`
    await executeQueueActionBatch({
      sessionId,
      auth,
      action_type: 'reconcile_posting',
      batch_id:    batchId,
      actions: [
        { title: 'Batch match 1', payload: { posting_id: 'p_b1', match_id: 'm_b1', match_type: 'payment_receipt' as const, match_reference: 'REC-B1', confidence_detail: 'test', preview: { posting: { description: 'x', amount: 100, date: '2026-01-01', account: 'HDFC' }, match: { reference: 'REC-B1', amount: 100, customer: 'X', date: '2026-01-01' } } }, confidence: 'high' as const },
        { title: 'Batch match 2', payload: { posting_id: 'p_b2', match_id: 'm_b2', match_type: 'payment_receipt' as const, match_reference: 'REC-B2', confidence_detail: 'test', preview: { posting: { description: 'y', amount: 200, date: '2026-01-01', account: 'HDFC' }, match: { reference: 'REC-B2', amount: 200, customer: 'Y', date: '2026-01-01' } } }, confidence: 'medium' as const },
        { title: 'Batch match 3', payload: { posting_id: 'p_b3', match_id: 'm_b3', match_type: 'payment_receipt' as const, match_reference: 'REC-B3', confidence_detail: 'test', preview: { posting: { description: 'z', amount: 300, date: '2026-01-01', account: 'HDFC' }, match: { reference: 'REC-B3', amount: 300, customer: 'Z', date: '2026-01-01' } } }, confidence: 'low' as const },
      ],
      on_approve: 'execute_immediately',
    })

    const batchActions = await listPendingActions({ batch_id: batchId })
    expect(batchActions).toHaveLength(3)
    expect(batchActions.every((a: any) => a.batch_id === batchId)).toBe(true)
    expect(batchActions.every((a: any) => a.batch_total === 3)).toBe(true)
  })

  test('semi_auto mode executes high confidence immediately, queues medium/low', async () => {
    const semiSession = await createAgentSession({
      org_id:  TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal:    'Semi-auto test session',
      mode:    'semi_auto',
    })

    const batchId = `${semiSession.id}-semi-test`
    await executeQueueActionBatch({
      sessionId: semiSession.id,
      auth,
      action_type: 'reconcile_posting',
      batch_id:    batchId,
      actions: [
        { title: 'High confidence action', payload: { posting_id: 'p_s1', match_id: 'm_s1', match_type: 'payment_receipt' as const, match_reference: 'REC-S1', confidence_detail: 'test', preview: { posting: { description: 'a', amount: 100, date: '2026-01-01', account: 'HDFC' }, match: { reference: 'REC-S1', amount: 100, customer: 'A', date: '2026-01-01' } } }, confidence: 'high' as const },
        { title: 'Low confidence action',  payload: { posting_id: 'p_s2', match_id: 'm_s2', match_type: 'payment_receipt' as const, match_reference: 'REC-S2', confidence_detail: 'test', preview: { posting: { description: 'b', amount: 200, date: '2026-01-01', account: 'HDFC' }, match: { reference: 'REC-S2', amount: 200, customer: 'B', date: '2026-01-01' } } }, confidence: 'low'  as const },
      ],
      on_approve: 'execute_immediately',
    })

    const actions = await listPendingActions({ batch_id: batchId })
    // High confidence was executed immediately — no pending_action row created
    // Low confidence was queued — pending_action row exists
    expect(actions).toHaveLength(1)
    expect(actions[0].confidence).toBe('low')

    // Cleanup
    await prisma.pending_action.deleteMany({ where: { session_id: semiSession.id } })
    await prisma.agent_session.delete({ where: { id: semiSession.id } })
  })

  // --- shouldAutoContinue ---

  test('shouldAutoContinue returns true for query/analysis/action steps while executing', () => {
    const querySession = { status: 'executing', plan: [{ type: 'query', requires_approval: false }], current_step_index: 0 } as any
    expect(shouldAutoContinue(querySession)).toBe(true)

    const analysisSession = { status: 'executing', plan: [{ type: 'analysis', requires_approval: false }], current_step_index: 0 } as any
    expect(shouldAutoContinue(analysisSession)).toBe(true)

    const actionSession = { status: 'executing', plan: [{ type: 'action', requires_approval: false }], current_step_index: 0 } as any
    expect(shouldAutoContinue(actionSession)).toBe(true)
  })

  test('shouldAutoContinue returns false for steps with requires_approval', () => {
    const approvalSession = { status: 'executing', plan: [{ type: 'action', requires_approval: true }], current_step_index: 0 } as any
    expect(shouldAutoContinue(approvalSession)).toBe(false)
  })

  test('shouldAutoContinue returns false when not executing (awaiting_approval pauses naturally)', () => {
    const waitingSession = { status: 'awaiting_approval', plan: [{ type: 'query', requires_approval: false }], current_step_index: 0 } as any
    expect(shouldAutoContinue(waitingSession)).toBe(false)
  })

  afterAll(async () => {
    await prisma.pending_action.deleteMany({ where: { session_id: sessionId } })
    await prisma.agent_message.deleteMany({ where: { session_id: sessionId } })
    await prisma.agent_session.delete({ where: { id: sessionId } })
    await prisma.$disconnect()
  })
})
```

**Gate**: All tests pass including backward compatibility test. `createPlan` called on first session turn. Plan persisted with correct structure. `completeStep` advances index. Queue logic respects session mode. `shouldAutoContinue` logic correct.

---

### Phase 3 — Executor service

**Build:**
- [ ] `PendingActionExecutor` with registry
- [ ] `ReconcilePostingExecutor` wrapping `confirmReconciliation`
- [ ] `PlaceholderExecutor` for all other types
- [ ] Executor called on approve in `PATCH /pending-actions/:id`
- [ ] Report continuation triggered when all pending actions in session resolved

**Test file:** `src/agent/__tests__/pending-action-executor.test.ts`

```typescript
import { PendingActionExecutor } from '../executors/PendingActionExecutor'
import prisma from '../../lib/prisma'
import { PermissionService } from '../../services/permissions/PermissionService'
import { AuthContext } from '../../auth/types'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../../../.env.test') })
dotenv.config()

const TEST_CONFIG = {
  userId: process.env.TEST_USER_ID || 'user_rajesh_kumar',
  orgId:  process.env.TEST_ORG_ID  || 'org_rajesh',
}

async function buildAuth(): Promise<AuthContext> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: TEST_CONFIG.userId } })
  const permissions = await PermissionService.getUserPermissions(TEST_CONFIG.userId)
  return { user: { id: user.id, email: user.email || '', name: user.name, org_id: user.org_id || TEST_CONFIG.orgId }, permissions }
}

describe('PendingActionExecutor — Phase 3', () => {

  let auth: AuthContext
  let testPostingId: string

  beforeAll(async () => {
    auth = await buildAuth()

    // Find or create an unreconciled posting for testing
    const posting = await prisma.posting.findFirst({
      where: { org_id: TEST_CONFIG.orgId, reconciliation_status: null },
    })
    if (!posting) {
      throw new Error(
        'No unreconciled posting found in test org. ' +
        'Create one via DB seed before running Phase 3 tests.'
      )
    }
    testPostingId = posting.id
  })

  // --- ReconcilePostingExecutor ---

  test('ReconcilePostingExecutor runs confirmReconciliation and marks posting reconciled', async () => {
    const action = await createPendingAction({
      org_id:      TEST_CONFIG.orgId,
      action_type: 'reconcile_posting',
      title:       'Test reconciliation',
      payload: {
        posting_id:        testPostingId,
        match_type:        'payment_receipt',
        match_id:          'rec_test_executor',
        match_reference:   'REC-EXEC-001',
        confidence_detail: 'Executor test',
        preview: {
          posting: { description: 'TEST', amount: 100, date: '2026-01-01', account: 'HDFC' },
          match:   { reference: 'REC-EXEC-001', amount: 100, customer: 'Test', date: '2026-01-01' },
        },
      },
      confidence:  'high',
      on_approve:  'execute_immediately',
      created_by:  'agent',
    })

    const result = await PendingActionExecutor.execute(action, auth)

    expect(result.success).toBe(true)

    // Verify posting is reconciled in DB
    const posting = await prisma.posting.findUnique({ where: { id: testPostingId } })
    expect(posting?.reconciliation_status).not.toBeNull()
    // reconciliation_status should be 'CONFIRMED' or equivalent
    // (check what confirmReconciliation actually sets before writing this assertion)
    expect(['CONFIRMED', 'MATCHED', 'RECONCILED']).toContain(posting?.reconciliation_status)

    // Cleanup — reset posting reconciliation status for other tests
    await prisma.posting.update({
      where: { id: testPostingId },
      data:  { reconciliation_status: null },
    })
  })

  // --- PlaceholderExecutor ---

  test('PlaceholderExecutor handles unknown action types without throwing', async () => {
    const action = await createPendingAction({
      org_id:      TEST_CONFIG.orgId,
      action_type: 'send_email',
      title:       'Placeholder test',
      payload:     { preview: {} },
      confidence:  'low',
      on_approve:  'execute_immediately',
      created_by:  'agent',
    })

    const result = await PendingActionExecutor.execute(action, auth)

    expect(result.success).toBe(true)
    // PlaceholderExecutor should log intent and return success — not throw
  })

  // --- Full approve flow via service ---

  test('approving a pending action calls executor and sets executed_at', async () => {
    const action = await createPendingAction({
      org_id:      TEST_CONFIG.orgId,
      action_type: 'reconcile_posting',
      title:       'Full approve flow test',
      payload: {
        posting_id: testPostingId, match_type: 'payment_receipt',
        match_id: 'rec_full_test', match_reference: 'REC-FULL-001',
        confidence_detail: 'Full flow test',
        preview: {
          posting: { description: 'TEST', amount: 100, date: '2026-01-01', account: 'HDFC' },
          match:   { reference: 'REC-FULL-001', amount: 100, customer: 'Test', date: '2026-01-01' },
        },
      },
      confidence: 'high', on_approve: 'execute_immediately', created_by: 'agent',
    })

    // Resolve via the service layer (same path as PATCH /pending-actions/:id)
    const resolved = await resolvePendingAction(action.id, {
      status:      'approved',
      resolved_by: TEST_CONFIG.userId,
    })

    expect(resolved.status).toBe('executed')
    expect(resolved.executed_at).not.toBeNull()
    expect(resolved.execution_error).toBeNull()

    // Cleanup
    await prisma.posting.update({
      where: { id: testPostingId },
      data:  { reconciliation_status: null },
    })
    await prisma.pending_action.delete({ where: { id: action.id } })
  })

  // --- All-resolved trigger ---

  test('resolving last pending action in session triggers report continuation', async () => {
    const session = await createAgentSession({
      org_id:  TEST_CONFIG.orgId,
      user_id: TEST_CONFIG.userId,
      goal:    'Report continuation test',
      mode:    'supervised',
      status:  'awaiting_approval',
      plan: [
        { index: 0, type: 'query',  title: 'Step 1', description: '', status: 'completed', requires_approval: false },
        { index: 1, type: 'action', title: 'Step 2', description: '', status: 'completed', requires_approval: true },
        { index: 2, type: 'report', title: 'Step 3', description: '', status: 'pending',   requires_approval: false },
      ],
      current_step_index:   2,
      pending_actions_count: 1,
    })

    const action = await createPendingAction({
      org_id: TEST_CONFIG.orgId, session_id: session.id,
      action_type: 'send_email', title: 'Last action',
      payload: { preview: {} }, confidence: 'low',
      on_approve: 'execute_immediately', created_by: 'agent',
    })

    // Resolve the last action
    await resolvePendingAction(action.id, {
      status: 'approved', resolved_by: TEST_CONFIG.userId,
    })

    // Wait briefly for setImmediate to fire
    await new Promise(resolve => setTimeout(resolve, 500))

    // Session should have transitioned back to executing (report step)
    // and then to completed once the report step finishes
    const updatedSession = await getAgentSession(session.id)
    // Status should be 'executing' (report triggered) or 'completed' if report ran fast
    expect(['executing', 'completed']).toContain(updatedSession.status)

    // Cleanup
    await prisma.pending_action.deleteMany({ where: { session_id: session.id } })
    await prisma.agent_message.deleteMany({ where: { session_id: session.id } })
    await prisma.agent_session.delete({ where: { id: session.id } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })
})
```

**Gate**: `ReconcilePostingExecutor` runs and posting is reconciled in DB. `PlaceholderExecutor` handles unknown types without error. Full approve flow via service sets `executed_at`. Last-action trigger fires report continuation.

---

### Phase 4 — Workbench frontend

**Build:**
- [ ] `AgentSessionContext`
- [ ] `ChatContext` with optional `sessionId`
- [ ] `/workbench` route and `WorkbenchPage` shell
- [ ] `SessionsSidebar`
- [ ] `SessionHeader`
- [ ] `GoalSetter` with mode selector
- [ ] Session creation flow
- [ ] `PendingActionsList`
- [ ] `PendingActionRow`
- [ ] `BatchSummaryCard` with auto-approve high
- [ ] `GenericBatchList`
- [ ] `ConversationPanel` (session-scoped)
- [ ] Workbench routing
- [ ] SSE listener for real-time updates

**Verify — manual browser walkthrough. Perform each step yourself in the dev environment:**

```
Step 1: Navigate to /workbench
        Expected: GoalSetter visible in center pane. Sessions sidebar present.
                  No active session. Sidebar chat at /chat is unaffected.

Step 2: Click "New Session +"
        Expected: Goal input appears with suggested goals.
                  Mode selector shows "Supervised" as default.

Step 3: Type "Reconcile unmatched transactions for HDFC current account", confirm
        Expected:
        - URL changes to /workbench/sessions/:sessionId
        - Session appears in sidebar
        - Conversation panel shows agent response streaming in
        - Within 15 seconds: session header shows current step text
        - Agent auto-continues through query/analysis steps (visible in conversation panel)

Step 4: Wait for pending actions to appear
        Expected:
        - BatchSummaryCard appears in work zone showing "N matches suggested"
        - High/medium/low breakdown shown
        - "Review all N" and "Auto-approve high (N)" buttons present
        - Sidebar badge shows pending count
        - Session status shows awaiting_approval

Step 5: Click "Auto-approve high (N)"
        Expected:
        - Card updates immediately showing remaining count
        - Sidebar badge decreases — no page refresh needed (SSE working)

Step 6: Click "Review all" (or "Review remaining")
        Expected:
        - URL changes to /workbench/sessions/:sessionId/batch/:batchId
        - GenericBatchList renders
        - Each row shows payload.preview data: description, amount, customer, date
        - Approve / Reject / Detail → per row
        - Back button visible

Step 7: Approve one row from batch list
        Expected:
        - Row updates to approved state or disappears
        - No page refresh

Step 8: Click "Detail →" on a remaining row
        Expected:
        - URL changes to /workbench/sessions/:sessionId/actions/:id
        - ReconciliationDetail (or PlaceholderDetail) renders as work zone overlay
        - Session header still visible
        - Back button returns to batch list

Step 9: Reject a row from the detail view
        Expected:
        - Action marked rejected
        - Navigates back to batch list

Step 10: Approve all remaining rows
         Expected:
         - All pending actions resolved
         - Session transitions to executing (report step)
         - Agent posts summary in conversation panel (~10 seconds)
         - Session transitions to completed
         - Sidebar shows ✓ on session

Step 11: Reload the page while on /workbench/sessions/:sessionId
         Expected:
         - Session rehydrates from DB — same state as before reload
         - Completed sessions show as read-only
         - All history visible in conversation panel

Step 12: Navigate to /chat
         Expected:
         - Sidebar chat works exactly as before — no session awareness
         - Sending a message in /chat does NOT create an agent session
```

**Gate**: All 12 steps pass without error. The full reconciliation loop runs end-to-end in the UI.

---

### Phase 5 — ReconciliationDetail component

**Build:**
- [ ] `ReconciliationDetail` — full detail view for `reconcile_posting`
  - Both sides of match (posting details + payment receipt or invoice details)
  - Confidence basis display (`payload.confidence_detail` + visual indicators)
  - Other candidates list from `payload.other_candidates`
  - Approve / Reject / Edit controls
  - Fetches fresh data using `payload.posting_id` and `payload.match_id`
  - Falls back to `payload.preview` if fetch fails
  - Shows "data may be outdated" indicator when using fallback

**Verify — manual browser walkthrough:**

```
Step 1: Run Phase 4 walkthrough through Step 8 (open Detail → on a row)
        Expected: ReconciliationDetail renders — NOT PlaceholderDetail
                  Both sides of the match are shown with live DB data
                  Confidence basis is displayed
                  Other candidates shown if payload.other_candidates is populated

Step 2: Approve from detail view
        Expected: Executor runs, posting reconciled in DB
                  Navigates back to batch list
                  Row shows approved state

Step 3: Verify fallback rendering
        Temporarily comment out the posting fetch in ReconciliationDetail
        Navigate to /workbench/sessions/:sessionId/actions/:id
        Expected: Detail still renders using payload.preview data
                  "Data may be outdated" indicator visible
        Restore the fetch

Step 4: Verify deep-link works
        Copy the URL /workbench/sessions/:sessionId/actions/:id
        Open in a new tab
        Expected: ReconciliationDetail renders correctly
                  Session header shows correct session context
```

**Gate**: `ReconciliationDetail` renders with live data. Fallback works. Approve from detail runs executor. Deep-link works.

---

### Phase 6 — Post-validation polish

Do not build Phase 6 until Phase 5 is verified with real data in a real environment. Scope is determined by what real usage reveals.

Planned items:
- Visual plan step tracker in session header
- Step-grouped pending actions in work zone
- Session timeline / history view
- Typed batch list components where `GenericBatchList` proves insufficient
- Collections triage flow (`invoice_match`, `escalate_collection`, `send_email`)
- Workbench-wide action queue (`/workbench/actions`)

---

## 13. What Is Not Changing

- Sidebar chat (`/chat`) — unchanged, no session awareness
- `AgentService` without `sessionId` — fully backward compatible
- All existing tools: `searchRecords`, `analyticsQuery`, `getAnalyticsContext`, `suggestReconciliationMatches`, `erpConnector`, all ERP handlers
- `confirmReconciliation` — called by executor, not modified
- Existing ERP handler registry — `PendingActionExecutor` follows same pattern
- Existing chat streaming (`/api/agent/chat/stream`)
- Existing `DynamicPromptManager` — `SESSION_DIRECTIVE` is a constant, not a new template
- Existing `ToolManager.getUnifiedTools()` — session tools added only when `sessionId` present
- Existing `TOOL_RESPONSE_HANDLING_GUIDELINE` in `constants.ts` — `SESSION_DIRECTIVE` added alongside it

---

## 14. Codebase References

Read these files before touching anything:

| File | Why |
|------|-----|
| `src/agent/AgentService.ts` | Primary file to modify |
| `src/agent/ToolManager.ts` | Add session tools to `getUnifiedTools()` when `sessionId` present |
| `src/agent/AgentTools.ts` | Pattern for new tool implementations |
| `src/agent/handlers/erp/registry.ts` | Pattern for `PendingActionExecutor` registry |
| `src/agent/tools/suggestReconciliationMatches.ts` | Used in V1 analysis step — understand return shape |
| `src/services/reconciliation/confirmReconciliation.ts` | Wrapped by `ReconcilePostingExecutor` — understand signature and return |
| `src/agent/routes.ts` | Add new endpoints here |
| `src/agent/prompt/constants.ts` | Add `SESSION_DIRECTIVE` here alongside `TOOL_RESPONSE_HANDLING_GUIDELINE` |
| `src/agent/prompt/DynamicPromptManager.ts` | Understand system prompt construction before modifying |
| `src/agent/slack/handle-app-mention.ts` | See `setImmediate()` fire-and-forget pattern for auto-continuation |
| `src/agent/__tests__/posting-prompt.test.ts` | Test harness pattern to follow for Phase 2-3 tests |
| `prisma/schema/data.prisma` | Add new models here — follow existing id generation convention |

---

*Document version: 0.7 — All design decisions resolved. Agent loop fully specified. Verification via direct AgentService calls in test files (Phases 1-3) and manual browser walkthrough (Phases 4-5). Ready for handoff.*