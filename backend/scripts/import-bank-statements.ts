#!/usr/bin/env ts-node
/**
 * Bank Statement Import Script
 *
 * Imports bank statements (PDF or CSV) from a folder and uploads them to the system.
 *
 * Usage:
 *   npx ts-node scripts/import-bank-statements.ts \
 *     --email user@example.com \
 *     --password yourpassword \
 *     --folder ./statements \
 *     --account-id <uuid>
 *
 * Options:
 *   --email, -e       User email for authentication (required)
 *   --password, -p    User password for authentication (required)
 *   --folder, -f      Path to folder containing statement files (required)
 *   --account-id, -a  Account ID to associate with transactions (required)
 *   --api-url, -u     Backend API URL (default: http://localhost:4000)
 *   --view-id, -v     View ID for posting (default: posting_view)
 *   --dry-run, -d     Test without importing (just parse and validate)
 *   --verbose         Enable detailed logging
 *
 * Examples:
 *   # Canada checking account
 *   npx ts-node scripts/import-bank-statements.ts -u https://demo-backend-fabriq-us-east-production.up.railway.app -e 'anusha@metalimits.com' -p 'Metalimits@123' -f /path/to/statements/canada-checking -a acco_org_rajesh_canada_1101 --verbose
 *
 *   # India saving account
 *   npx ts-node scripts/import-bank-statements.ts -u https://demo-backend-fabriq-us-east-production.up.railway.app -e 'anusha@metalimits.com' -p 'Metalimits@123' -f /path/to/statements/india-saving -a acco_org_rajesh_india_1101 --verbose
 *
 *   # Canada credit card
 *   npx ts-node scripts/import-bank-statements.ts -u https://demo-backend-fabriq-us-east-production.up.railway.app -e 'anusha@metalimits.com' -p 'Metalimits@123' -f /path/to/statements/canada-credit-card -a acco_org_rajesh_canada_2101 --verbose
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

// ============================================================================
// Types
// ============================================================================

interface ScriptConfig {
  email: string;
  password: string;
  folder: string;
  accountId: string;
  apiUrl: string;
  viewId: string;
  dryRun: boolean;
  verbose: boolean;
}

interface AuthResponse {
  user: {
    id: string;
    name: string;
    email: string;
    roles: string[];
  };
  token: string;
}

interface CategorizationResult {
  transaction_index?: number;
  index?: number;
  account_id?: string;
  predicted_account_id?: string;
  confidence_score?: number;
  [key: string]: any;
}

interface ParseDocumentResponse {
  success: boolean;
  data: {
    transactions?: TransactionRecord[];
    categorizations?: CategorizationResult[];
    [key: string]: any;
  };
  categorizations?: CategorizationResult[]; // Also support at top level
  metaData?: {
    confidence?: number;
    processingTime?: number;
    fileName?: string;
    [key: string]: any;
  };
  error?: string;
}

interface TransactionRecord {
  value_date?: string;
  posting_date?: string;
  description?: string;
  debit_amount?: number;
  credit_amount?: number;
  amount?: number;
  balance?: number;
  reference?: string;
  category_id?: string;
  category_name?: string;
  account_id?: string;
  credit_account_id?: string;
  predicted_account_id?: string; // AI-predicted account ID from categorizations
  [key: string]: any;
}

/**
 * Posting record with debit/credit accounts properly mapped
 */
interface MappedPostingRecord extends TransactionRecord {
  account_id?: string;
  credit_account_id?: string;
}

interface UploadResponse {
  success: boolean;
  message?: string;
  data?: {
    count: number;
  };
  error?: string;
}

interface FileResult {
  file: string;
  success: boolean;
  transactionCount?: number;
  error?: string;
}

interface ImportSummary {
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalTransactions: number;
  results: FileResult[];
}

// ============================================================================
// Utilities
// ============================================================================

function log(message: string, verbose: boolean = false, config?: ScriptConfig): void {
  if (!verbose || config?.verbose) {
    console.log(message);
  }
}

function logVerbose(message: string, config: ScriptConfig): void {
  if (config.verbose) {
    console.log(`  [verbose] ${message}`);
  }
}

function logError(message: string): void {
  console.error(`[ERROR] ${message}`);
}

function logSuccess(message: string): void {
  console.log(`[SUCCESS] ${message}`);
}

function logProgress(current: number, total: number, fileName: string): void {
  console.log(`\n[${current}/${total}] Processing: ${fileName}`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): ScriptConfig {
  const args = process.argv.slice(2);
  const config: Partial<ScriptConfig> = {
    apiUrl: 'http://localhost:4000',
    viewId: 'posting_view',
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--email':
      case '-e':
        config.email = nextArg;
        i++;
        break;
      case '--password':
      case '-p':
        config.password = nextArg;
        i++;
        break;
      case '--folder':
      case '-f':
        config.folder = nextArg;
        i++;
        break;
      case '--account-id':
      case '-a':
        config.accountId = nextArg;
        i++;
        break;
      case '--api-url':
      case '-u':
        config.apiUrl = nextArg;
        i++;
        break;
      case '--view-id':
      case '-v':
        config.viewId = nextArg;
        i++;
        break;
      case '--dry-run':
      case '-d':
        config.dryRun = true;
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  // Validate required arguments
  const missing: string[] = [];
  if (!config.email) missing.push('--email');
  if (!config.password) missing.push('--password');
  if (!config.folder) missing.push('--folder');
  if (!config.accountId) missing.push('--account-id');

  if (missing.length > 0) {
    logError(`Missing required arguments: ${missing.join(', ')}`);
    printUsage();
    process.exit(1);
  }

  // Resolve folder path
  config.folder = path.resolve(config.folder!);

  return config as ScriptConfig;
}

function printUsage(): void {
  console.log(`
Bank Statement Import Script

Usage:
  npx ts-node scripts/import-bank-statements.ts [options]

Required Options:
  --email, -e       User email for authentication
  --password, -p    User password for authentication
  --folder, -f      Path to folder containing statement files (PDF/CSV)
  --account-id, -a  Account ID to associate with all transactions

Optional:
  --api-url, -u     Backend API URL (default: http://localhost:4000)
  --view-id, -v     View ID for posting (default: posting_view)
  --dry-run, -d     Test without importing (parse and validate only)
  --verbose         Enable detailed logging
  --help, -h        Show this help message

Examples:
  npx ts-node scripts/import-bank-statements.ts \\
    --email user@example.com \\
    --password mypassword \\
    --folder ./bank-statements \\
    --account-id 12345678-1234-1234-1234-123456789abc

  npx ts-node scripts/import-bank-statements.ts \\
    -e user@example.com -p mypassword -f ./statements -a <uuid> --dry-run --verbose

  # Canada checking account
  npx ts-node scripts/import-bank-statements.ts -u https://demo-backend-fabriq-us-east-production.up.railway.app -e 'anusha@metalimits.com' -p 'Metalimits@123' -f /path/to/statements/canada-checking -a acco_org_rajesh_canada_1101 --verbose

  # India saving account
  npx ts-node scripts/import-bank-statements.ts -u https://demo-backend-fabriq-us-east-production.up.railway.app -e 'anusha@metalimits.com' -p 'Metalimits@123' -f /path/to/statements/india-saving -a acco_org_rajesh_india_1101 --verbose

  # Canada credit card
  npx ts-node scripts/import-bank-statements.ts -u https://demo-backend-fabriq-us-east-production.up.railway.app -e 'anusha@metalimits.com' -p 'Metalimits@123' -f /path/to/statements/canada-credit-card -a acco_org_rajesh_canada_2101 --verbose
`);
}

// ============================================================================
// Authentication
// ============================================================================

/**
 * Test if the API endpoint is accessible
 */
async function testEndpoint(apiUrl: string, verbose: boolean): Promise<void> {
  // Normalize API URL (same logic as authenticate)
  let normalizedUrl = apiUrl.replace(/\/$/, '');
  if (normalizedUrl.endsWith('/api')) {
    normalizedUrl = normalizedUrl.replace(/\/api$/, '');
  }
  const testUrl = `${normalizedUrl}/api/auth/login`;
  
  if (verbose) {
    logVerbose(`Testing endpoint accessibility: ${testUrl}`, { verbose } as ScriptConfig);
  }
  
  try {
    // Try a HEAD request first to see if the endpoint exists
    await axios.head(testUrl, { 
      timeout: 5000,
      validateStatus: () => true // Accept any status for HEAD
    });
  } catch (error) {
    // HEAD might not be supported, that's okay
    if (verbose && axios.isAxiosError(error)) {
      logVerbose(`HEAD request result: ${error.message}`, { verbose } as ScriptConfig);
    }
  }
}

async function authenticate(config: ScriptConfig): Promise<string> {
  log('Authenticating...', false);
  
  // Normalize API URL (remove trailing slash if present)
  let apiUrl = config.apiUrl.replace(/\/$/, '');
  
  // If API URL already includes /api, don't add it again
  // This handles cases where user provides http://example.com/api
  if (apiUrl.endsWith('/api')) {
    apiUrl = apiUrl.replace(/\/api$/, '');
    logVerbose(`Detected /api in URL, normalizing to: ${apiUrl}`, config);
  }
  
  const loginUrl = `${apiUrl}/api/auth/login`;
  
  logVerbose(`API URL: ${apiUrl}`, config);
  logVerbose(`Login URL: ${loginUrl}`, config);
  logVerbose(`Email: ${config.email}`, config);

  try {
    const response = await axios.post<AuthResponse>(
      loginUrl,
      {
        email: config.email,
        password: config.password,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      }
    );

    // Check for error status codes
    if (response.status === 401) {
      throw new Error('Authentication failed: Invalid credentials');
    }
    
    if (response.status === 405) {
      logVerbose(`Response status: ${response.status}`, config);
      logVerbose(`Response headers: ${JSON.stringify(response.headers)}`, config);
      logVerbose(`Response data: ${JSON.stringify(response.data)}`, config);
      throw new Error(`Authentication failed: Method Not Allowed (405). The endpoint ${loginUrl} may not accept POST requests. Please verify the API URL and endpoint path.`);
    }
    
    if (response.status >= 400) {
      logVerbose(`Response status: ${response.status}`, config);
      logVerbose(`Response data: ${JSON.stringify(response.data)}`, config);
      throw new Error(`Authentication failed: HTTP ${response.status} - ${JSON.stringify(response.data)}`);
    }

    if (!response.data.token) {
      logVerbose(`Response data: ${JSON.stringify(response.data)}`, config);
      throw new Error('No token received from authentication');
    }

    logSuccess(`Authenticated as ${response.data.user.name} (${response.data.user.email})`);
    logVerbose(`Roles: ${response.data.user.roles.join(', ')}`, config);

    return response.data.token;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error: string }>;
      
      // Network errors
      if (!axiosError.response) {
        logVerbose(`Network error: ${axiosError.message}`, config);
        logVerbose(`Request URL: ${loginUrl}`, config);
        throw new Error(`Authentication failed: Network error - ${axiosError.message}. Please check if the API server is accessible at ${apiUrl}`);
      }
      
      // HTTP errors
      const status = axiosError.response.status;
      const statusText = axiosError.response.statusText;
      const responseData = axiosError.response.data;
      
      logVerbose(`HTTP Error ${status}: ${statusText}`, config);
      logVerbose(`Response data: ${JSON.stringify(responseData)}`, config);
      logVerbose(`Request URL: ${loginUrl}`, config);
      
      if (status === 401) {
        throw new Error('Authentication failed: Invalid credentials');
      }
      
      if (status === 405) {
        const allowHeader = axiosError.response.headers['allow'] || axiosError.response.headers['Allow'] || '';
        const serverHeader = axiosError.response.headers['server'] || axiosError.response.headers['Server'] || '';
        
        // Check if this is a Railway Edge routing issue
        if (serverHeader.includes('railway-edge') && allowHeader.includes('GET, HEAD')) {
          throw new Error(
            `Authentication failed: Railway Edge routing issue detected.\n\n` +
            `The server is returning 405 Method Not Allowed with "allow: GET, HEAD", which indicates\n` +
            `that Railway Edge is serving the frontend application instead of routing API requests\n` +
            `to the backend service.\n\n` +
            `Possible solutions:\n` +
            `1. Check Railway project configuration - ensure backend service is properly configured\n` +
            `2. Verify that /api/* routes are proxied to the backend service, not the frontend\n` +
            `3. Check if backend service has a direct URL (e.g., backend-service.railway.app)\n` +
            `4. Review Railway service routing rules in the Railway dashboard\n\n` +
            `Current request URL: ${loginUrl}\n` +
            `Server: ${serverHeader}\n` +
            `Allowed methods: ${allowHeader}`
          );
        }
        
        throw new Error(`Authentication failed: Method Not Allowed (405). The endpoint ${loginUrl} may not accept POST requests. Please verify:\n  1. The API URL is correct: ${apiUrl}\n  2. The endpoint path is correct: /api/auth/login\n  3. The server is running and accessible`);
      }
      
      throw new Error(`Authentication failed: HTTP ${status} ${statusText} - ${JSON.stringify(responseData) || axiosError.message}`);
    }
    throw error;
  }
}

// ============================================================================
// File Discovery
// ============================================================================

function discoverFiles(folder: string): string[] {
  if (!fs.existsSync(folder)) {
    throw new Error(`Folder does not exist: ${folder}`);
  }

  const stats = fs.statSync(folder);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${folder}`);
  }

  const files = fs.readdirSync(folder);
  const supportedFiles: string[] = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.pdf' || ext === '.csv') {
      supportedFiles.push(path.join(folder, file));
    }
  }

  // Sort by filename for consistent ordering
  supportedFiles.sort();

  return supportedFiles;
}

// ============================================================================
// PDF Processing
// ============================================================================

async function processPdfFile(
  filePath: string,
  client: AxiosInstance,
  config: ScriptConfig
): Promise<TransactionRecord[]> {
  logVerbose(`Reading PDF file: ${filePath}`, config);

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  // Fetch account to get legal_entity_id for categorization
  let legalEntityId: string | undefined;
  try {
    logVerbose(`Fetching account ${config.accountId} to get legal_entity_id...`, config);
    const accountResponse = await client.get(`/api/account/${config.accountId}/view/account_view`);
    legalEntityId = accountResponse.data?.data?.legal_entity_id;
    console.log(accountResponse.data);
    logVerbose(`Found legal_entity_id: ${legalEntityId || 'NOT FOUND'}`, config);
  } catch (error) {
    logVerbose(`Warning: Could not fetch account for legal_entity_id: ${error instanceof Error ? error.message : String(error)}`, config);
    logVerbose(`Categorization may not work without legal_entity_id`, config);
  }

  const formData = new FormData();
  formData.append('file', fileBuffer, {
    filename: fileName,
    contentType: 'application/pdf',
  });

  // Add legalEntityId to FormData if available (matching frontend behavior)
  if (legalEntityId) {
    formData.append('legalEntityId', legalEntityId);
    logVerbose(`Added legalEntityId to FormData: ${legalEntityId}`, config);
  } else {
    throw new Error('No legalEntityId provided');
  }

  logVerbose(`Uploading PDF for parsing (${(fileBuffer.length / 1024).toFixed(2)} KB)...`, config);
  logVerbose(`Using endpoint: /api/parse-document/posting_with_categorization`, config);

  // Use posting_with_categorization as the model name in the path (matching frontend)
  const response = await client.post<ParseDocumentResponse>(
    `/api/parse-document/posting_with_categorization`,
    formData,
    {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );

  // Print full response for debugging
  console.log('\n' + '='.repeat(60));
  console.log('PDF PARSING RESPONSE');
  console.log('='.repeat(60));
  console.log(JSON.stringify(response.data, null, 2));
  console.log('='.repeat(60) + '\n');

  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to parse PDF document');
  }

  logVerbose(`Parse confidence: ${response.data.metaData?.confidence || 'N/A'}`, config);
  logVerbose(`Processing time: ${response.data.metaData?.processingTime || 'N/A'}ms`, config);

  // Check for categorizations in response
  const categorizations = response.data.data?.categorizations || response.data.categorizations;
  if (categorizations && Array.isArray(categorizations)) {
    log(`  Found ${categorizations.length} AI categorization(s)`, false);
    logVerbose(`Categorizations: ${JSON.stringify(categorizations, null, 2)}`, config);
  } else {
    log(`  WARNING: No categorizations found in response`, false);
    logVerbose(`Response data keys: ${Object.keys(response.data.data || {}).join(', ')}`, config);
    logVerbose(`This may indicate that categorization was not performed.`, config);
    logVerbose(`Ensure legalEntityId is provided and documentType is 'posting_with_categorization'`, config);
  }

  // Extract transactions from the response
  const transactions = response.data.data?.transactions || [];

  if (Array.isArray(response.data.data) && !transactions.length) {
    // If data is directly an array of transactions
    return response.data.data as TransactionRecord[];
  }

  // Attach categorizations to transactions for later use
  if (categorizations && Array.isArray(categorizations)) {
    // Create a map of categorizations by transaction index
    const catMap = new Map<number, any>();
    categorizations.forEach((cat: any, catIndex: number) => {
      const index = cat.transaction_index ?? cat.index ?? catIndex;
      if (index >= 0 && cat.confidence_score >= 0.5) {
        // Use account_id or predicted_account_id from categorization
        const accountId = cat.account_id || cat.predicted_account_id;
        if (accountId) {
          catMap.set(index, accountId);
        }
      }
    });

    // Attach predicted account IDs to transactions
    transactions.forEach((transaction: any, index: number) => {
      const predictedAccountId = catMap.get(index);
      if (predictedAccountId) {
        transaction.predicted_account_id = predictedAccountId;
        logVerbose(`Transaction ${index + 1}: Predicted account ID = ${predictedAccountId}`, config);
      }
    });
  }

  return transactions;
}

// ============================================================================
// CSV Processing
// ============================================================================

async function processCsvFile(
  filePath: string,
  config: ScriptConfig
): Promise<TransactionRecord[]> {
  logVerbose(`Reading CSV file: ${filePath}`, config);

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  // Parse header
  const header = parseCSVLine(lines[0]);
  logVerbose(`CSV columns: ${header.join(', ')}`, config);

  // Parse data rows
  const transactions: TransactionRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const record: TransactionRecord = {};
    for (let j = 0; j < header.length && j < values.length; j++) {
      const key = header[j].toLowerCase().trim();
      const value = values[j].trim();

      // Map common CSV column names to standard fields
      const mappedKey = mapCsvColumnName(key);
      record[mappedKey] = parseFieldValue(mappedKey, value);
    }

    transactions.push(record);
  }

  return transactions;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function mapCsvColumnName(column: string): string {
  const mappings: Record<string, string> = {
    'date': 'value_date',
    'transaction date': 'value_date',
    'trans date': 'value_date',
    'value date': 'value_date',
    'posting date': 'posting_date',
    'description': 'description',
    'narration': 'description',
    'particulars': 'description',
    'details': 'description',
    'amount': 'amount',
    'debit': 'debit_amount',
    'debit amount': 'debit_amount',
    'withdrawal': 'debit_amount',
    'credit': 'credit_amount',
    'credit amount': 'credit_amount',
    'deposit': 'credit_amount',
    'balance': 'balance',
    'running balance': 'balance',
    'reference': 'reference',
    'ref': 'reference',
    'ref no': 'reference',
    'reference number': 'reference',
    'cheque no': 'reference',
    'chq no': 'reference',
    'category': 'category_name',
  };

  return mappings[column] || column.replace(/\s+/g, '_');
}

function parseFieldValue(field: string, value: string): any {
  if (!value || value === '' || value === '-') {
    return null;
  }

  // Parse date fields
  if (field === 'value_date' || field === 'posting_date') {
    return parseDate(value);
  }

  // Parse numeric fields
  if (field === 'amount' || field === 'debit_amount' || field === 'credit_amount' || field === 'balance') {
    return parseNumber(value);
  }

  return value;
}

function parseDate(value: string): string | null {
  if (!value) return null;

  // Try common date formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
    /^(\d{2})\/(\d{2})\/(\d{2})$/, // DD/MM/YY
  ];

  // For YYYY-MM-DD format
  if (formats[0].test(value)) {
    return value;
  }

  // For DD/MM/YYYY format
  const match1 = value.match(formats[1]);
  if (match1) {
    return `${match1[3]}-${match1[2]}-${match1[1]}`;
  }

  // For DD-MM-YYYY format
  const match2 = value.match(formats[2]);
  if (match2) {
    return `${match2[3]}-${match2[2]}-${match2[1]}`;
  }

  // For DD/MM/YY format
  const match3 = value.match(formats[3]);
  if (match3) {
    const year = parseInt(match3[3]) > 50 ? `19${match3[3]}` : `20${match3[3]}`;
    return `${year}-${match3[2]}-${match3[1]}`;
  }

  return value; // Return as-is if no format matches
}

function parseNumber(value: string): number | null {
  if (!value) return null;

  // Remove currency symbols, commas, and spaces
  const cleaned = value.replace(/[₹$€£,\s]/g, '').trim();

  if (cleaned === '' || cleaned === '-') {
    return null;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ============================================================================
// Debit/Credit Account Mapping
// ============================================================================

/**
 * Apply debit/credit account mapping based on bank statement conventions.
 *
 * When an account (bank/credit card) is pre-selected:
 *
 * - Credit Amount > 0 (deposit/payment received):
 *   - Selected account goes to `account_id` (debit side - asset increases)
 *   - Contra account (from categorization) goes to `credit_account_id`
 *
 * - Debit Amount > 0 (withdrawal/spending):
 *   - Selected account goes to `credit_account_id` (credit side - asset decreases)
 *   - Contra account (from categorization) goes to `account_id`
 *
 * This logic is account-type agnostic and works for both asset accounts (bank)
 * and liability accounts (credit cards).
 */
function applyDebitCreditMapping(
  transactions: TransactionRecord[],
  selectedAccountId: string,
  config: ScriptConfig
): MappedPostingRecord[] {
  logVerbose('Applying debit/credit account mapping...', config);

  return transactions.map((transaction, index) => {
    const mapped: MappedPostingRecord = { ...transaction };

    const creditAmount = transaction.credit_amount || 0;
    const debitAmount = transaction.debit_amount || 0;

    // Get contra account from AI categorization (predicted_account_id) or fallback to category_id
    // Matching frontend behavior: use predicted account ID from categorizations with confidence >= 0.5
    const contraAccountId = transaction.predicted_account_id || transaction.category_id || null;

    if (creditAmount > 0) {
      // Credit on statement (deposit/payment received)
      // Selected account is debited (asset increases or liability decreases)
      mapped.account_id = selectedAccountId;
      mapped.credit_account_id = contraAccountId || undefined;

      logVerbose(
        `  [${index + 1}] Credit ${creditAmount}: account_id=${selectedAccountId}, credit_account_id=${contraAccountId || 'null'}`,
        config
      );
    } else if (debitAmount > 0) {
      // Debit on statement (withdrawal/spending)
      // Selected account is credited (asset decreases or liability increases)
      mapped.credit_account_id = selectedAccountId;
      mapped.account_id = contraAccountId || undefined;

      logVerbose(
        `  [${index + 1}] Debit ${debitAmount}: account_id=${contraAccountId || 'null'}, credit_account_id=${selectedAccountId}`,
        config
      );
    } else if (transaction.amount) {
      // Handle single amount field (positive = credit, negative = debit)
      const amount = transaction.amount;
      if (amount > 0) {
        // Positive amount = credit (deposit)
        mapped.account_id = selectedAccountId;
        mapped.credit_account_id = contraAccountId || undefined;
        mapped.credit_amount = amount;

        logVerbose(
          `  [${index + 1}] Amount +${amount}: account_id=${selectedAccountId}, credit_account_id=${contraAccountId || 'null'}`,
          config
        );
      } else if (amount < 0) {
        // Negative amount = debit (withdrawal)
        mapped.credit_account_id = selectedAccountId;
        mapped.account_id = contraAccountId || undefined;
        mapped.debit_amount = Math.abs(amount);

        logVerbose(
          `  [${index + 1}] Amount ${amount}: account_id=${contraAccountId || 'null'}, credit_account_id=${selectedAccountId}`,
          config
        );
      }
    } else {
      // No amount specified, skip mapping but log warning
      logVerbose(`  [${index + 1}] Warning: No debit_amount, credit_amount, or amount found`, config);
    }

    return mapped;
  });
}

// ============================================================================
// Data Upload
// ============================================================================

async function uploadTransactions(
  transactions: TransactionRecord[],
  client: AxiosInstance,
  config: ScriptConfig
): Promise<number> {
  if (transactions.length === 0) {
    logVerbose('No transactions to upload', config);
    return 0;
  }

  logVerbose(`Preparing ${transactions.length} transactions for upload...`, config);

  // Apply debit/credit account mapping based on bank statement conventions
  const mappedTransactions = applyDebitCreditMapping(transactions, config.accountId, config);

  // Transform data to match frontend updateCSVData transformation
  // Remove debit_amount/credit_amount and create single amount field
  const transformedData = mappedTransactions.map((record: any) => {
    const hasDebitAmount = record.debit_amount != null && 
      record.debit_amount != undefined && 
      record.debit_amount != 0 && 
      record.debit_amount !== '';
    
    const hasCreditAmount = record.credit_amount != null && 
      record.credit_amount != undefined && 
      record.credit_amount != 0 && 
      record.credit_amount !== '';

    // Create final record with single amount field (matching frontend transformation)
    const finalRecord: any = {
      ...record,
      // Use debit_amount or credit_amount as the single amount field
      amount: hasDebitAmount ? record.debit_amount : (hasCreditAmount ? record.credit_amount : record.amount || null),
    };

    // Remove debit_amount and credit_amount fields (not accepted by backend)
    delete finalRecord.debit_amount;
    delete finalRecord.credit_amount;
    
    // Remove other fields that shouldn't be sent or don't exist in posting model
    delete finalRecord.category_id;
    delete finalRecord.category_name;
    delete finalRecord.predicted_account_id; // Already applied to account_id/credit_account_id
    delete finalRecord.balance; // Running balance not needed
    delete finalRecord.account_name; // Only IDs are needed
    delete finalRecord.reference; // Not a valid field in posting model

    // Only keep valid posting model fields
    // Valid fields: name, description, value_date, posting_date, amount, account_id, credit_account_id, notes
    const validFields = ['name', 'description', 'value_date', 'posting_date', 'amount', 'account_id', 'credit_account_id', 'notes'];
    const cleanedRecord: any = {};
    validFields.forEach(field => {
      if (finalRecord.hasOwnProperty(field) && finalRecord[field] !== null && finalRecord[field] !== undefined) {
        cleanedRecord[field] = finalRecord[field];
      }
    });

    return cleanedRecord;
  });

  // Build mapping - only include fields that exist in transformed data
  const mapping: Record<string, string> = {};
  const sampleRecord = transformedData[0];

  // Only map valid posting model fields
  // Valid fields: name, description, value_date, posting_date, amount, account_id, credit_account_id, notes
  const validFields = ['name', 'description', 'value_date', 'posting_date', 'amount', 'account_id', 'credit_account_id', 'notes'];
  
  validFields.forEach(field => {
    if (sampleRecord.hasOwnProperty(field)) {
      mapping[field] = field;
    }
  });

  const uploadData = {
    data: transformedData,
    mapping,
    // Note: We don't set account_id in parentData since it's set per-transaction
    // based on whether it's a debit or credit transaction
  };

  logVerbose(`Upload payload size: ${JSON.stringify(uploadData).length} bytes`, config);
  logVerbose(`Mapping: ${JSON.stringify(mapping)}`, config);

  const response = await client.post<UploadResponse>(
    `/api/posting/view/${config.viewId}/upload`,
    uploadData,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to upload transactions');
  }

  return response.data.data?.count || mappedTransactions.length;
}

// ============================================================================
// Main Processing
// ============================================================================

async function processFile(
  filePath: string,
  client: AxiosInstance,
  config: ScriptConfig
): Promise<FileResult> {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  try {
    let transactions: TransactionRecord[];

    if (ext === '.pdf') {
      transactions = await processPdfFile(filePath, client, config);
    } else if (ext === '.csv') {
      transactions = await processCsvFile(filePath, config);
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    log(`  Found ${transactions.length} transaction(s)`, false);

    if (config.dryRun) {
      // In dry run mode, still apply mapping to show what would happen
      const mappedTransactions = applyDebitCreditMapping(transactions, config.accountId, config);

      // Count credits and debits
      const credits = mappedTransactions.filter(t => t.credit_amount && t.credit_amount > 0).length;
      const debits = mappedTransactions.filter(t => t.debit_amount && t.debit_amount > 0).length;

      log(`  [DRY RUN] Would upload ${transactions.length} transaction(s)`, false);
      log(`    - Credits (deposits): ${credits} -> account_id = selected account`, false);
      log(`    - Debits (withdrawals): ${debits} -> credit_account_id = selected account`, false);

      return {
        file: fileName,
        success: true,
        transactionCount: transactions.length,
      };
    }

    const uploadedCount = await uploadTransactions(transactions, client, config);
    logSuccess(`Uploaded ${uploadedCount} transaction(s)`);

    return {
      file: fileName,
      success: true,
      transactionCount: uploadedCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`Failed to process ${fileName}: ${errorMessage}`);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error: string; details?: string }>;
      logVerbose(`HTTP Status: ${axiosError.response?.status}`, config);
      logVerbose(`Response: ${JSON.stringify(axiosError.response?.data)}`, config);
    }

    return {
      file: fileName,
      success: false,
      error: errorMessage,
    };
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Bank Statement Import Script');
  console.log('='.repeat(60));

  // Parse arguments
  const config = parseArgs();

  if (config.dryRun) {
    console.log('\n[DRY RUN MODE] No data will be imported\n');
  }

  // Discover files
  log(`\nScanning folder: ${config.folder}`, false);
  const files = discoverFiles(config.folder);

  if (files.length === 0) {
    logError('No PDF or CSV files found in the specified folder');
    process.exit(1);
  }

  log(`Found ${files.length} file(s) to process:`, false);
  files.forEach(f => log(`  - ${path.basename(f)}`, false));

  // Test endpoint accessibility (verbose mode only)
  if (config.verbose) {
    try {
      await testEndpoint(config.apiUrl, config.verbose);
    } catch (error) {
      // Non-fatal, just for diagnostics
      logVerbose(`Endpoint test warning: ${error instanceof Error ? error.message : String(error)}`, config);
    }
  }

  // Authenticate
  console.log('');
  let token: string;
  try {
    token = await authenticate(config);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Create authenticated client
  const client = axios.create({
    baseURL: config.apiUrl,
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    timeout: 120000, // 2 minute timeout for large files
  });

  // Process files
  const summary: ImportSummary = {
    totalFiles: files.length,
    successfulFiles: 0,
    failedFiles: 0,
    totalTransactions: 0,
    results: [],
  };

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    logProgress(i + 1, files.length, path.basename(filePath));

    const result = await processFile(filePath, client, config);
    summary.results.push(result);

    if (result.success) {
      summary.successfulFiles++;
      summary.totalTransactions += result.transactionCount || 0;
    } else {
      summary.failedFiles++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total files:        ${summary.totalFiles}`);
  console.log(`Successful:         ${summary.successfulFiles}`);
  console.log(`Failed:             ${summary.failedFiles}`);
  console.log(`Total transactions: ${summary.totalTransactions}`);

  if (config.dryRun) {
    console.log('\n[DRY RUN] No data was actually imported');
  }

  if (summary.failedFiles > 0) {
    console.log('\nFailed files:');
    summary.results
      .filter(r => !r.success)
      .forEach(r => console.log(`  - ${r.file}: ${r.error}`));
  }

  console.log('='.repeat(60));

  // Exit with error code if any files failed
  process.exit(summary.failedFiles > 0 ? 1 : 0);
}

// Run the script
main().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
