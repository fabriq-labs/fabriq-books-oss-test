import { AuthContext } from "../auth/types";
import { DocumentExtractionRequest, DocumentExtractionResult, DocumentType } from './extractors/types';
import { ExtractorRegistry } from './extractors/extractor-registry';
import logger from '../utils/logger';

/**
 * Main entry point for document extraction functionality
 * Similar to reports.ts and actions.ts in structure
 */

export const extract_document = async (
  context: AuthContext, 
  documentType: string, 
  documentContent: string | Buffer,
  options?: any
): Promise<DocumentExtractionResult> => {
  logger.debug(`Starting document extraction for type: ${documentType}`, context.user);

  try {
    const registry = ExtractorRegistry.getInstance();
    
    // Get the appropriate extractor for the document type
    const extractor = registry.getExtractorForType(documentType);
    
    if (!extractor) {
      const supportedTypes = registry.getSupportedTypes();
      throw new Error(`Unsupported document type: ${documentType}. Supported types: ${supportedTypes.join(', ')}`);
    }

    // Create extraction request
    const request: DocumentExtractionRequest = {
      documentType,
      documentContent,
      options: {
        includeMetadata: true,
        confidenceThreshold: 70,
        ...options
      }
    };

    // Execute extraction
    const result = await extractor.extract(context, request);

    logger.debug(`Document extraction completed with confidence: ${result.confidence}%`, context.user);
    
    return result;

  } catch (error: any) {
    logger.error(`Document extraction failed: ${error.message}`, context.user);
    
    return {
      success: false,
      data: {},
      confidence: 0,
      errors: [error.message],
      metadata: {
        documentType,
        extractionTimestamp: new Date(),
        processingTime: 0
      }
    };
  }
};

export const get_supported_document_types = async (context: AuthContext): Promise<DocumentType[]> => {
  logger.debug('Retrieving supported document types', context.user);
  
  const registry = ExtractorRegistry.getInstance();
  return registry.getAllDocumentTypes();
};

export const get_document_type_info = async (
  context: AuthContext, 
  typeId: string
): Promise<DocumentType | null> => {
  logger.debug(`Retrieving document type info for: ${typeId}`, context.user);
  
  const registry = ExtractorRegistry.getInstance();
  return registry.getDocumentType(typeId);
};

export const validate_document_type = async (
  context: AuthContext, 
  documentType: string
): Promise<boolean> => {
  logger.debug(`Validating document type: ${documentType}`, context.user);
  
  const registry = ExtractorRegistry.getInstance();
  return registry.isTypeSupported(documentType);
};

export const batch_extract_documents = async (
  context: AuthContext,
  documents: Array<{
    id: string;
    type: string;
    content: string | Buffer;
    options?: any;
  }>
): Promise<Array<{
  id: string;
  result: DocumentExtractionResult;
}>> => {
  logger.debug(`Starting batch extraction for ${documents.length} documents`, context.user);

  const results = await Promise.allSettled(
    documents.map(async (doc) => {
      const result = await extract_document(context, doc.type, doc.content, doc.options);
      return {
        id: doc.id,
        result
      };
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      logger.error(`Batch extraction failed for document ${documents[index].id}:`, result.reason);
      return {
        id: documents[index].id,
        result: {
          success: false,
          data: {},
          confidence: 0,
          errors: [result.reason?.message || 'Unknown error'],
          metadata: {
            documentType: documents[index].type,
            extractionTimestamp: new Date(),
            processingTime: 0
          }
        }
      };
    }
  });
};

// Export types for external use
export * from './extractors/types';
export { ExtractorRegistry } from './extractors/extractor-registry';
export { BaseDocumentExtractor } from './extractors/base-extractor';
