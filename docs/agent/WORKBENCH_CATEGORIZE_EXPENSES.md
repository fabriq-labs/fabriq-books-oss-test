# Deep Dive: Categorise Expenses — How One Template Works End to End

**Purpose**: A step-by-step walkthrough of a single Categorise Expenses session from the first HTTP request to the final DB write. This document shows exactly what the LLM receives, what it returns, what each tool does, and how state changes in the database at every point.

**Assumes**: You've read `WORKBENCH_BACKEND.md`. This document is the practical companion.

> **Build status note**: The `categorizePostings` tool and `categorize_transaction` executor are currently being built (task #11). Sections that describe these components reflect the intended design. All other components described here (`categorizeTransactionBatch`, session tools, `PendingActionService`) are fully implemented.

---

## Table of Contents

1. [The Template](#1-the-template)
2. [What the User Does](#2-what-the-user-does)
3. [Turn 1 — Planning](#3-turn-1--planning)
4. [Turn 2 — Query Step: Find Uncategorized Postings](#4-turn-2--query-step-find-uncategorized-postings)
5. [Turn 3 — Action Step: Get Predictions and Queue](#5-turn-3--action-step-get-predictions-and-queue)
6. [Human Review: Approving Actions](#6-human-review-approving-actions)
7. [Turn 4 — Report Step](#7-turn-4--report-step)
8. [Complete Data Flow Diagram](#8-complete-data-flow-diagram)
9. [What Gets Written to the Database](#9-what-gets-written-to-the-database)
10. [How to Add a New Template Like This](#10-how-to-add-a-new-template-like-this)

---

## 1. The Template

The "Categorise Expenses" template is one of five system templates seeded in `agent_template`. It targets the `posting` model and guides the agent to:
1. Find postings that have a known account on one side but no counter-account (uncategorized)
2. Use an ML prediction tool to suggest which expense/income account each posting belongs to
3. Queue those suggestions as `categorize_transaction` pending actions for human review
4. Write approved categorizations to the `posting` record

**Template record** (stored in `agent_template`):

| Column | Value |
|--------|-------|
| `name` | Categorise Expenses |
| `goal_model` | `posting` |
| `default_mode` | `supervised` |
| `icon` | `tag` |
| `user_hint` | e.g. "Categorise all uncategorised HDFC expenses for March" |
| `system_prompt` | (see below) |

**The template's `system_prompt`** is the key extra instruction block. It adds context that the base prompt does not have:

```
You are helping categorize uncategorized bank postings in Fabriq's double-entry accounting system.

IMPORTANT CONTEXT:
- A "posting" in Fabriq represents one side of a double-entry transaction.
- An uncategorized posting has a primary account (e.g., "HDFC Current Account") but
  its counter-account is null — meaning we don't know what expense or income category
  it belongs to.
- Your goal is to predict the correct counter-account for each uncategorized posting.

TOOLS AVAILABLE FOR THIS TASK:
- Use analyticsQuery to find uncategorized postings (WHERE credit_account_id IS NULL
  or debit_account_id is null depending on direction)
- Use categorizePostings to get AI predictions for a set of uncategorized postings
  given a primary account. This tool returns predictions with confidence scores.
- Use queueActionBatch to queue approved predictions as categorize_transaction actions.

SEARCH TIPS:
- When looking for an account by name, use broad keyword search via ILIKE '%keyword%'
  rather than exact matches. Users may say "HDFC" and mean "HDFC Current Account 1234".
- The categorizePostings tool accepts an account_id, not a name — resolve the account
  name to an ID first using analyticsQuery.

IMPORTANT RULES:
- Never write categorizations directly. Always use queueActionBatch to create
  pending actions for human review.
- Pass the FULL list of predictions from categorizePostings into accumulated_context_update
  so the action step can use them.
```

---

## 2. What the User Does

1. Opens the Workbench and selects the "Categorise Expenses" template card
2. Types a goal: *"Categorise all uncategorised HDFC expenses for March 2025"*
3. Clicks Submit

This triggers two API calls in sequence:

**Call 1** — `POST /api/agent/sessions`
```json
{
  "goal": "Categorise all uncategorised HDFC expenses for March 2025",
  "mode": "supervised",
  "goalModel": "posting",
  "templateId": "atpl_..."
}
```

Response: `{ "id": "ses_abc123", "status": "planning", ... }`

**Call 2** — `POST /api/agent/chat/stream`
```json
{
  "message": "Categorise all uncategorised HDFC expenses for March 2025",
  "sessionId": "ses_abc123",
  "context": { "modelName": "posting" }
}
```

This is the call that starts the agent. The frontend opens an SSE connection to `GET /api/agent/sessions/ses_abc123/events` simultaneously to receive live updates.

---

## 3. Turn 1 — Planning

### What `AgentService.handleStreamingRequest` assembles

**File**: `backend/src/agent/AgentService.ts` (lines ~541–660)

The service runs through its setup sequence:

**Step A — Load session and check history**

```typescript
const session = await getAgentSession('ses_abc123');
// session.status === 'planning', session.plan === null
const sessionMessages = await listAgentMessages('ses_abc123');
// sessionMessages === []  (no history yet)
const isFirstTurn = true;  // no messages
const justCreatedPlan = false;  // plan is null
```

**Step B — Assemble the system prompt**

`createSystemPrompt()` calls `DynamicPromptManager`, which fetches prompt templates from the database and assembles:

```
[global agent rules — tool response handling, ID restriction, etc.]
[list of accessible models for this org: posting, account, payment_receipt, ...]
[multi-tenancy rules: always filter by org_id]
```

Then `template.system_prompt` is prepended. Then `buildSessionContextBlock()` appends:

```
## Active Session Context
Goal: Categorise all uncategorised HDFC expenses for March 2025
Mode: supervised
Status: planning
Pending actions: 0 awaiting review
Accumulated: {}

## Full Plan
[]

#### SESSION AGENT DIRECTIVE
You are operating inside an active agent session. Follow this decision tree exactly:

IF status is 'planning' AND no plan exists:
  → Call createPlan IMMEDIATELY. Decompose the goal into 3-5 steps.
  ...
```

**Step C — Select tools**

`ToolManager.getUnifiedTools('posting', auth, context, 'ses_abc123')` returns:

```
searchRecords           (model tool)
createRecord            (model tool)
updateRecord            (model tool)
advancedSqlQuery        (model tool)
suggestReconciliationMatches  (model tool, posting-specific)
categorizePostings      (model tool, posting-specific) ← task #11
getAnalyticsContext     (analytics tool)
analyticsQuery          (analytics tool)
createPlan              (session tool)
completeStep            (session tool)
queueAction             (session tool)
queueActionBatch        (session tool)
```

**Step D — Build `allMessages`**

Since `isFirstTurn` is true, there is no session history. `allMessages` is:

```typescript
[
  { role: 'system', content: '<full assembled system prompt>' },
  { role: 'user',   content: 'Categorise all uncategorised HDFC expenses for March 2025' }
]
```

**Step E — Emit `step_started` event**

```json
{ "type": "step_started", "data": { "step_index": null, "status": "planning" } }
```

**Step F — Call `streamText()`**

The AI SDK sends `allMessages` + all tools to the LLM. The `SESSION_DIRECTIVE` says *"IF status is 'planning' AND no plan exists → call createPlan IMMEDIATELY."* The LLM reads this and outputs a `createPlan` tool call.

### What the LLM returns

The LLM outputs a `tool_use` block (no text, just the tool call):

```json
{
  "tool": "createPlan",
  "args": {
    "goal": "Categorise all uncategorised HDFC bank postings for March 2025",
    "steps": [
      {
        "type": "query",
        "title": "Find uncategorised HDFC postings",
        "description": "Query postings where the HDFC account has no counter-account, filtered to March 2025",
        "requires_approval": false
      },
      {
        "type": "action",
        "title": "Predict and queue categorisations",
        "description": "Use categorizePostings to get AI predictions, then queue as categorize_transaction pending actions",
        "requires_approval": true
      },
      {
        "type": "report",
        "title": "Summarise categorisation results",
        "description": "Show how many postings were categorised, with breakdown by confidence",
        "requires_approval": false
      }
    ]
  }
}
```

### What `createPlan.execute()` does

**File**: `backend/src/agent/tools/sessionTools.ts` (lines ~55–79)

```typescript
const plan: PlanStep[] = [
  { index: 0, type: 'query',  title: 'Find uncategorised HDFC postings', status: 'in_progress', ... },
  { index: 1, type: 'action', title: 'Predict and queue categorisations', status: 'pending', ... },
  { index: 2, type: 'report', title: 'Summarise categorisation results',  status: 'pending', ... },
];

await updateAgentSession('ses_abc123', {
  plan,
  status: 'executing',
  current_step_index: 0,
});
```

**DB state after Turn 1:**
- `agent_session.status` = `'executing'`
- `agent_session.plan` = the 3-step plan JSON
- `agent_session.current_step_index` = `0`
- `agent_session.name` = (auto-generated asynchronously) "HDFC March Expense Categorisation"

**SSE events emitted:**
- `tool_called` — `{ tool_name: 'createPlan', step_index: null }`
- `step_completed` — `{ step_index: null, result_preview: '' }`
- `session_status_changed` — `{ status: 'executing' }`

**Auto-continuation check:** `shouldAutoContinue()` → status is `'executing'`, current step exists → **true**. `AgentService` fires `handleRequest()` recursively.

---

## 4. Turn 2 — Query Step: Find Uncategorized Postings

### What `allMessages` looks like now

```typescript
[
  { role: 'system',    content: '<system prompt with updated session context block>' },
  // ↑ now shows: Status: executing — Step 1 of 3: Find uncategorised HDFC postings
  // ↑ includes: Full Plan (because justCreatedPlan=true this turn)

  { role: 'user',      content: 'Categorise all uncategorised HDFC expenses for March 2025' },
  { role: 'assistant', content: [{ type: 'tool-call', toolName: 'createPlan', args: {...} }] },
  { role: 'tool',      content: [{ type: 'tool-result', toolName: 'createPlan',
                                   result: 'Plan created with 3 steps. Now executing step 1...' }] },
  // ↑ session message history, loaded from agent_message table

  { role: 'user',      content: 'Continue with step 1: Find uncategorised HDFC postings' }
  // ↑ auto-continuation prompt
]
```

The `SESSION_DIRECTIVE` now says: *"IF status is 'executing' AND current step type is 'query' → Use the appropriate existing tools..."*

### LLM decides to use `analyticsQuery`

Before querying, the LLM may call `getAnalyticsContext` to understand the schema. Then it constructs a SQL query:

**Tool call 1: `getAnalyticsContext`**
Returns schema info: the `posting` table has columns `id`, `description`, `amount`, `value_date`, `account_id` (FK to `account`), `credit_account_id` (nullable — null means uncategorized), `debit_account_id`, `org_id`, etc.

**Tool call 2: `analyticsQuery`**
```json
{
  "query": "SELECT p.id, p.description, p.amount, p.value_date, a.name as account_name FROM posting p JOIN account a ON p.account_id = a.id WHERE p.org_id = '{{org_id}}' AND a.name ILIKE '%HDFC%' AND p.credit_account_id IS NULL AND p.value_date >= '2025-03-01' AND p.value_date < '2025-04-01' ORDER BY p.value_date",
  "description": "Find uncategorized postings for HDFC accounts in March 2025"
}
```

`analyticsQuery.execute()`:
1. Validates SQL is read-only (`SELECT` only)
2. Checks org_id is present and matches `auth.user.org_id`
3. Runs the query via `prisma.$queryRawUnsafe`
4. Returns rows with column metadata

**Tool result (abbreviated):**
```json
{
  "rows": [
    { "id": "pos_1", "description": "MSEDCL Bill Payment", "amount": -4500, "value_date": "2025-03-05", "account_name": "HDFC Current 1234" },
    { "id": "pos_2", "description": "AWS India Private", "amount": -12000, "value_date": "2025-03-08", "account_name": "HDFC Current 1234" },
    { "id": "pos_3", "description": "UPI-RENT-MAR", "amount": 45000, "value_date": "2025-03-10", "account_name": "HDFC Current 1234" },
    ...
    // 18 rows total
  ],
  "rowCount": 18,
  "columns": ["id", "description", "amount", "value_date", "account_name"]
}
```

### LLM calls `completeStep`

```json
{
  "step_index": 0,
  "result_summary": "Found 18 uncategorized postings for HDFC Current 1234 in March 2025. Mix of expenses (electricity, cloud services, rent payments) and income entries.",
  "accumulated_context_update": {
    "uncategorized_count": 18,
    "hdfc_account_id": "acc_hdfc_1234",
    "posting_ids": ["pos_1", "pos_2", "pos_3", "...15 more"]
  }
}
```

### What `completeStep.execute()` does

**File**: `backend/src/agent/tools/sessionTools.ts` (lines ~94–263)

```typescript
// 1. Mark step 0 complete
plan[0].status = 'completed';
plan[0].result_summary = 'Found 18 uncategorized postings...';
plan[0].completed_at = '2025-03-31T...';

// 2. Merge accumulated context
mergedContext = { uncategorized_count: 18, hdfc_account_id: 'acc_...', posting_ids: [...] };

// 3. Dispatcher: check step 1 (action step)
const builder = ActionBuilderRegistry.get('posting', plan[1]);
// → No builder registered for categorize_transaction action steps
// → builder === null → break (LLM fallback)

// 4. cursor stayed at 1, session still executing
await updateAgentSession('ses_abc123', {
  plan,
  current_step_index: 1,
  accumulated_context: mergedContext,
  status: 'executing',
});
```

**DB state after Turn 2:**
- `agent_session.current_step_index` = `1`
- `agent_session.accumulated_context` = `{ uncategorized_count: 18, hdfc_account_id: 'acc_...', posting_ids: [...] }`
- `agent_session.plan[0].status` = `'completed'`
- `agent_message` — 4 new rows: user turn, assistant (tool calls), tool results, assistant text

**SSE events emitted:**
- `tool_called` × 3 (getAnalyticsContext, analyticsQuery, completeStep)
- `step_completed` — `{ step_index: 0, result_preview: 'Found 18 uncategorized postings...' }`

**Auto-continuation:** `shouldAutoContinue()` → status `'executing'` → **true**. Fire Turn 3.

---

## 5. Turn 3 — Action Step: Get Predictions and Queue

### What `allMessages` looks like now

The session context block now shows:

```
## Active Session Context
Goal: Categorise all uncategorised HDFC expenses for March 2025
Mode: supervised
Status: executing — Step 2 of 3: Predict and queue categorisations
Pending actions: 0 awaiting review
Accumulated: {"uncategorized_count":18,"hdfc_account_id":"acc_...","posting_ids":["pos_1",...]}
```

The full session message history (5 turns of user/assistant/tool exchanges) is included in `allMessages`.

The `SESSION_DIRECTIVE` says: *"IF status is 'executing' AND current step type is 'action' → The system may handle this step automatically... If the step is still active after completeStep returns, call queueActionBatch..."*

### LLM calls `categorizePostings`

Seeing the `posting_ids` and `hdfc_account_id` in `accumulated_context`, the LLM calls:

```json
{
  "tool": "categorizePostings",
  "args": {
    "account_id": "acc_hdfc_1234"
  }
}
```

### What `categorizePostings.execute()` does (task #11)

**Planned file**: `backend/src/agent/tools/categorizePostings.ts`

```typescript
// 1. Query postings where counter-account is null
const uncategorizedPostings = await prisma.posting.findMany({
  where: {
    org_id: auth.user.org_id,
    account_id: params.account_id,
    credit_account_id: null,  // or debit_account_id depending on type
  },
  include: { account: true },
});

// 2. Call the batch categorizer in dry_run mode — NO DB writes
const result = await categorizeTransactionBatchHandler.execute(
  connector,
  {
    posting_ids: uncategorizedPostings.map(p => p.id),
    options: { dry_run: true }
  },
  context,
  auth
);

// 3. Return structured predictions
return result.data.results;
```

The `categorizeTransactionBatch` handler (**existing file**: `backend/src/agent/handlers/erp/categorizeTransactionBatch.ts`) does the heavy ML work:

1. Fetches all `account` records for the org, grouped by type (expense, income, asset, liability)
2. Tries **historical matching** first: searches past approved categorizations for similar descriptions using fuzzy text match. If found, assigns high confidence (0.95) without calling an LLM.
3. For postings with no historical match, calls the **categorization LLM** (`getModel('categorization')` — a smaller, cheaper model than the agent model) using `generateObject` with a structured Zod schema:

```
System prompt (buildBulkSystemPrompt):
"You are a financial transaction categorization assistant...
 - 'Money OUT (expense)' → suggest EXPENSE accounts
 - 'Money IN (income)' → suggest INCOME or ASSET accounts
 - Only select account IDs from the provided list..."

User prompt (buildBulkPrompt):
"Categorize each transaction below by selecting the most appropriate account_id.

AVAILABLE ACCOUNTS:
Expense:
  acc_elec_001 — Electricity Expense
  acc_cloud_001 — Cloud Infrastructure Expense
  acc_rent_001 — Rent Expense
  ...

TRANSACTIONS TO CATEGORIZE:
0. 'MSEDCL Bill Payment' | Amount: 4500.00 | Money OUT (expense)
1. 'AWS India Private' | Amount: 12000.00 | Money OUT (expense)
2. 'UPI-RENT-MAR' | Amount: 45000.00 | Money IN (income)
...
"
```

4. The categorization LLM returns structured JSON (via `generateObject`):
```json
{
  "categorizations": [
    { "index": 0, "predicted_account_id": "acc_elec_001", "confidence_score": 0.95, "reasoning": "MSEDCL is Maharashtra electricity provider — Electricity Expense" },
    { "index": 1, "predicted_account_id": "acc_cloud_001", "confidence_score": 0.88, "reasoning": "AWS is a cloud service provider" },
    { "index": 2, "predicted_account_id": "acc_rental_income_001", "confidence_score": 0.82, "reasoning": "UPI transfer with RENT keyword, Money IN = rental income received" },
    ...
  ]
}
```

5. Returns predictions (no DB writes because `dry_run: true`)

**Tool result returned to the agent LLM:**
```json
[
  { "posting_id": "pos_1", "description": "MSEDCL Bill Payment", "amount": -4500, "predicted_account_id": "acc_elec_001", "predicted_account_name": "Electricity Expense", "confidence": "high", "confidence_score": 0.95, "reasoning": "MSEDCL is Maharashtra electricity board" },
  { "posting_id": "pos_2", "description": "AWS India Private", "amount": -12000, "predicted_account_id": "acc_cloud_001", "predicted_account_name": "Cloud Infrastructure Expense", "confidence": "high", "confidence_score": 0.88, "reasoning": "AWS is a cloud service provider" },
  { "posting_id": "pos_3", "description": "UPI-RENT-MAR", "amount": 45000, "predicted_account_id": "acc_rental_income_001", "predicted_account_name": "Rental Income", "confidence": "medium", "confidence_score": 0.75, "reasoning": "Incoming payment with rent keyword" },
  // ... 15 more
]
```

### LLM calls `queueActionBatch`

The LLM now takes the predictions and queues them as pending actions. Critically, the `SESSION_DIRECTIVE` told it to pass the full prediction list in `accumulated_context_update` when calling `completeStep`. But first it queues the batch:

```json
{
  "tool": "queueActionBatch",
  "args": {
    "action_type": "categorize_transaction",
    "batch_id": "ses_abc123-step-1",
    "on_approve": "execute_immediately",
    "actions": [
      {
        "title": "Categorise: MSEDCL Bill Payment",
        "payload": {
          "posting_id": "pos_1",
          "predicted_account_id": "acc_elec_001",
          "predicted_account_name": "Electricity Expense",
          "confidence_score": 0.95,
          "reasoning": "MSEDCL is Maharashtra electricity board"
        },
        "confidence": "high",
        "confidence_score": 0.95
      },
      // ... 17 more actions
    ]
  }
}
```

### What `queueActionBatch.execute()` does

**File**: `backend/src/agent/tools/sessionTools.ts` (lines ~327–403)

```typescript
// mode === 'supervised', so all actions are queued (no immediate execution)
const queuedActions = await createPendingActionBatch(
  actions.map(a => ({ title, description, payload, confidence, confidence_score })),
  {
    org_id: auth.user.org_id,
    session_id: 'ses_abc123',
    action_type: 'categorize_transaction',
    batch_id: 'ses_abc123-step-1',
    on_approve: 'execute_immediately',
    created_by: 'agent',
  }
);
// Creates 18 pending_action records
```

**`PendingActionService.createPendingActionBatch()`** also:
- Increments `agent_session.pending_actions_count` by 18
- Emits `action_queued` event for each action
- Emits `inbox_count_changed` event with new total

### LLM calls `completeStep`

```json
{
  "step_index": 1,
  "result_summary": "Queued 18 categorize_transaction pending actions. 12 high-confidence, 4 medium-confidence, 2 low-confidence.",
  "accumulated_context_update": {
    "categorization_summary": {
      "total": 18,
      "high": 12,
      "medium": 4,
      "low": 2
    }
  }
}
```

### `completeStep` dispatcher at the action step

```typescript
// Step 1 completed. cursor moves to 2 (report step).
// Dispatcher checks: is there a report formatter for 'posting'?
const formatter = ReportFormatterRegistry.get('posting', plan[2], session);
// → No formatter registered → break (LLM will write the report)

// pending_actions_count (18) > completed_actions_count (0) → awaiting_approval
newStatus = 'awaiting_approval';

await updateAgentSession('ses_abc123', {
  plan,
  current_step_index: 2,
  accumulated_context: { ...mergedContext, categorization_summary: {...} },
  status: 'awaiting_approval',
});
```

**DB state after Turn 3:**
- `agent_session.status` = `'awaiting_approval'`
- `agent_session.current_step_index` = `2`
- `agent_session.pending_actions_count` = `18`
- 18 new `pending_action` rows with `status = 'pending'`

**SSE events emitted:**
- `tool_called` × 3 (categorizePostings, queueActionBatch, completeStep)
- `step_completed` — step 1
- `session_status_changed` — `{ status: 'awaiting_approval' }`
- `action_queued` × 18
- `inbox_count_changed` — `{ count: 18 }`

**Auto-continuation:** `shouldAutoContinue()` → status is `'awaiting_approval'` → **false**. Loop pauses. The agent is idle.

---

## 6. Human Review: Approving Actions

The frontend renders `AwaitingApprovalView` because `session.status === 'awaiting_approval'`. Each pending action shows:
- Type badge: "categorize_transaction"
- Confidence badge: green (high) / amber (medium) / red (low)
- Primary text: posting description
- Secondary text: "→ Electricity Expense"
- Amount: -4,500

The user can approve individually, bulk-approve all high-confidence, or open in the global inbox.

### Approval call

`POST /api/agent/pending-actions/pa_xyz/resolve`
```json
{
  "status": "approved",
  "resolved_by": "user_sanjay_gupta"
}
```

### What `PendingActionService.resolvePendingAction()` does

**File**: `backend/src/agent/services/PendingActionService.ts`

```typescript
// 1. Update the pending_action record
await prisma.pending_action.update({
  where: { id: 'pa_xyz' },
  data: {
    status: 'approved',
    resolved_by: 'user_sanjay_gupta',
    resolved_at: new Date(),
  }
});

// 2. Run the executor
const result = await PendingActionExecutor.execute(action, auth);
// → CategorizeTransactionExecutor.execute() (task #11)
```

### What `CategorizeTransactionExecutor` does (task #11)

**Planned addition to**: `backend/src/agent/executors/PendingActionExecutor.ts`

```typescript
const CategorizeTransactionExecutor: PendingActionHandler = {
  actionType: 'categorize_transaction',

  async execute(action, auth): Promise<ExecutionResult> {
    const { posting_id, predicted_account_id, confidence_score } = action.payload;

    // 1. Load the posting to determine direction
    const posting = await prisma.posting.findUnique({
      where: { id: posting_id },
      include: { account: true, credit_account: true }
    });

    // 2. Determine which field to write
    const direction = determineTransactionDirection(
      posting.amount,
      posting.account.type,
      posting.credit_account?.type ?? []
    );
    const fieldToUpdate = getFieldToUpdate(direction);
    // → 'credit_account_id' for money_out, 'debit_account_id' for money_in

    // 3. Write the categorization
    await updatePostingWithCategorization(
      posting_id,
      predicted_account_id,
      confidence_score,
      fieldToUpdate,
      auth.user.id
    );
    // → Sets posting.credit_account_id (or debit_account_id) + posting.ai_cat_score

    return { success: true, data: { posting_id, field_updated: fieldToUpdate } };
  }
};
```

`updatePostingWithCategorization()` (existing in `categorizationUtils.ts`):
```typescript
await prisma.posting.update({
  where: { id: postingId },
  data: {
    [fieldToUpdate]: predictedAccountId,
    ai_cat_score: confidenceScore,
    modified_by: userId,
  }
});
```

This is the **only place** in the entire session flow where a financial record is written. Everything before this point was read-only or queuing intent.

### After each approval

```typescript
// Increment completed_actions_count
await updateAgentSession('ses_abc123', {
  completed_actions_count: { increment: 1 }
});

// Check if all done
const session = await getAgentSession('ses_abc123');
if (session.completed_actions_count >= session.pending_actions_count) {
  // All 18 approved → resume agent
  // Check for deterministic report formatter
  const formatter = ReportFormatterRegistry.get(session.goal_model, currentStep, session);
  if (!formatter) {
    // No formatter → resume agent for report step
    await updateAgentSession('ses_abc123', { status: 'executing' });
    await handleRequest(continuationPrompt, auth, [], context, 'ses_abc123');
  }
}
```

---

## 7. Turn 4 — Report Step

When all 18 actions are resolved, `PendingActionService` transitions the session back to `'executing'` and fires `handleRequest()` for the report step.

### What `allMessages` looks like

```
[system prompt with]:
  Status: executing — Step 3 of 3: Summarise categorisation results
  Accumulated: {
    "uncategorized_count": 18,
    "hdfc_account_id": "acc_...",
    "categorization_summary": { "total": 18, "high": 12, "medium": 4, "low": 2 }
  }
```

Plus the full session message history: all 3 prior turns' tool calls and results.

The `SESSION_DIRECTIVE` says: *"IF status is 'executing' AND current step type is 'report' → read the accumulated_context and each step's result_summary. Write a concise plain-text summary..."*

### LLM writes the report

The LLM composes a text summary (no tool calls needed for a simple report):

```
Categorisation complete for HDFC Current 1234 — March 2025.

18 postings were reviewed:
- 12 high-confidence: Electricity (3), Cloud services (4), Salary payroll (2), Bank charges (2), Miscellaneous expense (1)
- 4 medium-confidence: UPI transfers categorised as Rental Income
- 2 low-confidence: Generic UPI payments — categorised as Other Expenses, recommend manual review

All categorisations have been written to the posting ledger. Your P&L for March 2025 now includes these entries.
```

### LLM calls `completeStep`

```json
{
  "step_index": 2,
  "result_summary": "Categorised 18 HDFC postings for March 2025: 12 high, 4 medium, 2 low confidence."
}
```

`completeStep` sees `cursor >= plan.length` (cursor would be 3, plan has 3 steps) → sets `newStatus = 'completed'`.

**Final DB state:**
- `agent_session.status` = `'completed'`
- `agent_session.completed_at` = now
- All 3 plan steps: `status = 'completed'`
- 18 `posting` records: each has `credit_account_id` (or `debit_account_id`) set + `ai_cat_score`
- 18 `pending_action` records: all `status = 'executed'`

**SSE events:**
- `step_completed` — step 2
- `session_status_changed` — `{ status: 'completed' }`

---

## 8. Complete Data Flow Diagram

```
User types goal
      │
      ▼
POST /sessions            → creates agent_session (status=planning)
      │
      ▼
POST /chat/stream ─────────────────────────────────────────────────────────────┐
      │                                                                         │
      │  Turn 1: Planning                                                       │
      │  allMessages: [system, user_goal]                                       │
      │  LLM → createPlan({steps: [query, action, report]})                     │
      │  createPlan.execute() → session.plan set, status='executing'            │
      │  shouldAutoContinue() → true ─────────────────────────────────────────┐│
      │                                                                        ││
      │  Turn 2: Query step                                                    ││
      │  allMessages: [system, user, plan_tool_calls, continuation]            ││
      │  LLM → getAnalyticsContext() → analyticsQuery(SQL)                     ││
      │  → completeStep(0, summary, {posting_ids, hdfc_account_id})            ││
      │  completeStep.execute() → step 0 complete, cursor→1                    ││
      │  ActionBuilderRegistry.get('posting', step1) → null (LLM fallback)     ││
      │  session.current_step_index=1, accumulated_context updated             ││
      │  shouldAutoContinue() → true ─────────────────────────────────────────┐││
      │                                                                       │││
      │  Turn 3: Action step                                                  │││
      │  allMessages: [system, ...history, continuation]                      │││
      │  LLM → categorizePostings({account_id})                               │││
      │    └─ categorizeTransactionBatch(dry_run:true)                        │││
      │         ├─ historical matching (no LLM call for known patterns)       │││
      │         └─ categorization LLM call (separate model, generateObject)   │││
      │  LLM → queueActionBatch({18 actions})                                 │││
      │    └─ createPendingActionBatch() → 18 pending_action rows             │││
      │    └─ emit action_queued ×18, inbox_count_changed                     │││
      │  LLM → completeStep(1, summary)                                       │││
      │  completeStep.execute() → status='awaiting_approval'                  │││
      │  shouldAutoContinue() → false ← LOOP PAUSES ◄─────────────────────────┘││
      │                                                                          ││
      ▼                                                                          ││
SSE: session_status_changed (awaiting_approval)                                  ││
Frontend shows AwaitingApprovalView                                              ││
                                                                                 ││
User approves actions (one by one or bulk)                                       ││
POST /pending-actions/:id/resolve                                                ││
  └─ CategorizeTransactionExecutor.execute()                                     ││
       └─ updatePostingWithCategorization() ← FINANCIAL DB WRITE                ││
  └─ completed_actions_count++                                                   ││
  └─ when all 18 done: status='executing', fire handleRequest() ─────────────────┘│
                                                                                   │
  Turn 4: Report step                                                              │
  LLM → writes summary text → completeStep(2)                                     │
  completeStep → status='completed' ────────────────────────────────────────────────┘
      │
      ▼
SSE: session_status_changed (completed)
Frontend shows CompletedView
```

---

## 9. What Gets Written to the Database

A complete session produces writes across 5 tables:

| Table | Writes | When |
|-------|--------|------|
| `agent_session` | 1 row created + ~8 updates (plan, status changes, counts, accumulated_context, name, completed_at) | Throughout |
| `agent_message` | ~12–15 rows (user/assistant/tool turns across 4 agent calls) | After each LLM call |
| `pending_action` | 18 rows created | Turn 3, queueActionBatch |
| `pending_action` | 18 rows updated (status, resolved_by, execution_result) | During human review |
| `posting` | 18 rows updated (credit_account_id + ai_cat_score) | During human review, per executor |
| `llm_trace` | 4 rows (one per LLM call) | After each LLM call |
| `llm_trace_step` | ~8 rows (tool call rounds within each LLM call) | After each LLM call |

The critical constraint: **`posting` records are only modified by the executor, never by the agent directly.** The agent queues intent; humans approve; the executor writes. This is enforced by:
- The `SESSION_DIRECTIVE`: *"NEVER execute financial actions directly in supervised mode"*
- The template `system_prompt`: *"Always use queueActionBatch to create pending actions for human review"*
- The `categorizePostings` tool always runs with `dry_run: true`

---

## 10. How to Add a New Template Like This

If you were adding a "Categorise Purchase Invoices" template that works the same way but for the `invoice` model:

**1. Add the template to the database**
Insert a row into `agent_template` with the appropriate `system_prompt`, `goal_model = 'invoice'`, and `user_hint`. The system prompt should describe what "uncategorized" means for invoices and which tools to use.

**2. Add the tool to the target model**
In `ToolManager.ts`, add the new tool to the `invoice` model's tool block — similar to how `categorizePostings` is added to the `posting` block.

**3. Implement the tool** (in `tools/`)
The tool should follow the same pattern as `categorizePostings`:
- Accept identifying parameters (e.g., `supplier_id`, `date_range`)
- Query records needing processing
- Call the underlying handler with `dry_run: true`
- Return structured predictions

**4. Implement the executor** (in `executors/PendingActionExecutor.ts`)
Register a new executor for the new `action_type`. The executor receives the approved payload and writes to the database.

**5. Seed the template**
Either add to the seed SQL file or insert directly. For system templates (`org_id = null`), they are visible to all orgs.

**6. Test with an E2E test**
Copy the pattern from `__tests__/v2-categorise-expenses-e2e.test.ts` and adapt for the new template. Run with `--runInBand --forceExit` because it hits a real database.

---

*End of document.*
