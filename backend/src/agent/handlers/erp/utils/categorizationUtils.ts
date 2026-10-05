/**
 * Categorization Utilities
 *
 * Shared utilities for AI-powered transaction categorization.
 * Used by categorizeTransaction and categorizeTransactionBatch handlers.
 */

import { Prisma } from '@prisma/client';
import prisma from '../../../../lib/prisma';
import logger from '../../../../utils/logger';
import { AuthContext } from '../../../../auth/types';
import {
  toMerchantKey,
  type MerchantKeyProvider,
} from '../../../../services/transaction-identity/types';
import { MERCHANT_KEY_CANON_RULES } from '../../../../services/transaction-identity/merchantKeyCanonPrompt';

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
  aiCatScore: number | null;
  merchantKey?: string | null;
  merchantKeyProvider?: string | null;
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
 * Resolve legal entity + country for identity enrichment routing.
 */
export async function resolveEntityForIdentity(
  orgId: string,
  legalEntityId?: string | null
): Promise<{ legalEntityId: string | null; country: string }> {
  if (legalEntityId) {
    const entity = await prisma.entity.findFirst({
      where: { id: legalEntityId, org_id: orgId },
      select: { id: true, country: true },
    });
    if (entity) {
      return { legalEntityId: entity.id, country: entity.country ?? '' };
    }
  }

  const hqEntity = await prisma.entity.findFirst({
    where: { org_id: orgId, is_it_headquartres: 'yes' },
    select: { id: true, country: true },
  });
  if (hqEntity) {
    return { legalEntityId: hqEntity.id, country: hqEntity.country ?? '' };
  }

  const firstEntity = await prisma.entity.findFirst({
    where: { org_id: orgId },
    select: { id: true, country: true },
    orderBy: { created_at: 'asc' },
  });

  return {
    legalEntityId: firstEntity?.id ?? null,
    country: firstEntity?.country ?? '',
  };
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
    aiCatScore: posting.ai_cat_score?.toNumber() ?? null,
    merchantKey: posting.merchant_key ?? null,
    merchantKeyProvider: posting.merchant_key_provider ?? null,
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
    aiCatScore: posting.ai_cat_score?.toNumber() ?? null,
    merchantKey: posting.merchant_key ?? null,
    merchantKeyProvider: posting.merchant_key_provider ?? null,
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

export interface CategorizationIdentityWrite {
  merchantKey?: string | null;
  merchantKeyProvider?: MerchantKeyProvider | null;
}

/**
 * Update posting with categorization result (and optional persisted merchant key).
 */
export async function updatePostingWithCategorization(
  postingId: string,
  predictedAccountId: string,
  confidenceScore: number,
  fieldToUpdate: 'account_id' | 'credit_account_id',
  modifiedBy: string,
  identity?: CategorizationIdentityWrite
): Promise<void> {
  const updateData: Record<string, unknown> = {
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

  const key = toMerchantKey(identity?.merchantKey);
  if (key) {
    updateData.merchant_key = key;
    updateData.merchant_key_provider = identity?.merchantKeyProvider ?? null;
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
    merchantKey: key || undefined,
    merchantKeyProvider: identity?.merchantKeyProvider,
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
  /** Fixed confidence score for historical matches */
  HISTORICAL_MATCH_CONFIDENCE: 0.95,
};

/** Caller override wins; else env (default true unless CATEGORIZE_USE_HISTORICAL_MATCHING=false). */
export function resolveUseHistoricalMatching(override?: boolean): boolean {
  return override ?? process.env.CATEGORIZE_USE_HISTORICAL_MATCHING !== 'false';
}

/**
 * Historical mapping from past transactions
 */
export interface HistoricalMapping {
  /** Legacy stripped narrative (normalizeDescription); used in reasoning fallback. */
  descriptionNormalized: string;
  /**
   * Stable match key from the identity enricher.
   * Legacy adapter: same as descriptionNormalized.
   * Plaid Enrich: normalized merchant_name.
   */
  merchantKey: string;
  counterAccountId: string;
  counterAccountName: string;
  classification: string;
  /** Original AI/manual categorization reasoning from the source posting notes, if any. */
  sourceReasoning: string | null;
}

/** Prefix applied to historical-match reasoning (idempotent — not re-added if already present). */
export const HISTORICAL_MATCH_REASONING_PREFIX = 'Historical match: ';

const AI_CLASSIFICATION_MARKER = '--- AI classification';

/**
 * Pull categorization reasoning from posting.notes (AI classification block, "AI:" line,
 * or a short single-line note). Returns null when nothing usable is found.
 */
export function extractCategorizationReasoningFromNotes(
  notes: string | null | undefined
): string | null {
  if (!notes?.trim()) return null;
  const text = notes.trim();

  const markerIdx = text.indexOf(AI_CLASSIFICATION_MARKER);
  const searchIn = markerIdx >= 0 ? text.slice(markerIdx) : text;

  const catMatch = searchIn.match(/Categorization:\s*(.+?)(?:\n|$)/i);
  if (catMatch) {
    const cat = catMatch[1].trim();
    if (cat && cat !== '—' && cat !== '-') return cat;
  }

  const aiLine = text.match(/(?:^|\n)AI:\s*(.+?)(?:\n|$)/i);
  if (aiLine?.[1]?.trim()) return aiLine[1].trim();

  if (text.toLowerCase().startsWith(HISTORICAL_MATCH_REASONING_PREFIX.toLowerCase())) {
    return text;
  }

  // Import path may write reasoning alone when notes were empty
  if (!text.includes('\n') && text.length <= 500 && !text.startsWith('---')) {
    return text;
  }

  return null;
}

/**
 * Build reasoning for a historically matched posting.
 * Copies source reasoning when present; always ensures a single "Historical match: " prefix.
 */
export function formatHistoricalMatchReasoning(
  sourceReasoning: string | null | undefined,
  descriptionNormalized: string
): string {
  const prefix = HISTORICAL_MATCH_REASONING_PREFIX;
  const body = (sourceReasoning?.trim() || `similar to "${descriptionNormalized}"`);
  if (body.toLowerCase().startsWith(prefix.toLowerCase())) {
    return body;
  }
  return prefix + body;
}

/**
 * Result from bulk LLM categorization
 */
export interface BulkCategorizationItem {
  index: number;
  predicted_account_id: string;
  confidence_score: number;
  reasoning: string;
  /** Stable merchant identity for exact historical matching. */
  merchant_key?: string;
}

const BANK_TYPE_SET = new Set(['BANK', 'CREDIT_CARD', 'CHECKING', 'SAVINGS']);

/** US state/DC codes — only stripped for US debit-card narratives (not globally; preserves e.g. "amazon in"). */
const US_STATE_CODES =
  'al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc';

/**
 * Normalize a transaction description for the legacy merchant key path.
 *
 * Two-pass pipeline (A2):
 *   Pass 1 — strip noise tokens (payment rails, reference numbers, dates, bank prefixes, card masks)
 *   Pass 2 — take first 6 tokens to cap length
 *
 * US debit-card lines (`DEBIT CARD PURCHASE[-PIN] …`) get extra stripping so the
 * merchant remains inside the 6-token window instead of the shared rail prefix.
 */
export function normalizeDescription(description: string | null): string {
  if (!description) return '';

  // Step 0: lowercase + replace common separators with spaces
  let s = description.toLowerCase().replace(/[\/\-_*]/g, ' ');

  // US debit-card rail (Truist etc.): detect before stripping so location/card rules stay scoped
  const isUsDebitCard = /\bdebit\s+card\s+purchase(?:\s+pin)?\b/.test(s);
  if (isUsDebitCard) {
    s = s.replace(/\bdebit\s+card\s+purchase(?:\s+pin)?\b/g, '');
  }

  // Pass 1 — strip noise tokens (applied in order)

  // 1. Payment rail keywords and bank-specific transfer prefixes
  s = s.replace(/\b(upi|neft|rtgs|imps|nach|ecs|mmt|trf)\b/g, '');

  // 2. Alpha-prefix + long digit codes: bank routing codes (hdfc0001234) and ref codes (ref20250312001)
  s = s.replace(/\b[a-z]{2,6}\d{6,}\b/g, '');

  // 3. Standalone long reference numbers (8+ digits)
  s = s.replace(/\b\d{8,}\b/g, '');

  // 4. Embedded dates as separate tokens (after separator-to-space conversion, dates become
  //    sequences like "01 03 2026" — the year component is caught by pattern 3; short numbers
  //    like "01" "03" are left, which is acceptable)

  // 5. Month names with optional trailing year digits (mar2026, march, jan 2025)
  s = s.replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{0,4}\b/g, '');

  // 5b. Day+month compact or spaced tokens (08apr, 8 apr, 08 apr2026)
  s = s.replace(/\b\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{0,4}\b/g, '');

  // 6. Bank name phrases (exact multi-word) — must come before standalone bank-word patterns
  s = s.replace(/\b(hdfc bank|icici bank|axis bank|kotak bank|yes bank|indusind bank|indusind|sbi)\b/g, '');

  // 7. Transaction-type prefix tokens (atw/atl = Kotak ATM codes)
  s = s.replace(/\b(pos|atm|atw|atl|clg|chq|si|cr|dr)\b/g, '');

  // 7b. Decimal amounts like 5000.00 (e.g. Kotak ATW descriptions)
  s = s.replace(/\b\d+\.\d+\b/g, '');

  // 8. Masked card number fragments: digits + X/asterisk run + optional digits (e.g. 441234XXXXXX1234)
  s = s.replace(/\d*[x*]{3,}\d*/g, '');

  // 8b. US debit-card location / card-suffix noise (only when rail phrase was present)
  if (isUsDebitCard) {
    // mm dd yy (from 12-27-24) and mm dd (from 11-03)
    s = s.replace(/\b\d{1,2}\s+\d{1,2}\s+\d{2,4}\b/g, '');
    s = s.replace(/\b\d{1,2}\s+\d{1,2}\b/g, '');
    // phone numbers (866-712-7753 → 866 712 7753)
    s = s.replace(/\b\d{3}\s+\d{3}\s+\d{4}\b/g, '');
    // state / DC codes
    s = s.replace(new RegExp(`\\b(${US_STATE_CODES})\\b`, 'g'), '');
    // Normalize whitespace so ^-anchored city/card strip can match
    s = s.replace(/\s{2,}/g, ' ').trim();
    // PIN layout: "CITY [CITY…] CARDLAST4 MERCHANT…" — drop location + card before merchant
    s = s.replace(/^(?:[a-z]+\s+){1,3}\d{4}\s+/, '');
    // non-PIN layout: trailing card last-4
    s = s.replace(/\s+\d{4}$/, '');
  }

  // 9. Collapse multiple spaces
  s = s.replace(/\s{2,}/g, ' ').trim();

  // Pass 2 — take first 6 tokens to keep legacy keys stable and short
  if (!s) return '';
  return s.split(/\s+/).slice(0, 6).join(' ');
}

const BANK_TYPES_SQL = ['BANK', 'CREDIT_CARD', 'CHECKING', 'SAVINGS'];

type ExactHistRow = {
  merchantKey: string;
  description: string | null;
  notes: string | null;
  counterAccountId: string;
  counterAccountName: string | null;
  classification: string | null;
};

/**
 * Exact historical match for a batch of merchant keys (Postgres DISTINCT ON, key-scoped).
 * No fuzzy matching — miss means caller should use LLM / human review.
 */
export async function findExactHistoricalMatches(
  orgId: string,
  merchantKeys: string[]
): Promise<Map<string, HistoricalMapping>> {
  const keys = [
    ...new Set(merchantKeys.map((k) => toMerchantKey(k)).filter((k) => k.length > 0)),
  ];
  const out = new Map<string, HistoricalMapping>();
  if (keys.length === 0) return out;

  const rows = await prisma.$queryRaw<ExactHistRow[]>(Prisma.sql`
    SELECT DISTINCT ON (p.merchant_key)
      p.merchant_key AS "merchantKey",
      p.description AS description,
      p.notes AS notes,
      CASE
        WHEN credit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (debit.type && ${BANK_TYPES_SQL}::text[])
          THEN debit.id
        WHEN debit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (credit.type && ${BANK_TYPES_SQL}::text[])
          THEN credit.id
        ELSE NULL
      END AS "counterAccountId",
      CASE
        WHEN credit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (debit.type && ${BANK_TYPES_SQL}::text[])
          THEN debit.name
        WHEN debit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (credit.type && ${BANK_TYPES_SQL}::text[])
          THEN credit.name
        ELSE NULL
      END AS "counterAccountName",
      CASE
        WHEN credit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (debit.type && ${BANK_TYPES_SQL}::text[])
          THEN debit.classification
        WHEN debit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (credit.type && ${BANK_TYPES_SQL}::text[])
          THEN credit.classification
        ELSE NULL
      END AS classification
    FROM posting p
    INNER JOIN account debit ON debit.id = p.account_id
    INNER JOIN account credit ON credit.id = p.credit_account_id
    WHERE p.org_id = ${orgId}
      AND p.merchant_key = ANY(${keys})
      AND p.account_id IS NOT NULL
      AND p.credit_account_id IS NOT NULL
      AND NOT (
        (debit.type && ${BANK_TYPES_SQL}::text[])
        AND (credit.type && ${BANK_TYPES_SQL}::text[])
      )
      AND (
        (
          (credit.type && ${BANK_TYPES_SQL}::text[])
          AND NOT (debit.type && ${BANK_TYPES_SQL}::text[])
        )
        OR (
          (debit.type && ${BANK_TYPES_SQL}::text[])
          AND NOT (credit.type && ${BANK_TYPES_SQL}::text[])
        )
      )
    ORDER BY
      p.merchant_key,
      p.modified_at DESC NULLS LAST,
      p.created_at DESC,
      (p.ai_cat_score IS NULL) DESC
  `);

  for (const row of rows) {
    if (!row.counterAccountId || !row.merchantKey) continue;
    const descriptionNormalized = normalizeDescription(row.description);
    out.set(row.merchantKey, {
      merchantKey: row.merchantKey,
      descriptionNormalized,
      counterAccountId: row.counterAccountId,
      counterAccountName: row.counterAccountName ?? '',
      classification: row.classification ?? '',
      sourceReasoning: extractCategorizationReasoningFromNotes(row.notes),
    });
  }

  logger.debug('Exact historical matches loaded', {
    orgId,
    queryKeys: keys.length,
    hits: out.size,
  });

  return out;
}

/**
 * Load deduped historical corpus for an org from persisted merchant_key (SQL DISTINCT ON).
 * Used by tests / diagnostics. Batch categorize uses findExactHistoricalMatches instead.
 */
export async function fetchHistoricalMappings(orgId: string): Promise<HistoricalMapping[]> {
  const rows = await prisma.$queryRaw<ExactHistRow[]>(Prisma.sql`
    SELECT DISTINCT ON (p.merchant_key)
      p.merchant_key AS "merchantKey",
      p.description AS description,
      p.notes AS notes,
      CASE
        WHEN credit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (debit.type && ${BANK_TYPES_SQL}::text[])
          THEN debit.id
        WHEN debit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (credit.type && ${BANK_TYPES_SQL}::text[])
          THEN credit.id
        ELSE NULL
      END AS "counterAccountId",
      CASE
        WHEN credit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (debit.type && ${BANK_TYPES_SQL}::text[])
          THEN debit.name
        WHEN debit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (credit.type && ${BANK_TYPES_SQL}::text[])
          THEN credit.name
        ELSE NULL
      END AS "counterAccountName",
      CASE
        WHEN credit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (debit.type && ${BANK_TYPES_SQL}::text[])
          THEN debit.classification
        WHEN debit.type && ${BANK_TYPES_SQL}::text[]
             AND NOT (credit.type && ${BANK_TYPES_SQL}::text[])
          THEN credit.classification
        ELSE NULL
      END AS classification
    FROM posting p
    INNER JOIN account debit ON debit.id = p.account_id
    INNER JOIN account credit ON credit.id = p.credit_account_id
    WHERE p.org_id = ${orgId}
      AND p.merchant_key IS NOT NULL
      AND p.account_id IS NOT NULL
      AND p.credit_account_id IS NOT NULL
      AND NOT (
        (debit.type && ${BANK_TYPES_SQL}::text[])
        AND (credit.type && ${BANK_TYPES_SQL}::text[])
      )
      AND (
        (
          (credit.type && ${BANK_TYPES_SQL}::text[])
          AND NOT (debit.type && ${BANK_TYPES_SQL}::text[])
        )
        OR (
          (debit.type && ${BANK_TYPES_SQL}::text[])
          AND NOT (credit.type && ${BANK_TYPES_SQL}::text[])
        )
      )
    ORDER BY
      p.merchant_key,
      p.modified_at DESC NULLS LAST,
      p.created_at DESC,
      (p.ai_cat_score IS NULL) DESC
  `);

  const mappings: HistoricalMapping[] = [];
  for (const row of rows) {
    if (!row.counterAccountId || !row.merchantKey) continue;
    mappings.push({
      merchantKey: row.merchantKey,
      descriptionNormalized: normalizeDescription(row.description),
      counterAccountId: row.counterAccountId,
      counterAccountName: row.counterAccountName ?? '',
      classification: row.classification ?? '',
      sourceReasoning: extractCategorizationReasoningFromNotes(row.notes),
    });
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
- merchant_key: stable lowercase merchant/brand identity for future exact matching (see system rules)

Return exactly ${postings.length} categorizations, one per transaction.`;
}

/**
 * Build the system prompt for bulk categorization
 */
export function buildBulkSystemPrompt(): string {
  const merchantKeyRules = MERCHANT_KEY_CANON_RULES
    .split('\n')
    .map((line) => `   ${line}`)
    .join('\n');

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
7. Always return merchant_key using the same canonicalization as identity normalize:
${merchantKeyRules}

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
