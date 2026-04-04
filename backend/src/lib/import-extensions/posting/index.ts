/**
 * Posting Import Extension
 *
 * Provides posting/bank statement specific import functionality:
 * - Combined PDF extraction + AI categorization
 * - Requires legalEntityId option for Chart of Accounts lookup
 *
 * This extension uses BankStatementWithCategorizationExtractor which
 * extends the base extractor framework with categorization context hooks.
 */

import {
  ImportExtension,
  ImportExtensionContext,
  ImportExtensionOptions,
  ExtensionProcessResult,
} from '../types';
import { BankStatementWithCategorizationExtractor } from '../../extractors/bank-statement-with-categorization-extractor';
import logger from '../../../utils/logger';

export class PostingImportExtension implements ImportExtension {
  readonly targetModel = 'posting';
  readonly extensionId = 'posting-categorization';

  private extractor: BankStatementWithCategorizationExtractor;

  constructor() {
    this.extractor = new BankStatementWithCategorizationExtractor();
  }

  /**
   * Document types this extension handles
   */
  getSupportedDocumentTypes(): string[] {
    return ['posting_with_categorization', 'bank_statement_categorized'];
  }

  /**
   * Required options for extraction
   */
  getRequiredOptions(): string[] {
    return ['legalEntityId'];
  }

  /**
   * Custom extraction with categorization
   * Uses BankStatementWithCategorizationExtractor which extends the base
   * extractor framework with categorization context via augmentation hooks.
   */
  async customExtract(
    context: ImportExtensionContext,
    buffer: Buffer,
    options: ImportExtensionOptions
  ): Promise<ExtensionProcessResult> {
    const startTime = Date.now();

    try {
      logger.info('PostingImportExtension: Starting extraction with categorization', {
        orgId: context.user.org_id,
        legalEntityId: options.legalEntityId,
        bufferSize: buffer.length,
      });

      // Prepare categorization context (fetches Chart of Accounts)
      await this.extractor.prepareCategorizationContext({
        orgId: context.user.org_id,
        legalEntityId: options.legalEntityId,
      });

      // Use extractor framework for combined extraction + categorization
      const result = await this.extractor.extract(
        { user: context.user, permissions: context.permissions },
        {
          documentType: 'posting_with_categorization',
          documentContent: buffer,
        }
      );

      const processingTime = Date.now() - startTime;

      logger.info('PostingImportExtension: Extraction completed', {
        success: result.success,
        transactionCount: result.data.transactions?.length || 0,
        categorizationCount: result.data.categorizations?.length || 0,
        processingTime,
        confidence: result.confidence,
      });

      return {
        success: result.success,
        data: {
          transactions: result.data.transactions || [],
          accountContext: result.data.accountContext,
        },
        categorizations: result.data.categorizations,
        errors: result.errors,
        metadata: {
          processingTime,
          extractorType: 'BankStatementWithCategorizationExtractor',
          legalEntityId: options.legalEntityId,
          confidence: result.confidence,
        },
      };
    } catch (error: any) {
      logger.error('PostingImportExtension: Extraction failed', {
        error: error.message,
        orgId: context.user.org_id,
      });

      return {
        success: false,
        data: {},
        errors: [error.message],
        metadata: {
          processingTime: Date.now() - startTime,
          extractorType: 'BankStatementWithCategorizationExtractor',
        },
      };
    }
  }

  /**
   * Post-process extracted data (optional)
   * Can be used to augment data from standard extraction
   */
  async postProcess(
    context: ImportExtensionContext,
    data: Record<string, any>,
    options: ImportExtensionOptions
  ): Promise<ExtensionProcessResult> {
    // For now, pass through unchanged
    // This could be extended to add categorization to standard extraction results
    return {
      success: true,
      data,
    };
  }
}
