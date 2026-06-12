# Fabriq Agent — Builders and Executors

**Audience**: Anyone debugging "the agent skipped a step" or "an approved
action didn't write anything to the database".
**Files**: `builders/`, `executors/PendingActionExecutor.ts`

---

## Purpose

Not every plan step requires an LLM call. The **hybrid dispatcher** in
`completeStep` checks whether subsequent steps can be executed
deterministically:

- **Action builders** (`ActionBuilderRegistry`) — create pending actions from
  `accumulated_context` without asking the LLM
- **Report formatters** (`ReportFormatterRegistry`) — generate the session
  report without asking the LLM
- **Pending action executors** (`PendingActionExecutor`) — run the actual
  financial side effect when a user approves an action

Deterministic steps are reproducible (no LLM variance), faster (no LLM
round-trip), and cheaper (no tokens).

---

## The Hybrid Dispatcher

**Location**: Inside `completeStep` tool in `tools/sessionTools.ts`

After marking a step complete, the dispatcher walks forward through remaining
plan steps:

```typescript
while (cursor < plan.length) {
  const nextStep = plan[cursor];

  if (nextStep.type === 'action') {
    const builder = ActionBuilderRegistry.get(goal_model, nextStep, mergedContext);
    if (!builder) break;   // LLM handles this step
    // Run builder → create pending_actions → session → 'awaiting_approval'
    cursor++;
    continue;
  }

  if (nextStep.type === 'report') {
    const formatter = ReportFormatterRegistry.get(goal_model, nextStep, session);
    if (!formatter) break;  // LLM handles this step
    // Run formatter → write report → session → 'completed'
    cursor++;
    continue;
  }

  break;  // query/analysis steps always need the LLM
}
```

When the dispatcher breaks, the session stays `executing` and
auto-continuation fires the next LLM call — see
[03-SESSION_LIFECYCLE.md](./03-SESSION_LIFECYCLE.md#phase-2-executing-the-agent-loop).

---

## Action Builder Registry

**File**: `builders/ActionBuilderRegistry.ts`

### Interface

```typescript
interface ActionBuilder {
  matches(goalModel: string, step: PlanStep, context: AccumulatedContext): boolean;
  build(step: PlanStep, session: AgentSession, auth: AuthContext): Promise<BuildResult>;
}

interface BuildResult {
  pendingActions: PendingActionInput[];
  summary: string;
}
```

### Registration

Builders are registered in `builders/index.ts`:

```typescript
ActionBuilderRegistry.register(new ReconciliationActionBuilder());
```

### `ReconciliationActionBuilder`

**File**: `builders/ReconciliationActionBuilder.ts`

**`matches()` condition**:
- `goal_model === 'posting'`
- `step.type === 'action'`
- **`accumulated_context.match_results` is a non-empty array** ← critical condition

**Why the condition matters**: The categorise expenses flow also uses
`goal_model = 'posting'` with an action step, but has no `match_results` in
context. Without this check, the builder would claim the categorization
action step and create 0 actions, sliding the session to `completed` without
ever calling `categorizePostings`.

**`build()` behaviour**:
- Iterates `accumulated_context.match_results`
- For each posting with suggestions → creates a `reconcile_posting` pending action
- Payload includes `posting_id`, `matched_reference`, `match_type`,
  `matched_id`, `confidence`, `amount`
- Returns `{ pendingActions, summary }`

This is the deterministic half of the reconciliation flow traced end-to-end
in [07-WORKED_EXAMPLES.md](./07-WORKED_EXAMPLES.md), starting from the
NEFT/INV-006 posting introduced in
[01-OVERVIEW.md](./01-OVERVIEW.md#worked-example-a-single-bank-statement-line-end-to-end).

---

## Report Formatter Registry

**File**: `builders/ReportFormatterRegistry.ts`

### Interface

```typescript
interface ReportFormatter {
  matches(goalModel: string, step: PlanStep, session: AgentSession): boolean;
  format(accumulatedContext: any, session: AgentSession): string;
}
```

### `ReconciliationReportFormatter`

**File**: `builders/ReconciliationReportFormatter.ts`

**`matches()` condition**:
- `goal_model === 'posting'`
- `step.type === 'report'`
- The plan has at least one action step (distinguishes action flows from pure
  analysis flows)

**`format()` behaviour**:
- Reads `accumulated_context` (match counts, unmatched counts)
- Reads step `result_summary` values from the plan
- Produces a plain-text summary of reconciliation results (subject to
  `TOOL_RESPONSE_HANDLING_GUIDELINE` — see
  [04-PROMPT_SYSTEM.md](./04-PROMPT_SYSTEM.md#tool_response_handling_guideline))

---

## Two Strategies for Creating Pending Actions

When a session reaches an action step, there are two fundamentally different
strategies for creating pending actions. The choice reflects a trade-off
between reliability and flexibility.

### Strategy 1 — Deterministic Builder

**Used by**: Reconciliation (`atpl_reconcile`)

1. During an analysis step, the LLM calls `suggestReconciliationMatches` and
   saves the full result to `accumulated_context` via
   `completeStep({ accumulated_context_update: { match_results: [...] } })`
2. When `completeStep` fires on the action step, the hybrid dispatcher calls
   `ActionBuilderRegistry.get(goal_model, step, accumulated_context)`
3. `ReconciliationActionBuilder.matches()` returns `true` (because
   `match_results` exists)
4. `ReconciliationActionBuilder.build()` reads `match_results` and creates
   pending actions **directly** — no LLM call

```
suggestReconciliationMatches → accumulated_context.match_results
                                         ↓
                          completeStep (action step)
                                         ↓
                    ReconciliationActionBuilder.matches() → true
                                         ↓
                    ReconciliationActionBuilder.build()
                      reads match_results, creates pending_action rows
                                         ↓
                           session → awaiting_approval
```

### Strategy 2 — LLM-Driven Queuing

**Used by**: Categorization (`atpl_categorise`)

1. LLM calls `categorizePostings(account_id)` — ML predictions in **dry-run
   mode** (no DB writes), returns predictions array
2. LLM receives predictions as a tool result, **itself decides** to call
   `queueActions` with each prediction as an action

```
categorizePostings(account_id)
  → dry_run predictions[] returned to LLM
                    ↓
        LLM reads predictions, calls:
        queueActions({
          action_type: 'categorize_transaction',
          actions: [{ title, payload: { posting_id, predicted_account_id }, confidence }]
        })
                    ↓
        pending_action rows created
                    ↓
        session → awaiting_approval
```

**Why the LLM is involved here**: The LLM can filter unreliable predictions
based on reasoning, write human-readable titles, and group actions
meaningfully. This requires interpretation, not just data transformation.

### The Dry-Run Pattern

Both strategies rely on the analysis tool **not writing to the database**:

| Tool | What it returns | Writes to DB? |
|------|-----------------|---------------|
| `suggestReconciliationMatches` | Match suggestions with confidence scores | No |
| `categorizePostings` | Predictions with confidence scores | No (`dry_run: true`) |

Database writes happen **only** in the executor, **only** after human approval.

### When to Choose Which Strategy

| | Deterministic Builder | LLM-Driven |
|---|---|---|
| **Use when** | Tool output maps 1:1 to pending actions, no interpretation needed | Tool output needs filtering, judgement, or presentation decisions |
| **Reliability** | Guaranteed — no LLM variability | Depends on prompt quality |
| **LLM cost** | Saves one full LLM round-trip per action step | Costs one extra LLM turn |
| **Flexibility** | Fixed logic — new payload fields require a code change | LLM adapts to new data shapes |
| **Example** | Reconciliation: structured matches → structured actions | Categorization: AI predictions → human-readable proposals |

### The Shared Execution Layer

Regardless of how a pending action was created (builder or LLM), the executor
that runs on approval is **identical**. The executor reads `action.payload`
and doesn't know or care whether a builder or the LLM wrote it. This
decoupling means you can switch a template from LLM-driven to builder-driven
without changing the executor.

### Payload as Contract

A pending action's `payload` is a **self-contained instruction** —
everything the executor needs at approval time, no re-querying required:

| Action type | Payload fields | Written by | Read by |
|-------------|---------------|------------|---------|
| `reconcile_posting` | `posting_id`, `matched_reference`, `match_type`, `matched_id`, `confidence`, `amount` | `ReconciliationActionBuilder` | `ReconcilePostingExecutor` |
| `categorize_transaction` | `posting_id`, `predicted_account_id`, `predicted_account_name`, `confidence_score` | LLM via `queueActions` | `CategorizeTransactionExecutor` |
| `create_posting` | Full posting fields (`description`, `amount`, `account_id`, etc.) | LLM via `queueActions` | `CreatePostingExecutor` |

---

## Pending Action Executor

**File**: `executors/PendingActionExecutor.ts`

Runs the financial side effect when a user approves a pending action.

### Executor Registry

```typescript
const EXECUTORS: Record<string, PendingActionHandler> = {
  reconcile_posting:       ReconcilePostingExecutor,
  create_posting:          CreatePostingExecutor,
  categorize_transaction:  CategorizeTransactionExecutor,
  invoice_match:           PlaceholderExecutor,
  send_email:              PlaceholderExecutor,
  escalate_collection:     PlaceholderExecutor,
};
```

`PlaceholderExecutor` logs intent and returns success — it does not perform a
real side effect. Used for action types not yet fully implemented. See
[14-SHORTFALLS_AND_ROADMAP.md](./14-SHORTFALLS_AND_ROADMAP.md) for status.

### Execution Trigger

An executor fires if:
- `pending_action.on_approve === 'execute_immediately'` **OR**
- `PendingActionExecutor.hasExecutor(action_type)` is true

The second condition is intentional: it prevents the LLM from blocking
execution by accidentally setting `on_approve` to something else.

### Executor Interface

```typescript
interface PendingActionHandler {
  execute(action: PendingAction, auth: AuthContext): Promise<ExecutionResult>;
}

interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}
```

### `CategorizeTransactionExecutor`

Reads `action.payload`:
```json
{
  "posting_id": "post_abc",
  "predicted_account_id": "acco_xyz"
}
```
Updates `posting.credit_account_id` (or `account_id` depending on direction)
to `predicted_account_id`. Direction rules are the
[money direction cheat sheet](./01-OVERVIEW.md#money-direction-cheat-sheet) in
01-OVERVIEW.

### `ReconcilePostingExecutor`

Reads `action.payload`:
```json
{
  "posting_id": "post_abc",
  "matched_reference": "payment_receipt:payr_xxx:REC-001"
}
```
Calls `confirmReconciliation(posting_id, auth)` → creates payment receipt if
needed, sets `posting.payment_receipt_id` and `reconciliation_status =
'MATCHED'`.

### `CreatePostingExecutor`

Creates a new `posting` record from the action payload.

---

## Approval Flow End-to-End

```
User approves action:
POST /api/agent/pending-actions/:id/resolve { status: 'approved' }
  ↓
PendingActionService.resolvePendingAction(id, { status: 'approved' }, auth)  ← auth from HTTP request
  ↓
  1. Update pending_action.status = 'approved'
  2. Check PendingActionExecutor.hasExecutor(action_type) → true
  3. executor.execute(action, auth)
     → ReconcilePostingExecutor: confirmReconciliation(posting_id) → MATCHED
     → CategorizeTransactionExecutor: update posting counter-account
  4. On success: pending_action.status = 'executed', write execution_result
  5. On failure: status stays 'approved', write execution_error
  6. Increment completed_actions_count
  7. checkAllPendingActionsResolved(session_id):    ← called after EVERY resolve
     → Counts remaining pending actions (status = 'pending')
     → If 0 remain AND session.status = 'awaiting_approval':

       Path A: Deterministic report formatter
         → ReportFormatterRegistry.get(goal_model, reportStep, session) → matches
         → formatter.format(accumulated_context, session) → report text
         → Write report as agent_message
         → session.status = 'completed'

       Path B: More steps — resume LLM
         → shouldAutoContinue({ ...session, status: 'executing' }) → true
         → session.status = 'executing'
         → setImmediate(() => agentService.handleRequest(
             "All pending actions reviewed. Continue...", auth, [], context, session_id
           ))
         ← Note: auth comes from the HTTP request that resolved the LAST pending action

       Path C: No more steps
         → session.status = 'completed'
```

**Important**: The `auth` object used for the auto-continuation
`setImmediate` in Path B comes from the HTTP request that resolved the last
pending action. This means the continuation runs under the same user context
as the approver, not the original session creator.

---

## What's Next

- **07-WORKED_EXAMPLES.md** — full reconciliation and categorization traces
  using the builders/executors/strategies described here
- **13-EXTENDING.md** — recipes for adding a new builder, formatter, or
  executor
