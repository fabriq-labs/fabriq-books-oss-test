import { BaseDocumentExtractor } from './base-extractor';

export class BankStatementExtractor extends BaseDocumentExtractor {
  getSupportedTypes(): string[] {
    return ['posting', 'bank_statement', 'account_statement', 'credit_card_statement'];
  }

  getTargetModel(): string {
    return 'posting'; // This extractor maps to posting model only
  }

  getExtractionPrompt(): string {
    return `Extract bank statement transaction data from the provided document. Focus on extracting posting records.

    Extract the following transaction information for each transaction:
    - Transaction name/description
    - Account name/number
    - Value date (when transaction occurred)
    - Posting date (when transaction was recorded)
    - Debit amount (if present, keep as separate field)
    - Credit amount (if present, keep as separate field)
    - Notes/description
    - Transaction reference number
    - Running balance after transaction

    Important: Keep debit and credit amounts as separate fields. Do not merge them into a single amount field.
    If a transaction shows both debit and credit, include both fields with their respective values.
    Ignore posting_type field - focus on the actual debit/credit amounts as they appear in the document.

    Also extract basic account context:
    - Account number
    - Bank name
    - Statement period (from date, to date)
    - Currency

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
