/**
 * Tests for AI Transaction Categorization Handlers
 *
 * These tests verify the categorization handlers work correctly.
 * Mock data is created within the tests - no external data required.
 */

import { categorizeTransactionHandler } from '../../../agent/handlers/erp/categorizeTransaction';
import { categorizeTransactionBatchHandler } from '../../../agent/handlers/erp/categorizeTransactionBatch';
import {
  fetchAccountsForCategorization,
  determineTransactionDirection,
  getFieldToUpdate,
  mapConfidenceLevel,
  buildSystemPrompt,
  buildUserPrompt,
  normalizeDescription,
  calculateSimilarity,
  findFuzzyMatch,
  buildBulkPrompt,
  buildBulkSystemPrompt,
  PostingForCategorization,
  AccountsGrouped,
  HistoricalMapping,
  CATEGORIZATION_CONFIG,
} from '../../../agent/handlers/erp/utils/categorizationUtils';
import { aiActivityLogger } from '../../../agent/utils/aiActivityLogger';
import prisma from '../../../lib/prisma';
import { AuthContext } from '../../../auth/types';

// Test organization ID - uses existing demo org
const TEST_ORG_ID = 'org_indian_demo';
const TEST_USER_ID = 'user_test_categorization';

/**
 * Create test auth context
 */
const createTestAuth = (): AuthContext => ({
  user: {
    id: TEST_USER_ID,
    org_id: TEST_ORG_ID,
    email: 'test-categorization@example.com',
    name: 'Test Categorization User',
  },
  permissions: {
    posting: { '*': 'write' },
    account: { '*': 'read' },
  },
});

/**
 * Create mock posting data
 */
const createMockPosting = (overrides: Partial<PostingForCategorization> = {}): PostingForCategorization => ({
  id: 'post_test_' + Date.now(),
  description: 'AMAZON WEB SERVICES aws.amazon.com',
  amount: -150.0,
  valueDate: new Date(),
  accountId: 'acco_test_bank',
  accountName: 'Chase Business Checking',
  accountType: ['BANK'],
  creditAccountId: null,
  creditAccountName: null,
  creditAccountType: [],
  aiCatScore: null,
  ...overrides,
});

/**
 * Create mock accounts grouped
 */
const createMockAccounts = (): AccountsGrouped => ({
  expense: [
    { id: 'acco_software', name: 'Software Subscriptions', code: '6100', classification: 'Expense', subType: null, type: [] },
    { id: 'acco_cloud', name: 'Cloud Infrastructure', code: '6110', classification: 'Expense', subType: null, type: [] },
    { id: 'acco_travel', name: 'Travel & Transportation', code: '6200', classification: 'Expense', subType: null, type: [] },
    { id: 'acco_office', name: 'Office Supplies', code: '6300', classification: 'Expense', subType: null, type: [] },
  ],
  income: [
    { id: 'acco_sales', name: 'Sales Revenue', code: '4100', classification: 'Income', subType: null, type: [] },
    { id: 'acco_services', name: 'Service Revenue', code: '4200', classification: 'Income', subType: null, type: [] },
  ],
  asset: [
    { id: 'acco_ar', name: 'Accounts Receivable', code: '1200', classification: 'Assets', subType: null, type: [] },
    { id: 'acco_savings', name: 'Savings Account', code: '1110', classification: 'Assets', subType: null, type: ['BANK'] },
  ],
  liability: [
    { id: 'acco_ap', name: 'Accounts Payable', code: '2100', classification: 'Liabilities', subType: null, type: [] },
  ],
});

describe('Categorization Utilities', () => {
  describe('determineTransactionDirection', () => {
    it('should return money_out when bank is on credit side (fee charged to bank)', () => {
      // Bank account on credit side = money leaving bank = money_out
      const direction = determineTransactionDirection(3.95, [], ['BANK', 'CHECKING']);
      expect(direction).toBe('money_out');
    });

    it('should return money_in when bank is on debit side (deposit to bank)', () => {
      // Bank account on debit side = money entering bank = money_in
      const direction = determineTransactionDirection(500, ['BANK'], []);
      expect(direction).toBe('money_in');
    });

    it('should return money_out when credit card is on credit side', () => {
      // Credit card on credit side = purchase/expense = money_out
      const direction = determineTransactionDirection(50, [], ['CREDIT_CARD']);
      expect(direction).toBe('money_out');
    });

    it('should return money_in when credit card is on debit side (payment received)', () => {
      // Credit card on debit side = payment/refund = money_in
      const direction = determineTransactionDirection(100, ['CREDIT_CARD'], []);
      expect(direction).toBe('money_in');
    });

    it('should fallback to amount sign when no bank account on either side', () => {
      // No bank/credit card identified, use amount sign as fallback
      const directionNeg = determineTransactionDirection(-100, [], []);
      expect(directionNeg).toBe('money_out');

      const directionPos = determineTransactionDirection(100, [], []);
      expect(directionPos).toBe('money_in');
    });

    it('should throw in strict mode when both type arrays are empty', () => {
      expect(() =>
        determineTransactionDirection(100, [], [], { strict: true })
      ).toThrow(/Cannot determine transaction direction|account types are missing or ambiguous/);
    });

    it('should throw in strict mode when both sides are bank', () => {
      expect(() =>
        determineTransactionDirection(100, ['BANK'], ['BANK'], { strict: true })
      ).toThrow(/Cannot determine transaction direction|account types are missing or ambiguous/);
    });

    it('should return direction in strict mode when exactly one side is bank', () => {
      expect(
        determineTransactionDirection(100, ['BANK'], [], { strict: true })
      ).toBe('money_in');
      expect(
        determineTransactionDirection(50, [], ['CREDIT_CARD'], { strict: true })
      ).toBe('money_out');
    });
  });

  describe('getFieldToUpdate', () => {
    it('should return account_id for money_out', () => {
      const field = getFieldToUpdate('money_out');
      expect(field).toBe('account_id');
    });

    it('should return credit_account_id for money_in', () => {
      const field = getFieldToUpdate('money_in');
      expect(field).toBe('credit_account_id');
    });
  });

  describe('mapConfidenceLevel', () => {
    it('should return high for score >= 0.8', () => {
      expect(mapConfidenceLevel(0.8)).toBe('high');
      expect(mapConfidenceLevel(0.95)).toBe('high');
      expect(mapConfidenceLevel(1.0)).toBe('high');
    });

    it('should return medium for score >= 0.5 and < 0.8', () => {
      expect(mapConfidenceLevel(0.5)).toBe('medium');
      expect(mapConfidenceLevel(0.65)).toBe('medium');
      expect(mapConfidenceLevel(0.79)).toBe('medium');
    });

    it('should return low for score < 0.5', () => {
      expect(mapConfidenceLevel(0.0)).toBe('low');
      expect(mapConfidenceLevel(0.3)).toBe('low');
      expect(mapConfidenceLevel(0.49)).toBe('low');
    });
  });

  describe('buildSystemPrompt', () => {
    it('should return a non-empty system prompt', () => {
      const prompt = buildSystemPrompt();
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('financial transaction categorization');
    });
  });

  describe('buildUserPrompt', () => {
    it('should build a prompt with transaction details for money out', () => {
      // Bank on credit side = money out scenario (expense)
      const posting = createMockPosting({
        accountId: null,
        accountType: [],
        creditAccountId: 'acco_test_bank',
        creditAccountName: 'Chase Business Checking',
        creditAccountType: ['BANK'],
      });
      const accounts = createMockAccounts();
      const direction = determineTransactionDirection(posting.amount, posting.accountType, posting.creditAccountType);

      const prompt = buildUserPrompt(posting, accounts, direction);

      expect(prompt).toContain('AMAZON WEB SERVICES');
      expect(prompt).toContain('150.00');
      expect(prompt).toContain('Money OUT');
      expect(prompt).toContain('EXPENSE ACCOUNTS');
      expect(prompt).toContain('Software Subscriptions');
    });

    it('should include all account categories', () => {
      // Bank on debit side = money in scenario (income)
      const posting = createMockPosting({ amount: 500, accountType: ['BANK'] });
      const accounts = createMockAccounts();
      const direction = determineTransactionDirection(posting.amount, posting.accountType, posting.creditAccountType);

      const prompt = buildUserPrompt(posting, accounts, direction);

      expect(prompt).toContain('EXPENSE ACCOUNTS');
      expect(prompt).toContain('INCOME ACCOUNTS');
      expect(prompt).toContain('ASSET ACCOUNTS');
      expect(prompt).toContain('LIABILITY ACCOUNTS');
    });
  });

  describe('normalizeDescription', () => {
    it('should lowercase and trim descriptions', () => {
      expect(normalizeDescription('  MONTHLY ACCOUNT FEE  ')).toBe('monthly account fee');
      expect(normalizeDescription('E-TRANSFER')).toBe('e-transfer');
      expect(normalizeDescription(null)).toBe('');
      expect(normalizeDescription('')).toBe('');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(calculateSimilarity('hello', 'hello')).toBe(1);
      expect(calculateSimilarity('monthly account fee', 'monthly account fee')).toBe(1);
    });

    it('should return 0 for empty strings', () => {
      expect(calculateSimilarity('', 'hello')).toBe(0);
      expect(calculateSimilarity('hello', '')).toBe(0);
    });

    it('should return high similarity for similar strings', () => {
      const similarity = calculateSimilarity('monthly account fee', 'monthly acct fee');
      expect(similarity).toBeGreaterThan(0.8);
    });

    it('should return low similarity for different strings', () => {
      const similarity = calculateSimilarity('monthly account fee', 'amazon web services');
      expect(similarity).toBeLessThan(0.3);
    });
  });

  describe('findFuzzyMatch', () => {
    const mockMappings: HistoricalMapping[] = [
      { descriptionNormalized: 'monthly account fee', counterAccountId: 'acc1', counterAccountName: 'Bank Fees', classification: 'Expense' },
      { descriptionNormalized: 'amazon web services', counterAccountId: 'acc2', counterAccountName: 'Cloud Services', classification: 'Expense' },
      { descriptionNormalized: 'payroll deposit', counterAccountId: 'acc3', counterAccountName: 'Salary Income', classification: 'Income' },
    ];

    it('should find exact match', () => {
      const match = findFuzzyMatch('MONTHLY ACCOUNT FEE', mockMappings);
      expect(match).not.toBeNull();
      expect(match?.counterAccountId).toBe('acc1');
    });

    it('should find fuzzy match above threshold', () => {
      const match = findFuzzyMatch('MONTHLY ACCT FEE', mockMappings, 0.7);
      expect(match).not.toBeNull();
      expect(match?.counterAccountId).toBe('acc1');
    });

    it('should return null for no match', () => {
      const match = findFuzzyMatch('COMPLETELY DIFFERENT', mockMappings);
      expect(match).toBeNull();
    });

    it('should return null for empty description', () => {
      const match = findFuzzyMatch('', mockMappings);
      expect(match).toBeNull();
    });
  });

  describe('buildBulkPrompt', () => {
    it('should build a prompt with multiple transactions', () => {
      const postings = [
        createMockPosting({ description: 'MONTHLY FEE', amount: -5.00 }),
        createMockPosting({ description: 'E-TRANSFER', amount: 500.00 }),
      ];
      const accounts = createMockAccounts();

      const prompt = buildBulkPrompt(postings, accounts);

      expect(prompt).toContain('MONTHLY FEE');
      expect(prompt).toContain('E-TRANSFER');
      expect(prompt).toContain('EXPENSE ACCOUNTS');
      expect(prompt).toContain('Return exactly 2 categorizations');
    });
  });

  describe('buildBulkSystemPrompt', () => {
    it('should return a non-empty system prompt', () => {
      const prompt = buildBulkSystemPrompt();

      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('categorize multiple transactions');
    });
  });

  describe('CATEGORIZATION_CONFIG', () => {
    it('should have expected default values', () => {
      expect(CATEGORIZATION_CONFIG.BULK_LLM_BATCH_SIZE).toBe(20);
      expect(CATEGORIZATION_CONFIG.FUZZY_MATCH_THRESHOLD).toBe(0.85);
      expect(CATEGORIZATION_CONFIG.HISTORICAL_MATCH_CONFIDENCE).toBe(0.95);
    });
  });
});

describe('AI Activity Logger', () => {
  describe('createToolTracker', () => {
    it('should track tool usage correctly', () => {
      const tracker = aiActivityLogger.createToolTracker();

      tracker.track('fetchPosting', true);
      tracker.track('fetchPosting', true);
      tracker.track('generateObject', true);
      tracker.track('updatePosting', false);

      const usage = tracker.getUsage();

      expect(usage).toHaveLength(3);

      const fetchPosting = usage.find((u) => u.name === 'fetchPosting');
      expect(fetchPosting?.calls).toBe(2);
      expect(fetchPosting?.success).toBe(2);

      const updatePosting = usage.find((u) => u.name === 'updatePosting');
      expect(updatePosting?.calls).toBe(1);
      expect(updatePosting?.success).toBe(0);
    });
  });

  describe('startTimer', () => {
    it('should measure duration', async () => {
      const getElapsed = aiActivityLogger.startTimer();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      const elapsed = getElapsed();
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some variance
      expect(elapsed).toBeLessThan(200);
    });
  });
});

describe('categorizeTransactionHandler', () => {
  describe('validateParams', () => {
    it('should throw error when no params provided', () => {
      expect(() => {
        categorizeTransactionHandler.validateParams(undefined, undefined, createTestAuth());
      }).toThrow('requires params');
    });

    it('should throw error when neither posting_id nor posting_data provided', () => {
      expect(() => {
        categorizeTransactionHandler.validateParams({}, undefined, createTestAuth());
      }).toThrow('requires either posting_id or posting_data');
    });

    it('should accept posting_id', () => {
      const params = categorizeTransactionHandler.validateParams(
        { posting_id: 'post_123' },
        undefined,
        createTestAuth()
      );
      expect(params.posting_id).toBe('post_123');
    });

    it('should accept posting_data with required fields', () => {
      const params = categorizeTransactionHandler.validateParams(
        {
          posting_data: {
            id: 'post_123',
            description: 'Test',
            amount: -100,
            value_date: '2024-01-15',
            account_id: 'acco_123',
          },
        },
        undefined,
        createTestAuth()
      );
      expect(params.posting_data.id).toBe('post_123');
    });

    it('should throw error when posting_data.id is missing', () => {
      expect(() => {
        categorizeTransactionHandler.validateParams(
          {
            posting_data: {
              description: 'Test',
              amount: -100,
            } as any,
          },
          undefined,
          createTestAuth()
        );
      }).toThrow('posting_data.id is required');
    });

    it('should set default options', () => {
      const params = categorizeTransactionHandler.validateParams(
        { posting_id: 'post_123' },
        undefined,
        createTestAuth()
      );
      expect(params.options.include_alternatives).toBe(true);
      expect(params.options.max_alternatives).toBe(3);
      expect(params.options.apply).toBe(true);
    });
  });
});

describe('categorizeTransactionBatchHandler', () => {
  describe('validateParams', () => {
    it('should throw error when no params provided', () => {
      expect(() => {
        categorizeTransactionBatchHandler.validateParams(undefined, undefined, createTestAuth());
      }).toThrow('requires params');
    });

    it('should throw error when neither posting_ids nor postings provided', () => {
      expect(() => {
        categorizeTransactionBatchHandler.validateParams({}, undefined, createTestAuth());
      }).toThrow('requires either posting_ids or postings');
    });

    it('should throw error for empty posting_ids array', () => {
      expect(() => {
        categorizeTransactionBatchHandler.validateParams({ posting_ids: [] }, undefined, createTestAuth());
      }).toThrow('posting_ids array cannot be empty');
    });

    it('should throw error for empty postings array', () => {
      expect(() => {
        categorizeTransactionBatchHandler.validateParams({ postings: [] }, undefined, createTestAuth());
      }).toThrow('postings array cannot be empty');
    });

    it('should accept posting_ids array', () => {
      const params = categorizeTransactionBatchHandler.validateParams(
        { posting_ids: ['post_1', 'post_2', 'post_3'] },
        undefined,
        createTestAuth()
      );
      expect(params.posting_ids).toHaveLength(3);
    });

    it('should set default options', () => {
      const params = categorizeTransactionBatchHandler.validateParams(
        { posting_ids: ['post_1'] },
        undefined,
        createTestAuth()
      );
      expect(params.options.skip_already_categorized).toBe(true);
      expect(params.options.min_confidence).toBe('medium');
      expect(params.options.dry_run).toBe(false);
      expect(params.options.use_historical_matching).toBe(true);
    });
  });
});

// Integration test with real posting and real LLM call
describe('Real LLM Integration Test', () => {
  const REAL_POSTING_ID = 'post_b19a9c86-0592-4187-8ef1-20a7b5af03bf';

  it('should categorize a real posting with LLM', async () => {
    const auth = createTestAuth();

    const result = await categorizeTransactionHandler.execute(
      null as any,
      {
        posting_id: REAL_POSTING_ID,
        options: {
          include_alternatives: true,
          apply: false, // Don't apply - just test the categorization
        },
      },
      undefined,
      auth
    );

    console.log('\n=== Real LLM Categorization Result ===');
    console.log('Posting ID:', REAL_POSTING_ID);
    console.log('Success:', result.success);

    if (result.success && result.data) {
      console.log('Predicted Account ID:', result.data.predicted_account_id);
      console.log('Predicted Account Name:', result.data.predicted_account_name);
      console.log('Predicted Account Type:', result.data.predicted_account_type);
      console.log('Confidence:', result.data.confidence, `(${result.data.confidence_score})`);
      console.log('Reasoning:', result.data.reasoning);
      console.log('Transaction Direction:', result.data.transaction_direction);
      console.log('Field to Update:', result.data.field_to_update);

      if (result.data.alternatives && result.data.alternatives.length > 0) {
        console.log('\nAlternatives:');
        result.data.alternatives.forEach((alt: { account_name: string; confidence_score: number; reasoning: string }, i: number) => {
          console.log(`  ${i + 1}. ${alt.account_name} (${alt.confidence_score}) - ${alt.reasoning}`);
        });
      }
    } else {
      console.log('Error:', result.error);
    }
    console.log('=====================================\n');

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.predicted_account_id).toBeDefined();
    expect(result.data?.confidence_score).toBeGreaterThan(0);
    expect(result.data?.reasoning).toBeDefined();
  }, 60000); // 60 second timeout for LLM call

  it('should batch categorize postings for a bank account', async () => {
    const auth = createTestAuth();
    const TARGET_ACCOUNT_ID = 'acco_org_bangalore_office_1102'; // TD Checking Account

    // Step 1: Query postings where this account is on either side
    const postings = await prisma.posting.findMany({
      where: {
        org_id: TEST_ORG_ID,
        OR: [
          { account_id: TARGET_ACCOUNT_ID },
          { credit_account_id: TARGET_ACCOUNT_ID },
        ],
      },
      select: { id: true, description: true, amount: true },
      take: 10, // Limit for test
    });

    console.log('\n=== Batch Categorization Test ===');
    console.log('Target Account:', TARGET_ACCOUNT_ID);
    console.log('Postings found:', postings.length);

    if (postings.length === 0) {
      console.log('No postings found for this account, skipping test');
      return;
    }

    // Log the postings we're about to categorize
    console.log('\nPostings to categorize:');
    postings.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.id}: ${p.description} (${p.amount})`);
    });

    // Step 2: Extract posting IDs
    const postingIds = postings.map((p) => p.id);

    // Step 3: Call batch categorization (with optimizations: historical matching + bulk LLM)
    const result = await categorizeTransactionBatchHandler.execute(
      null as any,
      {
        posting_ids: postingIds,
        options: {
          skip_already_categorized: true,
          min_confidence: 'low', // Accept all predictions for testing
          dry_run: true, // Don't apply changes
          use_historical_matching: true, // Enable historical matching
        },
      },
      undefined,
      auth
    );

    console.log('\n=== Batch Results (Optimized v2) ===');
    console.log('Success:', result.success);

    if (result.success && result.data) {
      console.log('\nSummary:');
      console.log('  Total processed:', result.data.summary.total_processed);
      console.log('  Categorized:', result.data.summary.categorized_count);
      console.log('  Historical matches:', result.data.summary.historical_match_count);
      console.log('  LLM categorized:', result.data.summary.llm_categorized_count);
      console.log('  Applied:', result.data.summary.applied_count);
      console.log('  Skipped:', result.data.summary.skipped_count);
      console.log('  Errors:', result.data.summary.error_count);

      console.log('\nIndividual Results:');
      result.data.results.forEach((r: {
        posting_id: string;
        predicted_account_name: string | null;
        confidence: string | null;
        confidence_score: number | null;
        reasoning: string | null;
        applied: boolean;
        skipped_reason?: string;
        error?: string;
      }, i: number) => {
        const status = r.applied ? '✓ Applied' : r.skipped_reason ? `○ Skipped: ${r.skipped_reason}` : r.error ? `✗ Error: ${r.error}` : '○ Dry run';
        console.log(`  ${i + 1}. ${r.posting_id}`);
        console.log(`     → ${r.predicted_account_name || 'N/A'} (${r.confidence || 'N/A'}: ${r.confidence_score ?? 'N/A'})`);
        console.log(`     ${status}`);
        if (r.reasoning) {
          console.log(`     Reasoning: ${r.reasoning.substring(0, 80)}...`);
        }
      });
    } else {
      console.log('Error:', result.error);
    }
    console.log('=====================================\n');

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.summary.total_processed).toBeGreaterThan(0);
  }, 120000); // 120 second timeout for batch LLM calls
});

// Integration tests - these require database connection and LLM
// Mark as slow and only run when explicitly requested
describe.skip('Integration Tests (requires LLM)', () => {
  let testPostingId: string;

  beforeAll(async () => {
    // Create a test posting in the database
    const posting = await prisma.posting.create({
      data: {
        description: 'UBER TRIP - Business Travel',
        amount: -45.0,
        value_date: new Date(),
        org_id: TEST_ORG_ID,
        created_by: TEST_USER_ID,
      },
    });
    testPostingId = posting.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testPostingId) {
      await prisma.posting.delete({ where: { id: testPostingId } }).catch(() => { });
    }
    // Clean up AI activity logs from tests
    await prisma.ai_activity_log
      .deleteMany({
        where: {
          org_id: TEST_ORG_ID,
          user_id: TEST_USER_ID,
        },
      })
      .catch(() => { });
  });

  it('should categorize a transaction with LLM', async () => {
    const auth = createTestAuth();

    const result = await categorizeTransactionHandler.execute(
      null as any,
      {
        posting_id: testPostingId,
        options: {
          include_alternatives: true,
          apply: false, // Don't apply in test
        },
      },
      undefined,
      auth
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.predicted_account_id).toBeDefined();
    expect(result.data?.confidence_score).toBeGreaterThan(0);
    expect(result.data?.reasoning).toBeDefined();
  }, 30000); // 30 second timeout for LLM call

  it('should log AI activity', async () => {
    const auth = createTestAuth();

    // First, make a categorization call
    await categorizeTransactionHandler.execute(
      null as any,
      {
        posting_id: testPostingId,
        options: { apply: false },
      },
      undefined,
      auth
    );

    // Check that activity was logged
    const activities = await aiActivityLogger.getActivitiesByOrg(TEST_ORG_ID, {
      activityType: 'categorize_transaction',
      limit: 1,
    });

    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].activity_type).toBe('categorize_transaction');
    expect(activities[0].model_name).toBe('posting');
  }, 30000);
});
