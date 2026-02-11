# Requirements Prompt: Posting Income/Expense AI Agent

**Audience:** A coding agent (e.g., Opus, Codex) that will implement the feature.  
**Goal:** Build a model-specific prompt and minimal code changes so end users can ask the AI about their **income and expense entries** stored in the **posting** model, with correct use of tools and UI-derived context.  
**Usage:** Section 0 is a **starting prompt** for an interactive session — you will interact with the model as it asks questions to firm up the requirements before or during implementation.

---

## 0. Starting Prompt for an Interactive Requirements Session

**How to use this:** Paste the block below into your coding agent (Opus, Codex, etc.) as the **opening message**. This is **not** a one-shot instruction — you will interact with the model as it asks questions to firm up the requirements. The agent may ask for clarification on scope, edge cases, or implementation choices; answer those questions so the agent can refine the spec before (or while) implementing.

**Opening message to give the coding agent:**

```
I want to add a posting-specific AI prompt and minimal backend/frontend wiring so end users can ask the assistant about their income and expense entries.

**Reference doc:** Use docs/agent/POSTING_INCOME_EXPENSE_PROMPT_REQUIREMENTS.md as the main spec. I’ll answer your questions to clarify anything that’s ambiguous or missing. Ask me what you need to pin down before or during implementation — e.g. scope, examples, or trade-offs.

**Context:**
- Income/expense data lives in the `posting` model (double-entry: account_id = debit, credit_account_id = credit, amount, posting_date, value_date). The `category_id`/`category_name` fields on posting are NOT used.
- "Category" in this system is the contra/counter account: the other account head in the double entry. E.g. if a bank account receives rent, debit=bank and credit=rental income account — the rental income account is the effective "category". See backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts, backend/src/agent/handlers/erp/utils/categorizationUtils.ts (counter-account), and frontend-1/src/pages/reports/SimpleTransactionList.tsx (transformPostingData: category_name = other account’s name).
- Chart of accounts is in the `account` model. The agent uses DynamicPromptManager (view + prompt_type), ToolManager (tools by modelName), and question classification (analytical vs transactional). See docs/agent/END_USER_CONVERSATION_FLOW.md.

**What I’m aiming for:**
1. A default system prompt for the posting model that explains double-entry and contra-account-as-category, uses the usual placeholders and recordId context, and steers the LLM to analytics tools for questions like "how much did I spend on groceries last month?" or "how much did I incur on the credit card in Feb?"
2. View + prompt_template(s) for posting per END_USER_CONVERSATION_FLOW §6.
3. A `posting` branch in ToolManager.getToolsForModel() with at least searchRecords and advancedSqlQuery.
4. Optional: questionClassifier extended so "spend", "incur", "income last month" etc. are classified as analytical.
5. Frontend pageContext set to modelName: 'posting', viewName: 'posting_view' (and recordId when on a posting detail page), same pattern as Invoice.tsx / Master.tsx.

Do not add new API routes; use the existing agent chat and analytics tools. If anything is unclear, ask me before implementing.
```

---

## 1. Business and System Context (from Fabriq docs)

### 1.1 Domain

- **Posting** (`posting`) is the core of double-entry bookkeeping. Each row is a journal entry with:
  - `account_id` → debit account (FK to `account`)
  - `credit_account_id` → credit account (FK to `account`)
  - `amount` (Decimal)
  - `posting_date`, `value_date` (DateTime)
  - `description`, `notes`, `posting_type`, `org_id`, etc.
  - **Note:** The `category_id` / `category_name` fields on posting are **not used** in this codebase. The effective “category” for a posting is the **contra/counter account** — the other account head in the double entry.

- **Account** (`account`) is the Chart of Accounts. Fields include: `id`, `name`, `code`, `type` (array), `classification`, `org_id`, etc. Account `type` and `classification` distinguish asset, liability, equity, income, expense.

- **Contra / counter account = “category”:** When one leg of a posting is a bank account or credit card, the **other leg** (the contra account) is treated as the category. Examples:
  - Bank receives rent: debit = bank, credit = rental income account → “category” = rental income account head.
  - Credit card payment for groceries: debit = groceries expense account (or similar), credit = credit card → “category” = the expense account head (e.g. “Groceries” if that’s an account name).
  This is implemented in: `backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts`, `backend/src/agent/handlers/erp/utils/categorizationUtils.ts` (counter-account logic: “Money OUT: Bank is credited, counter-account is debited”; “Money IN: Bank is debited, counter-account is credited”), and `frontend-1/src/pages/reports/SimpleTransactionList.tsx` — see `transformPostingData`: `category_name` is `creditAccount?.name` when the selected account is debit, or `debitAccount?.name` when the selected account is credit (with `posting.category?.name` only as fallback).

- **Income vs expense:** For “how much did I spend on X” or “how much did I incur on the credit card in Feb”:
  - **By contra account:** Sum `posting.amount` where the **other account** (the one that is not the user’s bank/credit-card) matches X — e.g. an account named “Groceries” or “Rental Income”. Use `posting.account_id`/`posting.credit_account_id` joined to `account` and filter by the chosen “reference” account (bank/credit card) to get the contra side.
  - **By bank/credit-card account:** Sum postings where that account is on the credit side (money out) or debit side (money in), filtered by `posting_date` / `value_date`.
  The prompt and tools must describe this contra-account-as-category model clearly; do **not** instruct the LLM to use `posting.category_id` or `category` for spending/income breakdowns.

### 1.2 Existing Agent Architecture (reference only; implement per this spec)

- **Docs:** `docs/agent/END_USER_CONVERSATION_FLOW.md`, `docs/AGENT_END_USER_DOC_PROMPT.md`, `docs/BUSINESS_DOMAIN.md`.
- **Prompt loading:** `DynamicPromptManager` loads templates from DB (or local files when `USE_LOCAL_PROMPT=true`). Templates are keyed by **view** (`view.model_name`, `view.name`) and **prompt_type** (e.g. `default`, `analytics`).
- **Request flow:** Frontend sends `context: { modelName, viewName, recordId?, stateId?, viewId?, currentPath?, promptTypes? }`. Backend uses `context.modelName` for prompt selection and tool selection; when the question is **analytical**, `context.promptTypes` is set to `['analytics','default']` and analytics tools (`getAnalyticsContext`, `analyticsQuery`) are used.
- **Tools:** Chosen by `ToolManager.getToolsForModel(modelName, auth, context)`. For analytical questions, `ToolManager.getToolsForClassification(classification, auth, context)` returns analytics tools. The **posting** model currently has no dedicated bundle, so it falls through to “full” or default tools. The implementation must ensure analytical questions about postings use the analytics pipeline and, when `context.modelName === 'posting'`, use a posting-specific system prompt (and analytics prompt if applicable).

---

## 2. User Stories and Example Questions

End users should be able to ask things like:

1. **“How much did I spend on groceries last month?”**  
   → Sum of posting amounts where the **contra account** (the other leg) is an account named “Groceries” or similar (e.g. expense account), and posting_date/value_date in last calendar month. Do **not** use `posting.category_id` or the `category` table.

2. **“How much did I incur on the credit card in February?”**  
   → Sum of postings where the “Credit card” (or similarly named) account is the reference account and value_date/posting_date in February; “incur” = expense/outflow, so the credit-card account is typically credited (money out). The contra account in those rows is the effective “category” (e.g. Groceries, Utilities).

3. **“What was my total income last quarter?”**  
   → Sum of postings where the contra account (or the credited account, depending on perspective) is an income-type account (`account.classification` or `account.type`), in that quarter.

4. **“Show me my biggest expenses by category this year.”**  
   → Aggregate by **contra account** (the other account head: `account_id` or `credit_account_id` depending on which is the reference account), filter by year, sort by sum(amount) descending. “Category” here = contra account, not the `category` table.

5. **“How much did I spend?”** (when on a posting **detail** page)  
   → Can be clarified as “this posting’s amount” or “total for this contra account / period,” depending on prompt and recordId context.

The agent must:
- Prefer **analytics tools** (`getAnalyticsContext`, `analyticsQuery`) for all aggregation/sum/count/breakdown questions over time or by contra account.
- Use **search** only when the user asks for a list of postings (e.g. “show my grocery postings from March”) or for lookups supporting analytics.
- Be able to map natural language to:
  - **Tables:** `posting`, `account`. Do **not** use the `category` table for spending/income breakdowns; “category” = the contra account (`account_id` or `credit_account_id` joined to `account.name`).
  - **Dates:** “last month” → first to last day of previous month; “February” / “Feb” → current or specified year’s February; “last quarter” → quarter boundaries.
  - **Concepts:** “spend” / “expense” / “incur” → postings that represent outflows (e.g. credit side of bank/credit-card); “income” → postings that represent inflows; “by category” / “groceries” / “rent” → the **contra account** (the other account head in the double entry); “credit card” / “bank” → the reference account (`account_id` or `credit_account_id`).

---

## 3. Requirements for the Coding Agent

You are to implement the following so that a **posting-aware, income/expense-focused** system prompt is used when the user is in a posting context, and so that analytical questions use the analytics pipeline with the right schema and wording.

### 3.1 System Prompt (posting context)

- **When:** The system prompt for “posting” must be used when the frontend sends `context.modelName === 'posting'` (and optionally `context.viewName === 'posting_view'` or the configured view name).
- **Content:** The prompt must:
  1. **Set role and scope:**  
     “You are a financial assistant helping the user understand their income and expense entries. Data is stored in the **posting** model (double-entry journal entries: debit account and credit account). The Chart of Accounts is in the **account** model. The **category** field on posting is not used; the effective ‘category’ for a posting is the **contra/counter account** — the other account head in the double entry. E.g. if a bank account receives rent, the counter account is the rental income account; that account head is the ‘category’ for that transaction. See backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts and frontend-1/src/pages/reports/SimpleTransactionList.tsx for how contra account is used.”

  2. **Describe the posting model in one paragraph:**  
     - Each posting has: debit account (`account_id`), credit account (`credit_account_id`), `amount`, `posting_date`, `value_date`, `description`. Do **not** use `posting.category_id` or `category_name` for categorization.  
     - “Spending” / “expense” = postings where the user’s bank/credit-card is credited (money out); the **contra account** (the debited account) is the “category” (e.g. Groceries expense account).  
     - “Income” = postings where the user’s bank is debited (money in); the **contra account** (the credited account) is the “category” (e.g. Rental Income account).  
     - For “how much did I spend on X”, sum `amount` over postings where the **contra account** (the other leg) matches X (e.g. account name “Groceries” or similar), and filter by date. Use only `posting` and `account`; join on `account_id` / `credit_account_id` to get the contra account name.

  3. **Inject standard placeholders:**  
     `{{currentDate}}`, `{{userId}}`, `{{accessibleModels}}` (or equivalent per existing DynamicPromptManager behaviour).  
     Use `{{#if context.recordId}}...{{else}}...{{/if}}`:
     - **If `context.recordId` is set:** “The user is viewing posting record {{context.recordId}}. They may ask about this posting’s amount, its contra account (the other account head), or totals for the same contra account/period.”
     - **Else:** “No specific posting is selected. Answer questions about spending, income, and totals by contra account (the other account head in the double entry) or time period using the posting and account data only.”

  4. **Tool and behaviour guidelines (concise):**  
     - For “how much did I spend on X”, “total income in Y”, “breakdown by category”, “incur on credit card in Z”: use the **analytics** flow (getAnalyticsContext then analyticsQuery) with SQL over `posting` and `account`. “Category” = contra account: the other account in the double entry (use `account_id` or `credit_account_id` joined to `account`). Do **not** use the `category` table or `posting.category_id`.  
     - Always restrict to the user’s org (`posting.org_id`, `account.org_id`).  
     - For “list my postings…” use searchRecords on the posting model with appropriate filters.  
     - Map natural-language time expressions to `posting_date` or `value_date` (e.g. “last month”, “February”, “last quarter”).

  5. **Stay consistent with existing prompt style:**  
     Same tone and structure as other model-specific prompts (e.g. invoice, purchase_requisition). Follow existing placeholders and any “Tool response” / “Don’t show raw IDs” rules from the codebase.

### 3.2 Analytics Prompt (posting, optional but recommended)

- When the user asks an analytical question and `context.modelName === 'posting'`, the backend already sets `context.promptTypes = ['analytics','default']` and uses analytics tools. In addition, a **posting-specific analytics** template improves reliability.
- **Requirement:** Add an analytics prompt type for the posting view that:
  - States that the user is asking about aggregates (spending, income, totals by contra account or period).
  - Reminds the LLM of table names: `posting`, `account` only; key columns: `posting.amount`, `posting.posting_date`, `posting.value_date`, `posting.account_id`, `posting.credit_account_id`, `account.name`, `account.type`, `account.classification`. “Category” = the **contra account** (the other account in the double entry); do **not** use `posting.category_id` or the `category` table.
  - Emphasizes org-scoping (`posting.org_id`, `account.org_id`) and using `posting_date` or `value_date` for time filters.
  - Can be merged with the default posting prompt using the existing `priority`/`prompt_type` merge rules (see END_USER_CONVERSATION_FLOW §6).

### 3.3 Backend Code Changes

1. **View and prompt_template (DB or local files)**  
   - Ensure a **view** exists with `model_name = 'posting'` and a stable view name (e.g. `posting_view`). If the project uses metadata JSON, add/update accordingly.  
   - Insert (or add as local template) a **default** prompt_template row for this view with the system prompt text described in §3.1.  
   - If implementing §3.2, add an **analytics** prompt_template for the same view with the posting-analytics reminder text.

2. **ToolManager**  
   - Add an explicit case for `modelName === 'posting'` in `ToolManager.getToolsForModel()`.  
   - **Minimum:** Include `searchRecords`, `advancedSqlQuery` (for ad-hoc SQL when not going through analytics).  
   - **Recommended:** Reuse the same tool set as `default` or a small superset so that when the question is **transactional**, the agent can still search/create postings if needed. When the question is **analytical**, the existing classification already routes to `getToolsForClassification`, so no change there beyond ensuring the posting **prompt** is used (via `context.modelName = 'posting'`).

3. **Question classifier (optional but recommended)**  
   - In `questionClassifier.ts`, ensure phrases like “how much did I spend”, “how much did I incur”, “total expense”, “income last month”, “spending by category” are treated as **analytical**.  
   - The existing patterns already include “total … amount … spend” and “per (day|week|month|year)”. Add or extend patterns so that “spend”, “incur”, “income”, “expense” (when used in an aggregate sense) trigger analytical classification. Prefer one or two small, clear regexes to avoid false positives on transactional phrasing (e.g. “create an expense report”).

### 3.4 Frontend Code Changes

1. **PageContext when user is on posting-related pages**  
   - Whenever the user is on a **posting list** (e.g. “Posting list”, “Transactions”, or any route that shows postings as the main entity), set `pageContext` so that:
     - `modelName === 'posting'`
     - `viewName === 'posting_view'` (or the configured view name for postings)
     - `recordId === null` on list pages.
   - Implement this in the same way as other list pages (e.g. Invoice, Purchase Order): in the component that wraps the list, call `setPageContext({ modelName: 'posting', viewName: 'posting_view', recordId: null, ... })` on mount and clear on unmount.

2. **PageContext when user is on a posting detail page**  
   - If the app has a **posting detail** route (e.g. `/posting/:id/view/:viewId` or equivalent), set:
     - `modelName === 'posting'`
     - `viewName === 'posting_view'` (or the same view name)
     - `recordId === <id of the current posting>`
   - If there is no dedicated posting-detail route today, the prompt’s `{{#if context.recordId}}` branch will never run; that is acceptable. The implementation must still ensure list-level context is set as above.

3. **Chat request payload**  
   - Ensure the existing chat API sends the same `context` object (including `modelName`, `viewName`, `recordId`) that other model pages send. No new fields are required; re-use the existing `PageContext` shape and the backend’s use of `context.modelName` and `context.recordId`.

### 3.5 What You Must Not Do

- Do not add new API routes for “posting analytics”; use the existing agent chat endpoint and analytics tools.
- Do not duplicate large sections of `END_USER_CONVERSATION_FLOW.md` or `AI_AGENT.md` inside the new prompt text; keep the prompt concise and actionable.
- Do not change authentication or permission resolution; all tools already run with the request’s auth and org.

---

## 4. Deliverables Checklist (for the coding agent)

- [ ] **View:** View exists for `posting` with a defined view name (e.g. `posting_view`).
- [ ] **Default prompt:** A default prompt_template for that view implementing §3.1 (placeholders, recordId branch, income/expense/posting/account/contra-account-as-category explanation, tool guidance).
- [ ] **Analytics prompt (optional):** An analytics prompt_template for the same view implementing §3.2.
- [ ] **ToolManager:** Branch for `posting` in `getToolsForModel()` with at least `searchRecords` and `advancedSqlQuery` (and any other tools you deem useful for transactional posting use).
- [ ] **Question classifier:** Optional extended patterns so “spend” / “incur” / “income” / “expense” in aggregate sense are analytical.
- [ ] **Frontend – list:** On posting list / transactions pages, set `pageContext` with `modelName: 'posting'`, `viewName: 'posting_view'`, `recordId: null`.
- [ ] **Frontend – detail:** If a posting detail route exists, set `pageContext` with the same model/view and `recordId: <current posting id>`.
- [ ] **Docs:** Update or point from `docs/agent/` or `docs/AGENT_END_USER_DOC_PROMPT.md` to this requirements doc so future changes stay traceable.

---

## 5. Reference: Key Files and Conventions

- **Prompt loading:** `backend/src/agent/prompt/DynamicPromptManager.ts` — `getPromptTemplatesFromDatabase()` / `getPromptTemplatesFromFiles()`; match on `view.model_name`, `view.name`, `prompt_type`.
- **Prompt template table:** `prompt_template` in `backend/prisma/schema/metadata.prisma`; columns include `view_id`, `prompt_type`, `prompt_text`, `is_default`, `priority`, `version`, `app_name`.
- **Tool bundles:** `backend/src/agent/ToolManager.ts` — `getToolsForModel(modelName, auth, context)`.
- **Question classification:** `backend/src/agent/utils/questionClassifier.ts` — `classifyQuestion(text)`; analytical → `getToolsForClassification()` and `promptTypes: ['analytics','default']`.
- **Agent flow:** `backend/src/agent/AgentService.ts` — `handleRequest` / `handleStreamingRequest` use `context.modelName` for prompt and tools; they set `enhancedContext.promptTypes` when classification is analytical.
- **Frontend context:** `frontend-1/src/contexts/ChatContext.tsx` — `PageContext` type; `setPageContext` usage in `Master.tsx` and in model-specific pages (e.g. `Invoice.tsx`, `PurchaseRequisitionDetail.tsx`).
- **Existing prompt examples:** `backend/prisma/metadata/prompt-templates/` — naming `view_{viewId}_{promptType}_zeiv.txt` (or equivalent); see END_USER_CONVERSATION_FLOW §6 for the posting example and view resolution.

---

## 6. Acceptance (High Level)

- A user on the **posting list** (or transactions) who asks “How much did I spend on groceries last month?” receives an answer that aggregates postings by **contra account** (the other account head, e.g. an account named “Groceries”) and last month’s dates, using the analytics path. The agent must **not** use `posting.category_id` or the `category` table.
- A user who asks “How much did I incur on the credit card in February?” receives an answer that aggregates postings where the credit-card account is the reference account (typically credited = money out) for February; the contra account in those rows is the effective “category.”
- When the user is on a **posting detail** page (if it exists), the system prompt’s record-specific branch is active and the agent can tailor answers to “this posting” or “same contra account/period.”
- All answers respect org_id and the user’s permissions; no new security bypasses are introduced.

Use this document as the single requirements source for the “posting income/expense prompt” feature when implementing prompt content, backend tool/prompt wiring, and frontend context.

**See also:** [POSTING_PROMPT_TEST_HARNESS.md](./POSTING_PROMPT_TEST_HARNESS.md) — how to run the posting analytics test harness and use the output report to iteratively improve prompts.
