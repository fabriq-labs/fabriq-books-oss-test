import {
  filterTransactionsToTargetAccount,
  accountNumberMatches,
} from '../../lib/extractors/bank-statement/target-account-filter';

describe('filterTransactionsToTargetAccount', () => {
  it('keeps only rows matching preferred trailing digits', () => {
    const result = filterTransactionsToTargetAccount(
      [
        { description: 'A', source_account_number: '1430003249628', debit_amount: 1 },
        { description: 'B', source_account_number: '1430003249636', debit_amount: 2 },
        { description: 'C', source_account_number: '3249636', debit_amount: 3 },
      ],
      [
        { transaction_index: 0, predicted_account_id: 'x' },
        { transaction_index: 1, predicted_account_id: 'y' },
        { transaction_index: 2, predicted_account_id: 'z' },
      ],
      3249636
    );

    expect(result.transactions.map((t) => t.description)).toEqual(['B', 'C']);
    expect(result.removedCount).toBe(1);
    expect(result.categorizations).toEqual([
      expect.objectContaining({ transaction_index: 0, predicted_account_id: 'y' }),
      expect.objectContaining({ transaction_index: 1, predicted_account_id: 'z' }),
    ]);
  });

  it('drops unnumbered rows when preferred is set', () => {
    const result = filterTransactionsToTargetAccount(
      [
        { description: 'A', debit_amount: 1 },
        { description: 'B', source_account_number: '3249636', debit_amount: 2 },
      ],
      undefined,
      3249636
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.unnumberedDropped).toBe(1);
    expect(result.transactions[0].description).toBe('B');
  });

  it('accountNumberMatches trailing digits', () => {
    expect(accountNumberMatches('1430003249636', 3249636)).toBe(true);
    expect(accountNumberMatches('1430003249628', 3249636)).toBe(false);
  });
});
