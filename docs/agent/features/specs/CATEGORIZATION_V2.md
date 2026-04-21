# Spec: Categorization V2 — Smarter Historical Matching + Per-Account Extraction Hints

**Status**: Draft  
**Last Updated**: 2026-04-21  
**Related existing doc**: [`docs/agent/features/CATEGORIZATION.md`](../CATEGORIZATION.md)

---

## 1. Problem

The current categorization pipeline has two weaknesses:

1. **Too many LLM calls.** Historical matching misses transactions it should catch because (a) the historical corpus excludes AI-categorized postings that humans approved, and (b) Levenshtein distance on raw bank description strings fails whenever reference numbers, dates, or bank prefixes differ between otherwise identical transactions.

2. **Generic extraction.** The bank statement extractor uses one prompt for every account. Account-specific quirks (e.g. ICICI's "EBA" prefix meaning ICICI Direct transfers, or bank-specific interest narrative patterns) are invisible to the LLM, causing mis-categorization and wrong transaction direction.

---

## 2. Goals

| Goal | Success Metric |
|------|---------------|
| Increase historical match rate | ≥ 70% `historical_match_count / total_processed` on orgs with 90+ days of approved categorizations (up from estimated 30–40%) |
| Reduce LLM calls per batch | ≥ 50% reduction in `llm_categorized_count` on mature orgs |
| Enable account-specific extraction | Users can save extraction hints on a bank account; hints are injected into the extraction prompt for that account |
| No regressions | Existing E2E test `v2-categorise-expenses-e2e.test.ts` passes unchanged |

---

## 3. Feature A — Smarter Historical Matching

### A1. Expand the Historical Corpus

**Current behaviour**: `fetchHistoricalMappings` filters `ai_cat_score: null`, meaning only manually-entered postings are used. Every AI-categorized posting (including ones approved by the user through the pending action workflow) is excluded.

**New behaviour**: Include all postings where both sides are filled (`account_id IS NOT NULL AND credit_account_id IS NOT NULL`), regardless of `ai_cat_score`. Remove the `ai_cat_score: null` filter entirely.

**Rationale**: A posting with both sides filled is the record of a categorization decision. Whether it was manually entered or AI-suggested-and-human-approved doesn't change that it's trustworthy signal. If a user later corrects it, the correction appears as a newer posting and wins via A4 conflict resolution below.

**Edge cases**:
- A posting auto-applied with confidence 0.3 (low confidence, no human review) is still included. This is acceptable — the corpus is large enough that one bad signal is diluted by frequency. If the user never corrected it, it was probably fine.
- A posting where both sides are a bank/cash account (bank-to-bank transfer) should be excluded from the corpus since it doesn't represent a categorization — it's a transfer. **Rule**: exclude mappings where both the debit and credit accounts have type `BANK | CREDIT_CARD | CHECKING | SAVINGS`.

### A2. Description Normalization

**Current behaviour**: `normalizeDescription` does `toLowerCase().trim()` only.

**New behaviour**: After lowercasing, apply a two-pass normalization pipeline:

**Pass 1 — Strip noise tokens** (regex, in order):

| Pattern | What it matches | Replacement |
|---------|----------------|-------------|
| `\b(upi|neft|rtgs|imps|nach|ecs)\s*[\/\-]?\s*\d{6,}\b` | Payment rail + reference number | payment rail only (e.g. `"upi"`) |
| `\b\d{8,}\b` | Standalone long reference numbers | `""` (remove) |
| `\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b` | Embedded dates (01/03/2026) | `""` |
| `\b(jan\|feb\|mar\|apr\|may\|jun\|jul\|aug\|sep\|oct\|nov\|dec)[a-z]*[\s\-]?\d{0,4}\b` | Month names with optional year | `""` |
| `\b(hdfc bank\|icici bank\|sbi\|axis bank\|kotak bank\|yes bank\|indusind)\b` | Bank name prefixes | `""` |
| `\b(pos\|atm\|clg\|chq\|si\b)` | Transaction type prefixes | `""` |
| `\*{3,}\d+` | Masked card number fragments (****1234) | `""` |
| `\s{2,}` | Multiple spaces | single space |

**Pass 2 — Extract vendor core**: after stripping, take the first 6 tokens (words) of the result. This prevents long multi-segment descriptions from reducing similarity scores.

**Example transformations**:

| Raw description | After normalization |
|----------------|---------------------|
| `UPI/423156789012/Swiggy Technologies Pvt Ltd/swiggy@paytm` | `swiggy technologies pvt ltd swiggy@paytm` |
| `NEFT-HDFC0001234-Prasanna Jaganathan-REF20250312001` | `prasanna jaganathan` |
| `POS 441234XXXXXX1234 AMAZON IN` | `amazon in` |
| `HDFC BANK NEFT CR REF123456 Rent Mar2026` | `rent` |
| `EBA/20250312/ICICI DIRECT/SELL` | `eba icici direct sell` |

**Note on "EBA"**: normalization intentionally preserves `eba` tokens — they are meaningful account-specific context (see Feature B). They should NOT be stripped.

### A3. Fuzzy Matching Algorithm

**Current behaviour**: Levenshtein distance via custom `calculateSimilarity`, threshold 0.85.

**New behaviour**: Replace with `fuzzball.token_set_ratio` from the `fuzzball` npm package.

- `token_set_ratio` splits strings into tokens, sorts them, and compares the intersection + remainder — which handles word-order variations and partial matches far better than character-level edit distance.
- New threshold: **0.80** (lower is safe because token-set comparison on normalized strings is already more precise than Levenshtein on raw strings).
- The `findFuzzyMatch` function signature stays the same; only the internals change.

**Why fuzzball**: ~231k weekly downloads, TypeScript types included, direct port of Python FuzzyWuzzy which is widely used in financial data processing.

**Example improvement**:

| Pair | Levenshtein similarity | token_set_ratio |
|------|----------------------|-----------------|
| `"swiggy technologies pvt ltd"` vs `"swiggy"` | 0.31 | 0.94 |
| `"amazon in"` vs `"amazon seller"` | 0.54 | 0.77 |
| `"prasanna jaganathan"` vs `"prasanna jaganathan"` | 1.00 | 1.00 |

### A4. Conflict Resolution — Most Recent Wins

**Current behaviour**: `distinct: ['description']` returns whichever row the database returns first.

**New behaviour**: Fetch all fully-categorized postings (no `distinct`), group by normalized description, and for each group pick the entry with the **most recent `created_at`**.

**Rationale**: If a user recategorized a transaction (corrected a mistake), the newest mapping reflects current intent. Most-recent is simple, auditable, and doesn't require a frequency count query.

**Edge case**: If two postings have the same normalized description but different counter-accounts and the same `created_at` (unlikely but possible in bulk imports), pick the one with the higher `ai_cat_score` (or `null` last, meaning manual entry wins ties with AI entries).

### A5. Direction-Filtered Account List for LLM Prompts

**Current behaviour**: Every LLM call receives all four account groups (expense + income + asset + liability) even though the transaction direction is known before calling the LLM.

**New behaviour**: In `buildBulkPrompt`, group the transactions by direction and pass only the relevant accounts per group, OR split the batch into two sub-batches (money_in, money_out) and pass filtered account lists.

- `money_out` transactions → expense + liability accounts only
- `money_in` transactions → income + asset accounts only

This reduces the account list context by ~50–75% per call.

**Implementation note**: Since a batch may have mixed directions, the simplest approach is to filter `formatAllAccountsForPrompt` by the direction of the majority of transactions in the chunk, OR pass a per-transaction direction hint in the prompt and send all accounts (simpler, less token saving). **Decision for implementation**: split batch into direction-homogeneous sub-batches.

---

## 4. Feature B — Per-Account Extraction Hints

### B1. Data Model

Add a new nullable text field to the `account` model:

```
account.extraction_notes: String?  // Prisma: String? @db.Text
```

This field stores free-form text written by the user describing account-specific extraction quirks. It is not a prompt template — it is **additional context** appended to the standard extraction prompt.

**Constraints**:
- Max length: 2000 characters (enforced in UI, not DB)
- Visible and editable only when the account has `type` containing `BANK | CREDIT_CARD | CHECKING | SAVINGS` (only bank accounts have statements)
- Stored per-account, not per-import

### B2. UI — Account Edit Screen

In the account edit form, when the account type is a bank/credit card account, show a new optional textarea field:

- **Label**: "Statement extraction hints"
- **Placeholder**: `"e.g. EBA in the description means a transfer to/from ICICI Direct trading account. Interest credits appear as 'INT.PD' followed by a period."`
- **Help text**: "These notes are sent to the AI when extracting bank statements for this account. Describe any account-specific patterns, terminology, or quirks."
- Field is collapsible / in an "Advanced" section to avoid cluttering the main form

### B3. Extraction Pipeline Integration

**Where**: `BankStatementWithCategorizationExtractor.augmentPromptWithContext()` and `BankStatementExtractor.getExtractionPrompt()`.

**How**: Both extractors currently receive `options` when called. Pass the `account.extraction_notes` value through to `augmentPromptWithContext`. If non-null, append a clearly-labelled block to the assembled prompt:

```
=== ACCOUNT-SPECIFIC NOTES ===
The following notes were provided by the account owner about this particular bank account.
Apply these when interpreting transaction descriptions:

{account.extraction_notes}
```

This block is appended **after** the base extraction prompt and **before** the Chart of Accounts block (so it takes precedence over generic patterns but doesn't override account IDs).

**Caller responsibility**: whoever calls `prepareCategorizationContext` or `extract()` must pass `extractionNotes` if it's available on the account. The import handler (`/api/import`) is the primary caller.

**Fallback**: if `extraction_notes` is null or empty, prompt is assembled exactly as today — no change.

**Edge case**: if `extraction_notes` contains prompt injection attempts (e.g. `"Ignore previous instructions..."`), the notes are rendered as user-supplied context text within a labelled block, not as system instructions. The system prompt establishes the LLM's role and rules prior to this block, which limits injection surface.

---

## 5. Edge Cases Catalogue

| Scenario | Expected behaviour |
|----------|-------------------|
| Posting description is null | Skip normalization, skip fuzzy match — send to LLM |
| Normalized description is empty string after stripping | Skip fuzzy match — send to LLM |
| Historical corpus is empty (new org) | Skip historical match phase entirely — send all to LLM |
| fuzzball returns score for empty string | Guard: return null if either string is empty |
| Two historical mappings with same normalized description but different accounts | Most recent `created_at` wins |
| Bank-to-bank transfer in historical corpus (both sides are bank accounts) | Excluded from corpus (see A1) |
| `extraction_notes` is 3000 characters (over limit) | UI truncates at 2000; backend truncates on save |
| Account has no `extraction_notes` but caller passes `undefined` | Treat same as null — omit the block |
| Batch has mixed directions (money_in + money_out) | Split into two sub-batches for LLM; each gets direction-filtered accounts |
| LLM returns invalid account ID after direction filtering | Existing validation catches it — marked as error in result |

---

## 6. Acceptance Criteria

These are the testable assertions that define "done". Each maps to one or more unit/integration tests.

### Feature A — Historical Matching

**AC-A1**: Given a posting whose description normalizes to a string that matches a historical mapping with `token_set_ratio ≥ 0.80`, the batch handler returns `confidence: 'high'` and `reasoning` contains "Historical match" — without calling the LLM.

**AC-A2**: Given a posting whose `ai_cat_score` is non-null (AI-categorized) and both sides are filled, `fetchHistoricalMappings` includes it in the returned corpus.

**AC-A3**: Given two postings with the same normalized description mapping to different accounts (different `created_at`), `fetchHistoricalMappings` returns only the entry with the newer `created_at`.

**AC-A4**: Given a posting where both `account.type` and `credit_account.type` are `BANK`, `fetchHistoricalMappings` does NOT include it in the corpus.

**AC-A5**: `normalizeDescription("UPI/423156789012/Swiggy Technologies Pvt Ltd/swiggy@paytm")` returns a string containing `"swiggy technologies pvt ltd"` and not containing `"423156789012"`.

**AC-A6**: `normalizeDescription("NEFT-HDFC0001234-Prasanna Jaganathan-REF20250312001")` returns `"prasanna jaganathan"` (or similar with bank prefix stripped).

**AC-A7**: `normalizeDescription("EBA/20250312/ICICI DIRECT")` preserves `"eba"` — does not strip it.

**AC-A8**: `findFuzzyMatch("swiggy technologies", mappings_containing_"swiggy")` returns the "swiggy" mapping when `token_set_ratio("swiggy technologies", "swiggy") ≥ 0.80`.

**AC-A9**: A batch of 10 postings where 7 have historical matches results in exactly 3 items sent to the LLM (verified by mocking the LLM call).

**AC-A10**: For a `money_out` batch, the LLM is called with a prompt containing expense/liability accounts and NOT containing income accounts.

### Feature B — Per-Account Extraction Hints

**AC-B1**: When `account.extraction_notes = "EBA means ICICI Direct transfer"` and a bank statement is extracted for that account, the assembled prompt contains the exact string `"EBA means ICICI Direct transfer"` within the `=== ACCOUNT-SPECIFIC NOTES ===` block.

**AC-B2**: When `account.extraction_notes` is null, the assembled prompt does NOT contain `=== ACCOUNT-SPECIFIC NOTES ===`.

**AC-B3**: The `extraction_notes` field is present in the account edit view for accounts with type `BANK` or `CREDIT_CARD`.

**AC-B4**: The `extraction_notes` field is NOT visible in the account edit view for accounts with type `Expense` or `Income`.

**AC-B5**: Saving `extraction_notes` with > 2000 characters is rejected by the UI with a validation message before submission.

---

## 7. Out of Scope

- Vendor name canonicalization (e.g. mapping "SWIGGY TECHNOLOGIES PVT LTD" → a canonical `vendor` entity). This is a separate future feature.
- Caching `fetchHistoricalMappings` in-process across requests. Useful but not blocking; can be added as a follow-up.
- Showing the user which historical match was used (audit trail). Follow-up.
- Extraction hints for non-bank accounts (invoices, purchase orders). Follow-up.
- Automatic learning from user corrections (detecting when a user overrides an AI categorization and updating the corpus immediately). Follow-up.

---

## 8. Files That Will Change

| File | Change |
|------|--------|
| `backend/prisma/schema/*.prisma` | Add `extraction_notes String? @db.Text` to `account` model |
| `backend/src/agent/handlers/erp/utils/categorizationUtils.ts` | Replace `normalizeDescription`, `calculateSimilarity`, `findFuzzyMatch`; update `fetchHistoricalMappings` (remove `ai_cat_score: null` filter, add bank-to-bank exclusion, most-recent resolution) |
| `backend/src/agent/handlers/erp/categorizeTransactionBatch.ts` | Split LLM batch by direction (A5) |
| `backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts` | Accept and inject `extractionNotes` in `augmentPromptWithContext` |
| `backend/src/lib/extractors/bank-statement-extractor.ts` | Accept and inject `extractionNotes` in `getExtractionPrompt` (or a new override) |
| `backend/src/lib/extractors/types.ts` | Add `extractionNotes?: string` to extractor options type |
| Import handler (caller of extractors) | Pass `account.extraction_notes` when calling `prepareCategorizationContext` |
| `frontend-1/src/...` (account edit form) | Add `extraction_notes` textarea field, conditional on account type |
| `backend/src/agent/__tests__/...` | New unit tests for AC-A1 through AC-A10, AC-B1 through AC-B5 |

---

## 9. No-LLM Test Coverage

The LLM API key will not be available in the cloud test session. This is fine — the majority of the new logic is preprocessing that runs *before* the LLM is called. The following table lists every unit of testable behaviour, whether it needs a DB, and whether it needs the LLM.

### 9.1 What Can Be Tested Without LLM

| # | What | DB needed | LLM needed | AC items covered |
|---|------|-----------|------------|-----------------|
| T1 | `normalizeDescription` — strips UPI ref numbers | No | No | AC-A5 |
| T2 | `normalizeDescription` — strips NEFT prefix + bank code | No | No | AC-A6 |
| T3 | `normalizeDescription` — preserves `eba` token | No | No | AC-A7 |
| T4 | `normalizeDescription` — strips POS card fragments | No | No | AC-A5 |
| T5 | `normalizeDescription` — strips embedded dates | No | No | AC-A5 |
| T6 | `normalizeDescription` — strips bank name prefixes | No | No | AC-A5 |
| T7 | `normalizeDescription` — collapses multiple spaces | No | No | AC-A5 |
| T8 | `normalizeDescription` — null input returns empty string | No | No | AC-A5 |
| T9 | `findFuzzyMatch` — exact normalized match scores 1.0 | No | No | AC-A8 |
| T10 | `findFuzzyMatch` — "swiggy technologies pvt ltd" matches "swiggy" at ≥ 0.80 | No | No | AC-A1, AC-A8 |
| T11 | `findFuzzyMatch` — returns null when best score < threshold | No | No | AC-A8 |
| T12 | `findFuzzyMatch` — returns null on empty description | No | No | edge case |
| T13 | `findFuzzyMatch` — returns null when corpus is empty | No | No | edge case |
| T14 | `findFuzzyMatch` — picks highest scoring match when multiple candidates | No | No | AC-A8 |
| T15 | `fetchHistoricalMappings` — includes postings where `ai_cat_score IS NOT NULL` | Yes | No | AC-A2 |
| T16 | `fetchHistoricalMappings` — excludes bank-to-bank transfers | Yes | No | AC-A4 |
| T17 | `fetchHistoricalMappings` — most recent wins on duplicate normalized descriptions | Yes | No | AC-A3 |
| T18 | `fetchHistoricalMappings` — returns empty array for org with no categorized postings | Yes | No | edge case |
| T19 | Batch handler — historical match bypasses LLM, sets `reasoning` containing "Historical match" | Yes | Mocked | AC-A1 |
| T20 | Batch handler — 7 historical matches + 3 LLM → LLM mock called with exactly 3 items | Yes | Mocked | AC-A9 |
| T21 | Batch handler — `dry_run: true` returns predictions without writing to DB | Yes | Mocked | existing behaviour |
| T22 | Batch handler — money_out batch calls LLM with expense+liability accounts only | Yes | Mocked | AC-A10 |
| T23 | Batch handler — money_in batch calls LLM with income+asset accounts only | Yes | Mocked | AC-A10 |
| T24 | `augmentPromptWithContext` — injects `extraction_notes` block when non-null | No | No | AC-B1 |
| T25 | `augmentPromptWithContext` — omits block when `extraction_notes` is null | No | No | AC-B2 |
| T26 | `augmentPromptWithContext` — omits block when `extraction_notes` is empty string | No | No | AC-B2 |
| T27 | Prisma schema — `account.extraction_notes` column exists after migration | Yes | No | AC-B schema |

**Total: 27 tests, 0 requiring a real LLM call.** T19–T23 mock `bulkCategorizeWithLLM` to return controlled fixture data.

### 9.2 Test Data Fixtures

The cloud session cannot rely on the indian-demo seed for deterministic unit tests — demo data may change. All Feature A + B tests use a **dedicated fixture setup** that creates isolated test records, then tears them down.

Every fixture record uses `org_id = 'org_test_cat_v2'` and is created in a `beforeAll` / deleted in `afterAll` block.

#### Accounts fixture

```typescript
// Bank account (debit side for money_in, credit side for money_out)
{ id: 'acct_bank_hdfc',     name: 'HDFC Current',       type: ['BANK'],    classification: 'Assets',      org_id: 'org_test_cat_v2' }
{ id: 'acct_bank_icici',    name: 'ICICI Current',      type: ['BANK'],    classification: 'Assets',      org_id: 'org_test_cat_v2' }

// Expense accounts (counter-accounts for money_out)
{ id: 'acct_exp_meals',     name: 'Meals & Entertainment', type: ['EXPENSE'], classification: 'Expense',  org_id: 'org_test_cat_v2' }
{ id: 'acct_exp_travel',    name: 'Travel Expenses',    type: ['EXPENSE'], classification: 'Expense',     org_id: 'org_test_cat_v2' }
{ id: 'acct_exp_office',    name: 'Office Supplies',    type: ['EXPENSE'], classification: 'Expense',     org_id: 'org_test_cat_v2' }
{ id: 'acct_exp_rent',      name: 'Rent Expense',       type: ['EXPENSE'], classification: 'Expense',     org_id: 'org_test_cat_v2' }

// Income accounts (counter-accounts for money_in)
{ id: 'acct_inc_rental',    name: 'Rental Income',      type: ['INCOME'],  classification: 'Income',      org_id: 'org_test_cat_v2' }
{ id: 'acct_inc_interest',  name: 'Interest Income',    type: ['INCOME'],  classification: 'Income',      org_id: 'org_test_cat_v2' }
```

#### Historical postings fixture (corpus)

These postings have both sides filled — they form the historical corpus. Test T15–T18 read these.

```typescript
// Manual entry (ai_cat_score null) — money_out: Swiggy → Meals
{ id: 'post_hist_1', description: 'Swiggy Technologies', account_id: 'acct_exp_meals', credit_account_id: 'acct_bank_hdfc', amount: -450, ai_cat_score: null, created_at: '2026-01-10' }

// AI categorized + approved (ai_cat_score non-null) — must be included in corpus (T15)
{ id: 'post_hist_2', description: 'Uber India ride', account_id: 'acct_exp_travel', credit_account_id: 'acct_bank_hdfc', amount: -320, ai_cat_score: 0.91, created_at: '2026-01-15' }

// Duplicate normalized description — older, different account (T17: should LOSE to post_hist_4)
{ id: 'post_hist_3', description: 'Amazon IN purchase', account_id: 'acct_exp_travel', credit_account_id: 'acct_bank_hdfc', amount: -1200, ai_cat_score: null, created_at: '2026-01-05' }

// Duplicate normalized description — newer, correct account (T17: should WIN over post_hist_3)
{ id: 'post_hist_4', description: 'AMAZON IN purchase', account_id: 'acct_exp_office', credit_account_id: 'acct_bank_hdfc', amount: -890, ai_cat_score: null, created_at: '2026-03-01' }

// Bank-to-bank transfer (T16: should NOT appear in corpus)
{ id: 'post_hist_5', description: 'Transfer to ICICI', account_id: 'acct_bank_icici', credit_account_id: 'acct_bank_hdfc', amount: -50000, ai_cat_score: null, created_at: '2026-02-01' }

// Money_in — rental income
{ id: 'post_hist_6', description: 'Rent received from tenant', account_id: 'acct_bank_hdfc', credit_account_id: 'acct_inc_rental', amount: 25000, ai_cat_score: null, created_at: '2026-02-05' }
```

#### Uncategorized postings fixture (batch input)

These postings have a null counter-account — they are candidates for categorization.

```typescript
// Should match post_hist_1 via fuzzy match (slight variation)
{ id: 'post_new_1', description: 'UPI/423156789012/Swiggy Technologies Pvt Ltd/swiggy@paytm', credit_account_id: 'acct_bank_hdfc', account_id: null, amount: -520 }

// Should match post_hist_2 via fuzzy match (NEFT format)
{ id: 'post_new_2', description: 'NEFT-HDFC0001234-Uber India-REF20260312001', credit_account_id: 'acct_bank_hdfc', account_id: null, amount: -280 }

// Should match post_hist_4 (most recent Amazon mapping = Office Supplies)
{ id: 'post_new_3', description: 'POS 441234XXXXXX1234 AMAZON IN', credit_account_id: 'acct_bank_hdfc', account_id: null, amount: -1500 }

// No historical match — falls through to LLM (mocked in T19–T20)
{ id: 'post_new_4', description: 'EBA/20260312/ICICI DIRECT/SELL', credit_account_id: 'acct_bank_icici', account_id: null, amount: -75000 }

// No historical match — falls through to LLM
{ id: 'post_new_5', description: 'INT.PD 01-FEB-2026 TO 28-FEB-2026', account_id: 'acct_bank_hdfc', credit_account_id: null, amount: 1250 }

// Already categorized — should be skipped
{ id: 'post_new_6', description: 'Office rent payment', account_id: 'acct_exp_rent', credit_account_id: 'acct_bank_hdfc', amount: -45000 }
```

---

## 10. Implementation Workflow (Claude Code Web)

This section is written for the Claude Code agent that picks this up in a fresh cloud session. Read it fully before writing any code.

### 9.1 Starting Prompt

When the user connects this repo in Claude Code web and hands off this task, they will point you to this file. Your first message back should confirm:
- You have read this spec in full
- You have read `docs/agent/features/CATEGORIZATION.md` (existing behaviour)
- You have read the four key source files listed in Section 8
- You state which open questions in Section 9 you are defaulting on, and how

Do not start coding until the user says "go".

### 9.2 Environment Setup

**First: create `.env.test` from the committed example file:**

```bash
cp backend/.env.test.example backend/.env.test
```

All values in `.env.test.example` are pre-filled with safe test defaults. The only variable you need to confirm is `DATABASE_URL` — it is pre-set to `postgresql://fabriq:fabriq@localhost:5432/fabriq_dev` which matches the DB creation steps below. If the DB setup differs, update only that line.

Run the remaining steps in order. Do not proceed past a failing step without flagging it.

```bash
# 1. Start PostgreSQL
service postgresql start

# 2. Create the database and user
sudo -u postgres psql -c "CREATE USER fabriq WITH PASSWORD 'fabriq' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE fabriq_dev OWNER fabriq;"

# 3. Set DATABASE_URL
export DATABASE_URL="postgresql://fabriq:fabriq@localhost:5432/fabriq_dev"
echo "DATABASE_URL=\"${DATABASE_URL}\"" >> backend/.env

# 4. Install backend dependencies
cd backend && npm install

# 5. Push schema and generate client
npx prisma db push
npx prisma generate

# 6. Seed demo data
node setup-db.js --demo-data=indian-demo

# 7. Verify seed worked
psql "${DATABASE_URL}" -c "SELECT COUNT(*) FROM posting;"
psql "${DATABASE_URL}" -c "SELECT COUNT(*) FROM account;"
```

**Note on DDL**: The `CLAUDE.md` rule against running `prisma db push` applies to the production/shared database. This is a fresh throwaway cloud database — `prisma db push` is the correct and expected tool here.

### 9.3 Spec-Driven Development Methodology

This project uses spec-driven development. The contract is:

```
Spec (this file) → Tests → Implementation → Tests pass → Done
```

**Rules:**
1. **Spec is the source of truth.** If you discover the spec is wrong or ambiguous during implementation, stop and update the spec first. Do not silently deviate.
2. **Write tests before implementation.** For each feature (A and B), write all tests for that feature's acceptance criteria first, watch them fail, then implement until they pass.
3. **One feature at a time.** Complete Feature A fully (tests passing) before starting Feature B.
4. **No scope creep.** Section 7 (Out of Scope) defines the boundary. If something seems obviously useful but isn't in the spec, add it to Open Questions and flag it — don't implement it.
5. **No comments explaining what code does.** Only add a comment if the WHY is non-obvious. The spec lives here, not in the code.

### 9.4 Implementation Order

Follow this exact order:

#### Step 1 — Inspect real data before writing normalization regex

Before writing a single line of implementation, query the seeded database to see what real description strings look like:

```sql
-- Sample of raw descriptions from demo data
SELECT DISTINCT description, COUNT(*) as freq
FROM posting
WHERE description IS NOT NULL
ORDER BY freq DESC
LIMIT 50;

-- Descriptions that are already categorized (both sides filled)
SELECT description, a.name as debit_account, ca.name as credit_account
FROM posting p
JOIN account a ON p.account_id = a.id
JOIN account ca ON p.credit_account_id = ca.id
WHERE p.description IS NOT NULL
LIMIT 30;
```

Use the real data to validate or adjust the normalization regex table in Section A2. If real descriptions show patterns not covered by the table, update the spec before writing code.

#### Step 2 — Install fuzzball

```bash
cd backend && npm install fuzzball
npm install --save-dev @types/fuzzball  # if types package exists, else use inline declare
```

Verify it imports cleanly in a quick scratch test before proceeding.

#### Step 3 — Write tests for Feature A (T1–T23 in Section 9.1)

Create test file: `backend/src/agent/__tests__/categorization-v2.test.ts`

**No LLM API key is available in this session.** All 27 tests in Section 9.1 are designed to run without one. For T19–T23 (batch handler tests), mock `bulkCategorizeWithLLM` using Jest's `jest.spyOn` so no real LLM call is made:

```typescript
import * as batchModule from '../handlers/erp/categorizeTransactionBatch';
jest.spyOn(batchModule, 'bulkCategorizeWithLLM').mockResolvedValue({
  results: new Map([[0, { index: 0, predicted_account_id: 'acct_exp_meals', confidence_score: 0.88, reasoning: 'mocked' }]]),
  usage: { promptTokens: 100, completionTokens: 50 },
});
```

Structure the test file in three `describe` blocks:
1. `describe('normalizeDescription')` — T1–T8, pure unit tests, no fixtures
2. `describe('findFuzzyMatch')` — T9–T14, pure unit tests with inline fixture arrays
3. `describe('fetchHistoricalMappings + batch handler')` — T15–T23, use DB fixtures from Section 9.2

The DB fixture tests use a `beforeAll` to create all fixture records and `afterAll` to delete them (filter by `org_id = 'org_test_cat_v2'`).

Write all tests first. They should fail. Commit the failing test file before writing any implementation.

#### Step 4 — Implement Feature A

Modify the files listed in Section 8 for Feature A. Implementation order within A:

1. `normalizeDescription` (AC-A5, A6, A7) — pure function, easiest
2. Replace `calculateSimilarity` + `findFuzzyMatch` with fuzzball (AC-A1, A8)
3. Update `fetchHistoricalMappings` — remove `ai_cat_score` filter, add bank-to-bank exclusion, most-recent resolution (AC-A2, A3, A4)
4. Direction-filtered account batching in `categorizeTransactionBatch.ts` (AC-A10)
5. Verify batch routing (AC-A9)

Run tests after each sub-step. Do not move to the next sub-step with a failing test.

#### Step 5 — Write tests for Feature B (AC-B1 through AC-B5)

Add Feature B tests to the same test file. They will fail until implementation is done.

AC-B3, AC-B4 (frontend field visibility) cannot be tested in this backend-only test file — note them as "manual verification required" with a comment.

#### Step 6 — Schema change for Feature B

Add `extraction_notes` to the account Prisma schema, then:

```bash
cd backend && npx prisma db push && npx prisma generate
```

Verify the column exists:
```bash
psql "${DATABASE_URL}" -c "\d account" | grep extraction_notes
```

#### Step 7 — Implement Feature B backend

1. Update `CategorizationExtractionOptions` type to include `extractionNotes?: string`
2. Update `BankStatementWithCategorizationExtractor.augmentPromptWithContext` to inject the notes block
3. Update `BankStatementExtractor` similarly
4. Update the import handler (caller) to pass `account.extraction_notes` through

Run tests (AC-B1, AC-B2 should pass).

#### Step 8 — Frontend change

Add `extraction_notes` textarea to the account edit form, conditional on bank/credit card account type. Manual verification only (no automated test for UI).

#### Step 9 — Final check

```bash
# Run the full test suite including existing E2E test
cd backend && npm test -- --testPathPattern="categorization"

# Confirm the existing E2E test still passes
npm test -- --testPathPattern="v2-categorise-expenses-e2e"
```

#### Step 10 — Commit and push

Commit all changes with a message referencing this spec. Push to the feature branch for PR review.

---

## 10. Open Questions

| # | Question | Default if unresolved |
|---|----------|-----------------------|
| OQ-1 | Should `extraction_notes` also be injected into the **categorization** prompt (not just extraction)? Could help if the same account quirks affect re-categorization of existing postings. | No — extraction only for now |
| OQ-2 | For A5 (direction-filtered LLM accounts): split into two sub-batches, or pass direction hints per transaction and send all accounts? Splitting reduces tokens more; passing hints is simpler. | Split into sub-batches |
| OQ-3 | Should the historical match reasoning surface the matched description to the user? e.g. "Matched 'swiggy technologies' (approved 2026-03-15)" | No — keep reasoning string simple for now |
