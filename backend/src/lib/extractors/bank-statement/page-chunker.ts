import { PDFDocument } from 'pdf-lib';
import logger from '../../../utils/logger';

export const PAGE_CHUNK_SIZE = 2;

/**
 * Splits a PDF buffer into sub-PDF buffers by page range.
 * Returns a single-element array when the document fits within one chunk.
 */
export async function splitPdfIntoPageChunks(
  pdfBuffer: Buffer,
  chunkSize: number = PAGE_CHUNK_SIZE
): Promise<{ chunks: Buffer[]; pageCount: number }> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = srcDoc.getPageCount();

  logger.debug('Splitting PDF into page chunks', { totalPages, chunkSize });

  if (totalPages <= chunkSize) {
    return { chunks: [pdfBuffer], pageCount: totalPages };
  }

  const chunks: Buffer[] = [];
  for (let start = 0; start < totalPages; start += chunkSize) {
    const end = Math.min(start + chunkSize, totalPages);
    const chunkDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await chunkDoc.copyPages(srcDoc, pageIndices);
    pages.forEach((page: any) => chunkDoc.addPage(page));
    const chunkBytes = await chunkDoc.save();
    chunks.push(Buffer.from(chunkBytes));
  }

  logger.debug('PDF split complete', { chunkCount: chunks.length, totalPages });
  return { chunks, pageCount: totalPages };
}
