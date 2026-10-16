# Fabriq Agent Session Debugger

Diagnose a failed, stuck, or misbehaving agent session.

## Usage

- `/debug-session` — find and diagnose recent failed/stuck sessions automatically
- `/debug-session <session_id>` — diagnose a specific session

**Arguments**: `$ARGUMENTS` (optional session ID)

---

## Instructions

You are diagnosing an agent session in the Fabriq workbench. Follow every step in order. Do not skip steps. Run all database queries using psql — do not ask for permission.

```bash
DATABASE_URL=$(grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//') && psql "${DATABASE_URL}" -c "SELECT ..."
```

---

### Step 1 — Identify the session(s) to diagnose

If `$ARGUMENTS` is provided, use that as the session ID. Otherwise, find recent non-completed sessions:

```sql
SELECT id, status, goal, template_id, started_at, last_active_at
FROM agent_session
WHERE status NOT IN ('completed')
ORDER BY started_at DESC
LIMIT 10;
```

Pick sessions that are `failed`, `planning` (stuck), or `executing` (stuck) based on `last_active_at` being more than a few minutes ago.

---

### Step 2 — Run full diagnostics on each session

Run all five queries. Record the results — you will need them for pattern matching.

**2a. Session overview**
```sql
SELECT id, status, goal, template_id, goal_model,
       plan IS NOT NULL AS has_plan,
       jsonb_array_length(COALESCE(plan, '[]'::jsonb)) AS plan_steps,
       current_step_index,
       pending_actions_count, completed_actions_count,
       mode, started_at, last_active_at, completed_at,
       EXTRACT(EPOCH FROM (last_active_at - started_at))::int AS gap_seconds
FROM agent_session
WHERE id = '<SESSION_ID>';
```

**2b. Messages (were any LLM turns completed?)**
```sql
SELECT role, step_index,
       tool_calls IS NOT NULL AS has_tool_calls,
       left(content, 150) AS content_preview,
       created_at
FROM agent_message
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;
```

**2c. LLM traces (did any LLM call complete?)**
```sql
SELECT id, status, error_message, llm_model,
       prompt_tokens, completion_tokens, duration_ms,
       tools_called, created_at
FROM llm_trace
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;
```

**2d. Pending actions**
```sql
SELECT id, action_type, status, confidence_score,
       execution_error, created_at
FROM pending_action
WHERE session_id = '<SESSION_ID>'
ORDER BY created_at ASC;
```

**2e. Agent template**
```sql
SELECT at.id, at.name, at.goal_model, at.is_active,
       at.system_prompt IS NOT NULL AS has_system_prompt,
       length(at.system_prompt) AS prompt_len
FROM agent_session s
JOIN agent_template at ON s.template_id = at.id
WHERE s.id = '<SESSION_ID>';
```

---

### Step 3 — Match to a known failure pattern

Use the evidence from Step 2 to match against the patterns in
`docs/kernel/agent/03-SESSION_LIFECYCLE.md`.

Use this decision tree:

```
Has messages? ──No──► Has LLM traces? ──No──► gap ≈ 300s? ──Yes──► PATTERN 1: LLM Timeout
                │                      │                  └─No───► PATTERN: Early crash (pre-LLM)
                │                      └─Yes──► Check trace error_message
                │
               Yes──► Has plan? ──No──► Assistant msg has no tool_calls? ──Yes──► PATTERN 2: Plan Never Created
                │               └─Yes──► step_index cycling?    ──────────────────► PATTERN 3: Step Loop
                │
                └────► status = awaiting_approval + old last_active_at? ──────────► PATTERN 4: Abandoned
```

---

### Step 4 — Output a structured diagnostic report

Format your findings exactly as follows:

```
## Session Diagnostic Report

**Session ID**: ses_xxxxx
**Status**: failed / stuck / ...
**Goal**: "..."
**Template**: atpl_xxx (Name)
**Duration before failure**: Xs

### Symptoms observed
- [ ] Has plan: yes/no
- [ ] Messages created: N
- [ ] LLM traces linked: N
- [ ] Pending actions: N
- [ ] Time gap: Xs

### Pattern match
**Pattern**: #N — <Pattern Name>
**Confidence**: high / medium / low

### Root cause
<1–3 sentence explanation of what went wrong and why>

### Recommended fix
<Specific action to take — code change, config change, or manual resolution>

### Files to change (if code fix needed)
- path/to/file.ts — what to change
```

---

### Step 5 — Check if this is a new pattern

If the symptoms don't match any existing pattern in `SESSION_FAILURE_PATTERNS.md`, say so explicitly and propose a new pattern entry using the template in that document. Do not add it to the file without the user's confirmation.

---

### Step 6 — Append report to debug-session.log

After outputting the report, append it to `docs/kernel/agent/debugging/debug-session.log` using the following format. Create the file if it does not exist.

```
---
date: YYYY-MM-DD HH:MM
session_id: ses_xxxxx
pattern: #N — Pattern Name
status: needs_fix | informational | wont_fix
---

<paste the full Session Diagnostic Report here>

### Pending fixes
- [ ] <one line per actionable fix, copied from "Recommended fix" and "Files to change">

```

Rules for the log entry:
- Set `status: needs_fix` if the report has a code change in "Files to change"
- Set `status: informational` if the finding is data/config related (no code change needed)
- Set `status: wont_fix` only if the user explicitly says so
- Keep each entry self-contained — copy the full report, not a summary
- Do NOT remove or edit existing entries; only append at the end of the file

---

---

## Resetting Demo Transaction Data

When a session consumed demo postings (e.g. categorised all transactions) and you need to re-run tests from a clean state, reset with:

```bash
# Indian demo — clears AI categorisation, agent sessions, restores reconciliation postings
cd backend && node setup-db.js --reset-transactions --demo-data=indian-demo

# US-CA demo — clears AI categorisation and agent sessions
cd backend && node setup-db.js --reset-transactions --demo-data=us-ca-demo

# Both Indian and US-CA
cd backend && node setup-db.js --reset-transactions --demo-data=both

# Just clear agent sessions + AI fields (no posting reset)
cd backend && node setup-db.js --reset-transactions --demo-data=0
```

What each reset does:
- `ai_cat_score` / `ai_categorized_at` cleared on **all** postings (restores uncategorised state)
- All `agent_session`, `agent_message`, `llm_trace`, `pending_action` rows deleted
- Indian demo only: demo postings deleted and re-created at original reconciliation state (`--reset-postings`)
- No schema changes, no metadata re-seed

---

## Reference

- Session lifecycle: `docs/kernel/agent/03-SESSION_LIFECYCLE.md`
- Key tables: `agent_session`, `agent_message`, `llm_trace`, `pending_action`, `agent_template`
- Timeout default: 300s (`AGENT_SESSION_TIMEOUT_MS` env, `SessionTimeoutService.ts`)
