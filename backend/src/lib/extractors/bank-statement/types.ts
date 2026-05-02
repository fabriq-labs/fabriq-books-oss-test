export interface ChunkExtractionMetadata {
  chunkCount: number;
  pageCount: number;
  chunkSize: number;
  totalTransactionsBeforeDedup: number;
  deduplicatedCount: number;
  warnings: string[];
  perChunkLatencyMs: number[];
}
