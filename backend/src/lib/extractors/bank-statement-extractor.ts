import { BaseDocumentExtractor } from './base-extractor';

export class BankStatementExtractor extends BaseDocumentExtractor {
  private extractionNotes: string | null = null;

  getSupportedTypes(): string[] {
    return ['posting', 'bank_statement', 'account_statement', 'credit_card_statement'];
  }

  getTargetModel(): string {
    return 'posting'; // This extractor maps to posting model only
  }

  /** Inject account-specific extraction notes for this statement (Feature B). */
  setExtractionNotes(notes: string | null | undefined): void {
    this.extractionNotes = notes ?? null;
  }

  /** Append account-specific notes block to the base prompt when present (Feature B). */
  protected augmentPromptWithContext(basePrompt: string, options?: any): string {
    const notes: string | null | undefined = options?.extractionNotes ?? this.extractionNotes;
    if (!notes || !notes.trim()) return basePrompt;

    return `${basePrompt}

=== ACCOUNT-SPECIFIC NOTES ===
The following notes were provided by the account owner about this particular bank account.
Apply these when interpreting transaction descriptions:

${notes}`;
  }

  getExtractionPrompt(): string {
    return `Extract bank statement transaction data from the provided document. Focus on extracting posting records.

    Schema fields (posting model) — use these strictly:
    - description: FULL text from the statement's Description / Details / Transaction remarks / Memo column. That column must map to the JSON field \`description\`, not \`name\`.
    - name: Short display label only (e.g. merchant or payee), or null if the statement only provides one long description line.
    - account_name: Account name or number as shown for the transaction row if present.
    - notes: Extra lines or running balance text that are NOT the main Description column.

    Also extract:
    - Value date (when transaction occurred)
    - Posting date (when transaction was recorded)
    - Debit amount (if present, keep as separate field)
    - Credit amount (if present, keep as separate field)
    - Transaction reference number (if shown)
    - Running balance after transaction (if shown; put in notes if not a separate column)

    Important: Keep debit and credit amounts as separate fields. Do not merge them into a single amount field.
    If a transaction shows both debit and credit, include both fields with their respective values.
    Ignore posting_type field - focus on the actual debit/credit amounts as they appear in the document.

    Continuation rows and dates (many bank/PDF statements):
    - Transaction tables often leave value_date and/or posting_date blank on rows that continue the same logical day or the same multi-line transaction: the statement implies you reuse the last date shown above in the same table/section.
    - For each transaction row, if value_date or posting_date is empty in the document, set it to the same value as the nearest preceding row in that statement's transaction list that had a non-empty value in that column (read top to bottom). Multiple consecutive blank-date rows all use the same carried-forward dates until a new row shows an explicit date.
    - Carry forward value_date and posting_date independently (each column inherits from its own last non-empty cell). If the statement only prints one date column, use that date for both value_date and posting_date unless the document clearly labels two different dates.

    Also extract basic account context:
    - Account number
    - Bank name
    - Statement period (from date, to date)
    - Currency
    - Starting balance (opening balance)
    - Closing balance (ending balance)

    IMPORTANT:
    - Do NOT treat Opening/Starting Balance or Closing/Ending Balance lines as transactions.
    - Never include balance-only rows in the transactions array (they are not postings).

    Return an array of posting records that can be directly inserted into the posting model.`;
  }

  getExpectedSchema(): Record<string, any> {
    return {
      // Direct posting model fields - no transformation needed
      transactions: [{
        name: 'string', // posting.name
        account_name: 'string', // posting.account_name
        value_date: 'date', // posting.value_date
        posting_date: 'date', // posting.posting_date
        debit_amount: 'number', // posting.debit_amount (if present)
        credit_amount: 'number', // posting.credit_amount (if present)
        notes: 'string', // posting.notes
        description: 'string' // posting.description
      }],
      // Context information for reference
      accountContext: {
        accountNumber: 'string',
        bankName: 'string',
        address: 'string',
        statementPeriod: {
          fromDate: 'date',
          toDate: 'date'
        },
        currency: 'string',
        startingBalance: 'number',
        closingBalance: 'number'
      }
    };
  }
}
