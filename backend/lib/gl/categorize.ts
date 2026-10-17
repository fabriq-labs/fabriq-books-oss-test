import prisma from '../../src/lib/prisma';
import logger from '../../src/utils/logger';

export interface AccountForCategorization {
  id: string;
  name: string;
  code: string | null;
  classification: string;
  subType: string | null;
  type: string[];
}

export interface AccountsGrouped {
  expense: AccountForCategorization[];
  income: AccountForCategorization[];
  asset: AccountForCategorization[];
  liability: AccountForCategorization[];
  equity: AccountForCategorization[];
}

/**
 * Chart rows the statement categorizer may choose. entityId narrows the chart
 * when the caller has one. A missing entity is the whole org chart.
 */
export async function fetchAccountsForCategorization(
  orgId: string,
  excludeAccountId?: string,
  entityId?: string
): Promise<AccountsGrouped> {
  const accounts = await prisma.account.findMany({
    where: {
      org_id: orgId,
      is_active: true,
      classification: { in: ['expense', 'income', 'asset', 'liability', 'equity'] },
      ...(entityId ? { entity_id: entityId } : {}),
      ...(excludeAccountId ? { id: { not: excludeAccountId } } : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      classification: true,
      sub_type: true,
      account_types: true,
    },
    orderBy: [{ classification: 'asc' }, { name: 'asc' }],
  });

  const grouped: AccountsGrouped = {
    expense: [],
    income: [],
    asset: [],
    liability: [],
    equity: [],
  };

  for (const account of accounts) {
    const mapped: AccountForCategorization = {
      id: account.id,
      name: account.name ?? '',
      code: account.code,
      classification: account.classification ?? '',
      subType: account.sub_type,
      type: account.account_types,
    };
    if (account.classification && account.classification in grouped) {
      grouped[account.classification as keyof AccountsGrouped].push(mapped);
    }
  }

  logger.debug('Fetched accounts for categorization', {
    orgId,
    entityId: entityId ?? null,
    expense: grouped.expense.length,
    income: grouped.income.length,
    asset: grouped.asset.length,
    liability: grouped.liability.length,
    equity: grouped.equity.length,
  });

  return grouped;
}

export async function fetchTargetAccount(accountId: string): Promise<{
  id: string;
  name: string | null;
  account_number: string | null;
  extraction_notes: string | null;
  entity_id: string | null;
} | null> {
  try {
    return await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        account_number: true,
        extraction_notes: true,
        entity_id: true,
      },
    });
  } catch {
    return null;
  }
}

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

export function formatAllAccountsForPrompt(
  accounts: AccountsGrouped,
  maxPerCategory: number = 50
): string {
  return [
    formatAccountsListForPrompt(accounts.expense, 'EXPENSE ACCOUNTS', maxPerCategory),
    formatAccountsListForPrompt(accounts.income, 'INCOME ACCOUNTS', maxPerCategory),
    formatAccountsListForPrompt(accounts.asset, 'ASSET ACCOUNTS', maxPerCategory),
    formatAccountsListForPrompt(accounts.liability, 'LIABILITY ACCOUNTS', maxPerCategory),
    formatAccountsListForPrompt(accounts.equity, 'EQUITY ACCOUNTS', maxPerCategory),
  ].join('\n\n');
}

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

Provide a confidence score for each:
- High (0.8-1.0): Clear keyword match, unambiguous
- Medium (0.5-0.79): Reasonable inference
- Low (0.0-0.49): Ambiguous or uncertain`;
}

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
