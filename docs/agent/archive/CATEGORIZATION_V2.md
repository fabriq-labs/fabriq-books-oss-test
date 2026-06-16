# Fabriq Agent — Transaction Categorization (Current Implementation)

**Status**: Archived — implementation detail referenced from
[../05-TOOLS.md — categorizePostings](../05-TOOLS.md#categorizepostings) and
[../07-WORKED_EXAMPLES.md — Trace 1](../07-WORKED_EXAMPLES.md#trace-1-categorization-atpl_categorise).
For the current agent session walkthrough, tool contracts, and executor, see
those docs plus [../06-BUILDERS_AND_EXECUTORS.md](../06-BUILDERS_AND_EXECUTORS.md).

**Last Updated**: 2026-04-21  
**Spec**: [`CATEGORIZATION_V2_SPEC.md`](./CATEGORIZATION_V2_SPEC.md)

---

## Scope of This Document

This page describes **how categorization works today** in code: historical corpus, description normalization, fuzzy matching, LLM batching by direction, and per-account extraction notes at import time.

For **who calls what** (agent template `atpl_categorise`, `queueActions`, human review, `POST /api/agent/erp/categorize-transaction-batch`), see [../07-WORKED_EXAMPLES.md](../07-WORKED_EXAMPLES.md) and [../06-BUILDERS_AND_EXECUTORS.md](../06-BUILDERS_AND_EXECUTORS.md). The mental model is unchanged: categorization predicts the **counter-account** (expense/income/etc.) for postings where the bank side is known and the category side is null.

---

## End-to-End Batch Flow

**File**: `backend/src/agent/handlers/erp/categorizeTransactionBatch.ts`

1. Fetch postings (by IDs or inline payload).
2. Fetch all active accounts for the org, grouped by classification (expense, income, asset, liability).
3. Build the **historical mapping corpus** via `fetchHistoricalMappings()` (see below).
4. For each posting:
   - If already fully categorized → skip (record `skipped_reason`).
   - Else try **historical match** → on success, apply or return with confidence **0.95** and reasoning prefixed with `Historical match: ...`.
   - Else → enqueue for **LLM**.
5. Split the LLM queue by **money direction**:
   - **money_out** → `bulkCategorizeWithLLM` with **expense + liability** accounts only.
   - **money_in** → `bulkCategorizeWithLLM` with **income + asset** accounts only.
6. For each LLM result: validate account ID belongs to the org; if `dry_run === false` and confidence ≥ `min_confidence`, write to the database; always record a result row.
7. Return `{ results[], summary }`.

**`summary` fields** (API response and `aiActivityLogger`):

| Field | Meaning |
|-------|---------|
| `historical_match_count` | Resolved without calling the LLM |
| `llm_categorized_count` | Sent to and answered by the LLM |
| `applied_count` | Persisted when `dry_run` is false |
| `skipped_count` | Already categorized or below confidence threshold |
| `error_count` | Invalid account ID from LLM or handler failure |

Counter-account direction (money in vs money out, including credit-card cases) matches the [Money Direction Cheat Sheet](../01-OVERVIEW.md#money-direction-cheat-sheet).

---

## Historical Corpus

**File**: `backend/src/agent/handlers/erp/utils/categorizationUtils.ts` → `fetchHistoricalMappings()`

### Inclusion rules

The corpus includes postings where **both** `account_id` and `credit_account_id` are set, regardless of whether the categorization was manual or AI-assigned (`ai_cat_score` is not used to exclude rows).

**Excluded**: postings where **both** sides are bank/credit-card style accounts (internal transfers). Those rows represent moving money between accounts, not a merchant/category choice.

### Deduplication and conflicts

Candidates are loaded ordered by **`created_at` descending**. They are grouped by **normalized** description (see next section). For each normalized key, the **newest** posting wins. If two rows share the same timestamp, a **manual** row (`ai_cat_score IS NULL`) is preferred over an AI-scored row.

---

## Description Normalization

**File**: `categorizationUtils.ts` → `normalizeDescription()`

Every bank description used for fuzzy matching is normalized in two passes before comparison.

### Pass 1 — strip noise (ordered rules)

| Step | Intent | Examples |
|------|--------|----------|
| 1 | Remove payment-rail keywords and ICICI-specific sub-prefixes | Strips tokens like UPI, NEFT, RTGS, IMPS, NACH, ECS, MMT, TRF where applicable |
| 2 | Remove alpha + long digit bank/ref fragments | e.g. `HDFC0001234`, `ICIC22345678901234` |
| 3 | Remove standalone long digit sequences | e.g. `423156789012` |
| 4 | Remove month names with optional year | e.g. `Mar2026`, `jan 2025` |
| 5 | Remove common bank name phrases | e.g. HDFC/ICICI/KOTAK/SBI phrases |
| 6 | Remove transaction-type prefixes | POS, ATM, ATW, ATL, CR, DR, CLG, CHQ, etc. |
| 6b | Remove decimal amounts | e.g. Kotak ATW-style `5000.00` |
| 7 | Remove masked card patterns | e.g. `441234XXXXXX1234` |

### Pass 2 — length cap

After tokenization, only the **first six tokens** are kept so very long descriptions do not dilute similarity scores.

### Reference examples

| Raw description | Normalized (illustrative) |
|-----------------|---------------------------|
| `UPI/DR/987654321098/SWIGGY TECHNOLOGIES/swiggy@axisbank` | `swiggy technologies swiggy@axisbank` |
| `MMT/IMPS/412345678901/UBER INDIA PVT LTD` | `uber india pvt ltd` |
| `NEFT/TRF/ICIC22345678901234/AMAZON SELLER SERVICES` | `amazon seller services` |
| `EBA/20260315/ICICI DIRECT/SELL` | `eba icici direct sell` (EBA kept on purpose for ICICI Direct semantics) |
| `ATW 5000.00` | Often empty after stripping → no historical match; LLM path |
| `INT.PD 01-MAR-2026 TO 31-MAR-2026` | `int.pd 01 to 31` |

---

## Fuzzy Matching

**File**: `categorizationUtils.ts` → `findFuzzyMatch()`

Matching uses **`fuzzball.token_set_ratio`** (dependency: `fuzzball`) on the **normalized** incoming description versus each corpus entry’s normalized description. Scores are on a 0–100 scale from the library; the configured **match threshold is 0.80** on a 0–1 scale internally.

**Behavior**: token-set ratio rewards overlap of word sets after sorting, so a short corpus label like `swiggy` can score highly against a longer normalized bank string that contains that vendor name plus extra tokens.

---

## Per-Account Extraction Notes

### Data model

**Schema**: `backend/prisma/schema/data.prisma` — optional `account.extraction_notes` (`String?` `@db.Text`).

Recommended max length in product UI: **2000 characters**. The field is intended for **BANK**, **CREDIT_CARD**, **CHECKING**, and **SAVINGS** accounts where statement text is account-specific.

### Runtime behavior

**Files**:

- `backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts` → `augmentPromptWithContext()`
- `backend/src/lib/extractors/bank-statement-extractor.ts` — `setExtractionNotes()` and the same augmentation hook
- `backend/src/lib/extractors/types.ts` — `CategorizationExtractionOptions.extractionNotes?: string`

When preparing extraction, callers pass `extractionNotes` from `bankAccount.extraction_notes`. The extractor caches them and, on each extract, inserts a block **after** the base categorization instructions and **before** the Chart of Accounts:

```
=== ACCOUNT-SPECIFIC NOTES ===
The following notes were provided by the account owner about this particular bank account.
Apply these when interpreting transaction descriptions:

{account.extraction_notes}
```

If the field is null or empty, **this block is omitted**; prompts behave as if the feature were not configured.

**Example content** (ICICI savings):

```
EBA in the description means a transfer to/from ICICI Direct equity trading account.
Positive EBA = sale proceeds received. Negative EBA = purchase funds sent.
INT.PD entries are savings account interest credits, not expense payments.
```

---

## Key Code Locations

| Area | File |
|------|------|
| Batch orchestration, direction split, summary | `backend/src/agent/handlers/erp/categorizeTransactionBatch.ts` |
| Corpus fetch, normalization, fuzzy match | `backend/src/agent/handlers/erp/utils/categorizationUtils.ts` |
| Categorizing extractor + prompt augmentation | `backend/src/lib/extractors/bank-statement-with-categorization-extractor.ts` |
| Non-categorizing bank extractor + notes API | `backend/src/lib/extractors/bank-statement-extractor.ts` |
| Extractor options typing | `backend/src/lib/extractors/types.ts` |
| Account field | `account.extraction_notes` in Prisma schema |

Agent tool and API entry points: [../05-TOOLS.md — categorizePostings](../05-TOOLS.md#categorizepostings)
and [../09-API_REFERENCE.md — ERP / Direct Pipeline Endpoints](../09-API_REFERENCE.md#erp--direct-pipeline-endpoints).

---

## Tests

| File | Role |
|------|------|
| `backend/src/agent/__tests__/categorization-v2.test.ts` | Unit-style coverage (27 tests) |
| `backend/src/agent/__tests__/categorization-v2-bank-data.test.ts` | Fixture-driven cases (14 tests) |

DB-backed cases use the `org_test_cat_v2` fixture org (created in `beforeAll`, removed in `afterAll`). No real LLM calls in these suites.

```bash
cd backend
npx jest src/agent/__tests__/categorization-v2.test.ts --no-coverage --runInBand
npx jest src/agent/__tests__/categorization-v2-bank-data.test.ts --no-coverage
```

---

## Known Gaps and Follow-Ups

- **UI coverage**: `extraction_notes` is available on the Masters account form (`AccountForm.tsx`); other account-creation paths should be checked if they need the same control.
- **Performance**: `fetchHistoricalMappings` runs on each batch invocation; a short TTL in-process cache would reduce load for repeated imports.
- **Vendor model**: Multiple UPI handles for the same merchant still rely on fuzzy overlap; there is no separate vendor canonicalization table in this release.
- **Bank coverage**: Normalization is tuned for formats seen in tests (e.g. ICICI, Kotak); other banks benefit partially from generic rules (bank phrases, rails) but are not exhaustively regression-tested.
