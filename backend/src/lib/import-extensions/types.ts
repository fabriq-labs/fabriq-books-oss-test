import { AuthContext } from '../../auth/types';

/**
 * Context provided to import extensions during extraction/processing
 */
export interface ImportExtensionContext {
  user: AuthContext['user'];
  permissions: AuthContext['permissions'];
}

/**
 * Options passed to extension methods
 */
export interface ImportExtensionOptions {
  documentType?: string;
  legalEntityId?: string;
  fileName?: string;
  fileSize?: number;
  [key: string]: any;
}

/**
 * Result returned from extension processing
 */
export interface ExtensionProcessResult {
  success: boolean;
  data: Record<string, any>;
  categorizations?: Array<{
    transaction_index: number;
    predicted_account_id: string;
    predicted_account_name: string;
    confidence_score: number;
    reasoning: string;
  }>;
  metadata?: Record<string, any>;
  errors?: string[];
}

/**
 * Import Extension Interface
 *
 * Implementations provide model-specific import functionality without
 * polluting generic import components (CsvMapper, ImportPannel, ExtractorRegistry).
 *
 * Extensions are registered by model name and can:
 * - Provide custom document extraction (e.g., bank statements with categorization)
 * - Post-process extracted data before import
 * - Define required options for extraction
 */
export interface ImportExtension {
  /**
   * Target model this extension applies to (e.g., 'posting', 'invoice')
   */
  readonly targetModel: string;

  /**
   * Unique identifier for this extension
   */
  readonly extensionId: string;

  /**
   * Document types this extension can handle
   * Used to route extraction requests to the appropriate extension
   */
  getSupportedDocumentTypes(): string[];

  /**
   * Required options that must be extracted from request
   * (e.g., ['legalEntityId'] for posting categorization)
   */
  getRequiredOptions(): string[];

  /**
   * Custom extraction logic (replaces standard extractor)
   * Called when a supported document type is detected
   *
   * @param context - Auth context with user and permissions
   * @param buffer - Document content as Buffer
   * @param options - Additional options from request
   * @returns Extracted data with optional categorizations
   */
  customExtract?(
    context: ImportExtensionContext,
    buffer: Buffer,
    options: ImportExtensionOptions
  ): Promise<ExtensionProcessResult>;

  /**
   * Post-process extracted data after standard extraction
   * Can augment data with additional fields, predictions, etc.
   *
   * @param context - Auth context with user and permissions
   * @param data - Data extracted by standard extractor
   * @param options - Additional options from request
   * @returns Processed data with optional categorizations
   */
  postProcess?(
    context: ImportExtensionContext,
    data: Record<string, any>,
    options: ImportExtensionOptions
  ): Promise<ExtensionProcessResult>;
}
