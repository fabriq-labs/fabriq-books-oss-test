import { SystemDataLayer } from '../../dal/SystemDataLayer';
import { MigrationJournalRow, MigrationJournalResult, createMigrationJournal } from './MigrationJournalService';

const CREDIT_NORMAL = new Set(['Liabilities', 'Income', 'Equity']);

interface CsvRow {
  raw: Record<string, string>;
  lineNumber: number;
}

export interface CsvParseResult {
  rows: MigrationJournalRow[];
  errors: Array<{ line: number; message: string }>;
}

function col(row: Record<string, string>, ...candidates: string[]): string | undefined {
  for (const c of candidates) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === c.toLowerCase()) return row[key]?.trim();
    }
  }
  return undefined;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, idx) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { raw[h] = values[i] ?? ''; });
    return { raw, lineNumber: idx + 2 };
  });
}

async function resolveAccountId(
  sdl: SystemDataLayer,
  legalEntityId: string,
  code?: string,
  name?: string
): Promise<string | null> {
  if (!code && !name) return null;
  const match = await sdl.findFirst<{ id: string }>('account', {
    legal_entity_id: legalEntityId,
    ...(code ? { code } : { name }),
  }, { select: { id: true } });
  return match?.id ?? null;
}

function toSignedBalance(classification: string | null, debit: number, credit: number): number {
  if (!CREDIT_NORMAL.has(classification ?? '')) return debit - credit;
  return credit - debit;
}

export async function parseMigrationJournalCsv(
  sdl: SystemDataLayer,
  csvText: string,
  legalEntityId: string
): Promise<CsvParseResult> {
  const csvRows = parseCsv(csvText);
  const rows: MigrationJournalRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (const { raw, lineNumber } of csvRows) {
    const accountCode = col(raw, 'Account Code', 'Code', 'account_code');
    const accountName = col(raw, 'Account Name', 'Name', 'account_name', 'Account');

    const account_id = await resolveAccountId(sdl, legalEntityId, accountCode, accountName);
    if (!account_id) {
      errors.push({
        line: lineNumber,
        message: `Account not found for code="${accountCode ?? ''}" name="${accountName ?? ''}"`,
      });
      continue;
    }

    const debitStr  = col(raw, 'Debit', 'Debit Balance', 'DR', 'debit_balance');
    const creditStr = col(raw, 'Credit', 'Credit Balance', 'CR', 'credit_balance');
    const balStr    = col(raw, 'Balance', 'Amount', 'balance', 'amount');

    let balance: number;
    if (debitStr !== undefined || creditStr !== undefined) {
      const debit  = parseFloat(debitStr  || '0') || 0;
      const credit = parseFloat(creditStr || '0') || 0;
      const account = await sdl.findFirst<{ classification: string | null }>('account', { id: account_id }, { select: { classification: true } });
      balance = toSignedBalance(account?.classification ?? null, debit, credit);
    } else if (balStr !== undefined) {
      balance = parseFloat(balStr) || 0;
    } else {
      errors.push({ line: lineNumber, message: 'No balance column found' });
      continue;
    }

    rows.push({ account_id, balance });
  }

  return { rows, errors };
}

export async function importMigrationJournalFromCsv(
  sdl: SystemDataLayer,
  csvText: string,
  legalEntityId: string,
  migrationDate: string,
  replace = false
): Promise<MigrationJournalResult & { parse_errors: Array<{ line: number; message: string }> }> {
  const { rows, errors } = await parseMigrationJournalCsv(sdl, csvText, legalEntityId);

  if (errors.length && !rows.length) {
    throw new Error(
      `CSV parsing failed with no valid rows. Errors: ${errors.map((e) => `Line ${e.line}: ${e.message}`).join('; ')}`
    );
  }

  const result = await createMigrationJournal(sdl, {
    legal_entity_id: legalEntityId,
    migration_date: migrationDate,
    rows,
    replace,
  });

  return { ...result, parse_errors: errors };
}
