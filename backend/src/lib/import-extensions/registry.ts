import { ImportExtension } from './types';
import logger from '../../utils/logger';

/**
 * Import Extension Registry
 *
 * Singleton registry for model-specific import extensions.
 * Extensions can be registered to provide custom extraction, post-processing,
 * and other import-time behaviors without modifying generic import components.
 */
export class ImportExtensionRegistry {
  private static instance: ImportExtensionRegistry;
  private extensions: Map<string, ImportExtension> = new Map();
  private documentTypeMapping: Map<string, ImportExtension> = new Map();

  private constructor() {}

  public static getInstance(): ImportExtensionRegistry {
    if (!ImportExtensionRegistry.instance) {
      ImportExtensionRegistry.instance = new ImportExtensionRegistry();
    }
    return ImportExtensionRegistry.instance;
  }

  /**
   * Register an import extension
   * @param extension - The extension to register
   */
  public register(extension: ImportExtension): void {
    // Register by model name
    this.extensions.set(extension.targetModel.toLowerCase(), extension);

    // Register by supported document types
    const docTypes = extension.getSupportedDocumentTypes();
    for (const docType of docTypes) {
      this.documentTypeMapping.set(docType.toLowerCase(), extension);
    }

    logger.info('Registered import extension', {
      extensionId: extension.extensionId,
      targetModel: extension.targetModel,
      documentTypes: docTypes,
    });
  }

  /**
   * Get extension for a specific model
   * @param modelName - The model name (e.g., 'posting')
   */
  public getForModel(modelName: string): ImportExtension | null {
    return this.extensions.get(modelName.toLowerCase()) || null;
  }

  /**
   * Get extension by document type
   * @param documentType - The document type (e.g., 'posting_with_categorization')
   */
  public getByDocumentType(documentType: string): ImportExtension | null {
    return this.documentTypeMapping.get(documentType.toLowerCase()) || null;
  }

  /**
   * Check if a model has an extension registered
   * @param modelName - The model name to check
   */
  public hasExtension(modelName: string): boolean {
    return this.extensions.has(modelName.toLowerCase());
  }

  /**
   * Check if a document type is handled by an extension
   * @param documentType - The document type to check
   */
  public isDocumentTypeSupported(documentType: string): boolean {
    return this.documentTypeMapping.has(documentType.toLowerCase());
  }

  /**
   * Get all registered extensions
   */
  public getAllExtensions(): ImportExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Get all supported document types across all extensions
   */
  public getAllSupportedDocumentTypes(): string[] {
    return Array.from(this.documentTypeMapping.keys());
  }

  /**
   * Get required options for a model's extension
   * Returns empty array if no extension or no required options
   * @param modelName - The model name
   */
  public getRequiredOptions(modelName: string): string[] {
    const extension = this.getForModel(modelName);
    return extension?.getRequiredOptions() || [];
  }

  /**
   * Unregister an extension (mainly for testing)
   * @param modelName - The model name to unregister
   */
  public unregister(modelName: string): boolean {
    const extension = this.extensions.get(modelName.toLowerCase());
    if (!extension) return false;

    // Remove from model mapping
    this.extensions.delete(modelName.toLowerCase());

    // Remove from document type mapping
    for (const docType of extension.getSupportedDocumentTypes()) {
      this.documentTypeMapping.delete(docType.toLowerCase());
    }

    logger.info('Unregistered import extension', {
      extensionId: extension.extensionId,
      targetModel: extension.targetModel,
    });

    return true;
  }
}
