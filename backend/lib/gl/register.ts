import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../src/auth/middleware';
import { DocumentExtractor, DocumentType } from '../../src/lib/extractors/types';
import { ImportExtensionRegistry } from '../../src/lib/import-extensions/registry';
import logger from '../../src/utils/logger';
import { categorizeImportBatch } from './categorizeImportBatch';
import { BankStatementExtractor } from './extractors/bank-statement-extractor';
import { PostingImportExtension } from './postingImportExtension';

export { registerGlRoutes } from './reportRoutes';

type ExtractorHost = {
  registerExtractor(documentType: string, extractor: DocumentExtractor): void;
  registerDocumentType(documentType: DocumentType): void;
};

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
      confidenceThreshold: 90,
    },
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
      confidenceThreshold: 85,
    },
  },
];

/** Called from domain.ts. Extractor classes stay in this folder. */
export function registerGlExtractors(registry: ExtractorHost): void {
  const extractor = new BankStatementExtractor();
  for (const type of extractor.getSupportedTypes()) {
    registry.registerExtractor(type, extractor);
  }
  for (const documentType of documentTypes) {
    registry.registerDocumentType(documentType);
  }
}

/** Called from domain.ts. */
export function registerGlImportExtension(): void {
  ImportExtensionRegistry.getInstance().register(new PostingImportExtension());
}

/** Called from domain.ts. Predictions only; does not write postings. */
export function registerGlAgentRoutes(router: Router): void {
  router.post('/erp/categorize-transaction-batch', authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = req.context?.auth?.user;
      if (!user?.org_id) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const postings = req.body?.postings;
      if (!Array.isArray(postings) || postings.length === 0) {
        res.status(400).json({ success: false, error: 'postings array is required' });
        return;
      }
      const data = await categorizeImportBatch(user.org_id, user.id, postings);
      res.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Categorization failed';
      logger.error('Import categorization failed', { message });
      res.status(500).json({ success: false, error: message });
    }
  });
}
