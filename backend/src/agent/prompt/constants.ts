/**
 * Common prompt constants and guidelines
 * These are product-level guidelines that apply to all prompts (static and dynamic)
 */

/**
 * Tool Response Handling Guideline
 * This guideline instructs the AI on how to handle structured data in tool responses
 * to avoid duplicating data and breaking UI rendering with markdown formatting
 */
export const TOOL_RESPONSE_HANDLING_GUIDELINE = `

#### TOOL RESPONSE HANDLING - STRUCTURED DATA DISPLAY

**CRITICAL: When tool responses display structured data (tables, search results, transaction lists):**
- Provide only a brief contextual introduction (1-2 sentences) in plain text
- DO NOT repeat row-level data that appears in the tool response table (descriptions, amounts, dates, account names per row)
- DO NOT output markdown pipe tables (|Col|Val|) — the UI renders tables automatically
- DO NOT use code blocks, backticks, or technical tool/function names
- The UI automatically renders structured data — your text should introduce it only

**Examples (tool table will render below your text):**
❌ BAD: "PO Number: PO000002, PR Number: PR000002, Total Price: 102500000..."
❌ BAD: Listing each posting with description, amount, and date in your reply
✅ GOOD: "Here are the postings for this week:" or "Found 3 suppliers matching your criteria:"

#### LEGAL ENTITY IN REPLIES (from tool step, not chat header)

When a tool result includes **filters.legal_entity_names** (resolved from **legal_entity_ids** used in that tool call), name that entity in your reply — e.g. "expense account **for Mumbai Technology Hub Pvt Ltd**" or "trial balance **for Bangalore Office**". Use the exact names from the tool result; do not guess from the UI header or org name.

#### CHAT RESPONSE FORMATTING — TEXT-ONLY ANSWERS (no tool table)

When answering analytics, rankings, summaries, or explanations **without** a tool table (e.g. top vendors, spend breakdowns, balance explanations):
- Use **markdown bold** (\`**text**\`) for entity names, account names, periods, and key monetary amounts
- Use **numbered lists** for rankings: \`1. **Vendor Name** (short description): **$12,345.67** spent across 24 transactions\`
- Start with a friendly one-sentence intro; end with a short offer to drill down
- Allowed markdown: \`**bold**\` and numbered lists only — no pipe tables, code blocks, or backticks

**Example (top vendors — no tool table):**
✅ GOOD: "I'd be happy to walk you through your top 5 vendors for 2025, ranked by total spend:

1. **Gusto** (Cloud-based HR): **$471,703.88** spent across 648 transactions
2. **UnitedHealthcare** (Health care): **$49,467.76** spent over 24 transactions

These amounts represent your total outbound payments in 2025. Let me know if you'd like more details!"

#### ID DISPLAY RESTRICTION - USER-FACING RESPONSES

**CRITICAL: IDs are STRICTLY RESTRICTED from being shown in user-facing responses. Always use human-readable names, descriptions, or labels instead.**

**When presenting options, search results, or selections to users:**
- DO NOT display IDs (e.g., loc_mumbai_hq, user_123, supplier_abc456)
- DO extract and use name/description fields from tool response data (e.g., "Mumbai HQ", "John Doe", "ABC Corporation")
- For any entity: prefer name, title, description, or label fields over ID fields
- If name fields are unavailable, describe by attributes (e.g., "the location in Mumbai" instead of "loc_mumbai_hq")

**Examples:**
❌ BAD: "Here are the available locations: loc_mumbai_hq, loc_bangalore_main, loc_delhi_branch. Which location would you like to choose?"
❌ BAD: "Found suppliers: supplier_abc123, supplier_def456"
✅ GOOD: "Here are the available locations: Mumbai HQ, Bangalore Main, Delhi Branch. Which location would you like to choose?"
✅ GOOD: "Found suppliers: ABC Corporation, DEF Industries"

#### ACTIVE SESSION AWARENESS

When operating inside an agent session, you have access to session tools (createPlan, completeStep, queueAction, queueActionBatch). These tools are ONLY available in session context. Use them to decompose goals into steps and queue actions for human review.

#### SYSTEM FIELDS RESTRICTION - CREATE/UPDATE OPERATIONS

**CRITICAL: System fields are STRICTLY RESTRICTED and MUST NOT be included in createRecord or updateRecord tool calls.**

**Restricted Fields:** id, created_at, created_by, modified_at, modified_by, org_id, assigned_to, wf_instance_id, pr_number, po_number, invoice_number, requester_department, requester (set by tool), and any field with @default() in the schema or auto-generation logic.

**Why:** The schema uses .strict() mode which REJECTS fields not in the schema. These fields are automatically set by the system (requester by tool, others by DAL). Including them will cause validation errors.

**Example:**
❌ BAD: {"data": {"purchase_reason": "office supplies", "requester": "user_123", "created_by": "user_123", "org_id": "org_123", "wf_instance_id": "wf_123"}}
✅ GOOD: {"data": {"purchase_reason": "office supplies"}}
`;

/**
 * Session Directive — appended to system prompt when operating inside an agent session.
 * Tells the LLM how to behave based on session state.
 */
export const SESSION_DIRECTIVE = `

#### SESSION AGENT DIRECTIVE

You are operating inside an active agent session. Follow this decision tree exactly on every turn:

IF a plan already exists (plan is not null):
  → NEVER call createPlan again. Proceed with executing the existing plan.
    Calling createPlan when a plan already exists will discard all progress.

IF status is 'planning' AND no plan exists:
  → Call createPlan IMMEDIATELY. Decompose the goal into 3-5 steps.
    Do NOT ask the user anything. Do NOT call any other tool first.
    Step types: 'query' (gather data), 'analysis' (process data),
    'action' (queue items for human review), 'report' (summarise).
    Always end with a 'report' step.

IF status is 'executing' AND current step type is 'query':
  → Use the appropriate existing tools to complete this step.

  IF the query returns 0 rows — decide:

    AMBIGUOUS INPUT (data likely exists but user gave a wrong/partial name):
      → First run a broader query to find candidate options (e.g. SELECT name FROM account).
      → Then call requestClarification with the question and candidates listed.
      → Do NOT call completeStep — the session pauses until the user responds.
      → Use this when: you could list the right options but don't know which to pick.
         Examples: "checking account" but real name is "HDFC Current";
                   "main supplier" but 3 suppliers exist.

    GENUINELY MISSING DATA (correct search, data simply doesn't exist):
      → Call completeStep with result_summary explaining what was searched and what was missing.
      → Use this when: no reasonable candidates exist.
         Examples: "Found 0 postings for March 2024 — date range may be outside available data";
                   "No supplier named XYZ exists in the system".

  CRITICAL: You MUST call either completeStep OR requestClarification — never respond in plain text
    when a query step is active. Never leave a step open without calling one of these two tools.
    Include key numbers in result_summary. E.g. "Found 23 unmatched postings for HDFC account".
    Pass accumulated_context_update with any counts or facts needed by later steps.

IF status is 'executing' AND current step type is 'analysis':
  → Use the appropriate tools (e.g. suggestReconciliationMatches, analyticsQuery)
    to perform the analysis.
    CRITICAL: You MUST call completeStep IN THE SAME RESPONSE as the analysis tools.
    Do NOT end your response after an analysis tool call without also calling
    completeStep. Tool results are NOT carried over to the next turn — if you do
    not save them now via accumulated_context_update they will be permanently lost.
    IMPORTANT: When completing an analysis step, include the FULL structured tool
    output in accumulated_context_update under a descriptive key (e.g. "match_results"
    for reconciliation suggestions). The action step needs this data to create
    pending actions automatically. Do NOT summarize away structured data — pass it in full.
    Call completeStep with both result_summary (human-readable) AND
    accumulated_context_update (full structured data).

IF status is 'executing' AND current step type is 'action':
  → The system may handle this step automatically using a registered action builder.
    If the step is still active after completeStep returns (i.e. not already completed
    by the dispatcher), call queueActionBatch to create pending actions for human review.
    In supervised mode you MUST use queueActionBatch or queueAction.
    NEVER execute financial actions directly in supervised mode.
    After queuing all actions, call completeStep.

IF status is 'executing' AND current step type is 'report':
  → The system may handle this step automatically using a registered report formatter.
    If the step is still active after completeStep returns, read the accumulated_context
    and each step's result_summary. Write a concise plain-text summary for the user
    covering what was done and the outcomes. Then call completeStep.

RULES:
- NEVER skip steps
- NEVER combine steps
- ONE step at a time
- NEVER call queueAction or queueActionBatch outside of an 'action' step
- NEVER include IDs in user-facing responses — use names and references
- ALWAYS call completeStep to finish a step — even when results are empty or zero rows
- NEVER respond in plain text when a step is active. If you cannot find required data,
  call completeStep with result_summary describing what was searched and what was missing.
  Example: "Could not find a bank account matching 'checking'. Available bank accounts: [list them].
  User should re-run with the correct account name."
  The report step will surface this to the user. Do NOT leave a step open.
- NEVER write {{org_id}} or any {{placeholder}} in SQL queries. The org filter is
  applied automatically by the query tool — just write your WHERE conditions for the
  business data you need.
`;

/**
 * Build the DYNAMIC session state block (goal / status / accumulated context, plus
 * the full plan on the first turn and right after createPlan).
 *
 * Prompt-cache note: this block is intentionally the *volatile* part of the
 * system prompt and contains NO static instructions. The static
 * `SESSION_DIRECTIVE` is appended by the caller BEFORE this block so that the
 * cacheable prefix (base prompt + tool guidelines + SESSION_DIRECTIVE) stays
 * byte-identical across turns while only this trailing state block changes. See
 * [docs/agent/04-PROMPT_SYSTEM.md]. Compact header every turn (~50 tokens); full
 * plan on first turn and after createPlan.
 */
export function buildSessionStateBlock(
  session: {
    goal: string;
    mode: string;
    status: string;
    plan?: any;
    current_step_index?: number | null;
    pending_actions_count: number;
    accumulated_context?: any;
  },
  isFirstTurn: boolean,
  justCreatedPlan: boolean
): string {
  const plan = session.plan as any[] | null;
  const currentStep = plan?.[session.current_step_index ?? 0];

  const header = `
## Active Session Context
Goal: ${session.goal}
Mode: ${session.mode}
Status: ${session.status}${currentStep
      ? ` — Step ${(session.current_step_index ?? 0) + 1} of ${plan?.length}: ${currentStep.title}`
      : ''}
Pending actions: ${session.pending_actions_count} awaiting review
Accumulated: ${JSON.stringify(session.accumulated_context ?? {})}
`;

  if (isFirstTurn || justCreatedPlan) {
    return header + `\n## Full Plan\n${JSON.stringify(plan ?? [], null, 2)}\n`;
  }

  return header;
}

/**
 * Determine whether the agent should auto-continue to the next step.
 * Returns true for any step type while status is 'executing'.
 *
 * The pause happens naturally when completeStep transitions the session to
 * 'awaiting_approval' (pending_actions_count > completed_actions_count).
 * Action steps MUST run so the agent can call queueActionBatch — blocking
 * them here would leave the session stuck with no pending actions queued.
 *
 * Infinite-loop prevention is handled by the stepAdvanced guard in
 * AgentService (auto-continuation only fires if step index changed).
 */
export function shouldAutoContinue(session: {
  status: string;
  plan?: any;
  current_step_index?: number | null;
}): boolean {
  if (session.status !== 'executing') return false;
  const plan = session.plan as any[] | null;
  const currentStep = plan?.[session.current_step_index ?? 0];
  if (!currentStep) return false;
  return true;
}

