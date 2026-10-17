/**
 * Domain registration. The kernel reads these exports.
 * The shell leaves them empty. A domain fills this file.
 */

export type DomainSqlTable = {
  name: string;
  tenancy: 'private' | 'shareable';
};

export type DomainAction = (...args: any[]) => any;

export interface DomainActionBinding {
  fields: string[];
  method: DomainAction;
}

export type ReportHandler = (
  context: unknown,
  reportId: string,
  filters: unknown
) => Promise<unknown>;

export type DomainModelDescriptor = {
  name: string;
  description: string;
  businessContext: string;
  examples: string[];
  synonyms: string[];
};

/** Tables the analytics allowlist adds to the kernel tables. */
export const DOMAIN_SQL_TABLES: readonly DomainSqlTable[] = [
  { name: 'account', tenancy: 'private' },
  { name: 'posting', tenancy: 'private' },
  { name: 'entity', tenancy: 'private' },
  { name: 'ext_connection', tenancy: 'private' },
  { name: 'ext_transaction', tenancy: 'private' },
  { name: 'invoice', tenancy: 'private' },
  { name: 'payment_receipt', tenancy: 'private' },
  { name: 'credit_note', tenancy: 'private' },
  { name: 'trade', tenancy: 'private' },
  { name: 'holding', tenancy: 'private' },
  { name: 'budget_period', tenancy: 'private' },
  { name: 'general_ledger', tenancy: 'private' },
  { name: 'purchase_requisition', tenancy: 'private' },
  { name: 'purchase_order', tenancy: 'private' },
  { name: 'item_master', tenancy: 'private' },
  { name: 'project_master', tenancy: 'private' },
];

/** Models that start a workflow instance on create. */
export const DOMAIN_WORKFLOW_MODELS: readonly string[] = [];

/** Used when a session has no goal model. */
export const DEFAULT_GOAL_MODEL = 'posting';

/** Extra models named in the system prompt for a goal model. */
export const RELATED_MODELS: Record<string, readonly string[]> = {};

/** Product sentences appended to the kernel prompt. */
export const PROMPT_EXAMPLES = '';

/** Model descriptions the agent uses for a domain. */
export const DOMAIN_MODEL_REGISTRY: Record<string, DomainModelDescriptor> = {
  account: {
    name: 'account',
    description: 'Chart of accounts',
    businessContext: 'An account is one line of the chart. classification is asset, liability, equity, income, or expense. code is unique per org.',
    examples: ['List expense accounts', 'Find the bank account by code'],
    synonyms: ['chart of accounts', 'gl account', 'ledger account'],
  },
  posting: {
    name: 'posting',
    description: 'A transaction with a debit account and a credit account',
    businessContext: 'amount is positive. debit_account_id is the debit side and credit_account_id is the credit side. value_date is the accounting date. posting_date is the statement date. kind is opening, duplicate, journal, reversal, sales_invoice, or closing. status is active or reversed.',
    examples: ['Show transactions for an account this month', 'Find uncategorized postings'],
    synonyms: ['transaction', 'journal entry', 'ledger line'],
  },
};

/** Field keys a posting import row may send. Anything else is dropped before create. */
export const DOMAIN_IMPORT_FIELD_KEYS: readonly string[] = [
  'name',
  'description',
  'account_name',
  'notes',
  'category_name',
  'value_date',
  'posting_date',
  'amount',
  'debit_account_id',
  'credit_account_id',
  'entity_id',
  'kind',
  'status',
  'reconciliation_status',
];

export function normalizeAnalyticsSql(query: string, _auth?: unknown, _toolContext?: unknown): string {
  return query;
}

/** Post-write hooks keyed by model or "model.relation". */
export const functionMap: Record<string, DomainActionBinding> = {};

/** Workflow side effects keyed by handler name. */
export const workflowActionMap: Record<string, (...args: any[]) => any> = {};

/** Report id → handler. */
export const reportHandlers: Record<string, ReportHandler> = {};

export function registerDomainBuilders(
  _actionRegistry: { register: (builder: any) => void },
  _reportRegistry: { register: (formatter: any) => void }
) {}
