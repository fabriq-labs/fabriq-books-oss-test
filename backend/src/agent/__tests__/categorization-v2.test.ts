/**
 * Categorization V2 — Unit & Integration Tests
 *
 * 27 tests covering Feature A (smarter historical matching) and Feature B (per-account extraction hints).
 * Zero real LLM calls — generateObject is mocked throughout.
 *
 * Test structure:
 *   T1–T8   normalizeDescription (pure unit)
 *   T9–T14  findFuzzyMatch (pure unit)
 *   T15–T18 fetchHistoricalMappings (DB)
 *   T19–T23 categorizeTransactionBatchHandler (DB + mocked LLM)
 *   T24–T26 BankStatementWithCategorizationExtractor extraction hints (pure unit)
 *   T27     extraction_notes column exists in DB after migration (DB)
 *
 * Fixture org: org_test_cat_v2  — isolated, created in beforeAll, deleted in afterAll.
 */

import prisma from '../../lib/prisma';
import {
  normalizeDescription,
  findFuzzyMatch,
  fetchHistoricalMappings,
  HistoricalMapping,
} from '../handlers/erp/utils/categorizationUtils';
import { BankStatementWithCategorizationExtractor } from '../../lib/extractors/bank-statement-with-categorization-extractor';
import { categorizeTransactionBatchHandler } from '../handlers/erp/categorizeTransactionBatch';
import * as categorizationUtils from '../handlers/erp/utils/categorizationUtils';

// Mock generateObject so no real LLM call is made in T19–T23
jest.mock('ai', () => {
  const actual = jest.requireActual('ai');
  return { ...actual, generateObject: jest.fn() };
});

import { generateObject } from 'ai';
const mockGenerateObject = generateObject as jest.Mock;

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

const ORG = 'org_test_cat_v2';
const USER_ID = 'user_test_cat_v2';

const ACCT = {
  bankHdfc:   'acct_bank_hdfc_v2',
  bankIcici:  'acct_bank_icici_v2',
  expMeals:   'acct_exp_meals_v2',
  expTravel:  'acct_exp_travel_v2',
  expOffice:  'acct_exp_office_v2',
  expRent:    'acct_exp_rent_v2',
  incRental:  'acct_inc_rental_v2',
  incInterest:'acct_inc_interest_v2',
};

const mockAuth = {
  user: { id: USER_ID, email: 'test@test.com', name: 'Test', org_id: ORG },
} as any;

// ─── DB fixture setup ─────────────────────────────────────────────────────────

async function createFixtures() {
  // Accounts
  await prisma.account.createMany({
    data: [
      { id: ACCT.bankHdfc,    name: 'HDFC Current',           type: ['BANK'],    classification: 'Assets',      org_id: ORG, is_active: true },
      { id: ACCT.bankIcici,   name: 'ICICI Current',          type: ['BANK'],    classification: 'Assets',      org_id: ORG, is_active: true },
      { id: ACCT.expMeals,    name: 'Meals & Entertainment',  type: ['EXPENSE'], classification: 'Expense',     org_id: ORG, is_active: true },
      { id: ACCT.expTravel,   name: 'Travel Expenses',        type: ['EXPENSE'], classification: 'Expense',     org_id: ORG, is_active: true },
      { id: ACCT.expOffice,   name: 'Office Supplies',        type: ['EXPENSE'], classification: 'Expense',     org_id: ORG, is_active: true },
      { id: ACCT.expRent,     name: 'Rent Expense',           type: ['EXPENSE'], classification: 'Expense',     org_id: ORG, is_active: true },
      { id: ACCT.incRental,   name: 'Rental Income',          type: ['INCOME'],  classification: 'Income',      org_id: ORG, is_active: true },
      { id: ACCT.incInterest, name: 'Interest Income',        type: ['INCOME'],  classification: 'Income',      org_id: ORG, is_active: true },
    ],
    skipDuplicates: true,
  });

  // Historical postings (both sides filled — form the corpus)
  // post_hist_1: manual entry — Swiggy → Meals
  await prisma.posting.create({ data: {
    id: 'post_hist_1_v2', org_id: ORG,
    description: 'Swiggy Technologies',
    account_id: ACCT.expMeals, credit_account_id: ACCT.bankHdfc,
    amount: -450, ai_cat_score: null,
    created_at: new Date('2026-01-10'),
  }});

  // post_hist_2: AI-categorized (ai_cat_score non-null) — must be included (T15)
  await prisma.posting.create({ data: {
    id: 'post_hist_2_v2', org_id: ORG,
    description: 'Uber India ride',
    account_id: ACCT.expTravel, credit_account_id: ACCT.bankHdfc,
    amount: -320, ai_cat_score: 0.91,
    created_at: new Date('2026-01-15'),
  }});

  // post_hist_3: older Amazon → Travel (should LOSE to post_hist_4 in T17)
  await prisma.posting.create({ data: {
    id: 'post_hist_3_v2', org_id: ORG,
    description: 'Amazon IN purchase',
    account_id: ACCT.expTravel, credit_account_id: ACCT.bankHdfc,
    amount: -1200, ai_cat_score: null,
    created_at: new Date('2026-01-05'),
  }});

  // post_hist_4: newer Amazon → Office (should WIN over post_hist_3 in T17)
  await prisma.posting.create({ data: {
    id: 'post_hist_4_v2', org_id: ORG,
    description: 'AMAZON IN purchase',
    account_id: ACCT.expOffice, credit_account_id: ACCT.bankHdfc,
    amount: -890, ai_cat_score: null,
    created_at: new Date('2026-03-01'),
  }});

  // post_hist_5: bank-to-bank transfer — must NOT appear in corpus (T16)
  await prisma.posting.create({ data: {
    id: 'post_hist_5_v2', org_id: ORG,
    description: 'Transfer to ICICI',
    account_id: ACCT.bankIcici, credit_account_id: ACCT.bankHdfc,
    amount: -50000, ai_cat_score: null,
    created_at: new Date('2026-02-01'),
  }});

  // post_hist_6: money_in — Rental Income
  await prisma.posting.create({ data: {
    id: 'post_hist_6_v2', org_id: ORG,
    description: 'Rent received from tenant',
    account_id: ACCT.bankHdfc, credit_account_id: ACCT.incRental,
    amount: 25000, ai_cat_score: null,
    created_at: new Date('2026-02-05'),
  }});

  // Uncategorized postings (for batch handler tests T19–T23)
  // post_new_1: matches post_hist_1 via fuzzy (Swiggy)
  await prisma.posting.create({ data: {
    id: 'post_new_1_v2', org_id: ORG,
    description: 'UPI/423156789012/Swiggy Technologies Pvt Ltd/swiggy@paytm',
    credit_account_id: ACCT.bankHdfc, account_id: null,
    amount: -520,
  }});

  // post_new_2: matches post_hist_2 via fuzzy (Uber)
  await prisma.posting.create({ data: {
    id: 'post_new_2_v2', org_id: ORG,
    description: 'NEFT-HDFC0001234-Uber India-REF20260312001',
    credit_account_id: ACCT.bankHdfc, account_id: null,
    amount: -280,
  }});

  // post_new_3: matches post_hist_4 (most recent Amazon = Office Supplies)
  await prisma.posting.create({ data: {
    id: 'post_new_3_v2', org_id: ORG,
    description: 'POS 441234XXXXXX1234 AMAZON IN',
    credit_account_id: ACCT.bankHdfc, account_id: null,
    amount: -1500,
  }});

  // post_new_4: no historical match → falls to LLM
  await prisma.posting.create({ data: {
    id: 'post_new_4_v2', org_id: ORG,
    description: 'EBA/20260312/ICICI DIRECT/SELL',
    credit_account_id: ACCT.bankIcici, account_id: null,
    amount: -75000,
  }});

  // post_new_5: no historical match → falls to LLM (money_in)
  await prisma.posting.create({ data: {
    id: 'post_new_5_v2', org_id: ORG,
    description: 'INT.PD 01-FEB-2026 TO 28-FEB-2026',
    account_id: ACCT.bankHdfc, credit_account_id: null,
    amount: 1250,
  }});

  // post_new_6: already categorized — should be skipped
  await prisma.posting.create({ data: {
    id: 'post_new_6_v2', org_id: ORG,
    description: 'Office rent payment',
    account_id: ACCT.expRent, credit_account_id: ACCT.bankHdfc,
    amount: -45000,
  }});
}

async function deleteFixtures() {
  await prisma.posting.deleteMany({ where: { org_id: ORG } });
  await prisma.account.deleteMany({ where: { org_id: ORG } });
}

// ─────────────────────────────────────────────────────────────────────────────
// T1–T8: normalizeDescription
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeDescription', () => {
  // T1: strips UPI reference number, preserves vendor name
  it('T1 strips UPI ref number and preserves vendor name (AC-A5)', () => {
    const result = normalizeDescription('UPI/423156789012/Swiggy Technologies Pvt Ltd/swiggy@paytm');
    expect(result).toContain('swiggy technologies pvt ltd');
    expect(result).not.toContain('423156789012');
  });

  // T2: strips NEFT prefix + bank code + reference suffix
  it('T2 strips NEFT prefix + bank code (AC-A6)', () => {
    const result = normalizeDescription('NEFT-HDFC0001234-Prasanna Jaganathan-REF20250312001');
    expect(result).toContain('prasanna jaganathan');
    expect(result).not.toContain('hdfc');
    expect(result).not.toContain('0001234');
  });

  // T3: preserves EBA token (AC-A7)
  it('T3 preserves eba token (AC-A7)', () => {
    const result = normalizeDescription('EBA/20250312/ICICI DIRECT');
    expect(result).toContain('eba');
  });

  // T4: strips POS card fragments
  it('T4 strips POS card number fragments (AC-A5)', () => {
    const result = normalizeDescription('POS 441234XXXXXX1234 AMAZON IN');
    expect(result).toContain('amazon in');
    expect(result).not.toMatch(/441234/);
    expect(result).not.toMatch(/\*{3,}\d+/);
  });

  // T5: strips embedded dates
  it('T5 strips embedded dates (AC-A5)', () => {
    const result = normalizeDescription('HDFC BANK NEFT CR REF123456 Rent Mar2026');
    expect(result).not.toMatch(/mar/i);
    expect(result).not.toMatch(/2026/);
  });

  // T6: strips bank name prefixes
  it('T6 strips bank name prefixes (AC-A5)', () => {
    const result = normalizeDescription('HDFC BANK NEFT CR REF123456 Rent Mar2026');
    expect(result).not.toMatch(/hdfc bank/i);
  });

  // T7: collapses multiple spaces to single space
  it('T7 collapses multiple spaces', () => {
    const result = normalizeDescription('foo   bar   baz');
    expect(result).toBe('foo bar baz');
  });

  // T8: null input returns empty string
  it('T8 null input returns empty string', () => {
    expect(normalizeDescription(null)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T9–T14: findFuzzyMatch
// ─────────────────────────────────────────────────────────────────────────────

describe('findFuzzyMatch', () => {
  const swiggyMapping: HistoricalMapping = {
    descriptionNormalized: 'swiggy',
    counterAccountId: ACCT.expMeals,
    counterAccountName: 'Meals & Entertainment',
    classification: 'Expense',
  };
  const zomatoMapping: HistoricalMapping = {
    descriptionNormalized: 'zomato food delivery',
    counterAccountId: ACCT.expMeals,
    counterAccountName: 'Meals & Entertainment',
    classification: 'Expense',
  };
  const amazonMapping: HistoricalMapping = {
    descriptionNormalized: 'amazon in',
    counterAccountId: ACCT.expOffice,
    counterAccountName: 'Office Supplies',
    classification: 'Expense',
  };

  // T9: exact normalized match
  it('T9 returns mapping on exact normalized match', () => {
    const match = findFuzzyMatch('swiggy', [swiggyMapping]);
    expect(match).not.toBeNull();
    expect(match!.counterAccountId).toBe(ACCT.expMeals);
  });

  // T10: "swiggy technologies pvt ltd" matches "swiggy" at ≥ 0.80 (AC-A1, AC-A8)
  it('T10 partial match swiggy technologies matches swiggy corpus entry (AC-A1, AC-A8)', () => {
    const match = findFuzzyMatch('swiggy technologies pvt ltd', [swiggyMapping]);
    expect(match).not.toBeNull();
    expect(match!.counterAccountId).toBe(ACCT.expMeals);
  });

  // T11: low-similarity string returns null
  it('T11 returns null when best score is below threshold', () => {
    const match = findFuzzyMatch('completely unrelated payment xyz', [zomatoMapping]);
    expect(match).toBeNull();
  });

  // T12: empty description string returns null
  it('T12 returns null on empty description string', () => {
    expect(findFuzzyMatch('', [swiggyMapping])).toBeNull();
  });

  // T13: empty corpus returns null
  it('T13 returns null when corpus is empty', () => {
    expect(findFuzzyMatch('swiggy technologies', [])).toBeNull();
  });

  // T14: picks highest-scoring match when multiple candidates
  it('T14 picks highest-scoring match when multiple candidates exist', () => {
    // "amazon in purchase" should score higher against amazonMapping than zomatoMapping
    const match = findFuzzyMatch('amazon in purchase', [zomatoMapping, amazonMapping, swiggyMapping]);
    expect(match).not.toBeNull();
    expect(match!.counterAccountId).toBe(ACCT.expOffice);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T15–T23: fetchHistoricalMappings + batch handler (DB + mocked LLM)
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchHistoricalMappings + batch handler', () => {
  beforeAll(async () => {
    await deleteFixtures(); // clean any leftover state
    await createFixtures();
  });

  afterAll(async () => {
    await deleteFixtures();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // T15: includes AI-categorized postings (ai_cat_score IS NOT NULL) (AC-A2)
  it('T15 includes postings where ai_cat_score is non-null (AC-A2)', async () => {
    const mappings = await fetchHistoricalMappings(ORG);
    const uberMapping = mappings.find(
      (m) => m.counterAccountId === ACCT.expTravel && m.descriptionNormalized.includes('uber')
    );
    expect(uberMapping).toBeDefined();
  });

  // T16: excludes bank-to-bank transfers from corpus (AC-A4)
  it('T16 excludes bank-to-bank transfers from corpus (AC-A4)', async () => {
    const mappings = await fetchHistoricalMappings(ORG);
    const bankTransfer = mappings.find((m) => m.descriptionNormalized.includes('transfer to icici'));
    expect(bankTransfer).toBeUndefined();
  });

  // T17: most recent wins on duplicate normalized descriptions (AC-A3)
  it('T17 most recent posting wins when descriptions normalize to same string (AC-A3)', async () => {
    const mappings = await fetchHistoricalMappings(ORG);
    // Both "Amazon IN purchase" and "AMAZON IN purchase" normalize to the same string.
    // post_hist_4 (2026-03-01, Office Supplies) is newer than post_hist_3 (2026-01-05, Travel).
    const amazonMatches = mappings.filter((m) => m.descriptionNormalized.includes('amazon'));
    expect(amazonMatches).toHaveLength(1);
    expect(amazonMatches[0].counterAccountId).toBe(ACCT.expOffice);
  });

  // T18: returns empty array for org with no categorized postings
  it('T18 returns empty array for org with no categorized postings', async () => {
    const mappings = await fetchHistoricalMappings('org_nonexistent_xyz');
    expect(mappings).toHaveLength(0);
  });

  // T19: historical match bypasses LLM, sets confidence high + "Historical match" in reasoning (AC-A1)
  it('T19 historical match bypasses LLM, returns high confidence with Historical match reasoning (AC-A1)', async () => {
    const result = await categorizeTransactionBatchHandler.execute(
      null as any,
      {
        posting_ids: ['post_new_1_v2'],
        options: { dry_run: true, use_historical_matching: true },
      },
      undefined,
      mockAuth
    );

    expect(result.success).toBe(true);
    const prediction = result.data!.results[0];
    expect(prediction.confidence).toBe('high');
    expect(prediction.reasoning).toMatch(/historical match/i);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  // T20: 7 historical matches + 3 LLM → LLM called with exactly 3 items (AC-A9)
  it('T20 batch of 6: 3 match history + 1 already-categorized + 2 to LLM → LLM called with 2 items (AC-A9)', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        categorizations: [
          { index: 0, predicted_account_id: ACCT.expRent, confidence_score: 0.75, reasoning: 'mocked EBA' },
          { index: 1, predicted_account_id: ACCT.incInterest, confidence_score: 0.80, reasoning: 'mocked INT' },
        ],
      },
      usage: { promptTokens: 100, completionTokens: 50 },
    });

    const result = await categorizeTransactionBatchHandler.execute(
      null as any,
      {
        // post_new_1, _2, _3: historical matches
        // post_new_4, _5: no match → LLM
        // post_new_6: already categorized → skipped
        posting_ids: ['post_new_1_v2', 'post_new_2_v2', 'post_new_3_v2', 'post_new_4_v2', 'post_new_5_v2', 'post_new_6_v2'],
        options: { dry_run: true, use_historical_matching: true },
      },
      undefined,
      mockAuth
    );

    expect(result.success).toBe(true);
    // LLM called once for the 2 non-matching postings
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const llmCallArg = mockGenerateObject.mock.calls[0][0];
    // The prompt passed to the LLM should list exactly the 2 unmatched transactions
    expect(llmCallArg.prompt).toContain('EBA');
    expect(llmCallArg.prompt).toContain('INT.PD');
    expect(result.data!.summary.historical_match_count).toBe(3);
    expect(result.data!.summary.llm_categorized_count).toBe(2);
  });

  // T21: dry_run: true returns predictions without writing to DB
  it('T21 dry_run: true returns predictions without applying to DB', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { categorizations: [{ index: 0, predicted_account_id: ACCT.expMeals, confidence_score: 0.88, reasoning: 'mocked' }] },
      usage: { promptTokens: 50, completionTokens: 20 },
    });

    const before = await prisma.posting.findUnique({ where: { id: 'post_new_1_v2' }, select: { account_id: true } });

    await categorizeTransactionBatchHandler.execute(
      null as any,
      { posting_ids: ['post_new_1_v2'], options: { dry_run: true } },
      undefined,
      mockAuth
    );

    const after = await prisma.posting.findUnique({ where: { id: 'post_new_1_v2' }, select: { account_id: true } });
    expect(after!.account_id).toBe(before!.account_id); // unchanged
  });

  // T22: money_out batch → LLM receives expense+liability accounts only (AC-A10)
  it('T22 money_out batch — LLM prompt contains expense/liability accounts, not income accounts (AC-A10)', async () => {
    const buildBulkPromptSpy = jest.spyOn(categorizationUtils, 'buildBulkPrompt');
    mockGenerateObject.mockResolvedValue({
      object: { categorizations: [{ index: 0, predicted_account_id: ACCT.expRent, confidence_score: 0.80, reasoning: 'mocked' }] },
      usage: { promptTokens: 50, completionTokens: 20 },
    });

    await categorizeTransactionBatchHandler.execute(
      null as any,
      {
        posting_ids: ['post_new_4_v2'], // money_out, no historical match
        options: { dry_run: true, use_historical_matching: false },
      },
      undefined,
      mockAuth
    );

    expect(buildBulkPromptSpy).toHaveBeenCalled();
    const accountsArg: any = buildBulkPromptSpy.mock.calls[0][1];
    expect(accountsArg.expense.length).toBeGreaterThan(0);
    expect(accountsArg.income).toHaveLength(0);
    expect(accountsArg.asset).toHaveLength(0);
  });

  // T23: money_in batch → LLM receives income+asset accounts only (AC-A10)
  it('T23 money_in batch — LLM prompt contains income/asset accounts, not expense accounts (AC-A10)', async () => {
    const buildBulkPromptSpy = jest.spyOn(categorizationUtils, 'buildBulkPrompt');
    mockGenerateObject.mockResolvedValue({
      object: { categorizations: [{ index: 0, predicted_account_id: ACCT.incInterest, confidence_score: 0.80, reasoning: 'mocked' }] },
      usage: { promptTokens: 50, completionTokens: 20 },
    });

    await categorizeTransactionBatchHandler.execute(
      null as any,
      {
        posting_ids: ['post_new_5_v2'], // money_in, no historical match
        options: { dry_run: true, use_historical_matching: false },
      },
      undefined,
      mockAuth
    );

    expect(buildBulkPromptSpy).toHaveBeenCalled();
    const accountsArg: any = buildBulkPromptSpy.mock.calls[0][1];
    expect(accountsArg.income.length).toBeGreaterThan(0);
    expect(accountsArg.expense).toHaveLength(0);
    expect(accountsArg.liability).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T24–T26: BankStatementWithCategorizationExtractor — extraction hints (AC-B1, AC-B2)
// ─────────────────────────────────────────────────────────────────────────────

describe('BankStatementWithCategorizationExtractor — extraction hints', () => {
  let extractor: BankStatementWithCategorizationExtractor;

  beforeEach(() => {
    extractor = new BankStatementWithCategorizationExtractor();
    // Inject a minimal cached accounts object so augmentPromptWithContext proceeds
    (extractor as any).cachedAccounts = {
      expense: [{ id: 'e1', name: 'Test Expense', code: null, classification: 'Expense', subType: null, type: ['EXPENSE'] }],
      income: [],
      asset: [],
      liability: [],
    };
  });

  // T24: non-null extraction_notes appears in the assembled prompt (AC-B1)
  it('T24 injects extraction_notes block when notes are non-null (AC-B1)', () => {
    const basePrompt = 'Extract transactions.';
    const assembled = (extractor as any).augmentPromptWithContext(basePrompt, {
      extractionNotes: 'EBA means ICICI Direct transfer',
    });
    expect(assembled).toContain('EBA means ICICI Direct transfer');
    expect(assembled).toContain('=== ACCOUNT-SPECIFIC NOTES ===');
  });

  // T25: null extraction_notes → block absent (AC-B2)
  it('T25 omits extraction_notes block when notes are null (AC-B2)', () => {
    const assembled = (extractor as any).augmentPromptWithContext('Extract transactions.', {
      extractionNotes: null,
    });
    expect(assembled).not.toContain('=== ACCOUNT-SPECIFIC NOTES ===');
  });

  // T26: empty string extraction_notes → block absent (AC-B2)
  it('T26 omits extraction_notes block when notes are empty string (AC-B2)', () => {
    const assembled = (extractor as any).augmentPromptWithContext('Extract transactions.', {
      extractionNotes: '',
    });
    expect(assembled).not.toContain('=== ACCOUNT-SPECIFIC NOTES ===');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T27: extraction_notes column exists in DB after migration (AC-B schema)
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature B — schema', () => {
  // T27: account.extraction_notes column must exist after prisma db push
  it('T27 account.extraction_notes column exists in the database', async () => {
    const result: any[] = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'account'
        AND column_name = 'extraction_notes'
    `;
    expect(result).toHaveLength(1);
    expect(result[0].column_name).toBe('extraction_notes');
  });
});
