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

/** Live status for a long PDF extract. Counts are chunk progress, not filtered rows. */
export interface ExtractionProgress {
  phase: 'preparing' | 'extracting' | 'combining';
  message: string;
  completed?: number;
  total?: number;
  pageCount?: number;
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
    onProgress?: (progress: ExtractionProgress) => void;
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
  /** Destination bank account for this upload — used to scope multi-account PDFs. */
  targetAccount?: {
    id: string;
    name?: string | null;
    account_number?: number | string | null;
  } | null;
}
