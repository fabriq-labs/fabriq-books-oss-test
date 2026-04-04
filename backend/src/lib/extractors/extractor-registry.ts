import { DocumentExtractor, DocumentType } from './types';
import { BankStatementExtractor } from './bank-statement-extractor';
import { InvoiceExtractor } from './invoice-extractor';
// Note: BankStatementWithCategorizationExtractor has been moved to import-extensions/posting

export class ExtractorRegistry {
  private static instance: ExtractorRegistry;
  private extractors: Map<string, DocumentExtractor> = new Map();
  private documentTypes: Map<string, DocumentType> = new Map();

  private constructor() {
    this.initializeExtractors();
    this.initializeDocumentTypes();
  }

  public static getInstance(): ExtractorRegistry {
    if (!ExtractorRegistry.instance) {
      ExtractorRegistry.instance = new ExtractorRegistry();
    }
    return ExtractorRegistry.instance;
  }

  private initializeExtractors(): void {
    // Initialize bank statement extractor (extraction only)
    const bankStatementExtractor = new BankStatementExtractor();

    // Register extractor by its supported types
    bankStatementExtractor.getSupportedTypes().forEach(type => {
      this.extractors.set(type, bankStatementExtractor);
    });

    // Note: Bank statement with categorization is now handled by ImportExtensionRegistry
    // See: lib/import-extensions/posting/

    // Initialize invoice extractor
    const invoiceExtractor = new InvoiceExtractor();

    // Register invoice extractor by its supported types
    invoiceExtractor.getSupportedTypes().forEach(type => {
      this.extractors.set(type, invoiceExtractor);
    });
  }

  private initializeDocumentTypes(): void {
    // Note: bank_statement_categorized is now handled by ImportExtensionRegistry
    // See: lib/import-extensions/posting/
    const documentTypes: DocumentType[] = [
      {
        id: 'bank_statement',
        name: 'Bank Statement',
        description: 'Bank and credit card statements',
        extractorClass: 'BankStatementExtractor',
        config: {
          name: 'Bank Statement Extractor',
          supportedTypes: ['bank_statement', 'account_statement', 'credit_card_statement'],
          prompt: 'Extract bank statement information',
          schema: {},
          confidenceThreshold: 90
        }
      },
      {
        id: 'invoice',
        name: 'Invoice',
        description: 'Purchase invoices, bills, and vendor invoices',
        extractorClass: 'InvoiceExtractor',
        config: {
          name: 'Invoice Extractor',
          supportedTypes: ['invoice', 'bill', 'vendor_invoice', 'supplier_invoice', 'purchase_invoice'],
          prompt: 'Extract invoice information including header and line items',
          schema: {},
          confidenceThreshold: 85
        }
      }
    ];

    documentTypes.forEach(docType => {
      this.documentTypes.set(docType.id, docType);
    });
  }

  public getExtractor(documentType: string): DocumentExtractor | null {
    return this.extractors.get(documentType.toLowerCase()) || null;
  }

  public getDocumentType(typeId: string): DocumentType | null {
    return this.documentTypes.get(typeId.toLowerCase()) || null;
  }

  public getAllDocumentTypes(): DocumentType[] {
    return Array.from(this.documentTypes.values());
  }

  public getSupportedTypes(): string[] {
    return Array.from(this.extractors.keys());
  }

  public registerExtractor(documentType: string, extractor: DocumentExtractor): void {
    this.extractors.set(documentType.toLowerCase(), extractor);
  }

  public registerDocumentType(documentType: DocumentType): void {
    this.documentTypes.set(documentType.id.toLowerCase(), documentType);
  }

  public isTypeSupported(documentType: string): boolean {
    return this.extractors.has(documentType.toLowerCase());
  }

  public getExtractorForType(documentType: string): DocumentExtractor | null {
    // Try exact match first
    let extractor = this.extractors.get(documentType.toLowerCase());
    
    if (extractor) {
      return extractor;
    }

    // Try partial matching for more flexible type detection
    const supportedTypes = this.getSupportedTypes();
    const matchingType = supportedTypes.find(type => 
      type.includes(documentType.toLowerCase()) || 
      documentType.toLowerCase().includes(type)
    );

    if (matchingType) {
      return this.extractors.get(matchingType) || null;
    }

    return null;
  }

  /**
   * Find extractor by target model name (1:1 mapping)
   */
  public getExtractorForModel(modelName: string): DocumentExtractor | null {
    for (const extractor of this.extractors.values()) {
      if (extractor.getTargetModel() === modelName.toLowerCase()) {
        return extractor;
      }
    }
    return null;
  }

  /**
   * Get all available model names that have extractors
   */
  public getAvailableModels(): string[] {
    const models = new Set<string>();
    for (const extractor of this.extractors.values()) {
      models.add(extractor.getTargetModel());
    }
    return Array.from(models);
  }
}
