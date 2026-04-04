import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { getTrialBalance } from '../reports/perfin';
import logger from '../../utils/logger';

interface ClosingBalancePostingData {
  account_id?: string;
  credit_account_id?: string;
  name: string;
  account_name: string;
  amount: number;
  posting_date: Date;
  value_date: Date;
  posting_type: 'debit' | 'credit';
  notes: string;
  description: string;
}

/**
 * Creates closing balance posting records for all accounts based on trial balance
 * @param financialYear - The financial year (e.g., 2024 for FY 2024-25)
 * @param orgId - Organization ID
 * @param createdBy - User ID who is creating the postings
 * @returns Array of created posting records
 */
export async function createClosingBalancePostings(
  financialYear: number,
  orgId: string,
  createdBy: string
): Promise<any[]> {
  try {
    // Calculate financial year date range (Apr 1 to Mar 31)
    const startDate = `${financialYear}-04-01`;
    const endDate = `${financialYear + 1}-03-31`;

    // Get trial balance for the financial year
    const trialBalanceData = await getTrialBalance(startDate, endDate, orgId);

    // Filter accounts with non-zero total balances (including opening balance)
    const accountsWithBalances = trialBalanceData.filter(account => account.total_balance !== 0);

    if (accountsWithBalances.length === 0) {
      logger.info('No accounts with non-zero balances found for closing balance postings', {
        financialYear,
        orgId
      });
      return [];
    }

    // Create postings in a transaction, reusing the single account logic
    const createdPostings = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const results = [];

      for (const account of accountsWithBalances) {
        const posting = await createClosingBalancePostingForAccountInternal(
          account,
          endDate,
          financialYear,
          orgId,
          createdBy,
          tx
        );
        if (posting) {
          results.push(posting);
        }
      }

      return results;
    }, {
      timeout: 1200000, // 2 minutes in milliseconds
      maxWait: 20000,  // 20 seconds to wait for transaction to start
    });

    logger.info(`Successfully processed ${createdPostings.length} closing balance postings for FY ${financialYear}-${(financialYear + 1).toString().slice(-2)} (created/updated as needed)`, {
      financialYear,
      orgId,
      createdBy,
      postingsCount: createdPostings.length
    });

    return createdPostings;

  } catch (error) {
    logger.error('Error processing closing balance postings', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      metadata: {
        financialYear,
        orgId,
        createdBy
      }
    });
    throw new Error(`Failed to process closing balance postings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Internal helper function to create or update a closing balance posting for a single account
 * @param account - Trial balance account data
 * @param endDate - End date of the financial year
 * @param financialYear - The financial year
 * @param orgId - Organization ID
 * @param createdBy - User ID who is creating/updating the posting
 * @param tx - Prisma transaction instance
 * @returns Created or updated posting record or null if no balance
 */
async function createClosingBalancePostingForAccountInternal(
  account: any,
  endDate: string,
  financialYear: number,
  orgId: string,
  createdBy: string,
  tx: any
): Promise<any | null> {
  if (account.total_balance === 0) {
    logger.debug(`Account ${account.account_id} has zero total balance, no closing posting needed`, {
      accountId: account.account_id,
      accountName: account.account_name,
      totalBalance: account.total_balance
    });
    return null;
  }

  const isDebit = account.total_balance > 0;
  const postingType = isDebit ? 'debit' : 'credit';
  const amount = Math.abs(account.total_balance);

  // Check if closing balance posting already exists for this account and year
  const existingPosting = await tx.posting.findFirst({
    where: {
      name: `Closing Balance - ${account.account_name}`,
      org_id: orgId,
      notes: `Closing balance for FY ${financialYear}-${(financialYear + 1).toString().slice(-2)}`,
      OR: [
        { account_id: account.account_id },
        { credit_account_id: account.account_id }
      ]
    }
  });

  const postingData = {
    account_id: isDebit ? account.account_id : undefined,
    credit_account_id: !isDebit ? account.account_id : undefined,
    name: `Closing Balance - ${account.account_name}`,
    account_name: account.account_name,
    amount: amount,
    posting_date: new Date(endDate),
    value_date: new Date(endDate),
    posting_type: postingType,
    notes: `Closing balance for FY ${financialYear}-${(financialYear + 1).toString().slice(-2)}`,
    description: `Closing balance posting for ${account.account_name} (${account.classification}) - ${postingType} ${amount}`,
    org_id: orgId,
    modified_by: createdBy,
    assigned_to: createdBy
  };

  let result;

  if (existingPosting) {
    // Update existing posting
    result = await tx.posting.update({
      where: { id: existingPosting.id },
      data: {
        ...postingData,
        modified_at: new Date()
      }
    });
    logger.info(`Successfully updated closing balance posting for account ${account.account_id} (Total Balance: ${amount})`, {
      accountId: account.account_id,
      accountName: account.account_name,
      amount,
      postingType,
      financialYear,
      orgId,
      createdBy
    });
  } else {
    // Create new posting
    result = await tx.posting.create({
      data: {
        ...postingData,
        created_by: createdBy
      }
    });
    logger.info(`Successfully created closing balance posting for account ${account.account_id} (Total Balance: ${amount})`, {
      accountId: account.account_id,
      accountName: account.account_name,
      amount,
      postingType,
      financialYear,
      orgId,
      createdBy
    });
  }

  return result;
}

/**
 * Creates closing balance posting records for a specific account
 * @param financialYear - The financial year (e.g., 2024 for FY 2024-25)
 * @param orgId - Organization ID
 * @param accountId - Specific account ID to create closing balance for
 * @param createdBy - User ID who is creating the posting
 * @returns Created posting record or null if no balance
 */
export async function createClosingBalancePostingForAccount(
  financialYear: number,
  orgId: string,
  accountId: string,
  createdBy: string
): Promise<any | null> {
  try {
    // Calculate financial year date range (Apr 1 to Mar 31)
    const startDate = `${financialYear}-04-01`;
    const endDate = `${financialYear + 1}-03-31`;

    // Get trial balance for the specific account
    const trialBalanceData = await getTrialBalance(startDate, endDate, orgId, accountId);

    if (trialBalanceData.length === 0) {
      logger.warn(`No trial balance data found for account ${accountId}`, {
        accountId,
        financialYear,
        orgId,
        startDate,
        endDate
      });
      return null;
    }

    const account = trialBalanceData[0];

    // Use the internal helper function
    const createdPosting = await createClosingBalancePostingForAccountInternal(
      account,
      endDate,
      financialYear,
      orgId,
      createdBy,
      prisma
    );

    return createdPosting;

  } catch (error) {
    logger.error('Error creating closing balance posting for account', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      metadata: {
        accountId,
        financialYear,
        orgId,
        createdBy
      }
    });
    throw new Error(`Failed to create closing balance posting for account: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
