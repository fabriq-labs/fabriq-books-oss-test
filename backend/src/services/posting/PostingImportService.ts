import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { AuthContext } from '../../auth/types';
import { ModelService } from '../core/ModelService';
import { UploadService } from '../upload/UploadService';
import { RelationshipResolverService } from '../RelationshipResolverService';
import { buildPostingImportFieldMapping } from '../../lib/import/bankStatementImportClient';
import { ValidationError } from '../../rest/errors/ApiError';
import logger from '../../utils/logger';
import { ImportAuditService } from '../import/ImportAuditService';

// ── Debit / Credit Convention ─────────────────────────────────────────────────
//
// This service uses DOUBLE-ENTRY BOOKKEEPING conventions, not bank-statement
// labelling conventions. The two differ, so the mapping is:
//
//  Bank-statement "Debit" (withdrawal, money leaving the account)
//  ┌──────────────────────────────────────────────────────────────┐
//  │  Debit  : Expense / contra account  → account_id            │
//  │  Credit : Bank account              → credit_account_id      │
//  └──────────────────────────────────────────────────────────────┘
//    The bank account is CREDITED because the asset (cash) DECREASES.
//
//  Bank-statement "Credit" (deposit, money entering the account)
//  ┌──────────────────────────────────────────────────────────────┐
//  │  Debit  : Bank account              → account_id            │
//  │  Credit : Revenue / contra account  → credit_account_id      │
//  └──────────────────────────────────────────────────────────────┘
//    The bank account is DEBITED because the asset (cash) INCREASES.
//
// Therefore:
//   debit_amount  present  →  accountId (bank) → credit_account_id
//                             contra (expense)  → account_id   (null until categorised)
//   credit_amount present  →  accountId (bank) → account_id
//                             contra (revenue)  → credit_account_id (null until categorised)
//
// For CSV imports the user expresses this via column_mapping:
//   Expense column code → "account_id"        (contra for debits)
//   Revenue column code → "credit_account_id" (contra for credits)
// RelationshipResolverService then resolves those codes to DB IDs before
// mapCsvRow applies the bank-account override.
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────────

export type ImportStep = 'extracting' | 'mapping' | 'importing' | 'complete' | 'error';

export interface ImportProgress {
  step: ImportStep;
  message: string;
  count?: number;
  error?: string;
}

export type ProgressCallback = (progress: ImportProgress) => void;

export interface ImportBankStatementOptions {
  fileBuffer: Buffer;
  mimeType: string;
  fileSize: number;
  fileName: string;
  accountId: string;
  viewId?: string;
  dryRun?: boolean;
  /**
   * Required for CSV imports. Maps CSV column headers to posting field names.
   *
   * Direction is expressed via "debit_amount" / "credit_amount" as the target —
   * never "amount" directly (ambiguous for bank vs. credit-card statements).
   *
   * Contra-account columns should target "account_id" (expense side, for debits)
   * or "credit_account_id" (revenue side, for credits).
   *
   * Examples:
   *   Bank account CSV (all withdrawals, with expense codes):
   *     { "Date": "value_date", "Description": "description",
   *       "Amount": "debit_amount", "Expense Code": "account_id" }
   *
   *   Mixed CSV (no contra-account resolution):
   *     { "Date": "value_date", "Description": "description",
   *       "Debit": "debit_amount", "Credit": "credit_amount" }
   */
  columnMapping?: Record<string, string>;
  /**
   * Enable AI categorisation (PDF only).
   * When true, the LLM predicts the contra-account for each transaction
   * using the Chart of Accounts linked to legalEntityId.
   * Requires legalEntityId.
   */
  categorize?: boolean;
  /**
   * Legal entity ID (or name) used to scope the Chart of Accounts for
   * categorisation. Required when categorize=true.
   * If a name string is passed the service resolves it to an ID via a DB lookup.
   */
  legalEntityId?: string;
  onProgress?: ProgressCallback;
}

export interface ImportBankStatementResult {
  success: boolean;
  count?: number;
  import_id?: string;
  /** Populated when dryRun=true — the mapped transactions without DB insert */
  transactions?: Record<string, any>[];
  error?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class PostingImportService {
  private static instance: PostingImportService;

  private constructor() {}

  public static getInstance(): PostingImportService {
    if (!PostingImportService.instance) {
      PostingImportService.instance = new PostingImportService();
    }
    return PostingImportService.instance;
  }

  /**
   * Full bank-statement import pipeline — all in-process, zero HTTP calls.
   *
   * Routes to the PDF or CSV branch depending on mimeType / fileName extension.
   * See the debit/credit convention block at the top of this file.
   */
  async importBankStatement(
    context: AuthContext,
    options: ImportBankStatementOptions
  ): Promise<ImportBankStatementResult> {
    const { mimeType, fileName } = options;

    const isCsv =
      mimeType === 'text/csv' ||
      mimeType === 'text/plain' ||
      (mimeType === 'application/octet-stream' && fileName.toLowerCase().endsWith('.csv'));

    return isCsv
      ? this.importFromCsv(context, options)
      : this.importFromPdf(context, options);
  }

  // ── PDF branch ─────────────────────────────────────────────────────────────

  private async importFromPdf(
    context: AuthContext,
    options: ImportBankStatementOptions
  ): Promise<ImportBankStatementResult> {
    const {
      fileBuffer, mimeType, fileSize, fileName,
      accountId, viewId = 'posting_view', dryRun = false,
      categorize = false, legalEntityId,
      onProgress,
    } = options;

    const emit = makeEmitter(onProgress);
    const auditService = ImportAuditService.getInstance();
    let importId: string | undefined;

    try {
      importId = await auditService.createRun({
        context,
        targetModel: 'posting',
        targetView: viewId,
        importChannel: 'custom_posting_bank_statement',
        fileName,
        mimeType,
        fileSizeBytes: fileSize,
        isDryRun: dryRun,
        sourceFileBuffer: fileBuffer,
      });
      await auditService.markProcessing(importId);
      // ── Step 1: Extract (with optional categorisation) ────────────────────
      if (categorize) {
        emit({ step: 'extracting', message: 'Extracting transactions and categorising…' });
        if (!legalEntityId) {
          throw new ValidationError('legalEntityId is required when categorize=true');
        }
      } else {
        emit({ step: 'extracting', message: 'Extracting transactions from PDF…' });
      }

      // Resolve legal entity name → ID if a name string was provided
      const resolvedLegalEntityId = legalEntityId
        ? await resolveLegalEntityId(legalEntityId, context.user?.org_id)
        : undefined;

      // Fetch account-specific extraction notes (may be null if not set)
      const extractionNotes = categorize
        ? await fetchAccountExtractionNotes(accountId)
        : null;

      const modelName = categorize ? 'posting_with_categorization' : 'posting';
      const parseOptions: Record<string, any> = { mimeType, fileSize, fileName };
      if (resolvedLegalEntityId) parseOptions.legalEntityId = resolvedLegalEntityId;
      if (extractionNotes) parseOptions.extractionNotes = extractionNotes;

      const parseResult = await ModelService.getInstance().parseDocument(
        modelName, context, fileBuffer, parseOptions
      );

      if (!parseResult.success) {
        const msg = parseResult.error ?? 'PDF extraction failed';
        if (importId) await auditService.markFailure(importId, msg);
        emit({ step: 'error', message: msg, error: msg });
        return { success: false, error: msg, import_id: importId };
      }

      const rawTransactionsAll: Record<string, any>[] = parseResult.data?.transactions ?? [];
      const rawTransactions: Record<string, any>[] = rawTransactionsAll.filter((t) => !isBalanceOnlyRow(t));

      logger.info('PostingImportService: PDF extraction complete', {
        fileName,
        transactionCount: rawTransactions.length,
        filteredBalanceRows: rawTransactionsAll.length - rawTransactions.length,
        categorize, userId: context.user?.id,
      });

      // ── Step 2: Merge categorisation predictions (if any) ─────────────────
      const categorizations: Array<Record<string, any>> =
        parseResult.data?.categorizations ?? [];

      if (categorizations.length > 0) {
        logger.info('PostingImportService: applying categorizations', {
          count: categorizations.length,
        });
        applyCategorizations(rawTransactions, categorizations);
      }

      // ── Step 3: Map to posting fields (debit/credit convention) ───────────
      emit({
        step: 'mapping',
        message: `Mapping ${rawTransactions.length} transaction(s) to posting fields…`,
        count: rawTransactions.length,
      });

      const mapped = rawTransactions.map((t) => {
        const mappedRow = mapPdfRow(t, accountId);
        if (resolvedLegalEntityId) {
          mappedRow.legal_entity_id = resolvedLegalEntityId;
        }
        return mappedRow;
      });

      if (dryRun) {
        if (importId) {
          await auditService.markSuccess(importId, {
            records_total: mapped.length,
            records_success: 0,
            records_failed: 0,
          });
        }
        emit({ step: 'complete', message: `Dry run — ${mapped.length} transaction(s) parsed, nothing inserted.`, count: mapped.length });
        return { success: true, count: mapped.length, transactions: mapped, import_id: importId };
      }

      // ── Step 4: Bulk insert ───────────────────────────────────────────────
      return await this.bulkInsert(mapped, viewId, context, emit, fileName, importId);

    } catch (error: any) {
      if (importId) await auditService.markFailure(importId, error);
      const result = handleError(error, fileName, emit, logger);
      return { ...result, import_id: importId };
    }
  }

  // ── CSV branch ─────────────────────────────────────────────────────────────

  private async importFromCsv(
    context: AuthContext,
    options: ImportBankStatementOptions
  ): Promise<ImportBankStatementResult> {
    const {
      fileBuffer, fileName,
      accountId, viewId = 'posting_view', dryRun = false,
      columnMapping, onProgress,
    } = options;

    const emit = makeEmitter(onProgress);
    const auditService = ImportAuditService.getInstance();
    let importId: string | undefined;

    try {
      importId = await auditService.createRun({
        context,
        targetModel: 'posting',
        targetView: viewId,
        importChannel: 'custom_posting_bank_statement',
        fileName,
        mimeType: 'text/csv',
        fileSizeBytes: fileBuffer.length,
        isDryRun: dryRun,
        sourceFileBuffer: fileBuffer,
      });
      await auditService.markProcessing(importId);
      // ── Validate columnMapping ─────────────────────────────────────────────
      if (!columnMapping || Object.keys(columnMapping).length === 0) {
        throw new ValidationError('column_mapping is required for CSV imports');
      }

      const targetFields = Object.values(columnMapping);

      if (targetFields.includes('amount')) {
        throw new ValidationError(
          'column_mapping cannot target "amount" directly; ' +
          'use "debit_amount" for withdrawals or "credit_amount" for deposits'
        );
      }

      if (!targetFields.includes('debit_amount') && !targetFields.includes('credit_amount')) {
        throw new ValidationError(
          'column_mapping must include at least one of "debit_amount" or "credit_amount"'
        );
      }

      // ── Step 1: Parse CSV ──────────────────────────────────────────────────
      emit({ step: 'extracting', message: `Parsing CSV "${fileName}"…` });

      const rawRows = await parseCsvBuffer(fileBuffer);

      logger.info('PostingImportService: CSV parsed', {
        fileName, rowCount: rawRows.length, userId: context.user?.id,
      });

      // ── Step 2: Apply columnMapping ────────────────────────────────────────
      const renamedRows = rawRows.map((row) => applyColumnMapping(row, columnMapping));

      // ── Step 3: Resolve relationships (account codes → IDs, etc.) ─────────
      emit({
        step: 'mapping',
        message: `Resolving relationships for ${renamedRows.length} row(s)…`,
        count: renamedRows.length,
      });

      const { data: resolvedRows } = await RelationshipResolverService.getInstance().resolve({
        data: renamedRows,
        viewName: viewId,
        modelName: 'posting',
        context,
      });

      // ── Step 4: Apply bank-account mapping (debit/credit convention) ───────
      const mapped = resolvedRows.map((row) => mapCsvRow(row, accountId));

      if (dryRun) {
        if (importId) {
          await auditService.markSuccess(importId, {
            records_total: mapped.length,
            records_success: 0,
            records_failed: 0,
          });
        }
        emit({ step: 'complete', message: `Dry run — ${mapped.length} row(s) parsed, nothing inserted.`, count: mapped.length });
        return { success: true, count: mapped.length, transactions: mapped, import_id: importId };
      }

      // ── Step 5: Bulk insert ────────────────────────────────────────────────
      return await this.bulkInsert(mapped, viewId, context, emit, fileName, importId);

    } catch (error: any) {
      if (importId) await auditService.markFailure(importId, error);
      const result = handleError(error, fileName, emit, logger);
      return { ...result, import_id: importId };
    }
  }

  // ── Shared bulk-insert helper ──────────────────────────────────────────────

  private async bulkInsert(
    rows: Record<string, any>[],
    viewId: string,
    context: AuthContext,
    emit: ReturnType<typeof makeEmitter>,
    fileName: string,
    importId?: string
  ): Promise<ImportBankStatementResult> {
    emit({ step: 'importing', message: `Importing ${rows.length} transaction(s)…`, count: rows.length });

    const mapping = buildPostingImportFieldMapping(rows);
    const uploadResult = await UploadService.getInstance().uploadCSV(
      'posting', context, { data: rows, mapping, importMeta: importId ? { import_id: importId } : undefined }, viewId
    );

    if (!uploadResult.success) {
      const msg = uploadResult.error ?? 'Upload failed';
      emit({ step: 'error', message: msg, error: msg });
      return { success: false, error: msg, import_id: importId };
    }

    const count = uploadResult.data?.count ?? 0;
    emit({ step: 'complete', message: `Successfully imported ${count} transaction(s).`, count });

    logger.info('PostingImportService: import complete', {
      fileName, count, userId: context.user?.id,
    });

    return { success: true, count, import_id: importId };
  }
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Some statements (and LLMs) surface Opening/Closing Balance lines as if they
 * were transactions. We must never import those as postings.
 */
export function isBalanceOnlyRow(t: Record<string, any>): boolean {
  const text = String(
    t?.description ?? t?.name ?? t?.notes ?? ''
  ).trim().toLowerCase();

  if (!text) return false;

  const mentionsBalance =
    text.includes('opening balance') ||
    text.includes('starting balance') ||
    text.includes('beginning balance') ||
    text.includes('closing balance') ||
    text.includes('ending balance');

  if (!mentionsBalance) return false;

  const debit = t?.debit_amount != null ? Number(t.debit_amount) : 0;
  const credit = t?.credit_amount != null ? Number(t.credit_amount) : 0;
  const hasMovement = (Number.isFinite(debit) && debit !== 0) || (Number.isFinite(credit) && credit !== 0);

  // If it looks like a balance row and there's no debit/credit movement, drop it.
  return !hasMovement;
}

/**
 * Parse a CSV buffer into an array of raw string-value row objects.
 */
export function parseCsvBuffer(buffer: Buffer): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    Readable.from(buffer)
      .pipe(csvParser())
      .on('data', (row: Record<string, string>) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * Rename CSV columns per the columnMapping.
 * Only columns present in the mapping are included in the output.
 * debit_amount / credit_amount: empty string or zero → omitted entirely.
 */
export function applyColumnMapping(
  row: Record<string, string>,
  columnMapping: Record<string, string>
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [csvCol, targetField] of Object.entries(columnMapping)) {
    const raw = row[csvCol];
    if (raw === undefined) continue;

    if (targetField === 'debit_amount' || targetField === 'credit_amount') {
      const num = raw.trim() === '' ? undefined : parseFloat(raw.trim().replace(/,/g, ''));
      if (num !== undefined && !isNaN(num) && num !== 0) {
        result[targetField] = num;
      }
    } else {
      result[targetField] = raw.trim() === '' ? undefined : raw.trim();
    }
  }
  return result;
}

/**
 * Map a PDF-extracted transaction row to posting fields.
 *
 * Convention (see file header):
 *   debit_amount  → bank account → credit_account_id  (asset decreases)
 *   credit_amount → bank account → account_id         (asset increases)
 *
 * The contra-account fields (account_id for debits, credit_account_id for credits)
 * are preserved from the row — AI categorisation populates them beforehand via
 * applyCategorizations().
 */
export function mapPdfRow(t: Record<string, any>, accountId: string): Record<string, any> {
  const isDebit = t.debit_amount != null && Number(t.debit_amount) !== 0;
  const amount = isDebit ? Number(t.debit_amount) : Number(t.credit_amount ?? 0);
  return {
    ...t,
    amount,
    // Debit (withdrawal): bank credited → credit_account_id; expense debited → account_id
    // Credit (deposit):   bank debited  → account_id;         revenue credited → credit_account_id
    account_id:        isDebit ? t.account_id        : accountId,
    credit_account_id: isDebit ? accountId           : t.credit_account_id,
    debit_amount: undefined,
    credit_amount: undefined,
    _predicted_account_id: undefined, // internal field — strip before insert
  };
}

/**
 * Apply bank-account mapping to a CSV row after relationship resolution.
 *
 * Convention (see file header):
 *   debit_amount  row → bank → credit_account_id; row.account_id preserved (expense contra)
 *   credit_amount row → bank → account_id;        row.credit_account_id preserved (revenue contra)
 */
export function mapCsvRow(row: Record<string, any>, accountId: string): Record<string, any> {
  const isDebit = row.debit_amount != null && Number(row.debit_amount) !== 0;
  const amount = isDebit ? Number(row.debit_amount) : Number(row.credit_amount ?? 0);
  return {
    ...row,
    amount,
    account_id:        isDebit ? row.account_id        : accountId,
    credit_account_id: isDebit ? accountId             : row.credit_account_id,
    debit_amount: undefined,
    credit_amount: undefined,
  };
}

/**
 * Merge AI categorisation predictions into raw transaction rows.
 *
 * Each categorisation entry: { transaction_index, account_id, confidence_score }
 * Only entries with confidence >= 0.5 are applied.
 *
 * The predicted account is stored in `_predicted_account_id` (internal field).
 * mapPdfRow() then routes it to account_id (for debit rows) or
 * credit_account_id (for credit rows) per the double-entry convention.
 */
export function applyCategorizations(
  transactions: Record<string, any>[],
  categorizations: Array<Record<string, any>>
): void {
  const CONFIDENCE_THRESHOLD = 0.5;

  for (const cat of categorizations) {
    const idx = cat.transaction_index ?? cat.index;
    if (typeof idx !== 'number' || idx < 0 || idx >= transactions.length) continue;
    if ((cat.confidence_score ?? 0) < CONFIDENCE_THRESHOLD) continue;

    const predictedId = cat.account_id ?? cat.predicted_account_id;
    if (!predictedId) continue;

    // Store on the row; mapPdfRow will route it to the correct side
    transactions[idx]._predicted_account_id = predictedId;
    // Also set the correct target field now so mapPdfRow can pick it up via ...t spread
    const isDebit = transactions[idx].debit_amount != null && Number(transactions[idx].debit_amount) !== 0;
    if (isDebit) {
      transactions[idx].account_id = predictedId;        // expense on debit side
    } else {
      transactions[idx].credit_account_id = predictedId; // revenue on credit side
    }
  }
}

// ── Private module helpers ─────────────────────────────────────────────────────

function makeEmitter(onProgress?: ProgressCallback) {
  return (progress: ImportProgress) => {
    try { onProgress?.(progress); } catch { /* client disconnect */ }
  };
}

function handleError(
  error: any,
  fileName: string,
  emit: ReturnType<typeof makeEmitter>,
  log: typeof logger
): ImportBankStatementResult {
  // ValidationError is a user error — re-throw so callers can return 400
  if (error?.name === 'ValidationError') throw error;

  const msg = error?.message ?? 'Unexpected error during import';
  log.error('PostingImportService error', { error: msg, fileName });
  emit({ step: 'error', message: msg, error: msg });
  return { success: false, error: msg };
}

/**
 * Fetch extraction_notes from the account record. Returns null if not set or account not found.
 */
async function fetchAccountExtractionNotes(accountId: string): Promise<string | null> {
  try {
    const { default: prisma } = await import('../../lib/prisma');
    const account = await (prisma as any).account.findUnique({
      where: { id: accountId },
      select: { extraction_notes: true },
    });
    return account?.extraction_notes ?? null;
  } catch {
    return null;
  }
}

/**
 * Accept either a legal entity ID (starts with typical ID prefix) or a name.
 * If a name is given, look up the DB for the matching entity within the org.
 */
async function resolveLegalEntityId(
  idOrName: string,
  orgId?: string
): Promise<string> {
  // Heuristic: IDs in this system start with a letter and contain underscores (e.g. le_org_xyz_1)
  // Names contain spaces or mixed case. A simple check: if it already looks like a DB ID, pass through.
  if (/^[a-z_]+[0-9_]+/.test(idOrName)) {
    return idOrName; // looks like an ID already
  }

  // Look up by name
  if (!orgId) throw new ValidationError('org_id is required to resolve legal entity by name');

  const { default: prisma } = await import('../../lib/prisma');
  const entity = await (prisma as any).legal_entity.findFirst({
    where: { legal_name: idOrName, org_id: orgId },
    select: { id: true },
  });

  if (!entity) {
    throw new ValidationError(
      `No legal entity found with name "${idOrName}" in org ${orgId}`
    );
  }

  return entity.id;
}
