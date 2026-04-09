/**
 * Categorization Utilities
 *
 * Shared utilities for AI-powered transaction categorization.
 * Used by categorizeTransaction and categorizeTransactionBatch handlers.
 */

import prisma from '../../../../lib/prisma';
import logger from '../../../../utils/logger';
import { AuthContext } from '../../../../auth/types';

/**
 * Account structure for categorization
 */
export interface AccountForCategorization {
  id: string;
  name: string;
  code: string | null;
  classification: string;
  subType: string | null;
  type: string[];
}

/**
 * Grouped accounts by classification
 */
export interface AccountsGrouped {
  expense: AccountForCategorization[];
  income: AccountForCategorization[];
  asset: AccountForCategorization[];
  liability: AccountForCategorization[];
}

/**
 * Posting data for categorization
 */
export interface PostingForCategorization {
  id: string;
  description: string | null;
  amount: number;
  valueDate: Date | null;
  accountId: string | null;
  accountName: string | null;
  accountType: string[];
  creditAccountId: string | null;
  creditAccountName: string | null;
  creditAccountType: string[];
  categoryId: string | null;
  aiCatScore: number | null;
}

/**
 * Transaction direction
 */
export type TransactionDirection = 'money_in' | 'money_out';

/**
 * Confidence level
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Get the HQ (headquarters) legal entity for an organization
 * Returns the entity where is_it_headquartres is 'yes' or the first entity if none is marked as HQ
 */
export async function getHQEntityId(orgId: string): Promise<string | null> {
  // First try to find the HQ entity
  const hqEntity = await prisma.entity.findFirst({
    where: {
      org_id: orgId,
      is_it_headquartres: 'yes',
    },
    select: { id: true },
  });

  if (hqEntity) {
    return hqEntity.id;
  }

  // Fallback: get the first entity for this org
  const firstEntity = await prisma.entity.findFirst({
    where: { org_id: orgId },
    select: { id: true },
    orderBy: { created_at: 'asc' },
  });

  return firstEntity?.id ?? null;
}

/**
 * Fetch accounts available for categorization
 * Groups accounts by classification and filters by legal_entity_id
 * If no legalEntityId provided, uses the HQ entity for the org
 */
export async function fetchAccountsForCategorization(
  orgId: string,
  excludeAccountId?: string,
  legalEntityId?: string
): Promise<AccountsGrouped> {
  // Determine which legal entity to use
  let entityId: string | undefined = legalEntityId;
  if (!entityId) {
    entityId = (await getHQEntityId(orgId)) ?? undefined;
    logger.debug('Using HQ entity for categorization', { orgId, hqEntityId: entityId });
  }

  const accounts = await prisma.account.findMany({
    where: {
      org_id: orgId,
      is_active: true,
      classification: {
        in: ['Expense', 'Income', 'Assets', 'Liabilities'],
      },
      // Filter by legal_entity_id if we have one
      ...(entityId ? { legal_entity_id: entityId } : {}),
      ...(excludeAccountId ? { id: { not: excludeAccountId } } : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      classification: true,
      sub_type: true,
      type: true,
    },
    orderBy: [{ classification: 'asc' }, { name: 'asc' }],
  });

  const grouped: AccountsGrouped = {
    expense: [],
    income: [],
    asset: [],
    liability: [],
  };

  for (const account of accounts) {
    const mapped: AccountForCategorization = {
      id: account.id,
      name: account.name ?? '',
      code: account.code,
      classification: account.classification ?? '',
      subType: account.sub_type,
      type: account.type,
    };

    switch (account.classification) {
      case 'Expense':
        grouped.expense.push(mapped);
        break;
      case 'Income':
        grouped.income.push(mapped);
        break;
      case 'Assets':
        grouped.asset.push(mapped);
        break;
      case 'Liabilities':
        grouped.liability.push(mapped);
        break;
    }
  }

  logger.debug('Fetched accounts for categorization', {
    orgId,
    legalEntityId: entityId,
    expense: grouped.expense.length,
    income: grouped.income.length,
    asset: grouped.asset.length,
    liability: grouped.liability.length,
  });

  return grouped;
}

/**
 * Fetch a posting by ID with related account data
 */
export async function fetchPostingById(
  postingId: string,
  orgId: string
): Promise<PostingForCategorization | null> {
  const posting = await prisma.posting.findFirst({
    where: {
      id: postingId,
      org_id: orgId,
    },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
      credit_account: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  if (!posting) {
    return null;
  }

  return {
    id: posting.id,
    description: posting.description,
    amount: posting.amount?.toNumber() ?? 0,
    valueDate: posting.value_date,
    accountId: posting.account_id,
    accountName: posting.account?.name ?? posting.account_name,
    accountType: posting.account?.type ?? [],
    creditAccountId: posting.credit_account_id,
    creditAccountName: posting.credit_account?.name ?? null,
    creditAccountType: posting.credit_account?.type ?? [],
    categoryId: posting.category_id,
    aiCatScore: posting.ai_cat_score?.toNumber() ?? null,
  };
}

/**
 * Fetch multiple postings by IDs
 */
export async function fetchPostingsByIds(
  postingIds: string[],
  orgId: string
): Promise<PostingForCategorization[]> {
  const postings = await prisma.posting.findMany({
    where: {
      id: { in: postingIds },
      org_id: orgId,
    },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
      credit_account: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  return postings.map((posting) => ({
    id: posting.id,
    description: posting.description,
    amount: posting.amount?.toNumber() ?? 0,
    valueDate: posting.value_date,
    accountId: posting.account_id,
    accountName: posting.account?.name ?? posting.account_name,
    accountType: posting.account?.type ?? [],
    creditAccountId: posting.credit_account_id,
    creditAccountName: posting.credit_account?.name ?? null,
    creditAccountType: posting.credit_account?.type ?? [],
    categoryId: posting.category_id,
    aiCatScore: posting.ai_cat_score?.toNumber() ?? null,
  }));
}

/**
 * Check if account type array indicates a bank or credit card account
 */
function isBankOrCreditCardAccount(accountType: string[]): boolean {
  return (
    accountType.includes('BANK') ||
    accountType.includes('CREDIT_CARD') ||
    accountType.includes('bank') ||
    accountType.includes('credit_card') ||
    accountType.includes('CHECKING') ||
    accountType.includes('SAVINGS')
  );
}

const DIRECTION_ERROR_MESSAGE =
  'Cannot determine transaction direction: account types are missing or ambiguous (need exactly one side to be bank/credit card).';

/**
 * Determine transaction direction based on which side has the bank account
 *
 * For simple transactions (bank statement imports):
 * - If bank is on CREDIT side (credit_account_id) → Money OUT (expense needed for debit)
 * - If bank is on DEBIT side (account_id) → Money IN (income needed for credit)
 *
 * This is because:
 * - Money leaving bank = credit the bank account, debit an expense
 * - Money entering bank = debit the bank account, credit an income
 *
 * When options.strict is true, throws if direction cannot be determined from account types
 * (e.g. both sides bank, neither side bank, or empty type arrays) instead of falling back to amount sign.
 */
export function determineTransactionDirection(
  amount: number,
  accountType: string[],
  creditAccountType: string[] = [],
  options?: { strict?: boolean }
): TransactionDirection {
  const debitSideIsBank = isBankOrCreditCardAccount(accountType);
  const creditSideIsBank = isBankOrCreditCardAccount(creditAccountType);

  // If bank is on credit side (credit_account_id), money is leaving → money_out
  if (creditSideIsBank && !debitSideIsBank) {
    return 'money_out';
  }

  // If bank is on debit side (account_id), money is entering → money_in
  if (debitSideIsBank && !creditSideIsBank) {
    return 'money_in';
  }

  // Ambiguous: both sides bank, neither bank, or empty types
  if (options?.strict) {
    throw new Error(DIRECTION_ERROR_MESSAGE);
  }

  // Fallback: if both sides have accounts or neither identified as bank,
  // use amount sign (negative = out, positive = in)
  // This handles legacy data or unusual cases (only when not strict)
  return amount < 0 ? 'money_out' : 'money_in';
}

/**
 * Determine which field to update based on transaction direction
 */
export function getFieldToUpdate(direction: TransactionDirection): 'account_id' | 'credit_account_id' {
  // Money OUT: Bank is credited, counter-account is debited → update account_id
  // Money IN: Bank is debited, counter-account is credited → update credit_account_id
  return direction === 'money_out' ? 'account_id' : 'credit_account_id';
}

/**
 * Map confidence score to level
 */
export function mapConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

/**
 * Build the system prompt for categorization
 */
export function buildSystemPrompt(): string {
  return `You are a financial transaction categorization assistant. Your task is to analyze transaction details and predict the most appropriate counter-account from the available Chart of Accounts.

CRITICAL - The transaction direction tells you which account type to suggest:
- "Money OUT (expense/payment)" = account holder is paying → suggest EXPENSE accounts
- "Money IN (income/receipt)" = account holder is receiving → suggest INCOME or ASSET accounts

IMPORTANT - Do NOT confuse the account holder's perspective with the counterparty:
- "rent" with Money IN = account holder receiving rental INCOME (suggest Income account)
- "rent" with Money OUT = account holder paying rent (suggest Expense account)
- "salary" with Money IN = account holder receiving salary (suggest Income account)
- "salary" with Money OUT = account holder paying salaries (suggest Payroll Expense)

RULES:
1. Only select from the provided account list - never invent account IDs
2. The direction label tells you which type of account to suggest
3. Match keywords in description to account purpose
4. Provide confidence based on how clear the match is:
   - High (0.8-1.0): Clear keyword match, unambiguous category
   - Medium (0.5-0.79): Partial match, reasonable inference
   - Low (0.0-0.49): Ambiguous, multiple possible categories
5. Suggest up to 3 alternatives when uncertain
6. Provide brief reasoning for your choice

Common patterns for Money OUT (Expenses):
- AWS, Azure, GCP → Cloud/Software expenses
- UBER, LYFT → Travel & Transportation
- AMAZON → Office Supplies (unless clearly something else)
- Payroll, ADP, Gusto → Payroll Expenses
- STRIPE, PAYPAL (outgoing) → Payment Processing Fees

Common patterns for Money IN (Income/Assets):
- UPI transfers with "rent/month" keywords → Rental Income
- Customer payments, invoice references → Accounts Receivable or Sales Revenue
- Dividend payments (DIV) → Dividend Income
- Interest credits (Int.Pd) → Interest Income`;
}

/**
 * Build the user prompt for categorization
 */
export function buildUserPrompt(
  posting: PostingForCategorization,
  accounts: AccountsGrouped,
  direction: TransactionDirection
): string {
  const directionLabel = direction === 'money_out' ? 'Money OUT (expense/payment)' : 'Money IN (income/receipt)';

  return `Transaction to categorize:
- Description: ${posting.description || '(no description)'}
- Amount: ${Math.abs(posting.amount).toFixed(2)} (${directionLabel})
- Date: ${posting.valueDate?.toISOString().split('T')[0] || 'unknown'}
- Source Account: ${posting.accountName || 'unknown'} (${posting.accountType.join(', ') || 'unknown type'})

Available counter-accounts (select the account_id):

${formatAllAccountsForPrompt(accounts)}

Analyze the transaction and return your prediction.`;
}

/**
 * Update posting with categorization result
 */
export async function updatePostingWithCategorization(
  postingId: string,
  predictedAccountId: string,
  confidenceScore: number,
  fieldToUpdate: 'account_id' | 'credit_account_id',
  modifiedBy: string
): Promise<void> {
  const updateData: any = {
    ai_cat_score: confidenceScore,
    ai_categorized_at: new Date(),
    modified_at: new Date(),
    modified_by: modifiedBy,
  };

  if (fieldToUpdate === 'account_id') {
    updateData.account_id = predictedAccountId;
  } else {
    updateData.credit_account_id = predictedAccountId;
  }

  await prisma.posting.update({
    where: { id: postingId },
    data: updateData,
  });

  logger.debug('Updated posting with categorization', {
    postingId,
    predictedAccountId,
    confidenceScore,
    fieldToUpdate,
  });
}

/**
 * Validate that an account exists and belongs to the org
 */
export async function validateAccount(
  accountId: string,
  orgId: string
): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      org_id: orgId,
      is_active: true,
    },
    select: { id: true },
  });

  return account !== null;
}

/**
 * Get account details by ID
 */
export async function getAccountById(
  accountId: string,
  orgId: string
): Promise<AccountForCategorization | null> {
  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      org_id: orgId,
    },
    select: {
      id: true,
      name: true,
      code: true,
      classification: true,
      sub_type: true,
      type: true,
    },
  });

  if (!account) return null;

  return {
    id: account.id,
    name: account.name ?? '',
    code: account.code,
    classification: account.classification ?? '',
    subType: account.sub_type,
    type: account.type,
  };
}

// ============================================================================
// BULK CATEGORIZATION & HISTORICAL MATCHING
// ============================================================================

/**
 * Configuration constants for categorization
 */
export const CATEGORIZATION_CONFIG = {
  /** Maximum number of transactions per LLM call */
  BULK_LLM_BATCH_SIZE: 20,
  /** Minimum similarity score for fuzzy matching (0-1) */
  FUZZY_MATCH_THRESHOLD: 0.85,
  /** Fixed confidence score for historical matches */
  HISTORICAL_MATCH_CONFIDENCE: 0.95,
};

/**
 * Historical mapping from past transactions
 */
export interface HistoricalMapping {
  descriptionNormalized: string;
  counterAccountId: string;
  counterAccountName: string;
  classification: string;
}

/**
 * Result from bulk LLM categorization
 */
export interface BulkCategorizationItem {
  index: number;
  predicted_account_id: string;
  confidence_score: number;
  reasoning: string;
}

/**
 * Normalize a transaction description for matching
 * Uses light normalization: lowercase and trim
 */
export function normalizeDescription(description: string | null): string {
  if (!description) return '';
  return description.toLowerCase().trim();
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns similarity score from 0 to 1
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[str1.length][str2.length];
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - distance / maxLength;
}

/**
 * Find a fuzzy match in historical mappings
 * Returns the best match above threshold, or null
 */
export function findFuzzyMatch(
  description: string,
  historicalMappings: HistoricalMapping[],
  threshold: number = CATEGORIZATION_CONFIG.FUZZY_MATCH_THRESHOLD
): HistoricalMapping | null {
  const normalized = normalizeDescription(description);
  if (!normalized) return null;

  let bestMatch: HistoricalMapping | null = null;
  let bestScore = 0;

  for (const mapping of historicalMappings) {
    const score = calculateSimilarity(normalized, mapping.descriptionNormalized);
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestMatch = mapping;
    }
  }

  return bestMatch;
}

/**
 * Fetch historical description → counter-account mappings from past transactions
 * Only returns mappings where both sides are filled (human-approved or manually entered)
 */
export async function fetchHistoricalMappings(orgId: string): Promise<HistoricalMapping[]> {
  // Query postings where both account_id and credit_account_id are filled
  // and ai_cat_score is null (meaning human-approved, not AI-assigned)
  const postings = await prisma.posting.findMany({
    where: {
      org_id: orgId,
      account_id: { not: null },
      credit_account_id: { not: null },
      description: { not: null },
      ai_cat_score: null, // Only human-approved transactions
    },
    select: {
      description: true,
      account_id: true,
      credit_account_id: true,
      account: {
        select: { id: true, name: true, type: true, classification: true },
      },
      credit_account: {
        select: { id: true, name: true, type: true, classification: true },
      },
    },
    distinct: ['description'],
  });

  const mappings: HistoricalMapping[] = [];
  const seen = new Set<string>();

  for (const posting of postings) {
    const normalized = normalizeDescription(posting.description);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    // Determine which side is the counter-account (non-bank side)
    const creditIsBank = posting.credit_account?.type?.some(
      (t) => ['BANK', 'CREDIT_CARD', 'CHECKING', 'SAVINGS'].includes(t)
    );
    const debitIsBank = posting.account?.type?.some(
      (t) => ['BANK', 'CREDIT_CARD', 'CHECKING', 'SAVINGS'].includes(t)
    );

    let counterAccount: { id: string; name: string | null; classification: string | null } | null = null;

    if (creditIsBank && !debitIsBank && posting.account) {
      // Bank on credit side, counter-account is on debit side
      counterAccount = posting.account;
    } else if (debitIsBank && !creditIsBank && posting.credit_account) {
      // Bank on debit side, counter-account is on credit side
      counterAccount = posting.credit_account;
    }

    if (counterAccount) {
      mappings.push({
        descriptionNormalized: normalized,
        counterAccountId: counterAccount.id,
        counterAccountName: counterAccount.name ?? '',
        classification: counterAccount.classification ?? '',
      });
    }
  }

  logger.debug('Fetched historical mappings', {
    orgId,
    totalMappings: mappings.length,
  });

  return mappings;
}

/**
 * Build a bulk prompt for categorizing multiple transactions at once
 */
export function buildBulkPrompt(
  postings: PostingForCategorization[],
  accounts: AccountsGrouped
): string {
  const formatPosting = (posting: PostingForCategorization, index: number): string => {
    const direction = determineTransactionDirection(
      posting.amount,
      posting.accountType,
      posting.creditAccountType,
      { strict: true }
    );
    const directionLabel = direction === 'money_out' ? 'Money OUT (expense)' : 'Money IN (income)';
    return `${index}. "${posting.description || '(no description)'}" | Amount: ${Math.abs(posting.amount).toFixed(2)} | ${directionLabel}`;
  };

  const transactionsList = postings.map((p, i) => formatPosting(p, i)).join('\n');

  return `Categorize each transaction below by selecting the most appropriate account_id.

AVAILABLE ACCOUNTS:

${formatAllAccountsForPrompt(accounts)}

TRANSACTIONS TO CATEGORIZE:
${transactionsList}

For each transaction, return:
- index: the transaction number (0-based)
- predicted_account_id: the account ID from the list above
- confidence_score: 0.0 to 1.0 based on how confident you are
- reasoning: brief explanation

Return exactly ${postings.length} categorizations, one per transaction.`;
}

/**
 * Build the system prompt for bulk categorization
 */
export function buildBulkSystemPrompt(): string {
  return `You are a financial transaction categorization assistant. Your task is to categorize multiple transactions at once.

CRITICAL - Transaction direction is determined by the label in the transaction:
- "Money OUT (expense)" = the account holder is paying/spending → suggest EXPENSE accounts
- "Money IN (income)" = the account holder is receiving money → suggest INCOME or ASSET accounts

IMPORTANT - Do NOT confuse the account holder's perspective with the counterparty:
- "rent" with "Money IN" = account holder receiving rental INCOME (not paying rent)
- "rent" with "Money OUT" = account holder paying rent EXPENSE
- "salary" with "Money IN" = account holder receiving salary income
- "salary" with "Money OUT" = account holder paying salaries (Payroll Expense)

RULES:
1. Only select account IDs from the provided list - never invent IDs
2. The direction label tells you which type of account to suggest
3. Match keywords in descriptions to account purposes
4. Return exactly one categorization per transaction
5. Maintain the same order as the input (use index field)
6. Provide confidence based on how clear the match is:
   - High (0.8-1.0): Clear keyword match
   - Medium (0.5-0.79): Reasonable inference
   - Low (0.0-0.49): Ambiguous, guessing

Common patterns for Money OUT (Expenses):
- FEES, INTEREST charges → Bank/Processing Fees
- AWS, UBER, etc. → Match to appropriate expense category
- Rent payments → Rent Expense

Common patterns for Money IN (Income):
- UPI transfers with "rent/month" keywords → Rental Income
- Customer payments → Accounts Receivable or Sales Revenue
- Dividend payments (DIV) → Dividend Income
- Interest credits → Interest Income`;
}

// ============================================================================
// SHARED PROMPT FORMATTING UTILITIES
// ============================================================================

/**
 * Format an account list for inclusion in LLM prompts
 * Shared by: BankStatementWithCategorizationExtractor, buildUserPrompt, buildBulkPrompt
 */
export function formatAccountsListForPrompt(
  accountList: AccountForCategorization[],
  label: string,
  maxItems: number = 50
): string {
  if (accountList.length === 0) return `${label}: (none available)`;

  const items = accountList
    .slice(0, maxItems)
    .map((a) => `  - ${a.id}: ${a.name}${a.code ? ` (${a.code})` : ''}`)
    .join('\n');

  const truncated = accountList.length > maxItems
    ? `\n  ... and ${accountList.length - maxItems} more`
    : '';

  return `${label}:\n${items}${truncated}`;
}

/**
 * Format all account groups for a categorization prompt
 */
export function formatAllAccountsForPrompt(
  accounts: AccountsGrouped,
  maxPerCategory: number = 50
): string {
  return [
    formatAccountsListForPrompt(accounts.expense, 'EXPENSE ACCOUNTS', maxPerCategory),
    formatAccountsListForPrompt(accounts.income, 'INCOME ACCOUNTS', maxPerCategory),
    formatAccountsListForPrompt(accounts.asset, 'ASSET ACCOUNTS', maxPerCategory),
    formatAccountsListForPrompt(accounts.liability, 'LIABILITY ACCOUNTS', maxPerCategory),
  ].join('\n\n');
}

/**
 * Build the categorization instruction block for combined extraction prompts
 */
export function buildCategorizationInstructions(): string {
  return `=== CATEGORIZATION TASK ===
For EACH extracted transaction, predict the appropriate counter-account from the Chart of Accounts below.

CRITICAL - Determine transaction direction from the AMOUNT FIELDS:
- If debit_amount > 0 (Withdrawal column has value): This is MONEY OUT - the account holder is paying/spending
  → Suggest an EXPENSE account (e.g., Rent Expense, Utilities, Office Supplies)
- If credit_amount > 0 (Deposit column has value): This is MONEY IN - the account holder is receiving money
  → Suggest an INCOME or ASSET account (e.g., Rental Income, Sales Revenue, Accounts Receivable)

IMPORTANT: Do NOT confuse the account holder's perspective with the counterparty:
- "rent" in a DEPOSIT means the account holder is RECEIVING rental income (suggest Income account)
- "rent" in a WITHDRAWAL means the account holder is PAYING rent (suggest Expense account)
- "salary" in a DEPOSIT means the account holder is receiving salary (suggest Income account)
- "salary" in a WITHDRAWAL means the account holder is paying salary to employees (suggest Payroll Expense)

Additional context clues:
- UPI/NEFT/RTGS transfers with names in Deposit column = likely income (rental, dividends, payments received)
- ACH with company names in Deposit column = likely dividends or refunds
- Tax deductions (TDS, WTax) in Withdrawal column = Tax Expense

Common patterns for WITHDRAWALS (Expense accounts):
- AWS, Azure, GCP = Cloud/Software expenses
- UBER, LYFT = Travel & Transportation
- Payroll, ADP, Gusto = Payroll Expenses

Common patterns for DEPOSITS (Income accounts):
- UPI transfers with "rent/month" keywords = Rental Income
- Customer payments, invoice references = Accounts Receivable or Sales Revenue
- Dividend payments (DIV in description) = Dividend Income
- Interest credits (Int.Pd) = Interest Income

Provide a confidence score for each:
- High (0.8-1.0): Clear keyword match, unambiguous
- Medium (0.5-0.79): Reasonable inference
- Low (0.0-0.49): Ambiguous or uncertain`;
}

/**
 * Schema for categorization results
 */
export function getCategorizationSchema(): Record<string, any> {
  return {
    categorizations: [
      {
        transaction_index: 'number',
        predicted_account_id: 'string',
        predicted_account_name: 'string',
        confidence_score: 'number',
        reasoning: 'string',
      },
    ],
  };
}
