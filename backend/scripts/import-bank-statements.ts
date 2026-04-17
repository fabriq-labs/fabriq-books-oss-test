#!/usr/bin/env ts-node
/**
 * Bank Statement Import Script
 *
 * Imports bank statements (PDF or CSV) from a folder by calling the combined
 * server-side import API endpoint. All extraction, mapping, relationship
 * resolution, and upload logic lives in the server — this script is purely
 * a CLI wrapper that authenticates, discovers files, and streams progress.
 *
 * Usage:
 *   npx ts-node scripts/import-bank-statements.ts \
 *     --api-key  fabriq-us-ca-demo-user_daniel_lee \
 *     --folder   ./test-data/us-ca-bank-import \
 *     --account-id  acco_org_techflow_us_1102
 *
 * Authentication (one of):
 *   --api-key, -k       X-API-Key (see prisma/demo-stable-api-keys.ts)
 *   --email, -e         User email  (with --password)
 *   --password, -p      User password
 *
 * Required:
 *   --folder, -f        Folder containing PDF / CSV files to import
 *   --account-id, -a    Bank/statement account ID
 *
 * Optional:
 *   --api-url, -u       Backend API URL (default: http://localhost:4000)
 *   --view-id, -v       View ID for posting (default: posting_view)
 *   --dry-run, -d       Parse and validate only — do not insert into the DB
 *   --column-mapping    JSON mapping of CSV column headers → posting field names
 *                       Required for CSV files.
 *                       e.g. '{"Date":"value_date","Amount":"debit_amount"}'
 *   --categorize        Enable AI categorisation (PDF only).
 *                       Requires --legal-entity-id or --legal-entity-name.
 *   --legal-entity-id   Legal entity ID for the Chart of Accounts
 *   --legal-entity-name Legal entity name (server resolves it to an ID)
 *   --verbose           Print detailed per-event progress
 *   --help, -h          Show this help
 *
 * ── Debit / Credit Convention ─────────────────────────────────────────────────
 * The server uses double-entry bookkeeping conventions:
 *
 *   Bank statement Debit  (withdrawal, money OUT):
 *     account_id        = expense / contra account  (debit side)
 *     credit_account_id = bank account              (credit side — asset decreases)
 *
 *   Bank statement Credit (deposit, money IN):
 *     account_id        = bank account              (debit side  — asset increases)
 *     credit_account_id = revenue / contra account  (credit side)
 *
 * For CSV files with contra-account codes, map them accordingly:
 *   Expense code column → "account_id"        (contra for debit rows)
 *   Revenue code column → "credit_account_id" (contra for credit rows)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Examples:
 *   # PDF import (local server, API-key auth)
 *   npx ts-node scripts/import-bank-statements.ts \
 *     -k fabriq-us-ca-demo-user_daniel_lee \
 *     -f test-data/us-ca-bank-import/pdf-categorization-only \
 *     -a acco_org_techflow_us_1102
 *
 *   # PDF import WITH AI categorisation
 *   npx ts-node scripts/import-bank-statements.ts \
 *     -k fabriq-us-ca-demo-user_daniel_lee \
 *     -f test-data/us-ca-bank-import/pdf-categorization-only \
 *     -a acco_org_techflow_us_1102 \
 *     --categorize --legal-entity-id le_org_techflow_us_001
 *
 *   # CSV import (no contra-account codes)
 *   npx ts-node scripts/import-bank-statements.ts \
 *     -k fabriq-us-ca-demo-user_daniel_lee \
 *     -f test-data/us-ca-bank-import \
 *     -a acco_org_techflow_us_1102 \
 *     --column-mapping '{"Value Date":"value_date","Description":"description","Debit":"debit_amount","Credit":"credit_amount"}'
 *
 *   # CSV import with expense account codes (resolved server-side)
 *   npx ts-node scripts/import-bank-statements.ts \
 *     -k fabriq-us-ca-demo-user_daniel_lee \
 *     -f ./statements \
 *     -a acco_org_techflow_us_1102 \
 *     --column-mapping '{"Date":"value_date","Desc":"description","Amount":"debit_amount","Expense Code":"account_id"}'
 *
 *   # Remote server, email/password auth, dry run
 *   npx ts-node scripts/import-bank-statements.ts \
 *     -u https://demo-backend.railway.app \
 *     -e user@example.com -p password \
 *     -f ./statements -a <account_id> --dry-run --verbose
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { normalizeFabriqApiBaseUrl } from '../src/lib/import/bankStatementImportClient';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScriptConfig {
  email?: string;
  password?: string;
  apiKey?: string;
  folder: string;
  accountId: string;
  apiUrl: string;
  viewId: string;
  dryRun: boolean;
  columnMapping?: Record<string, string>;
  categorize: boolean;
  legalEntityId?: string;
  legalEntityName?: string;
  verbose: boolean;
}

interface FileResult {
  file: string;
  success: boolean;
  transactionCount?: number;
  error?: string;
}

// ── CLI arg parsing ────────────────────────────────────────────────────────────

function parseArgs(): ScriptConfig {
  const args = process.argv.slice(2);
  const config: Partial<ScriptConfig> = {
    apiUrl: 'http://localhost:4000',
    viewId: 'posting_view',
    dryRun: false,
    categorize: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg  = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--email':      case '-e': config.email     = next; i++; break;
      case '--password':   case '-p': config.password  = next; i++; break;
      case '--api-key':    case '-k': config.apiKey    = next; i++; break;
      case '--folder':     case '-f': config.folder    = next; i++; break;
      case '--account-id': case '-a': config.accountId = next; i++; break;
      case '--api-url':    case '-u': config.apiUrl    = next; i++; break;
      case '--view-id':    case '-v': config.viewId    = next; i++; break;
      case '--dry-run':    case '-d': config.dryRun    = true; break;
      case '--verbose':               config.verbose   = true; break;
      case '--categorize':            config.categorize = true; break;
      case '--legal-entity-id':   config.legalEntityId   = next; i++; break;
      case '--legal-entity-name': config.legalEntityName = next; i++; break;
      case '--column-mapping':
        try   { config.columnMapping = JSON.parse(next); }
        catch { console.error(`[ERROR] --column-mapping is not valid JSON: ${next}`); process.exit(1); }
        i++;
        break;
      case '--help': case '-h':
        printUsage(); process.exit(0);
    }
  }

  // Validate auth
  const hasApiKey   = !!config.apiKey;
  const hasPassword = !!(config.email && config.password);
  if (!hasApiKey && !hasPassword) {
    console.error('[ERROR] Provide --api-key or (--email and --password)');
    printUsage(); process.exit(1);
  }
  if (hasApiKey && (config.email || config.password)) {
    console.error('[ERROR] Do not mix --api-key with --email/--password');
    process.exit(1);
  }

  // Validate required fields
  if (!config.folder)    { console.error('[ERROR] --folder is required');     printUsage(); process.exit(1); }
  if (!config.accountId) { console.error('[ERROR] --account-id is required'); printUsage(); process.exit(1); }

  if (config.categorize && !config.legalEntityId && !config.legalEntityName) {
    console.error('[ERROR] --legal-entity-id or --legal-entity-name is required when --categorize is set');
    process.exit(1);
  }

  config.folder = path.resolve(config.folder!);
  config.apiUrl = normalizeFabriqApiBaseUrl(config.apiUrl!);

  return config as ScriptConfig;
}

function printUsage(): void {
  console.log(`
Bank Statement Import Script

Usage:
  npx ts-node scripts/import-bank-statements.ts [options]

Authentication (one of):
  --api-key, -k       X-API-Key
  --email, -e         User email (with --password)
  --password, -p      User password

Required:
  --folder, -f        Folder with PDF / CSV files
  --account-id, -a    Bank account ID for all transactions

Optional:
  --api-url, -u             Backend URL (default: http://localhost:4000)
  --view-id, -v             View ID (default: posting_view)
  --dry-run, -d             Parse only — do not insert
  --column-mapping JSON     CSV column → posting field mapping (required for CSV)
  --categorize              Enable AI categorisation (PDF only)
  --legal-entity-id ID      Legal entity for categorisation
  --legal-entity-name NAME  Legal entity name (looked up by server)
  --verbose                 Detailed progress output
  --help, -h                This message
`);
}

// ── Authentication ─────────────────────────────────────────────────────────────

async function authenticate(config: ScriptConfig): Promise<string | null> {
  if (config.apiKey) return null; // API key sent as header — no JWT needed

  console.log('Authenticating…');
  const resp = await axios.post(
    `${config.apiUrl}/api/auth/login`,
    { email: config.email, password: config.password },
    { validateStatus: () => true }
  );

  if (resp.status !== 200 || !resp.data?.token) {
    throw new Error(`Authentication failed (HTTP ${resp.status}): ${JSON.stringify(resp.data)}`);
  }

  console.log(`[OK] Authenticated as ${resp.data.user?.name ?? config.email}`);
  return resp.data.token as string;
}

function makeClient(config: ScriptConfig, token: string | null): AxiosInstance {
  const headers: Record<string, string> = {};
  if (token)         headers['Authorization'] = `Bearer ${token}`;
  if (config.apiKey) headers['X-API-Key']     = config.apiKey;
  return axios.create({ baseURL: config.apiUrl, headers });
}

// ── File discovery ─────────────────────────────────────────────────────────────

function discoverFiles(folder: string): string[] {
  if (!fs.existsSync(folder))          throw new Error(`Folder not found: ${folder}`);
  if (!fs.statSync(folder).isDirectory()) throw new Error(`Not a directory: ${folder}`);

  return fs.readdirSync(folder)
    .filter((f) => ['.pdf', '.csv'].includes(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => path.join(folder, f));
}

// ── Per-file import via SSE ────────────────────────────────────────────────────

async function importFile(
  filePath: string,
  client: AxiosInstance,
  config: ScriptConfig
): Promise<FileResult> {
  const fileName = path.basename(filePath);
  const isCsv    = path.extname(filePath).toLowerCase() === '.csv';

  if (isCsv && !config.columnMapping) {
    return { file: fileName, success: false, error: 'CSV file requires --column-mapping' };
  }

  // Build multipart form
  const form = new FormData();
  form.append('file', fs.readFileSync(filePath), {
    filename:    fileName,
    contentType: isCsv ? 'text/csv' : 'application/pdf',
  });
  form.append('account_id', config.accountId);
  form.append('view_id',    config.viewId);
  if (config.dryRun) form.append('dry_run', 'true');
  if (isCsv && config.columnMapping) {
    form.append('column_mapping', JSON.stringify(config.columnMapping));
  }
  if (!isCsv && config.categorize) {
    form.append('categorize', 'true');
    // Pass whichever identifier was supplied — server resolves name → ID
    const entityRef = config.legalEntityId ?? config.legalEntityName!;
    form.append('legal_entity_id', entityRef);
  }

  // Collect SSE events in an array so TypeScript doesn't narrow the type through callbacks.
  const sseEvents: Record<string, any>[] = [];

  try {
    const response = await client.post(
      '/api/posting/custom/import-bank-statement',
      form,
      {
        headers:      { ...form.getHeaders() },
        responseType: 'stream',
        timeout:      120_000,
      }
    );

    await new Promise<void>((resolve, reject) => {
      let buffer = '';

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: Record<string, any> = JSON.parse(line.slice(6));
            sseEvents.push(event);

            if (config.verbose) {
              const tag = event.step ?? event.type ?? '?';
              console.log(`    [${tag}] ${event.message ?? JSON.stringify(event)}`);
            } else if (event.step && event.step !== 'complete' && event.step !== 'error') {
              process.stdout.write(`  ${event.message ?? event.step}…\r`);
            }
          } catch { /* non-JSON SSE comment line */ }
        }
      });

      response.data.on('end',   resolve);
      response.data.on('error', reject);
    });

  } catch (err: any) {
    // HTTP-level error (4xx / 5xx before SSE headers were flushed)
    const status  = err?.response?.status;
    const body    = err?.response?.data ?? err?.message ?? String(err);
    return { file: fileName, success: false, error: `HTTP ${status ?? '?'}: ${JSON.stringify(body)}` };
  }

  const errorEvent  = sseEvents.find((e) => e.step === 'error');
  if (errorEvent) {
    return { file: fileName, success: false, error: errorEvent.message ?? errorEvent.error };
  }

  const doneEvent = sseEvents.find((e) => e.step === 'complete' || e.type === 'result');
  const count = doneEvent?.count ?? sseEvents.reduce((m, e) => (e.count != null ? Number(e.count) : m), 0);
  return { file: fileName, success: true, transactionCount: count };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Bank Statement Import');
  console.log('='.repeat(60));

  const config = parseArgs();
  if (config.dryRun) console.log('\n[DRY RUN] No data will be inserted.\n');

  const token  = await authenticate(config);
  const client = makeClient(config, token);
  const files  = discoverFiles(config.folder);

  if (files.length === 0) {
    console.log(`No PDF or CSV files found in: ${config.folder}`);
    process.exit(0);
  }

  console.log(`\nFound ${files.length} file(s) in: ${config.folder}`);
  if (config.columnMapping) {
    console.log(`Column mapping : ${JSON.stringify(config.columnMapping)}`);
  }
  if (config.categorize) {
    const entity = config.legalEntityId ?? config.legalEntityName;
    console.log(`Categorisation : enabled (entity: ${entity})`);
  }

  const results: FileResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    console.log(`\n[${i + 1}/${files.length}] ${path.basename(filePath)}`);

    const result = await importFile(filePath, client, config);
    results.push(result);

    if (result.success) {
      const verb = config.dryRun ? 'Would import' : 'Imported';
      console.log(`  [OK] ${verb} ${result.transactionCount ?? 0} transaction(s)`);
    } else {
      console.error(`  [FAIL] ${result.error}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const ok    = results.filter((r) =>  r.success);
  const fail  = results.filter((r) => !r.success);
  const total = ok.reduce((s, r) => s + (r.transactionCount ?? 0), 0);

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Files : ${results.length} total, ${ok.length} succeeded, ${fail.length} failed`);
  console.log(`Rows  : ${total} ${config.dryRun ? '(dry run — not inserted)' : 'imported'}`);

  if (fail.length > 0) {
    console.log('\nFailed:');
    fail.forEach((r) => console.log(`  ${r.file} — ${r.error}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
