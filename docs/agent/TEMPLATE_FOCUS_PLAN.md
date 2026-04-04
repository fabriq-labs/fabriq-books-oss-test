# Agent Template Focus: Models + Tools Declaration

**Status**: Planned — ready for implementation  
**Created**: 2026-04-03  
**Context**: [WORKBENCH_BACKEND.md](./WORKBENCH_BACKEND.md), [WORKBENCH_IMPLEMENTATION_PLAN.md](./WORKBENCH_IMPLEMENTATION_PLAN.md)

---

## Problem

The agent harness currently makes two decisions that template authors cannot control:

**1. Which models appear in the system prompt (`accessibleModels`)**  
Controlled by a hardcoded `RELATED_MODELS` constant keyed on `goal_model`. Two templates sharing the same `goal_model` (e.g. `atpl_categorise` and `atpl_reconcile` both use `posting`) get identical model context even though their information needs differ. The LLM receives schema noise for models it will never query.

**2. Which tools are available to the LLM**  
Controlled by a `getToolsForModel()` if-else switch in `ToolManager.ts` keyed on model name. For the categorise workflow the LLM receives `suggestReconciliationMatches`, `searchRecords`, `createRecord`, `updateRecord`, `advancedSqlQuery` — none of which it needs. For reconcile it receives `categorizePostings` — which it doesn't use.

**Why this matters beyond token count**  
A sharp, focused prompt is a better prompt. When the LLM receives 12 tools it reasons about 12 tools when deciding what to call next — it may hesitate between `advancedSqlQuery` and `analyticsQuery`, or wonder whether `createRecord` is appropriate. With exactly the right 6 tools the decision space collapses and the model moves faster and more accurately. The same applies to model schemas: `payment_receipt` and `invoice` appearing in the categorise agent's context is noise the LLM must reason around.

---

## Design

### 1. Two new columns on `agent_template`

```sql
focus_models  text[]  DEFAULT '{}'
-- List of model names needed in the system prompt.
-- Empty array = use current fallback behaviour (RELATED_MODELS, then all accessible).

allowed_tools text[]  DEFAULT '{}'
-- List of tool names the LLM may call (besides always-included core tools).
-- Empty array = use current model-switch behaviour in ToolManager.
```

Both default to empty so every existing template continues to work without modification.

---

### 2. Focus Models — runtime logic

When building the session prompt, `AgentService` resolves `effectiveContext.focusModels` using this precedence chain:

```
1. template.focus_models  (non-empty)        → intersect with accessibleModels
2. RELATED_MODELS[goal_model]  (hardcoded)   → intersect with accessibleModels  [existing fallback]
3. all accessibleModels                                                           [widest fallback]
```

The intersection with `accessibleModels` is the **security gate** — a template can only reference models the authenticated user has permission to see. `focus_models: ['posting', 'account', 'secret_model']` silently yields `['posting', 'account']` if `secret_model` is not in the user's permissions.

**`atpl_categorise` example:**
```json
focus_models: ["posting", "account", "category", "category_group"]
```
4 models instead of 6 → ~1,400 fewer tokens per LLM call, with cleaner SQL context.

---

### 3. Allowed Tools — runtime logic

Two tiers:

**Tier 1 — Core tools (always injected, not declarable, not removable):**
- `createPlan` — structural; every session needs it
- `completeStep` — structural; every session needs it

**Tier 2 — Declared tools (from `template.allowed_tools`):**  
Everything else. When `allowed_tools` is non-empty, `ToolManager.getUnifiedTools()` builds only the tools in `[CORE_TOOLS, ...template.allowed_tools]`, intersected against the registered tool registry (safety net against typos or removed tool names).

When `allowed_tools` is empty the existing model-switch in `getToolsForModel()` applies (backward compatible).

**Security rule**: The request context (API caller / UI) cannot extend the tool list beyond what the template declares. Templates define the security ceiling. This prevents a crafted goal from coaxing the agent into calling tools (`createRecord`, `erpConnector`) the workflow was never designed to use.

**`atpl_categorise` example:**
```json
allowed_tools: [
  "getAnalyticsContext",
  "analyticsQuery",
  "categorizePostings",
  "queueActions"
]
```
6 tools visible instead of 12.

---

### 4. Merge `queueAction` + `queueActionBatch` → `queueActions`

**Current state:**
- `queueAction` — creates a single pending action; `action_type` is per-action; `batch_id` optional
- `queueActionBatch` — creates N actions of the same type; `batch_id` required; `action_type` at batch level

**Problem:** Two tools for the same concept. The LLM must choose between them. `queueAction` is never actually used by any existing template (both `atpl_categorise` and `atpl_reconcile` use `queueActionBatch`). Having both in the context wastes tokens and creates decision overhead for the LLM.

**Merged tool `queueActions`:**

```typescript
parameters: z.object({
  action_type: z.string()
    .describe('Type of all actions in this call, e.g. "categorize_transaction"'),
  batch_id: z.string()
    .describe('Unique batch identifier. Use: {sessionId}-step-{stepIndex}'),
  on_approve: z.enum(['execute_immediately', 'queue_for_batch', 'notify_only']),
  actions: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    payload: z.record(z.any()),
    confidence: z.enum(['high', 'medium', 'low']),
    confidence_score: z.number().min(0).max(1).optional(),
  })).min(1).describe('One or more actions. Pass a single-item array for one action.'),
})
```

- `action_type` moves to the batch level (all actions in one call share a type — the LLM never queues mixed types in a single call in practice)
- `batch_id` becomes required (it was always required in the batch tool; the single tool made it optional which led to UI grouping issues)
- `actions` is an array of 1..N — handles both the single and batch case

**Migration:**
- Export `queueActionsTool` from `sessionTools.ts` (new)
- Keep `queueActionTool` and `queueActionBatchTool` exported but **deprecated** — existing code that calls `getUnifiedTools()` still works; they just won't be included in the tool map for templates that declare `allowed_tools`
- Remove `queueAction` and `queueActionBatch` from `getUnifiedTools()`, replace with `queueActions`
- Update `atpl_categorise` and `atpl_reconcile` SQL seeds to reference `queueActions`
- No DB migration needed (tool names are strings in `allowed_tools` / prompt text, not FK-constrained)

---

### 5. Non-agent AI features — no breakage

Non-agent paths use `AgentService.handleRequest()` with no `sessionId`. `getUnifiedTools()` only injects session tools (`createPlan`, `completeStep`, `queueActions`) when `sessionId` is present. The non-agent path continues to receive model tools + analytics tools exactly as today.

The `getToolsForModel()` model-switch is **not removed** — it remains the fallback for templates without `allowed_tools` and for direct `handleRequest()` calls. Non-agent features are fully isolated from the template declaration system.

---

## Current tool inventory for `posting` model in a session

| Tool | Source | `atpl_categorise` | `atpl_reconcile` | Non-agent |
|---|---|:---:|:---:|:---:|
| `createPlan` | core | ✅ always | ✅ always | ❌ no session |
| `completeStep` | core | ✅ always | ✅ always | ❌ no session |
| `queueActions` | session (merged) | ✅ | ✅ | ❌ no session |
| `getAnalyticsContext` | analytics | ✅ | ✅ | ✅ |
| `analyticsQuery` | analytics | ✅ | ✅ | ✅ |
| `categorizePostings` | model specialised | ✅ | ❌ | ✅ (posting model) |
| `suggestReconciliationMatches` | model specialised | ❌ | ✅ | ✅ (posting model) |
| `searchRecords` | model CRUD | ❌ | ❌ | ✅ |
| `createRecord` | model CRUD | ❌ | ❌ | ✅ |
| `updateRecord` | model CRUD | ❌ | ❌ | ✅ |
| `advancedSqlQuery` | model CRUD | ❌ | ❌ | ✅ |

---

## Implementation plan

### Step 1 — Schema migration

```prisma
// prisma/schema/agent_template.prisma
focus_models  String[]  @default([])
allowed_tools String[]  @default([])
```

Run `npx prisma db push` (no data migration needed — defaults are empty arrays).

### Step 2 — Merge queueAction + queueActionBatch → queueActions

In `backend/src/agent/tools/sessionTools.ts`:
- Add `queueActionsTool(sessionId, auth)` — merged implementation
- Keep old exports to avoid import-time breakage elsewhere
- Update `tools/index.ts` to export `queueActionsTool`

### Step 3 — Update ToolManager

In `backend/src/agent/ToolManager.ts`:
- `getUnifiedTools(modelName, auth, context, sessionId, allowedTools?: string[])` — add parameter
- When `sessionId` present: replace `queueAction` + `queueActionBatch` with `queueActions`
- When `allowedTools` non-empty: after building all tools, filter to `[...CORE_TOOLS, ...allowedTools]`, intersected with the keys of the built tool map
- `getToolsForModel()` model-switch — no change (remains fallback)

### Step 4 — Wire into AgentService

In `backend/src/agent/AgentService.ts` (both `handleRequest` and `handleStreamingRequest`):
- After session load, read `template.focus_models` — if non-empty, set `effectiveContext.focusModels` before the `RELATED_MODELS` fallback check
- Pass `template.allowed_tools` to `toolManager.getUnifiedTools()`

### Step 5 — Update seed templates

In `backend/prisma/seed-agent-templates.sql`:

```sql
-- atpl_categorise
focus_models  = ARRAY['posting', 'account', 'category', 'category_group'],
allowed_tools = ARRAY['getAnalyticsContext', 'analyticsQuery', 'categorizePostings', 'queueActions']

-- atpl_reconcile  
focus_models  = ARRAY['posting', 'account', 'payment_receipt', 'invoice'],
allowed_tools = ARRAY['getAnalyticsContext', 'analyticsQuery', 'suggestReconciliationMatches', 'queueActions']
```

Also run these as UPDATEs against both local and Railway test DBs.

### Step 6 — Test

Run `v2-categorise-expenses-e2e.test.ts` and verify:
- Session completes, 24 actions queued
- `tools_called` in `llm_trace` contains `queueActions`, not `queueActionBatch`
- Prompt token count ≤ previous run (136,033)
- No non-agent test regressions

---

## Expected token impact

| Component | Before this PR | After this PR |
|---|---:|---:|
| accessibleModels (6 models → 4) | ~4,354 | ~2,900 |
| Tool schema (12 tools → 6) | ~600 | ~300 |
| **Additional saving** | | **~1,750 / call** |
| **Running total vs original 173k** | 136,033 | ~134,300 |

The absolute token saving from this step is modest. The architectural value is:
1. Template authors declare intent explicitly — no hidden model-switch surprises
2. LLM decision space is smaller — faster, more accurate tool selection
3. Wrong tools cannot be accidentally called — security boundary is in the template, not the code
4. Adding a new template for a new workflow requires only SQL, no TypeScript changes

---

## Files to change

| File | Change |
|---|---|
| `prisma/schema/agent_template.prisma` (or equivalent) | Add `focus_models`, `allowed_tools` columns |
| `src/agent/tools/sessionTools.ts` | Add `queueActionsTool`, keep old exports |
| `src/agent/tools/index.ts` | Export `queueActionsTool` |
| `src/agent/ToolManager.ts` | Accept `allowedTools?` in `getUnifiedTools`; replace two queue tools with one; add filter logic |
| `src/agent/AgentService.ts` | Read template fields; pass to ToolManager and focusModels chain |
| `prisma/seed-agent-templates.sql` | Add `focus_models` + `allowed_tools` to `atpl_categorise`, `atpl_reconcile` |
| `src/agent/__tests__/v2-categorise-expenses-e2e.test.ts` | Assert `queueActions` in tools_called (not `queueActionBatch`) |

---

---

## Feature: User Clarification Flow (`requestClarification`)

**Status**: Designed — not yet implemented  
**Context**: Emerged from debugging `ses_64362f57` (Pattern 6: Step Stalled — Data Not Found). The LLM got 0 rows from a query and had no way to ask the user what they meant.

### Problem

Currently, when a `query` step returns 0 results due to ambiguous user input (e.g. "reconcile the checking account" but the account is named "HDFC Current"), the LLM has two bad options:
1. Fail the step with `completeStep` — session ends, user must re-run from scratch
2. Leave the step open — session stalls until the watchdog fires

Neither preserves the work done so far or gives the user a chance to correct the input.

### Design

#### New session state: `awaiting_input`

```
executing → awaiting_input  (agent calls requestClarification)
awaiting_input → executing  (user submits clarification via POST /clarify)
```

**Timeout behaviour**: `SessionTimeoutService` does NOT arm or check the timer while status is `awaiting_input`. The user may close their browser and return later. When the session transitions back to `executing` (via `/clarify`), the timer is re-armed with a fresh `AGENT_SESSION_TIMEOUT_MS` window.

#### New DB column on `agent_session`

```sql
clarification_request  JSONB  DEFAULT NULL
-- Stores the pending question while status = 'awaiting_input'.
-- Structure: { question: string, context: object, step_index: number }
-- Cleared when answered; content archived into accumulated_context.
```

The question + answer are stored additively in `accumulated_context` under the key `clarifications` (array), so later steps can reference past clarifications:

```json
"accumulated_context": {
  "clarifications": [
    { "step_index": 0, "question": "Which account did you mean?", "answer": "HDFC Current", "context": { "searched_for": "checking", "available": ["HDFC Current", "HDFC Savings"] } }
  ]
}
```

#### New tool: `requestClarification`

**Tier**: Declared (Tier 2) — templates opt in by adding it to `allowed_tools`. Templates that don't declare it cannot use the clarification flow.

**Parameters:**
```typescript
z.object({
  question: z.string()
    .describe('Clear question for the user. Include what you searched for and the available options found.'),
  context: z.record(z.any()).optional()
    .describe('Structured context: searched_for, available_options, etc. Stored for later steps.'),
})
```

**Execute behaviour:**
1. Set `session.status = 'awaiting_input'`
2. Write `session.clarification_request = { question, context, step_index: current_step_index }`
3. Cancel the session timeout watchdog
4. Return the question text (LLM uses this as its response to the user)

#### New API route: `POST /api/agent/sessions/:id/clarify`

```json
// Request body
{ "response": "HDFC Current" }
```

Steps:
1. Validate `session.status === 'awaiting_input'`
2. Append a new `user` message to `agent_message` with the clarification text
3. Merge `{ step_index, question, answer, context }` into `accumulated_context.clarifications[]`
4. Clear `session.clarification_request`
5. Set `session.status = 'executing'`
6. Trigger auto-continuation (same path as the post-`completeStep` continuation)

The LLM receives the clarification as a user message in the next turn. It reads the accumulated context, sees what was tried, and re-calls `analyticsQuery` with a corrected query. The query fix is LLM-driven — not mechanical substitution — which handles cases where the query itself was structurally wrong, not just a name mismatch.

#### SESSION_DIRECTIVE addition

Add a new branch to the `query` step IF block:

```
IF status is 'executing' AND current step type is 'query' AND query returned 0 rows:
  → Decide: is this ambiguous input or genuinely missing data?

  AMBIGUOUS INPUT (data likely exists, user gave a partial/wrong name):
    → First run a broader query to find available candidates (e.g. SELECT name FROM account)
    → Then call requestClarification with the question and candidates listed
    → Do NOT call completeStep yet — session pauses until user responds

  GENUINELY MISSING DATA (correct search, data simply doesn't exist):
    → Call completeStep with result_summary explaining what was searched and what was missing
    → Example: "Found 0 postings for March 2024 in HDFC Current — date range may be outside the data"

  Rule of thumb: if you could list the right options but don't know which one to pick → clarify.
  If no reasonable candidates exist → fail the step.
```

#### When `requestClarification` is appropriate

| Situation | Action |
|---|---|
| User said "checking account", DB has "HDFC Current" and "HDFC Savings" | `requestClarification` — ambiguous name, candidates available |
| User said "March transactions", DB has no postings in March | `completeStep` failed — data genuinely missing |
| User said "reconcile vendor XYZ", no supplier named XYZ exists | `completeStep` failed — entity doesn't exist |
| User said "use the main bank account", 3 accounts exist | `requestClarification` — underspecified, user can choose |

#### Template opt-in

Templates that need clarification support must declare it in `allowed_tools`:

```sql
-- atpl_categorise (example)
allowed_tools = ARRAY['getAnalyticsContext', 'analyticsQuery', 'categorizePostings', 'queueActions', 'requestClarification']

-- atpl_reconcile (example)
allowed_tools = ARRAY['getAnalyticsContext', 'analyticsQuery', 'suggestReconciliationMatches', 'queueActions', 'requestClarification']
```

Templates that don't declare `requestClarification` fall back to the existing `completeStep`-on-failure behaviour (correct for batch/automated templates that shouldn't pause for user input).

### Files to change

| File | Change |
|---|---|
| `prisma/schema/agent_session.prisma` | Add `clarification_request Json?` column |
| `src/agent/tools/sessionTools.ts` | Add `requestClarificationTool(sessionId, auth)` |
| `src/agent/tools/index.ts` | Export `requestClarificationTool` |
| `src/agent/ToolManager.ts` | Register `requestClarification` as declarable Tier-2 tool |
| `src/agent/routes.ts` | Add `POST /sessions/:id/clarify` route |
| `src/agent/AgentService.ts` | `SessionTimeoutService.cancel()` on `awaiting_input`; re-arm on `/clarify` |
| `src/agent/SessionTimeoutService.ts` | Skip watchdog check when `status = 'awaiting_input'` |
| `src/agent/prompt/constants.ts` | Add `requestClarification` branch to `SESSION_DIRECTIVE` |
| `prisma/seed-agent-templates.sql` | Add `requestClarification` to `allowed_tools` for both templates |

---

---

## Feature: Workbench UI Redesign — Hybrid Step Card View (V2)

**Status**: Designed — not yet implemented  
**Context**: The current workbench renders a flat SSE event list. V2 replaces this with per-step cards that use visual hierarchy to serve both audiences: business users read the narrative summary, power users read the technical detail below it in smaller muted text.

### Problem with the current UI

- The flat event list gives equal visual weight to all events — tool calls, completions, status changes all look the same
- No primary/secondary hierarchy: business users see the same wall of text as developers
- No way for the agent to ask the user a question mid-session (requires `awaiting_input` state)

### Design principles for V2

1. **One card per step** — the step is the unit of display, not the event
2. **Visual hierarchy within the card** — narrative text (normal weight) on top, technical detail (`text-xs` muted) below
3. **`result_summary` is the primary line** — plain English written by the LLM at `completeStep`
4. **Tool calls are secondary lines** — small, muted, show what the agent actually did for transparency and trust
5. **Clarification renders inline inside the active step card** — no separate screen, no conversation UI
6. **V2 reads from `session.plan` + `session.clarification_request`**, not the raw SSE events array

---

### Shared: Session Header

```
┌──────────────────────────────────────────────────────────────┐
│  Reconcile HDFC Current · supervised              [v1]  [v2] │
│                                                               │
│  ●━━━━━━━●━━━━━━━●━━━━━━━○                                   │
│  Query   Match   Review  Report                              │
└──────────────────────────────────────────────────────────────┘
```

Toggle: small segmented control, right-aligned in `SessionHeader`. State stored in `localStorage` key `workbench_view_mode`. Used for internal comparison during rollout; V1 retired once V2 is validated.

Step progress bar icon changes:
- Active step: amber spinner (unchanged)
- `awaiting_input` step: amber `?` icon — signals "waiting for your input"
- Completed step: green checkmark (unchanged)

---

### V1 — Current flat log (baseline, no changes)

```
┌──────────────────────────────────────────────────────────────┐
│  [chevron]  Step 1: Query bank postings                      │
│  [wrench]   analyticsQuery called                            │
│  [wrench]   analyticsQuery called                            │
│  [check]    Step 1 complete — Found 47 postings              │
│  [chevron]  Step 2: Suggest matches                          │
│  [wrench]   suggestReconciliationMatches called              │
└──────────────────────────────────────────────────────────────┘
```

`ExecutingView.tsx` — untouched.

---

### V2 — Hybrid step card view (`ExecutingViewV2.tsx`)

Each step renders as a card. Completed cards are collapsed to two lines. The active card is open.

**Two steps done, one active:**

```
┌─ Step 1: Query bank postings ──────────────────── ✅ ─┐
│  Found 47 unreconciled postings for HDFC Current       │  ← result_summary, normal text
│  · analyticsQuery · 2 calls · 47 rows                  │  ← text-xs, muted
└────────────────────────────────────────────────────────┘

┌─ Step 2: Suggest matches ──────────────────────── ✅ ─┐
│  Matched 23 to receipts — 4 exact, 19 suggested        │  ← result_summary
│  · suggestReconciliationMatches · 23 matches           │  ← text-xs, muted
└────────────────────────────────────────────────────────┘

┌─ Step 3: Queue actions ────────────────────── ⏳ ────┐
│  Preparing 23 reconciliation actions...               │  ← step.title while active
│  · queueActions · running                             │  ← text-xs, muted, live
└───────────────────────────────────────────────────────┘
```

---

**`awaiting_input` — agent has candidates (chips):**

```
┌─ Step 1: Query bank account ───────────────────── ⏸ ─┐
│  I couldn't find "checking". Which account did you     │  ← clarification question
│  mean?                                                 │
│                                                        │
│  [ HDFC Current ]  [ HDFC Savings ]  [ ICICI Op. ]    │  ← chips, click to submit
│                                                        │
│  · analyticsQuery · 0 rows                            │  ← text-xs, muted (what was tried)
└────────────────────────────────────────────────────────┘
```

Clicking a chip submits immediately — no separate Continue button for constrained choices. The muted line shows what the agent already attempted, building trust that it did the work.

---

**`awaiting_input` — open-ended question:**

```
┌─ Step 1: Query transactions ───────────────────── ⏸ ─┐
│  What date range should I use for this analysis?       │
│                                                        │
│  ┌──────────────────────────────────┐  [Continue →]   │
│  │ e.g. January 2024                │                  │
│  └──────────────────────────────────┘                  │
│                                                        │
│  · analyticsQuery · 0 rows                            │
└────────────────────────────────────────────────────────┘
```

---

**After clarification answered:**

```
┌─ Step 1: Query bank account ───────────── ✅  ↩ ────┐
│  Found 23 postings in HDFC Current                   │  ← result_summary after re-run
│  · analyticsQuery · 23 rows  · clarified             │  ← "clarified" badge inline
└──────────────────────────────────────────────────────┘
```

The `↩` icon in the card header indicates this step had a clarification. Hovering shows a tooltip with the Q&A. No separate expanded state needed.

---

**Failed step:**

```
┌─ Step 2: Suggest matches ──────────────────────── ❌ ─┐
│  No receipts found for HDFC Current in March 2024      │  ← result_summary
│  · suggestReconciliationMatches · 0 matches            │  ← text-xs, muted
│                                                        │
│  Session could not continue. Try re-running with a     │  ← inline guidance, text-sm muted
│  different date range.                                  │
└────────────────────────────────────────────────────────┘
```

---

### Data sources

| Card element | Source |
|---|---|
| Card title | `session.plan[i].title` (LLM-written, human-readable) |
| Primary line (completed) | `session.plan[i].result_summary` |
| Primary line (active) | `session.plan[i].title` + ellipsis animation |
| Secondary muted lines | SSE `tool_called` events for that step's `step_index` |
| Clarification question | `session.clarification_request.question` |
| Clarification chips | `session.clarification_request.context.available[]` |
| Clarification badge | `session.plan[i]` has entry in `accumulated_context.clarifications[]` |

Note: V2 uses *both* `session.plan` (for narrative lines) and the SSE events array (filtered by `step_index`, for secondary muted lines). This gives the hybrid its dual-audience character.

---

### Component tree

```
ExecutingViewV2
  └── StepCard (one per plan step)
        props: step, events[], clarificationRequest?, stepIndex, isCurrent
        ├── CardHeader     — title + status icon (✅ / ⏳ / ⏸ / ❌ / ↩)
        ├── PrimaryLine    — result_summary (completed) or title+spinner (active)
        ├── ClarificationCard (only when isCurrent && status = 'awaiting_input')
        │     props: question, available?: string[], onSubmit(answer)
        │     renders: ChipGroup if available.length > 0, else TextInput + button
        └── SecondaryLines — tool_called events for this step, text-xs muted
```

`ClarificationCard.onSubmit` → `POST /api/agent/sessions/:id/clarify { response: answer }`

---

### `awaiting_input` in SessionView

`SessionView` routes `awaiting_input` to the executing view — it is not a separate screen.

```typescript
if (['planning', 'executing', 'awaiting_input'].includes(status)) {
  return viewMode === 'v2' ? <ExecutingViewV2 ... /> : <ExecutingView ... />;
}
```

Both views receive `session` (including `session.clarification_request`) as a prop.

---

### Files to change (UI)

| File | Change |
|---|---|
| `src/contexts/AgentSessionContext.tsx` | Add `awaiting_input` to `SessionStatus` type; add `clarification_request` to session type |
| `src/pages/workbench/SessionView.tsx` | Add `viewMode` state + localStorage; route `awaiting_input` to executing view |
| `src/components/workbench/SessionHeader.tsx` | Add `[v1][v2]` toggle; `?` icon for `awaiting_input` step in progress bar |
| `src/components/workbench/ExecutingViewV2.tsx` | New file — renders StepCard list |
| `src/components/workbench/StepCard.tsx` | New file — card with primary + secondary lines |
| `src/components/workbench/ClarificationCard.tsx` | New file — chips or text input |

---

## Open questions (resolved)

| # | Question | Decision |
|---|---|---|
| 1 | `queueAction` vs `queueActionBatch` | Merge into `queueActions` (array of 1..N). Old tools kept as deprecated exports. |
| 2 | Non-agent features breaking | Not affected — model-switch fallback unchanged; session tools only injected when `sessionId` present |
| 3 | `RELATED_MODELS` deleted? | Kept as fallback for templates without `focus_models` |
| 4 | Request context extending tools? | Not allowed — template defines ceiling |
| 5 | Intersection with accessibleModels | Always applied as security gate |
