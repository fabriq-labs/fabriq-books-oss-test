import { DocumentExtractor } from '../../src/lib/extractors/types';
import { ImportExtensionRegistry } from '../../src/lib/import-extensions/registry';
import { BankStatementExtractor } from './extractors/bank-statement-extractor';
import { PostingImportExtension } from './postingImportExtension';

type ExtractorHost = {
  registerExtractor(documentType: string, extractor: DocumentExtractor): void;
};

/** Called from the kernel extractor registry. The extractor classes stay in this folder. */
export function registerGlExtractors(registry: ExtractorHost): void {
  const extractor = new BankStatementExtractor();
  for (const type of extractor.getSupportedTypes()) {
    registry.registerExtractor(type, extractor);
  }
}

/** Called from the kernel import-extension init. */
export function registerGlImportExtension(): void {
  ImportExtensionRegistry.getInstance().register(new PostingImportExtension());
}
