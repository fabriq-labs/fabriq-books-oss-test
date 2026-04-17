/**
 * Bank Statement Extractor with Categorization
 *
 * Extends BaseDocumentExtractor to provide combined extraction + categorization
 * in a single LLM call. Uses the augmentation hooks to inject Chart of Accounts
 * context into the extraction prompt.
 *
 * Usage:
 *   const extractor = new BankStatementWithCategorizationExtractor();
 *   await extractor.prepareCategorizationContext({ orgId, legalEntityId });
 *   const result = await extractor.extract(authContext, { documentType, documentContent });
 */

import { BaseDocumentExtractor } from './base-extractor';
import { CategorizationExtractionOptions } from './types';
import {
  fetchAccountsForCategorization,
  formatAllAccountsForPrompt,
  buildCategorizationInstructions,
  getCategorizationSchema,
  AccountsGrouped,
} from '../../agent/handlers/erp/utils/categorizationUtils';
import logger from '../../utils/logger';

export class BankStatementWithCategorizationExtractor extends BaseDocumentExtractor {
  private cachedAccounts: AccountsGrouped | null = null;
  private cachedOrgId: string | null = null;
  private cachedLegalEntityId: string | null = null;

  getSupportedTypes(): string[] {
    return ['posting_with_categorization', 'bank_statement_categorized'];
  }

  getTargetModel(): string {
    return 'posting';
  }

  getExtractionPrompt(): string {
    // Base extraction prompt (categorization context added via augmentation)
    return `Extract bank statement transaction data from the provided document.

=== EXTRACTION TASK ===
Extract the following for each transaction:

Schema fields (posting model) — use these strictly:
- description: Put the FULL narrative text from the statement's Description / Details / Transaction remarks / Memo column (whatever the bank labels that column). This is the primary line users see for each row — it must go in \`description\`, not in \`name\`.
- name: Short display label only — e.g. merchant or payee name, or a brief title derived from the first segment of the description (optional; may be null if the statement only provides one long description line).
- notes: Extra notes, running text, or secondary lines that are NOT the main Description column (often empty).
- reference: Transaction reference / cheque / confirmation number if shown.

Also extract:
- Value date (when transaction occurred)
- Posting date (when transaction was recorded)
- Debit amount (from Withdrawal/Debit column - money going OUT of the account, 0 if empty)
- Credit amount (from Deposit/Credit column - money coming IN to the account, 0 if empty)

IMPORTANT - Column mapping for Indian bank statements:
- "Withdrawal Amount" or "Debit" column → debit_amount (money leaving the account)
- "Deposit Amount" or "Credit" column → credit_amount (money entering the account)
- Keep debit and credit amounts as SEPARATE fields. Do not merge them.
- Set the unused amount field to 0 (not null or empty)

Continuation rows and dates (common on bank/PDF statements, e.g. RBC):
- Tables often leave value_date and/or posting_date blank on continuation rows; the statement implies you reuse the last date shown above in the same transaction section.
- For each row, if value_date or posting_date is empty in the document, set it from the nearest preceding row that had a non-empty value in that column (top to bottom). Any number of consecutive blank-date rows share the same carried dates until a row shows a new explicit date.
- Carry value_date and posting_date independently from each column's last non-empty cell. If only one date column exists, use it for both fields unless two distinct dates are clearly labeled.

=== ACCOUNT CONTEXT ===
Also extract basic account context from the statement header:
- Account number
- Bank name
- Statement period (from date, to date)
- Currency
- Starting balance (opening balance)
- Closing balance (ending balance)

IMPORTANT:
- Do NOT treat Opening/Starting Balance or Closing/Ending Balance lines as transactions.
- Never include balance-only rows in the transactions array (they are not postings).`;
  }

  getExpectedSchema(): Record<string, any> {
    return {
      transactions: [{
        name: 'string',
        description: 'string',
        value_date: 'date',
        posting_date: 'date',
        debit_amount: 'number',
        credit_amount: 'number',
        notes: 'string',
        reference: 'string',
      }],
      accountContext: {
        accountNumber: 'string',
        bankName: 'string',
        statementPeriod: { fromDate: 'date', toDate: 'date' },
        currency: 'string',
        startingBalance: 'number',
        closingBalance: 'number',
      },
    };
  }

  /**
   * Augment the base prompt with categorization instructions and Chart of Accounts
   */
  protected augmentPromptWithContext(basePrompt: string, options?: any): string {
    if (!this.cachedAccounts) {
      return basePrompt;
    }

    const categorizationInstructions = buildCategorizationInstructions();
    const accountsList = formatAllAccountsForPrompt(this.cachedAccounts);

    return `${basePrompt}

${categorizationInstructions}

=== CHART OF ACCOUNTS ===
${accountsList}

Return the data in the exact JSON structure specified.`;
  }

  /**
   * Augment the base schema with categorization fields
   */
  protected augmentSchemaWithContext(baseSchema: Record<string, any>, options?: any): Record<string, any> {
    if (!this.cachedAccounts) {
      return baseSchema;
    }
    return { ...baseSchema, ...getCategorizationSchema() };
  }

  /**
   * Prepare categorization context by fetching accounts
   * Must be called before extract() for categorization to work
   */
  async prepareCategorizationContext(options: CategorizationExtractionOptions): Promise<void> {
    // Return cached if same org/entity
    if (
      this.cachedAccounts &&
      this.cachedOrgId === options.orgId &&
      this.cachedLegalEntityId === options.legalEntityId
    ) {
      logger.debug('Using cached accounts for categorization', {
        orgId: options.orgId,
        legalEntityId: options.legalEntityId,
      });
      return;
    }

    logger.debug('Fetching accounts for categorization context', {
      orgId: options.orgId,
      legalEntityId: options.legalEntityId,
    });

    this.cachedAccounts = await fetchAccountsForCategorization(
      options.orgId,
      undefined,
      options.legalEntityId
    );
    this.cachedOrgId = options.orgId;
    this.cachedLegalEntityId = options.legalEntityId ?? null;

    const total =
      this.cachedAccounts.expense.length +
      this.cachedAccounts.income.length +
      this.cachedAccounts.asset.length +
      this.cachedAccounts.liability.length;

    logger.debug('Fetched accounts for categorization', {
      orgId: options.orgId,
      legalEntityId: options.legalEntityId,
      totalAccounts: total,
      expense: this.cachedAccounts.expense.length,
      income: this.cachedAccounts.income.length,
      asset: this.cachedAccounts.asset.length,
      liability: this.cachedAccounts.liability.length,
    });

    if (total === 0) {
      throw new Error(
        'No accounts available for categorization. Please ensure Chart of Accounts is set up for this legal entity.'
      );
    }
  }

  /**
   * Clear cached categorization context
   */
  clearContext(): void {
    this.cachedAccounts = null;
    this.cachedOrgId = null;
    this.cachedLegalEntityId = null;
  }

  /**
   * Check if categorization context is ready
   */
  hasCategorizationContext(): boolean {
    return this.cachedAccounts !== null;
  }
}
