# Fabriq Agent — Extending the Agent

**Audience**: Anyone adding a new tool, ERP handler, action builder, report
formatter, or executor.
**Companion docs**: [05-TOOLS.md](./05-TOOLS.md),
[06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md)

---

## Running Example: "Write Off Small Balances"

Each recipe below is illustrated with the same hypothetical feature: an
action template that finds postings with a tiny unreconciled balance
(`abs(amount) < 100`, e.g. ₹40 rounding differences) and proposes writing
them off to a "Rounding Off" expense account. This touches every extension
point in this doc:

- A new tool, `suggestWriteOffs`, that finds candidate postings (analysis step)
- A new action builder, `WriteOffActionBuilder`, that turns candidates into
  pending actions (deterministic, like `ReconciliationActionBuilder`)
- A new executor, `WriteOffPostingExecutor`, that performs the actual posting
  update on approval
- A new report formatter for the final summary

You don't need to build all of these for every feature — most new features
need only one or two of these pieces. Use the table below to pick which
recipes apply.

| If your feature... | You need |
|---|---|
| Fetches/computes data the LLM doesn't currently have access to | A new **tool** |
| Calls an external ERP system | A new **ERP handler** |
| Has a "tool output maps 1:1 to pending actions" shape (like reconciliation) | A new **action builder** |
| Performs a DB write when a pending action is approved | A new **executor** |
| Needs a deterministic (non-LLM) final summary | A new **report formatter** |

---

## Recipe: Add a New Tool

1. Define the Zod `parameters` schema — inline in the tool factory for
   tool-specific shapes, or in `GenericFunctions.ts` if shared across tools
   (e.g. pagination/filter fragments).
2. Create the tool factory function returning `tool({ description, parameters, execute })`
   in `AgentTools.ts`, or a new file under `tools/` for a substantial tool
   (the existing convention for `categorizePostings` and
   `suggestReconciliationMatches`).
3. Export it from `tools/index.ts`.
4. Register it:
   - Always-available analytics tool → add alongside `getAnalyticsContext`/`analyticsQuery`
     in `ToolManager.getUnifiedTools()`
   - Model-specific tool → add to `ToolManager.getToolsForModel('posting')` (or
     the relevant model) in the [model → tool table](./05-TOOLS.md#model--default-tool-set)
   - Session-only tool → add to the session tools block (alongside
     `queueActions`, `requestClarification`)
5. If the tool should be restricted by template, add it to the relevant
   templates' `allowed_tools` in `backend/prisma/seed-agent-templates.sql`
   (e.g. `atpl_reconcile`'s `allowed_tools` would need `suggestWriteOffs`).
6. Write a test in `__tests__/` — at minimum, call the tool's `execute()`
   directly with a fixture `AuthContext` and assert the shape and `org_id`
   scoping of the result (per
   [08-DATA_MODELS.md — Multi-Tenancy](./08-DATA_MODELS.md#multi-tenancy)).

**Example** — `suggestWriteOffs({ account_id })`:
```typescript
export const suggestWriteOffsTool = (auth: AuthContext) => tool({
  description: 'Find postings with a small unreconciled balance that may be eligible for write-off',
  parameters: z.object({ account_id: z.string(), threshold: z.number().default(100) }),
  execute: async ({ account_id, threshold }) => {
    const candidates = await prisma.posting.findMany({
      where: {
        org_id: auth.user.org_id,   // never trust a caller-supplied org_id
        account_id,
        credit_account_id: null,
        amount: { lt: threshold, gt: -threshold },
      },
    });
    return { candidates, threshold };
  },
});
```

---

## Recipe: Add a New ERP Handler

ERP handlers ([05-TOOLS.md — ERP Handler Registry](./05-TOOLS.md#erp-handler-registry))
are reached via the generic `erpConnector` tool, not their own tool entry —
add one when the new capability is **ERP-system-specific** (e.g. "fetch
ledger entries from Zoho/Tally/QuickBooks"), not when it's a Fabriq-internal
query (use a regular tool instead).

1. Create `handlers/erp/myMethod.ts` implementing `ERPMethodHandler`:
   `validateParams(params, context, auth)` then
   `execute(connector, validatedParams, context, auth)`.
2. Register it in `handlers/erp/registry.ts`'s method map.
3. Implement `myMethod()` on each `ERPConnector` subclass that supports it
   (or have it throw a clear "not supported by this ERP" error — the
   `erpConnector` tool surfaces handler errors as
   `{ tool: 'erpConnector', success: false, error }`).
4. If end users should be able to trigger it directly (not just via agent
   session), add a thin route in `routes.ts` — follow the pattern of
   `POST /api/agent/erp/categorize-transaction`
   ([09-API_REFERENCE.md](./09-API_REFERENCE.md#erp--direct-pipeline-endpoints)).

---

## Recipe: Add a New Action Builder

Use this when an analysis tool's output maps **directly** to pending actions
with no LLM judgement needed — see
[06-BUILDERS_AND_EXECUTORS.md — Strategy 1 vs 2](./06-BUILDERS_AND_EXECUTORS.md#two-strategies-for-creating-pending-actions)
for when this is (and isn't) the right call. If the LLM needs to filter,
prioritize, or write human-readable titles from heterogeneous data, use
Strategy 2 (LLM calls `queueActions` directly) instead — no builder needed.

1. Create `builders/WriteOffActionBuilder.ts` implementing `ActionBuilder`:
   ```typescript
   export const WriteOffActionBuilder: ActionBuilder = {
     matches(goalModel, step, context) {
       return goalModel === 'posting'
         && step.type === 'action'
         && Array.isArray(context.writeoff_candidates)
         && context.writeoff_candidates.length > 0;
     },
     async build(step, session, auth) {
       const pendingActions = context.writeoff_candidates.map((c) => ({
         action_type: 'write_off_posting',
         title: `Write off ₹${c.amount} — ${c.description}`,
         payload: { posting_id: c.posting_id, amount: c.amount, writeoff_account_id: 'acco_rounding_off' },
         confidence: 'high',
       }));
       return { pendingActions, summary: `Queued ${pendingActions.length} write-offs` };
     },
   };
   ```
2. The `matches()` condition **must** be specific enough that it doesn't
   accidentally claim another flow's action step — note how
   `ReconciliationActionBuilder` checks for `match_results` specifically
   ([06-BUILDERS_AND_EXECUTORS.md — ReconciliationActionBuilder](./06-BUILDERS_AND_EXECUTORS.md#reconciliationactionbuilder))
   so it doesn't steal the categorization flow's action step (same
   `goal_model: 'posting'`, same step type, but no `match_results`).
3. Register in `builders/index.ts`:
   ```typescript
   ActionBuilderRegistry.register(WriteOffActionBuilder);
   ```
4. Pair it with an executor (next recipe) — a builder that creates
   `write_off_posting` actions with no matching executor leaves those actions
   stuck at `approved` forever (no `execution_result`).

---

## Recipe: Add a New Executor

1. Add the handler to `EXECUTORS` in `executors/PendingActionExecutor.ts`:
   ```typescript
   const EXECUTORS: Record<string, PendingActionHandler> = {
     // ...existing entries
     write_off_posting: WriteOffPostingExecutor,
   };
   ```
2. Implement `execute(action, auth)`:
   ```typescript
   export const WriteOffPostingExecutor: PendingActionHandler = {
     async execute(action, auth) {
       const { posting_id, amount, writeoff_account_id } = action.payload;
       await prisma.posting.update({
         where: { id: posting_id, org_id: auth.user.org_id },
         data: { credit_account_id: writeoff_account_id, reconciliation_status: 'MATCHED' },
       });
       return { success: true, result: { posting_id, writeoff_account_id } };
     },
   };
   ```
   Always scope the write by `org_id` from `auth`, not from `action.payload`
   — the payload's `org_id` (if present) was set at session creation time and
   should never be trusted over the approver's actual `auth.user.org_id`
   (same principle as `normalizeAnalyticsOrgId()` in
   [08-DATA_MODELS.md — Multi-Tenancy](./08-DATA_MODELS.md#multi-tenancy)).
3. Registering in `EXECUTORS` is sufficient for
   `PendingActionExecutor.hasExecutor()` to return `true`, which alone
   triggers execution on approval — see
   [06-BUILDERS_AND_EXECUTORS.md — Execution Trigger](./06-BUILDERS_AND_EXECUTORS.md#execution-trigger).
   No `on_approve` value needs to be set by the builder/LLM.
4. Add a UI entry to `frontend-1/src/components/workbench/actions/registry.ts`
   so the pending-action card renders sensibly — minimum is a `label`, `icon`,
   `badgeClass`, and `renderRowSummary()`; a custom `DetailComponent` (like
   `CategorizeTransactionDetail.tsx`) is optional for simple payloads.
5. Write a test in `pending-action-executor.test.ts` covering: success path,
   `org_id` mismatch (should fail, not silently no-op), and the
   `execution_error` path (e.g. `posting_id` not found).

---

## Recipe: Add a New Report Formatter

1. Create `builders/WriteOffReportFormatter.ts` implementing `ReportFormatter`:
   ```typescript
   export const WriteOffReportFormatter: ReportFormatter = {
     matches(goalModel, step, session) {
       return goalModel === 'posting'
         && step.type === 'report'
         && (session.plan as PlanStep[]).some(s => s.type === 'action');
     },
     format(accumulatedContext, session) {
       const n = accumulatedContext.writeoff_candidates?.length ?? 0;
       return `Identified ${n} small-balance postings for write-off. Review in the inbox.`;
     },
   };
   ```
2. Register in `builders/index.ts`:
   ```typescript
   ReportFormatterRegistry.register(WriteOffReportFormatter);
   ```
3. As with action builders, make `matches()` specific — two formatters
   matching the same `(goal_model, step.type)` is a silent bug (whichever is
   registered first wins, per
   [06-BUILDERS_AND_EXECUTORS.md](./06-BUILDERS_AND_EXECUTORS.md#report-formatter-registry)).

---

## Putting It Together: New Template

Once the tool/builder/executor/formatter exist, wire them into a template
(`backend/prisma/seed-agent-templates.sql`):

```sql
INSERT INTO agent_template (id, name, system_prompt, goal_model, default_mode, focus_models, allowed_tools)
VALUES (
  'atpl_writeoff',
  'Write Off Small Balances',
  'Find postings with a balance under the threshold and propose write-offs. Save full candidate list to accumulated_context as writeoff_candidates when calling completeStep.',
  'posting',
  'supervised',
  ARRAY['posting', 'account'],
  ARRAY['getAnalyticsContext', 'analyticsQuery', 'suggestWriteOffs', 'queueActions']
);
```

Then end-to-end test it following the
[12-TESTING.md — E2E Session Test Pattern](./12-TESTING.md#e2e-session-test-pattern),
verifying the hybrid dispatcher skips the LLM for the action and report steps
(proving `WriteOffActionBuilder`/`WriteOffReportFormatter` fired, not the LLM).

---

## What's Next

- **14-SHORTFALLS_AND_ROADMAP.md** — known gaps to be aware of before
  building on top of this system (deprecated tools, untested paths, reserved
  session states)
