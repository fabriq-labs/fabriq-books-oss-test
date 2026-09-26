/**
 * Chunked extract reports progress after each batch, then a combine step.
 */

import { BaseDocumentExtractor } from '../../lib/extractors/base-extractor';
import { BankStatementWithCategorizationExtractor } from '../../lib/extractors/bank-statement/bank-statement-with-categorization-extractor';
import { splitPdfIntoPageChunks } from '../../lib/extractors/bank-statement/page-chunker';
import { ExtractionProgress } from '../../lib/extractors/types';

jest.mock('../../lib/extractors/bank-statement/page-chunker', () => ({
  PAGE_CHUNK_SIZE: 2,
  splitPdfIntoPageChunks: jest.fn(),
}));

const splitMock = splitPdfIntoPageChunks as jest.MockedFunction<typeof splitPdfIntoPageChunks>;

function okChunk(description: string) {
  return {
    success: true,
    confidence: 1,
    data: {
      transactions: [{ description, debit_amount: 1, credit_amount: 0, value_date: '2024-12-01' }],
      categorizations: [],
    },
  };
}

describe('bank statement extract progress', () => {
  let extractSpy: jest.SpyInstance;

  beforeEach(() => {
    extractSpy = jest
      .spyOn(BaseDocumentExtractor.prototype, 'extract')
      .mockImplementation(async (_context, request: any) => {
        const label = request?.options?.label || 'row';
        return okChunk(String(label));
      });
  });

  afterEach(() => {
    extractSpy.mockRestore();
    splitMock.mockReset();
  });

  it('emits chunk counts in batches of two, then combining', async () => {
    splitMock.mockResolvedValue({
      chunks: [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')],
      pageCount: 6,
    });
    const events: ExtractionProgress[] = [];
    const extractor = new BankStatementWithCategorizationExtractor();

    const result = await extractor.extract({ user: { org_id: 'org' } } as any, {
      documentType: 'posting_with_categorization',
      documentContent: Buffer.from('pdf'),
      options: {
        enableChunking: true,
        onProgress: (progress) => events.push(progress),
      },
    });

    expect(result.success).toBe(true);
    expect(events.map((e) => `${e.phase}:${e.completed}/${e.total}`)).toEqual([
      'extracting:0/3',
      'extracting:2/3',
      'extracting:3/3',
      'combining:3/3',
    ]);
    expect(events[0].message).toBe('Reading 6 pages in 3 chunks');
    expect(events[1].message).toBe('Read 2 of 3 chunks');
    expect(events[3].message).toBe('Combining results');
  });
});
