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
import { filterTransactionsToTargetAccount } from './target-account-filter';

// Process this many chunks concurrently. Set to 1 for sequential (safest); increase to tune.
const CHUNK_PARALLEL_FACTOR = 2;

export class BankStatementWithCategorizationExtractor extends BaseDocumentExtractor {
  private cachedAccounts: AccountsGrouped | null = null;
  private cachedOrgId: string | null = null;
  private cachedLegalEntityId: string | null = null;
  private cachedExtractionNotes: string | null = null;
  private cachedTargetAccount: CategorizationExtractionOptions['targetAccount'] = null;

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
- debit_amount: money leaving the account (0 if none)
- credit_amount: money entering the account (0 if none)
- source_account_number: the bank account number this row belongs to (full number as printed). Required on consolidated multi-account statements.

=== DIRECTION (pick whichever mechanism the statement uses) ===
1. Separate Debit/Withdrawal and Credit/Deposit columns → map each to debit_amount / credit_amount; set the unused field to 0.
2. Separate sections (e.g. "Checks", "Other withdrawals / debits", "Deposits / credits"), each with a single amount column → section heading decides direction; carry that direction across page breaks until a new section heading appears.
3. A single signed or marked amount column (negatives, or CR/DR markers) → map to debit_amount or credit_amount accordingly.

Keep debit_amount and credit_amount as SEPARATE fields. Do not merge them into one amount.

Continuation rows and dates:
- Tables often leave value_date and/or posting_date blank on continuation rows; reuse the last non-empty date above in the same section (top to bottom).
- Carry value_date and posting_date independently. If only one date column exists, use it for both unless two dates are clearly labeled.
- Derive the year from the statement period when rows print only month/day.
- One printed line may contain several transactions when date/reference/amount groups repeat horizontally (e.g. a Checks grid) — emit one transaction per group.
- Strip footnote markers from reference numbers (e.g. *121324 → 121324).

=== ACCOUNT CONTEXT ===
Also extract basic account context from the statement header:
- Account number
- Bank name
- Statement period (from date, to date)
- Currency
- Starting balance (opening balance)
- Closing balance (ending balance)

IMPORTANT — do NOT treat as transactions:
- Opening/Starting/Closing/Ending balance lines
- Account-summary rollups and "Total … = $…" lines (capture totals only in accountContext if useful)
- Fee-change / legal / boilerplate pages with no transaction table`;
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
        source_account_number: 'string',
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
   * Augment the base prompt with target-account scoping, notes, categorization, CoA.
   */
  protected augmentPromptWithContext(basePrompt: string, options?: any): string {
    const notes: string | null | undefined =
      options?.extractionNotes ?? this.cachedExtractionNotes;
    const target =
      options?.targetAccount ?? this.cachedTargetAccount;

    const parts: string[] = [basePrompt];

    if (target && (target.account_number != null || target.name)) {
      const num =
        target.account_number != null ? String(target.account_number) : null;
      const name = target.name?.trim() || null;
      parts.push(`
=== MULTI-ACCOUNT STATEMENT — LABEL ACCURATELY ===
This PDF may cover several bank accounts. The upload destination is:
${name ? `- Account name: ${name}` : ''}
${num ? `- Account number (stored / trailing digits): ${num}` : ''}

CRITICAL — do NOT re-label other accounts' rows as this destination:
- Extract EVERY transaction table on the statement (all accounts), not only the destination.
- Set source_account_number on EVERY row to the account that owns that section/table (full printed number when shown).
- Never copy the destination account number onto rows that belong under a different account heading.
- Software will filter to the destination after extraction; wrong labels cause incorrect imports.
- Consolidated layouts often show a multi-account summary first, then per-account detail (Checks / withdrawals / deposits). Carry the current account number across page breaks until a new account heading appears.
- Set accountContext.accountNumber to the destination's full printed number when available (summary balances for that account).`);
    }

    if (notes && notes.trim()) {
      parts.push(`
=== ACCOUNT-SPECIFIC NOTES ===
The following notes were provided by the account owner about this particular bank account.
Apply these when interpreting layout and transaction descriptions:

${notes}`);
    }

    if (this.cachedAccounts) {
      const categorizationInstructions = buildCategorizationInstructions();
      const accountsList = formatAllAccountsForPrompt(this.cachedAccounts);
      parts.push(`
${categorizationInstructions}

=== CHART OF ACCOUNTS ===
${accountsList}

Return the data in the exact JSON structure specified.`);
    }

    return parts.join('\n');
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
    const result = await super.extract(context, request);
    return this.applyTargetAccountFilter(result);
  }

  private applyTargetAccountFilter(
    result: DocumentExtractionResult
  ): DocumentExtractionResult {
    if (!result.success || !result.data) return result;
    const preferred = this.cachedTargetAccount?.account_number ?? null;
    if (preferred == null) return result;

    const before = result.data.transactions || [];
    const filtered = filterTransactionsToTargetAccount(
      before,
      result.data.categorizations,
      preferred
    );

    logger.info('Filtered transactions to target account', {
      preferredAccountNumber: preferred,
      before: before.length,
      after: filtered.transactions.length,
      removedCount: filtered.removedCount,
      unnumberedDropped: filtered.unnumberedDropped,
      sampleSourceNumbers: before.slice(0, 8).map(
        (t: any) => t.source_account_number ?? t.account_number ?? null
      ),
    });

    return {
      ...result,
      data: {
        ...result.data,
        transactions: filtered.transactions,
        ...(filtered.categorizations
          ? { categorizations: filtered.categorizations }
          : { categorizations: undefined }),
      },
    };
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
      const single = await super.extract(context, {
        documentType: documentType || 'posting_with_categorization',
        documentContent: buffer,
        options,
      });
      return this.applyTargetAccountFilter(single);
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

    const merged = mergeChunkResults(chunkResults, {
      preferredAccountNumber: this.cachedTargetAccount?.account_number ?? null,
    });

    const preferred = this.cachedTargetAccount?.account_number ?? null;
    const filtered = filterTransactionsToTargetAccount(
      merged.transactions,
      merged.categorizations,
      preferred
    );

    logger.info('[chunking] filtered transactions to target account', {
      preferredAccountNumber: preferred,
      before: merged.transactions.length,
      after: filtered.transactions.length,
      removedCount: filtered.removedCount,
      unnumberedDropped: filtered.unnumberedDropped,
      sampleSourceNumbers: merged.transactions.slice(0, 8).map(
        (t: any) => t.source_account_number ?? t.account_number ?? null
      ),
    });

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
      finalTransactions: filtered.transactions.length,
      deduplicatedCount: merged.deduplicatedCount,
      categorizationCount: filtered.categorizations?.length || 0,
      processingTimeMs: processingTime,
      perChunkLatencyMs,
      warnings: merged.warnings,
      orgId: context.user?.org_id,
    });

    return {
      success: true,
      data: {
        transactions: filtered.transactions,
        accountContext: merged.accountContext,
        ...(filtered.categorizations ? { categorizations: filtered.categorizations } : {}),
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
   * Pass options.extractionNotes / targetAccount for account-specific prompt blocks.
   */
  async prepareCategorizationContext(options: CategorizationExtractionOptions): Promise<void> {
    // Always refresh notes + target account even when CoA is cached
    this.cachedExtractionNotes = options.extractionNotes ?? null;
    this.cachedTargetAccount = options.targetAccount ?? null;

    // Return cached accounts if same org/entity
    if (
      this.cachedAccounts &&
      this.cachedOrgId === options.orgId &&
      this.cachedLegalEntityId === options.legalEntityId
    ) {
      logger.debug('Using cached accounts for categorization', {
        orgId: options.orgId,
        legalEntityId: options.legalEntityId,
        targetAccountId: this.cachedTargetAccount?.id,
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
    this.cachedTargetAccount = null;
  }

  hasCategorizationContext(): boolean {
    return this.cachedAccounts !== null;
  }
}
