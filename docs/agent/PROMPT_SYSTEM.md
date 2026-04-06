# Fabriq Agent — Prompt System

**Last Updated**: 2026-04-04  
**Primary files**: `prompt/DynamicPromptManager.ts`, `prompt/constants.ts`

---

## Overview

There is no single "prompt string" — the final system prompt is assembled from four layers that merge at request time. Understanding this layering is essential for debugging unexpected agent behaviour.

```
Final system prompt =
  [Layer 1: template.system_prompt]     ← task-specific instructions
  + "---"
  + [Layer 2: base prompt from DB]      ← global rules + model descriptions
  + [Layer 3: session context block]    ← current status, plan, accumulated data
  + [Layer 4: SESSION_DIRECTIVE]        ← exact behavioural decision tree
```

---

## Two Template Types

Before diving into the layers, it's important to understand that the system has **two separate template tables** that serve completely different purposes and are loaded at different times.

| | `agent_template` | `prompt_template` |
|---|---|---|
| **Purpose** | Configures agent behaviour for a task type — which tools, which model schemas, task-specific expert instructions | Stores reusable prompt fragments — domain knowledge, analytics rules, tool response guidelines |
| **Scope** | One row per task type (Reconcile Transactions, Categorise Expenses, …) | Many rows per model/view/prompt type — merged at load time |
| **Loaded when** | Only in sessions that have a `template_id` | Every LLM call — session and non-session chat alike |
| **Affects** | Layer 1 (prepended as expert brief) + tool filtering (`allowed_tools`) + model scoping (`focus_models`) | Layer 2 (assembled as the base system prompt by `DynamicPromptManager`) |
| **Managed by** | Super Admin via Settings → AI Templates → Agent Templates tab | Developer / Admin via Settings → AI Templates → Prompt Templates tab |
| **If absent** | Session still works — uses full tool set with no task-specific instructions | `DynamicPromptManager` throws "No prompt templates found" and the session fails immediately |

**How they combine on every LLM call:**

```
agent_template.system_prompt     ← Layer 1: task-specific expert brief (sessions only)
        +  "---"
merged prompt_template rows       ← Layer 2: base domain knowledge (always)
        +
session context block             ← Layer 3: current plan + accumulated data (sessions only)
        +
SESSION_DIRECTIVE                 ← Layer 4: behavioural decision tree (sessions only)
```

A non-session chat call only uses Layer 2. A session call uses all four layers.

---

## Layer 1: Template System Prompt (`agent_template`)

**Table**: `agent_template`  
**Loaded by**: `AgentService` at the start of every LLM call when the session has a `template_id`

`agent_template` is a session-level configuration record. It contains task-specific expert instructions and tool/model constraints for a specific task type (e.g. "Reconcile Transactions", "Categorise Expenses").

When present, its `system_prompt` is **prepended** to the base prompt:

```
finalSystemPrompt = template.system_prompt + "\n\n---\n\n" + baseAgentSystemPrompt
```

Template prompts are task-specific expert briefs. For example, the "Reconcile Transactions" template explains Fabriq's double-entry model, defines what "matched" means, and instructs the agent to use broad keyword search for account names.

**Key behaviour**: The template is always loaded fresh from the database on every LLM call — including auto-continuations. This means template updates take effect immediately without a code deploy.

### Fields that affect prompt assembly

| Field | Effect |
|-------|--------|
| `system_prompt` | Prepended to base prompt as Layer 1 |
| `focus_models` | Limits which model schemas appear in `{{accessibleModels}}` (see Layer 2) |
| `allowed_tools` | Filters the tool set the LLM can call — acts as a security ceiling |

All three work together: `system_prompt` tells the LLM *what* to do; `focus_models` gives it the right schema context; `allowed_tools` prevents it from calling irrelevant or dangerous tools.

### When agent_template is absent

Sessions without a `template_id` (e.g. free-form chat, `atpl_custom`) still use Layers 2–4. They receive the full tool set for `goal_model` and all accessible model schemas — no task-specific scoping. `agent_template` is **optional**; `prompt_template` is **required**.

**Full schema**: [DATA_MODELS.md — agent_template](./DATA_MODELS.md#agent_template)

---

## Layer 2: Base Prompt from `DynamicPromptManager` (`prompt_template`)

**Table**: `prompt_template`  
**File**: `prompt/DynamicPromptManager.ts`  
**Loaded on**: Every LLM call — sessions and non-session chat alike

`prompt_template` stores reusable prompt fragments scoped by model, view, and prompt type. Unlike `agent_template` (one row per task), many `prompt_template` rows can match a single request and are merged into one base prompt. The same `prompt_template` rows power both session LLM calls and regular chat requests — they are not tied to any specific task or template.

**Why it exists separately from `agent_template`**: Prompt fragments for the `posting` model (e.g. analytics guidelines, double-entry rules) are shared across multiple task types — reconciliation, categorisation, spending analysis all need the same base domain knowledge. Storing them in `prompt_template` means they can be versioned, prioritised, and merged without duplicating content in every `agent_template.system_prompt`.

`DynamicPromptManager` fetches matching `prompt_template` records from the database, merges them by priority, and substitutes placeholders.

**Full schema**: [DATA_MODELS.md — prompt_template](./DATA_MODELS.md#prompt_template)

### How it works

```typescript
new DynamicPromptManager(orgId, userId, modelName, viewName?, promptTypes?, context)
  .generateDynamicPromptWithMetadata(permissions)
  → { prompt: string, metadata: { templateIds, versions, promptTypes, modelName } }
```

### Prompt composition order

1. Base template (from DB filtered by `model_name`, `view_name`, `prompt_type`)
2. Model descriptions: human-readable list of all models the user can access (filtered by permissions and `focus_models`)
3. Reconciliation guidelines (if `promptTypes.includes('reconciliation')`)
4. Analytics guidelines (if `promptTypes.includes('analytics')`)
5. `TOOL_RESPONSE_HANDLING_GUIDELINE` from `constants.ts` (global tool response rules)

### Placeholders

`DynamicPromptManager.replacePlaceholders()` substitutes these in the assembled prompt:

| Placeholder | Replaced with |
|-------------|--------------|
| `{{org_id}}` or `{org_id}` or `{{orgId}}` | User's org ID |
| `{{user_id}}` or `{{userId}}` | User's ID |
| `{{accessibleModels}}` | Human-readable list of accessible models + descriptions |
| `{{currentDate}}` | ISO timestamp of today's date |
| `{{modelName}}` | The active model name (e.g. `posting`) |
| `{{viewName}}` | View name or `${modelName}_views` fallback |
| `{{promptType}}` | Comma-joined prompt types (e.g. `analytics, default`) |
| `{{context.recordId}}` | Record ID if viewing a specific record |
| `{{context.stateId}}` | Workflow state ID if applicable |
| `{{context.viewId}}` | View ID if applicable |
| `{{context.modelContext.KEY}}` | Any key from the `modelContext` object (regex-substituted) |
| `{{context.modelContext.selectedAccountId}}` | Selected account if in a posting context |

**Conditional blocks** are also supported:
```
{{#if context.recordId}}
  Text shown only when a record is in context
{{else}}
  Text shown when no record is in context
{{/if}}

{{#if context.modelContext.selectedAccountId}}
  Text shown only when selectedAccountId is set
{{/if}}
```
Blocks are resolved before other placeholder substitution. Unknown or missing context values cause the block to be removed.

### Template Merge Order

When multiple `prompt_template` rows match, `mergeTemplates()` sorts them:
1. `is_default DESC` — non-default (override) templates first
2. `priority DESC` — higher priority wins
3. `version DESC` — latest version wins

Sorted texts are joined with `\n\n`. The result is a single merged prompt string.

### `focus_models` and `RELATED_MODELS`

When a template declares `focus_models` (e.g. `["posting", "account", "category"]`), only those models appear in the `{{accessibleModels}}` substitution — intersected with models the user actually has permission to see.

When `focus_models` is empty, `AgentService` falls back to the `RELATED_MODELS` constant:

```typescript
const RELATED_MODELS = {
  posting: ['posting', 'account', 'category', 'category_group', 'payment_receipt', 'invoice'],
  invoice: ['invoice', 'supplier', 'purchase_order', 'posting', 'account'],
  trade:   ['trade', 'instrument', 'holding', 'posting', 'account'],
}
```

Precedence chain (evaluated in `AgentService` before `DynamicPromptManager` is called):
```
1. template.focus_models (non-empty)      → pass to DynamicPromptManager as focusModels
2. RELATED_MODELS[goal_model] (hardcoded) → pass to DynamicPromptManager as focusModels
3. undefined (no focusModels set)         → all accessible models (widest fallback)
```

### Local vs Database Prompts

`USE_LOCAL_PROMPT=true` in `.env` → loads prompt text from JSON + TXT files in `backend/prisma/metadata/` instead of DB.

File structure: view metadata lives in a `.json` file; the prompt text lives in a corresponding `.txt` file. File matching logic:
- Finds the view JSON matching `model_name` and view `name`
- Matches prompt files: `view_{normalized_view_id}_{promptType}[_{appName}].json`
- If `APP_NAME` is set, prefers files with the app name suffix; falls back to files without

To sync local files to the DB: `cd backend && npx ts-node prisma/sync-metadata.ts`

### App Name Filtering

`DynamicPromptManager` always filters `prompt_template` rows by `app_name = process.env.APP_NAME`. If `APP_NAME` is unset, all templates load regardless of app name. This allows separate prompt sets per deployment (e.g. `fabriq`, `perfin`) sharing the same database.

**Failure mode**: If `APP_NAME` in `.env` doesn't match the `app_name` column in any `prompt_template` rows, `DynamicPromptManager` throws "No prompt templates found" and the session fails immediately. See [debugging/SESSION_FAILURE_PATTERNS.md — Pattern 5](./debugging/SESSION_FAILURE_PATTERNS.md#5-prompt-template-not-found).

---

## Layer 3: Session Context Block

**Function**: `buildSessionContextBlock(session, isFirstTurn, justCreatedPlan)` in `prompt/constants.ts`

Signature:
```typescript
buildSessionContextBlock(
  session: { goal, mode, status, current_step_index, plan, accumulated_context, pending_actions_count },
  isFirstTurn: boolean,       // true if no agent_message rows exist for this session yet
  justCreatedPlan: boolean    // true if the last assistant message called createPlan
): string
```

**Always appended** (every turn):
```
## Active Session Context
Goal: Reconcile all unmatched HDFC transactions for March
Mode: supervised
Status: executing — Step 2 of 4: Suggest matches
Pending actions: 0 awaiting review
Accumulated: {"unmatched_count": 23, "hdfc_account_id": "acc_..."}
```

**Full plan included only when `isFirstTurn === true` OR `justCreatedPlan === true`**:
```
## Full Plan
[{"index":0,"type":"query","title":"Find unmatched postings","status":"completed",...},
 {"index":1,"type":"analysis","title":"Suggest matches","status":"in_progress",...},
 ...]
```

On all other turns, only the header block is emitted. This saves ~50 tokens per turn and reduces noise in the message history.

`accumulated_context` is the key mechanism: query steps write results here, later steps read them. Without this, the LLM would have no data to act on in the action step.

---

## Layer 4: SESSION_DIRECTIVE

**Source**: `SESSION_DIRECTIVE` constant in `prompt/constants.ts`

Always appended after the session context block. It is a decision tree telling the LLM exactly what to do based on current `status` and step type:

```
CRITICAL RULE: If a plan already exists, NEVER call createPlan again.

IF status is 'planning' AND no plan exists:
  → Call createPlan IMMEDIATELY with 3–5 steps

IF status is 'executing' AND current step type is 'query':
  → Use tools to find the required data
  → Call completeStep with result_summary and accumulated_context_update

  IF query returns 0 rows:
    AMBIGUOUS INPUT (data likely exists, user gave wrong/partial name):
      → Run a broader query to find available candidates
      → Call requestClarification with the question and candidates listed
      → Do NOT call completeStep yet — session pauses until user responds
    GENUINELY MISSING DATA (correct search, data simply doesn't exist):
      → Call completeStep with result_summary explaining what was searched and what was missing

IF status is 'executing' AND current step type is 'analysis':
  → Run analysis tools
  → Save FULL structured output in accumulated_context_update when calling completeStep
  → Do not truncate or summarise the structured data — subsequent steps need it complete

IF status is 'executing' AND current step type is 'action':
  → Call queueActions with predictions from accumulated_context
  → Do NOT write to the database directly
  → Call completeStep after queueActions

IF status is 'executing' AND current step type is 'report':
  → Write a plain-text summary of what was accomplished
  → Call completeStep
```

This directive keeps the agent on-track. Without it, the LLM would write plain text instead of calling the structured tools.

### SESSION_DIRECTIVE Behavioral Rules (Always Enforced)

In addition to the decision tree, the directive includes hard prohibitions:

- **Never include IDs** in user-facing responses — use names/labels instead (e.g. "HDFC Current Account", not `acc_abc123`)
- **Never write `{{org_id}}` in SQL** — the `org_id` filter is applied automatically by the tool; literal `{{org_id}}` in a query matches nothing
- **Always call `completeStep`** — every step must be completed with a `completeStep` call; plain text without a tool call leaves the session stuck
- **Never skip or combine steps** — complete exactly the current step before moving forward
- **Never call `createPlan` again** once a plan exists

### Reconciliation Prompt Type Conditional

The `'reconciliation'` prompt type is NOT added for all posting sessions. It is conditioned on the specific template:

```typescript
const isReconciliationSession = session?.template_id === 'atpl_reconcile';
const basePromptTypes = context?.modelName === 'posting' && isReconciliationSession
  ? ['reconciliation', 'analytics', 'default']
  : ['analytics', 'default'];
```

Templates other than `atpl_reconcile` (e.g. `atpl_categorise`, `atpl_spending_analysis`) use `['analytics', 'default']` only. This prevents reconciliation-specific instructions from bleeding into categorisation or analytical sessions.

---

## TOOL_RESPONSE_HANDLING_GUIDELINE

**Source**: `TOOL_RESPONSE_HANDLING_GUIDELINE` constant in `prompt/constants.ts`

Always appended at the end of Layer 2 (base prompt). Applies to **all** LLM calls — session and non-session.

### What it enforces

| Rule | Detail |
|------|--------|
| **No IDs in responses** | Never show internal IDs (`loc_mumbai_hq`, `user_123`, `acc_abc`) to users — use names/labels |
| **No markdown code blocks** | No backticks, no triple-backtick fences, no `code` formatting in any output |
| **Plain-text structure only** | Structured data (tables, lists) must have a 1–2 sentence plain-text intro |
| **No special characters** | No `#` headers, no bold `**`, no inline formatting |

### Why it exists

The workbench renders agent output in a controlled UI. Markdown formatting and raw IDs would leak implementation details to the user and break the UI layout. This guideline is the catch-all enforcement layer — it covers all tool calls and responses, not just session steps.

### `maxSteps` Configuration

| Context | Env var | Default |
|---------|---------|---------|
| Session calls (`sessionId` present) | `SESSION_MAX_STEPS` | `20` |
| Non-session chat calls | `AGENT_MAX_STEPS` | `5` |

`maxSteps` is passed directly to `generateText` / `streamText` — it limits how many LLM steps (tool call + response) can occur in a single invocation. For sessions, 20 steps is enough for a full 4-step plan with multi-tool analysis steps. For chat, 5 steps is sufficient for simple lookup + response.

---

## Question Classification

**File**: `utils/questionClassifier.ts`

Non-session requests (the standard chat path) classify the question before tool selection:

| Classification | Max Steps | When |
|---|---|---|
| `analytical` | 8 | "how much", "total", "breakdown", "show me spending by..." |
| `transactional` | 2 | "create", "update", "find record", everything else |

For analytical queries, `promptTypes` is set to `['analytics', 'default']` which adds analytics guidelines to Layer 2 and ensures `analyticsQuery` + `getAnalyticsContext` tools are included.

**Note**: This classification is for the non-session chat path. Inside a session, all tools are provided and the SESSION_DIRECTIVE governs tool selection.

---

## Prompt Template Database Schema

The full `prompt_template` schema is documented in [DATA_MODELS.md — prompt_template](./DATA_MODELS.md#prompt_template).

Quick diagnostic query:
```sql
SELECT app_name, model_name, view_name, prompt_type, priority, is_default
FROM prompt_template
WHERE app_name = 'fabriq' AND model_name = 'posting'
ORDER BY is_default DESC, priority DESC, version DESC;
```

Prompts are merged in `is_default DESC, priority DESC, version DESC` order. The `app_name` must match `APP_NAME` in `.env` exactly — mismatch causes "No prompt templates found" errors. See [debugging/SESSION_FAILURE_PATTERNS.md — Pattern 5](./debugging/SESSION_FAILURE_PATTERNS.md#5-prompt-template-not-found).

---

## Debugging Prompt Issues

```bash
# Check what APP_NAME is set to
grep APP_NAME backend/.env

# Check what templates exist in DB
DATABASE_URL=$(grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//') \
  && psql "${DATABASE_URL}" -c "SELECT app_name, model_name, prompt_type, priority FROM prompt_template ORDER BY app_name, model_name;"

# Run prompt test harness to see full assembled prompt and resulting SQL
cd backend && npm run test:posting-prompt
```

See [TESTING.md](./TESTING.md) for the full prompt test workflow.
