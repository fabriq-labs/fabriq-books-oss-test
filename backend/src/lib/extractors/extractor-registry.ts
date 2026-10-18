import { registerDomainExtractors } from '../../../lib/domain';
import { DocumentExtractor, DocumentType } from './types';

export class ExtractorRegistry {
  private static instance: ExtractorRegistry;
  private extractors: Map<string, DocumentExtractor> = new Map();
  private documentTypes: Map<string, DocumentType> = new Map();

  private constructor() {
    registerDomainExtractors(this);
  }

  public static getInstance(): ExtractorRegistry {
    if (!ExtractorRegistry.instance) {
      ExtractorRegistry.instance = new ExtractorRegistry();
    }
    return ExtractorRegistry.instance;
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
