/**
 * Unit tests for chunk merge + categorization index remapping.
 */

import { mergeChunkResults } from '../../lib/extractors/bank-statement/bank-statement-merger';
import { DocumentExtractionResult } from '../../lib/extractors/types';

function chunkResult(
  transactions: Record<string, any>[],
  categorizations: Record<string, any>[],
  accountNumber?: string
): DocumentExtractionResult {
  return {
    success: true,
    confidence: 1,
    data: {
      transactions,
      categorizations,
      accountContext: accountNumber ? { accountNumber } : undefined,
    },
  };
}

describe('mergeChunkResults categorization index remap', () => {
  it('offsets transaction_index across chunks', () => {
    const merged = mergeChunkResults([
      chunkResult(
        [
          { description: 'A', debit_amount: 10, credit_amount: 0, value_date: '2024-12-01' },
          { description: 'B', debit_amount: 20, credit_amount: 0, value_date: '2024-12-02' },
        ],
        [
          { transaction_index: 0, predicted_account_id: 'exp_a', confidence_score: 0.9 },
          { transaction_index: 1, predicted_account_id: 'exp_b', confidence_score: 0.9 },
        ],
        '1430003249628'
      ),
      chunkResult(
        [
          { description: 'C', debit_amount: 0, credit_amount: 30, value_date: '2024-12-03' },
        ],
        [
          { transaction_index: 0, predicted_account_id: 'inc_c', confidence_score: 0.9 },
        ],
        '1430003249636'
      ),
    ]);

    expect(merged.transactions).toHaveLength(3);
    expect(merged.categorizations).toEqual([
      expect.objectContaining({ transaction_index: 0, predicted_account_id: 'exp_a' }),
      expect.objectContaining({ transaction_index: 1, predicted_account_id: 'exp_b' }),
      expect.objectContaining({ transaction_index: 2, predicted_account_id: 'inc_c' }),
    ]);
    // Prefer accountContext that matches preferredAccountNumber when provided
    const preferred = mergeChunkResults(
      [
        chunkResult([{ description: 'A', debit_amount: 10, credit_amount: 0, value_date: '2024-12-01' }], [], '1430003249628'),
        chunkResult([{ description: 'C', debit_amount: 0, credit_amount: 30, value_date: '2024-12-03' }], [], '1430003249636'),
      ],
      { preferredAccountNumber: 3249636 }
    );
    expect(preferred.accountContext?.accountNumber).toBe('1430003249636');
  });

  it('remaps indices after boundary dedupe removes a duplicate', () => {
    const boundary = {
      description: 'Overlap',
      debit_amount: 5,
      credit_amount: 0,
      value_date: '2024-12-10',
    };

    const merged = mergeChunkResults([
      chunkResult(
        [
          { description: 'First', debit_amount: 1, credit_amount: 0, value_date: '2024-12-09' },
          boundary,
        ],
        [
          { transaction_index: 0, predicted_account_id: 'exp_first', confidence_score: 0.9 },
          { transaction_index: 1, predicted_account_id: 'exp_overlap_chunk0', confidence_score: 0.9 },
        ]
      ),
      chunkResult(
        [
          boundary, // duplicate of chunk0 last row
          { description: 'After', debit_amount: 0, credit_amount: 9, value_date: '2024-12-11' },
        ],
        [
          { transaction_index: 0, predicted_account_id: 'exp_overlap_chunk1', confidence_score: 0.9 },
          { transaction_index: 1, predicted_account_id: 'inc_after', confidence_score: 0.9 },
        ]
      ),
    ]);

    expect(merged.transactions).toHaveLength(3);
    expect(merged.deduplicatedCount).toBe(1);
    // Chunk1's cat for the dropped duplicate is discarded; "After" shifts to index 2
    expect(merged.categorizations).toEqual([
      expect.objectContaining({ transaction_index: 0, predicted_account_id: 'exp_first' }),
      expect.objectContaining({ transaction_index: 1, predicted_account_id: 'exp_overlap_chunk0' }),
      expect.objectContaining({ transaction_index: 2, predicted_account_id: 'inc_after' }),
    ]);
  });
});
