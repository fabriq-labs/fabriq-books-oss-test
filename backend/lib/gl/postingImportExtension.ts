import {
  ImportExtension,
  ImportExtensionContext,
  ImportExtensionOptions,
  ExtensionProcessResult,
} from '../../src/lib/import-extensions/types';
import { BankStatementWithCategorizationExtractor } from './extractors/bank-statement/bank-statement-with-categorization-extractor';
import { ExtractionProgress } from '../../src/lib/extractors/types';
import logger from '../../src/utils/logger';
import { fetchTargetAccount } from './categorize';

export class PostingImportExtension implements ImportExtension {
  readonly targetModel = 'posting';
  readonly extensionId = 'posting-categorization';

  private extractor = new BankStatementWithCategorizationExtractor();

  getSupportedDocumentTypes(): string[] {
    return ['posting_with_categorization', 'bank_statement_categorized'];
  }

  getRequiredOptions(): string[] {
    return ['legalEntityId', 'accountId', 'enableChunking'];
  }

  async customExtract(
    context: ImportExtensionContext,
    buffer: Buffer,
    options: ImportExtensionOptions
  ): Promise<ExtensionProcessResult> {
    const startTime = Date.now();
    const entityId = options.entityId || options.legalEntityId;
    try {
      const targetAccount = options.accountId
        ? await fetchTargetAccount(String(options.accountId))
        : null;
      const extractionNotes = targetAccount?.extraction_notes ?? options.extractionNotes ?? null;

      await this.extractor.prepareCategorizationContext({
        orgId: context.user.org_id,
        legalEntityId: entityId,
        extractionNotes: extractionNotes ?? undefined,
        targetAccount: targetAccount
          ? {
              id: targetAccount.id,
              name: targetAccount.name,
              account_number: targetAccount.account_number,
            }
          : null,
      });

      const enableChunking = options.enableChunking === true || options.enableChunking === 'true';
      const result = await this.extractor.extract(
        { user: context.user, permissions: context.permissions },
        {
          documentType: 'posting_with_categorization',
          documentContent: buffer,
          options: {
            enableChunking,
            extractionNotes: extractionNotes ?? undefined,
            onProgress: options.onProgress,
            targetAccount: targetAccount
              ? {
                  id: targetAccount.id,
                  name: targetAccount.name,
                  account_number: targetAccount.account_number,
                }
              : undefined,
          },
        }
      );

      return {
        success: result.success,
        data: {
          transactions: result.data.transactions || [],
          accountContext: result.data.accountContext,
        },
        categorizations: result.data.categorizations,
        errors: result.errors,
        metadata: {
          processingTime: Date.now() - startTime,
          extractorType: 'BankStatementWithCategorizationExtractor',
          entityId,
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
}

export function emitExtensionProgress(
  options: ImportExtensionOptions,
  progress: ExtractionProgress
) {
  const cb = options.onProgress;
  if (typeof cb !== 'function') return;
  try {
    cb(progress);
  } catch {
    // Client disconnect must not fail the extract.
  }
}
