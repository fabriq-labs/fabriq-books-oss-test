import { AuthContext } from "../../auth/types";

export interface DocumentExtractionResult {
  success: boolean;
  data: Record<string, any>;
  confidence: number;
  errors?: string[];
  metadata?: {
    documentType: string;
    extractionTimestamp: Date;
    processingTime: number;
    pageCount?: number;
  };
}

export interface DocumentExtractionRequest {
  documentType: string;
  documentContent: string | Buffer;
  options?: {
    includeMetadata?: boolean;
    confidenceThreshold?: number;
    customFields?: string[];
    language?: string;
    enableChunking?: boolean;
    [key: string]: any;
  };
}

export interface DocumentExtractor {
  extract(context: AuthContext, request: DocumentExtractionRequest): Promise<DocumentExtractionResult>;
  getSupportedTypes(): string[];
  getTargetModel(): string; // New: Each extractor maps to one model
  validateDocument(documentContent: string | Buffer): boolean;
}

export interface ExtractorConfig {
  name: string;
  supportedTypes: string[];
  prompt: string;
  schema: Record<string, any>;
  confidenceThreshold: number;
}

export interface DocumentType {
  id: string;
  name: string;
  description: string;
  extractorClass: string;
  config: ExtractorConfig;
}

export interface ExtractionContext extends AuthContext {
  documentId?: string;
  batchId?: string;
  retryCount?: number;
}

export interface CategorizationExtractionOptions {
  orgId: string;
  legalEntityId?: string;
  /** Free-form hints about this account's statement format, injected into the extraction prompt (Feature B). */
  extractionNotes?: string | null;
}
