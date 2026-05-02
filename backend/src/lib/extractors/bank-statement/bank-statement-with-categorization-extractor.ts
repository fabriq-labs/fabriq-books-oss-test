/**
 * Bank Statement Extractor with Categorization
 *
 * Extends BaseDocumentExtractor to provide combined extraction + categorization
 * in a single LLM call. Uses the augmentation hooks to inject Chart of Accounts
 * context into the extraction prompt.
 *
 * When request.options.enableChunking is true, the PDF is split into page-range
 * sub-buffers and each is extracted independently, then merged.
 *
 * Usage:
 *   const extractor = new BankStatementWithCategorizationExtractor();
 *   await extractor.prepareCategorizationContext({ orgId, legalEntityId });
 *   const result = await extractor.extract(authContext, { documentType, documentContent });
 */

import { BaseDocumentExtractor } from '../base-extractor';
import { CategorizationExtractionOptions, DocumentExtractionRequest, DocumentExtractionResult } from '../types';
import { ExtractionContext } from '../types';
import {
  fetchAccountsForCategorization,
  formatAllAccountsForPrompt,
  buildCategorizationInstructions,
  getCategorizationSchema,
  AccountsGrouped,
} from '../../../agent/handlers/erp/utils/categorizationUtils';
import logger from '../../../utils/logger';
import { splitPdfIntoPageChunks, PAGE_CHUNK_SIZE } from './page-chunker';
import { mergeChunkResults } from './bank-statement-merger';

// Process this many chunks concurrently. Set to 1 for sequential (safest); increase to tune.
const CHUNK_PARALLEL_FACTOR = 2;

export class BankStatementWithCategorizationExtractor extends BaseDocumentExtractor {
  private cachedAccounts: AccountsGrouped | null = null;
  private cachedOrgId: string | null = null;
  private cachedLegalEntityId: string | null = null;
  private cachedExtractionNotes: string | null = null;

  getSupportedTypes(): string[] {
    return ['posting_with_categorization', 'bank_statement_categorized'];
  }

  getTargetModel(): string {
    return 'posting';
  }

  getExtractionPrompt(): string {
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
   * Augment the base prompt with categorization instructions and Chart of Accounts.
   * If options.extractionNotes (or cachedExtractionNotes) is non-empty, injects an
   * account-specific notes block before the Chart of Accounts (Feature B).
   */
  protected augmentPromptWithContext(basePrompt: string, options?: any): string {
    if (!this.cachedAccounts) {
      return basePrompt;
    }

    const notes: string | null | undefined =
      options?.extractionNotes ?? this.cachedExtractionNotes;

    const categorizationInstructions = buildCategorizationInstructions();
    const accountsList = formatAllAccountsForPrompt(this.cachedAccounts);

    const notesBlock =
      notes && notes.trim()
        ? `\n=== ACCOUNT-SPECIFIC NOTES ===\nThe following notes were provided by the account owner about this particular bank account.\nApply these when interpreting transaction descriptions:\n\n${notes}\n`
        : '';

    return `${basePrompt}

${categorizationInstructions}
${notesBlock}
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
   * Override extract to branch on enableChunking.
   * Falls through to BaseDocumentExtractor.extract when chunking is off.
   */
  async extract(
    context: ExtractionContext,
    request: DocumentExtractionRequest
  ): Promise<DocumentExtractionResult> {
    const enableChunking =
      request.options?.enableChunking === true ||
      (request.options as any)?.enableChunking === 'true';

    logger.debug('[chunking] extract() called', {
      enableChunking,
      rawOptionValue: (request.options as any)?.enableChunking,
      isBuffer: Buffer.isBuffer(request.documentContent),
      bufferSize: Buffer.isBuffer(request.documentContent) ? request.documentContent.length : 'n/a',
      orgId: context.user?.org_id,
    });

    if (enableChunking && Buffer.isBuffer(request.documentContent)) {
      logger.debug('[chunking] routing to extractChunked');
      return this.extractChunked(context, request.documentContent, request.options, request.documentType);
    }

    logger.debug('[chunking] routing to single-call extract (chunking off or not a buffer)');
    return super.extract(context, request);
  }

  private async extractChunked(
    context: ExtractionContext,
    buffer: Buffer,
    options: any,
    documentType?: string
  ): Promise<DocumentExtractionResult> {
    const startTime = Date.now();

    logger.debug('[chunking] splitting PDF into page chunks', {
      bufferSize: buffer.length,
      pageChunkSize: PAGE_CHUNK_SIZE,
    });

    const { chunks, pageCount } = await splitPdfIntoPageChunks(buffer, PAGE_CHUNK_SIZE);

    logger.info('[chunking] PDF split complete — starting chunked extraction', {
      pageCount,
      chunkCount: chunks.length,
      chunkSize: PAGE_CHUNK_SIZE,
      chunkBufferSizes: chunks.map(c => c.length),
      orgId: context.user?.org_id,
    });

    if (chunks.length === 1) {
      logger.debug('[chunking] document fits in one chunk, falling back to single-call path');
      return super.extract(context, {
        documentType: documentType || 'posting_with_categorization',
        documentContent: buffer,
        options,
      });
    }

    const chunkResults: DocumentExtractionResult[] = [];
    const perChunkLatencyMs: number[] = [];

    for (let batchStart = 0; batchStart < chunks.length; batchStart += CHUNK_PARALLEL_FACTOR) {
      const batch = chunks.slice(batchStart, batchStart + CHUNK_PARALLEL_FACTOR);
      const batchIndices = batch.map((_, i) => batchStart + i);

      logger.debug('[chunking] processing batch', {
        batchIndices,
        batchSize: batch.length,
        remainingChunks: chunks.length - batchStart - batch.length,
      });

      const batchResults = await Promise.all(
        batch.map(async (chunkBuffer, batchIdx) => {
          const chunkIndex = batchStart + batchIdx;
          const chunkStart = Date.now();

          logger.debug(`[chunking] chunk ${chunkIndex + 1}/${chunks.length} — LLM call starting`, {
            chunkIndex,
            chunkBufferSize: chunkBuffer.length,
          });

          const result = await super.extract(context, {
            documentType: documentType || 'posting_with_categorization',
            documentContent: chunkBuffer,
            options,
          });

          const latencyMs = Date.now() - chunkStart;
          perChunkLatencyMs.push(latencyMs);

          logger.debug(`[chunking] chunk ${chunkIndex + 1}/${chunks.length} — done`, {
            chunkIndex,
            success: result.success,
            transactionCount: result.data.transactions?.length || 0,
            categorizationCount: result.data.categorizations?.length || 0,
            errors: result.errors,
            latencyMs,
          });

          return result;
        })
      );

      chunkResults.push(...batchResults);
    }

    const failures = chunkResults.filter(r => !r.success);
    if (failures.length > 0) {
      const errorMessages = failures.flatMap(r => r.errors || ['Unknown chunk error']);
      const summary = `Chunked extraction failed: ${failures.length}/${chunks.length} chunks failed. ${errorMessages.join('; ')}`;

      logger.error('[chunking] hard fail — one or more chunks failed', {
        failedChunks: failures.length,
        totalChunks: chunks.length,
        errors: errorMessages,
        orgId: context.user?.org_id,
      });

      return {
        success: false,
        data: {},
        confidence: 0,
        errors: [summary],
        metadata: {
          documentType: documentType || 'posting_with_categorization',
          extractionTimestamp: new Date(),
          processingTime: Date.now() - startTime,
          pageCount,
        },
      };
    }

    const merged = mergeChunkResults(chunkResults);
    const processingTime = Date.now() - startTime;

    logger.debug('[chunking] per-chunk transaction counts', {
      perChunk: chunkResults.map((r, i) => ({
        chunkIndex: i,
        transactions: r.data.transactions?.length || 0,
        categorizations: r.data.categorizations?.length || 0,
      })),
    });

    logger.info('[chunking] extraction complete', {
      chunkCount: chunks.length,
      pageCount,
      chunkSize: PAGE_CHUNK_SIZE,
      originalTransactions: merged.originalCount,
      finalTransactions: merged.transactions.length,
      deduplicatedCount: merged.deduplicatedCount,
      categorizationCount: merged.categorizations?.length || 0,
      processingTimeMs: processingTime,
      perChunkLatencyMs,
      warnings: merged.warnings,
      orgId: context.user?.org_id,
    });

    return {
      success: true,
      data: {
        transactions: merged.transactions,
        accountContext: merged.accountContext,
        ...(merged.categorizations ? { categorizations: merged.categorizations } : {}),
        ...(merged.warnings.length > 0 ? { warnings: merged.warnings } : {}),
      },
      confidence: this.averageConfidence(chunkResults),
      metadata: {
        documentType: documentType || 'posting_with_categorization',
        extractionTimestamp: new Date(),
        processingTime,
        pageCount,
      },
    };
  }

  private averageConfidence(results: DocumentExtractionResult[]): number {
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  }

  /**
   * Prepare categorization context by fetching accounts.
   * Must be called before extract() for categorization to work.
   * Pass options.extractionNotes to inject account-specific hints into the prompt (Feature B).
   */
  async prepareCategorizationContext(options: CategorizationExtractionOptions): Promise<void> {
    // Always update extraction notes even when accounts are cached
    this.cachedExtractionNotes = options.extractionNotes ?? null;

    // Return cached accounts if same org/entity
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

  clearContext(): void {
    this.cachedAccounts = null;
    this.cachedOrgId = null;
    this.cachedLegalEntityId = null;
    this.cachedExtractionNotes = null;
  }

  hasCategorizationContext(): boolean {
    return this.cachedAccounts !== null;
  }
}
