# Fabriq Agentic Upgrade v2 — Hybrid Execution Model

**Status**: Ready for implementation
**Version**: 2.0
**Context**: Redesign of session orchestration based on v1 lessons learned. Introduces deterministic execution for mechanical steps while preserving LLM-driven execution for intelligent steps.

---

## 1. What Changed from v1

### Problem with v1
The LLM drives every step (planning → query → analysis → action → report) via auto-continuation. This causes:
- Infinite loops when the LLM doesn't call `completeStep`
- Wrong parameter values chosen by LLM (e.g., `on_approve`)
- Can't tell if a bug is in the orchestration layer or the LLM
- The LLM adds zero value in action/report steps — it's just following rigid instructions

### v2 Core Insight
The LLM should only drive steps where it adds intelligence. Mechanical steps should be deterministic code. When no deterministic handler is registered, fall back to LLM (preserving generality).

| Step Type | v1 (always LLM) | v2 (hybrid) |
|-----------|-----------------|-------------|
| planning | LLM | LLM |
| query | LLM | LLM |
| analysis | LLM | LLM |
| action | LLM (fragile) | **Code if builder registered**, LLM fallback |
| report | LLM (wasteful) | **Code if formatter registered**, LLM fallback |

---

## 2. Two Use Cases

### Use Case 1: Reconciliation (action + deterministic report)
```
Step 1 (query):    Find unmatched postings         → LLM drives
Step 2 (analysis): suggestReconciliationMatches     → LLM drives
Step 3 (action):   Queue matches for human review   → DETERMINISTIC (builder)
Step 4 (report):   Summarize results                → DETERMINISTIC (formatter)
```

### Use Case 2: Multi-turn Analytical Question (no action, LLM report)
```
Step 1 (query):    Pull quarterly expense data      → LLM drives
Step 2 (query):    Pull prior year comparison        → LLM drives
Step 3 (analysis): Identify top drivers, anomalies   → LLM drives
Step 4 (report):   Synthesize findings into narrative → LLM drives (no formatter)
```

Both use the same session orchestration. The only difference is whether deterministic handlers are registered.

---

## 3. Design: Dispatcher in completeStep

When `completeStep` finishes marking a step done, it checks if the **next step** has a registered deterministic handler. If yes, it executes inline (no LLM round-trip). If no, it breaks and lets the existing auto-continuation fire the LLM.

```
completeStep(analysis_step) called by LLM
  ├─ Mark analysis step complete, merge accumulated_context
  ├─ Look at next step (action)
  │   ├─ ActionBuilderRegistry.get(goal_model, step) → found?
  │   │   ├─ YES → run builder, create pending_actions, mark step complete
  │   │   │   ├─ pending_actions > 0 → status = 'awaiting_approval', STOP
  │   │   │   └─ pending_actions = 0 → continue to next step
  │   │   └─ NO → break (LLM auto-continuation handles it)
  │   └─ Look at next step (report)
  │       ├─ ReportFormatterRegistry.get(goal_model, step) → found?
  │       │   ├─ YES → run formatter, mark step complete, status = 'completed'
  │       │   └─ NO → break (LLM auto-continuation handles it)
```

---

## 4. New Registries

### 4.1 Action Builder Registry

```typescript
interface ActionBuildResult {
  actionType: string;
  pendingActions: Array<{
    title: string;
    description?: string;
    payload: Record<string, any>;
    confidence: 'high' | 'medium' | 'low';
    confidence_score?: number;
  }>;
  summary: string;
  contextUpdate?: Record<string, any>;
}

interface ActionBuilder {
  matches(goalModel: string | null, step: PlanStep): boolean;
  build(ctx: Record<string, any>, session: any, auth: AuthContext): Promise<ActionBuildResult>;
}
```

**Reconciliation builder**: reads `ctx.match_results` (PostingWithSuggestions[]), creates one pending action per posting using best match.

### 4.2 Report Formatter Registry

```typescript
interface ReportFormatter {
  matches(goalModel: string | null, step: PlanStep): boolean;
  format(ctx: Record<string, any>, session: any): string;
}
```

**Reconciliation formatter**: reads `ctx.unmatched_count`, `ctx.queued_matches`, `ctx.confidence_breakdown` → plain-text summary.

**No formatter for analytical questions** → LLM fallback (synthesizes narrative).

---

## 5. Data Flow: accumulated_context

The contract between steps:

**Query step** (LLM) → `completeStep` with:
```json
{ "accumulated_context_update": { "unmatched_count": 23, "account_id": "acc_hdfc_001" } }
```

**Analysis step** (LLM) → `completeStep` with:
```json
{ "accumulated_context_update": { "match_results": [ /* PostingWithSuggestions[] */ ] } }
```

The `match_results` array is the full output from `suggestReconciliationMatches`. ~10-15KB for 23 postings — fits fine in JSONB.

---

## 6. Execution Flows

### Reconciliation (3 LLM turns instead of 5)

```
Turn 1 (LLM): createPlan → [query, analysis, action, report]
Turn 2 (LLM): query step → finds 23 unmatched → completeStep(0)
  └─ dispatcher: next is analysis → no builder → break → auto-continue
Turn 3 (LLM): analysis step → suggestReconciliationMatches → completeStep(1)
  └─ dispatcher: next is action → ReconciliationActionBuilder found!
     → creates 18 pending_actions → mark action step complete
     → status = awaiting_approval → STOP
[Human reviews, approves/rejects in workbench]
[All resolved → PendingActionService triggers report]
  └─ formatter found → deterministic report → session completed
```

### Analytical Question (unchanged from v1)

```
Turn 1 (LLM): createPlan → [query, query, analysis, report]
Turn 2-4 (LLM): query/analysis steps → dispatcher finds no builders → auto-continue
Turn 5 (LLM): report step → LLM synthesizes narrative → session completed
```

---

## 7. File Changes

### Modified
| File | Change |
|------|--------|
| `backend/src/agent/tools/sessionTools.ts` | Add auth param to completeStepTool, add dispatcher loop |
| `backend/src/agent/ToolManager.ts` | Pass auth to completeStepTool (line 222) |
| `backend/src/agent/services/PendingActionService.ts` | Deterministic report path on action resolution |
| `backend/src/agent/prompt/constants.ts` | SESSION_DIRECTIVE: analysis step data-forwarding instruction |

### New
| File | Purpose |
|------|---------|
| `backend/src/agent/builders/ActionBuilderRegistry.ts` | ActionBuilder interface + registry |
| `backend/src/agent/builders/ReconciliationActionBuilder.ts` | Reconciliation action builder |
| `backend/src/agent/builders/ReportFormatterRegistry.ts` | ReportFormatter interface + registry |
| `backend/src/agent/builders/ReconciliationReportFormatter.ts` | Reconciliation report formatter |
| `backend/src/agent/builders/index.ts` | Re-exports |

### Unchanged
- Session schema (agent_session, agent_message, pending_action)
- PendingActionExecutor (runs on approval)
- shouldAutoContinue + stepAdvanced guard
- Auto-continuation via setImmediate for LLM-driven steps
- Workbench frontend
- queueAction/queueActionBatch tools (remain as LLM fallback)

---

## 8. Adding a New Use Case (Checklist)

To add a new agentic use case (e.g., invoice matching):

1. ☐ Create `backend/src/agent/builders/InvoiceMatchActionBuilder.ts`
   - Implement `matches()` and `build()`
   - Register in `ActionBuilderRegistry`
2. ☐ Create `backend/src/agent/builders/InvoiceMatchReportFormatter.ts` (optional)
   - If report is mechanical, implement `format()`
   - If report needs LLM insight, skip this (LLM fallback)
3. ☐ Create executor in `backend/src/agent/executors/` for approval side effects
   - Register in `PendingActionExecutor.EXECUTORS`
4. ☐ Ensure analysis tool puts results in `accumulated_context` with a known key
5. ☐ No changes to session orchestration, auto-continuation, or frontend needed
