# Posting Analytics Prompt Test Harness

**Purpose:** Run the full agent flow (AgentService + prompts + tools + DB) against a fixed set of questions, capture the generated SQL and responses, and use the output report to iteratively improve prompt templates without manual UI testing.

**Audience:** Developers and prompt engineers refining the posting analytics prompts.

---

## 1. Overview

The test harness:

- Calls **AgentService.handleRequest()** directly with the same context shape the UI sends (`pageContext`).
- Uses **real** prompts (DynamicPromptManager), **real** tools (ToolManager), and **real** database queries.
- Runs either the **full suite** of test cases or a **single custom question** you provide (see [Running a single question](#22-running-a-single-question)).
- Runs a set of **test cases** (questions + expected behavior).
- Writes **reports** (Markdown + JSON) with:
  - Each question and expected behavior
  - Classification (analytical vs transactional)
  - All **queries generated** (tool name, description, reasoning, SQL, row count)
  - Final response text

You review the report, identify wrong or missing SQL/behavior, then update the prompt templates and re-run until the queries and responses match expectations.

---

## 2. How to Run

### 2.1 Full test suite

**From the backend directory:**

```bash
cd backend
npm run test:posting-prompt
```

This runs all defined test cases (see [Adding or changing test cases](#53-adding-or-changing-test-cases)) and writes the reports below.

### 2.2 Running a single question

You can run the agent with **one custom question** instead of the full suite. Same setup (auth, page context, DB) is used; no assertions are run — you get the full agent response and a report for that single run. Useful for ad-hoc prompts during development.

**Using `--question` or `-q`:**

```bash
cd backend
npm run test:posting-prompt -- --question "How much did I spend on groceries?"
npm run test:posting-prompt -- -q "Show my spending by category this month"
```

**Using a positional argument (first non-flag):**

```bash
npm run test:posting-prompt -- "How much did I spend on groceries?"
```

If you pass a custom question (via `--question`, `-q`, or the first positional arg), **only** that question is run; the full suite is skipped. Reports are still written for the single result.

### 2.3 Prerequisites and output (both modes)

**Prerequisites:**

- Database running with test data (same DB as normal dev).
- Environment variables set (see [Configuration](#3-configuration)).
- For posting analytics, an account ID in context is recommended (e.g. `TEST_ACCOUNT_ID` in `.env.test`).

**Output:**

- Console: test summary (passed/failed) and paths to reports.
- **Markdown report:** `backend/src/agent/__tests__/reports/posting-prompt-report.md`
- **JSON report:** `backend/src/agent/__tests__/reports/posting-prompt-report.json`
- **Timestamped JSON:** `backend/src/agent/__tests__/reports/posting-prompt-report-<timestamp>.json` (for history/comparison)

---

## 3. Configuration

Config is read from environment variables. The harness loads **`.env.test` first**, then `.env` for any missing vars.

| Variable | Description | Example |
|----------|-------------|--------|
| `TEST_USER_ID` | User ID for auth (must exist in DB) | `user_rajesh_kumar` |
| `TEST_ORG_ID` | Org ID for scoping | `org_rajesh` |
| `TEST_ACCOUNT_ID` | Selected account ID (simulates “selected card/bank” in UI) | `acco_org_rajesh_canada_2101` |
| `TEST_ACCOUNT_NAME` | Optional; if omitted, name is fetched from DB by ID | `Credit Card - CAN` |

**Example `.env.test`:**

```env
DATABASE_URL="postgresql://..."
TEST_ACCOUNT_ID=acco_org_rajesh_canada_2101
```

Context passed to the agent matches the UI: `modelName: 'posting'`, `viewName: 'posting_view'`, and when `TEST_ACCOUNT_ID` is set, `modelContext: { selectedAccountId, selectedAccountName }`. This drives prompt placeholder replacement (e.g. `{{context.modelContext.selectedAccountId}}`) and correct double-entry logic in generated SQL.

---

## 4. Report Contents

### 4.1 Markdown report (`posting-prompt-report.md`)

Best for human review.

- **Configuration:** User, org, selected account (if any).
- **Summary:** Total / Passed / Failed.
- **Per test case:**
  - Question and **Expected Behavior** (from test definition).
  - Classification (e.g. analytical, maxSteps).
  - Steps taken and elapsed time.
  - **Queries generated:** for each tool call, description, reasoning, **full SQL**, row count (and small result preview if present).
  - **Final response** (what the user would see).
- **Feedback template:** Placeholder section for noting issues and suggested prompt changes.

Use this to quickly see whether the SQL and response for each question are correct and to jot down what to change in the prompts.

### 4.2 JSON report (`posting-prompt-report.json`)

Structured data for tooling or diffing.

- `generated`: ISO timestamp.
- `config`: Same as TEST_CONFIG (user, org, selected account).
- `summary`: `{ total, passed, failed }`.
- `results`: Array of test results; each has `name`, `question`, `expectedBehavior`, `passed`, `errors`, `classification`, `stepsCount`, `queries` (array of `{ toolName, description, reasoning, sql, rowCount, result }`), `finalResponse`, `elapsedMs`, `timestamp`.

Use this to compare runs (e.g. before/after prompt edits) or to drive automated checks.

---

## 5. Using the Report to Improve Prompts

### 5.1 Iterative workflow

1. **Run the harness**  
   `npm run test:posting-prompt`

2. **Open the Markdown report**  
   `backend/src/agent/__tests__/reports/posting-prompt-report.md`

3. **Review each test:**
   - Does the **SQL** match the expected behavior (correct tables, joins, filters, `org_id`, selected account side)?
   - Is the **final response** accurate and helpful?
   - Note any placeholders left literal (e.g. `{{context.modelContext.selectedAccountId}}` or `{org_id}`) — those indicate missing replacement in DynamicPromptManager or missing context.

4. **Document feedback**  
   Use the “Feedback Template” section in the report (or a separate doc) to list:
   - **Issues:** e.g. “Total spending query does not filter by selected account,” “Groceries query uses exact match instead of ILIKE.”
   - **Suggested prompt changes:** e.g. “In analytics prompt, add an example for ‘total spend with selected card’ that uses `credit_account_id = selectedAccountId`.”

5. **Edit prompt templates**  
   Posting prompts live under:
   - `backend/prisma/metadata/prompt-templates/`
   - Files for posting view (e.g. `view_d8b6c832-62dd-48b4-b50d-20f24edbc969_*_zeiv.txt` and corresponding `.json`).
   - Default + analytics prompts: `*_default_zeiv.txt`, `*_analytics_zeiv.txt`.

6. **Sync and re-run**  
   If you changed metadata files (not DB directly):
   ```bash
   cd backend
   npx ts-node prisma/sync-metadata.ts
   npm run test:posting-prompt
   ```
   Compare the new report to the previous run (or to the timestamped JSON).

7. **Repeat** until the generated SQL and responses match expectations for all (or target) cases.

### 5.2 What to look for in the report

| Symptom | Likely cause | Where to fix |
|--------|----------------|--------------|
| SQL contains `{{context.modelContext.selectedAccountId}}` or `{org_id}` literally | Placeholders not replaced | DynamicPromptManager: ensure context (including `modelContext`) is passed and that `replacePlaceholders` handles `modelContext` and `org_id`. |
| “Total spend” sums all postings instead of filtering by selected account | Prompt doesn’t state that context account must be used | Analytics prompt: add/strengthen rule that when `selectedAccountId` is present, spending = credit side for card, debit for bank; add example. |
| Category/category name wrong (e.g. credit vs debit side) | Double-entry side unclear in prompt | Analytics prompt: clarify “expense → credit_account_id = payment account, category on debit; income → account_id = payment account, category on credit.” |
| No fuzzy match; exact account name required | No guidance on ILIKE / candidate resolution | Analytics prompt: add fuzzy-matching and multi-step resolution (e.g. ILIKE, then aggregate by candidate). |
| Agent gives up after one empty query | No instruction to retry or broaden | Analytics prompt: add “if query returns zero rows, broaden match or run diagnostic query before concluding no data.” |

### 5.3 Adding or changing test cases

Test cases are defined in the harness file:

- **File:** `backend/src/agent/__tests__/posting-prompt.test.ts`
- **Arrays:** `TEST_CASES` (always run), `TEST_CASES_WITH_ACCOUNT` (run only when `TEST_ACCOUNT_ID` is set).

Each case can specify:

- `name`, `question`, `expectedBehavior` (documentation and review).
- `expectAnalytical`, `minSteps`, `expectToolPatterns`, `expectResponseContains` (optional assertions).

Add a new case when you want to lock in desired behavior for a new question type; use `expectedBehavior` to describe the correct SQL/logic so the report stays useful for prompt tuning even if assertions are minimal.

---

## 6. Relation to Other Docs

- **Prompt requirements and business rules:** [POSTING_INCOME_EXPENSE_PROMPT_REQUIREMENTS.md](./POSTING_INCOME_EXPENSE_PROMPT_REQUIREMENTS.md)
- **End-to-end flow (context, tools, prompts):** [END_USER_CONVERSATION_FLOW.md](./END_USER_CONVERSATION_FLOW.md)
- **Main agent index:** [docs/AI_AGENT.md](../AI_AGENT.md)

The test harness does not replace UI testing; it gives a fast, repeatable way to check that **prompt + context → SQL + response** are correct so you can iterate on prompts efficiently and then validate in the UI when needed.
