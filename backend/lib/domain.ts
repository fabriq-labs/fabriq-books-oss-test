/**
 * Domain registration. The kernel reads these exports.
 * The shell leaves them empty. A domain fills this file.
 *
 * A todo app and the ledger use the same function names.
 * Replace the bodies. Do not add a product import under backend/src.
 */
import { Router } from 'express';
import { installEntityWriteGuard } from './gl/entityWrite';
import {
  registerGlAgentRoutes,
  registerGlExtractors,
  registerGlImportExtension,
  registerGlRoutes,
} from './gl/register';
import { registerIntegrationsRoutes } from './integrations/register';

/** Host passed by the kernel extractor registry. */
export type DomainExtractorHost = {
  registerExtractor(documentType: string, extractor: any): void;
  registerDocumentType(documentType: any): void;
};

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
  { name: 'exchange_rate', tenancy: 'private' },
  { name: 'ext_connection', tenancy: 'private' },
  { name: 'ext_transaction', tenancy: 'private' },
  { name: 'customer', tenancy: 'private' },
  { name: 'supplier', tenancy: 'private' },
  { name: 'location', tenancy: 'private' },
  { name: 'payment_terms', tenancy: 'private' },
  { name: 'uom', tenancy: 'private' },
  { name: 'item_master', tenancy: 'private' },
  { name: 'tax_region', tenancy: 'shareable' },
  { name: 'party_tax_registration', tenancy: 'private' },
  { name: 'tax_master', tenancy: 'private' },
  { name: 'tax_group', tenancy: 'private' },
  { name: 'tax_group_component', tenancy: 'private' },
  { name: 'invoice_line_tax', tenancy: 'private' },
  { name: 'entity_tax_settings', tenancy: 'private' },
  { name: 'invoice', tenancy: 'private' },
  { name: 'invoice_line_item', tenancy: 'private' },
  { name: 'payment_receipt', tenancy: 'private' },
  { name: 'payment_receipt_application', tenancy: 'private' },
  { name: 'credit_note', tenancy: 'private' },
  { name: 'credit_note_item', tenancy: 'private' },
  { name: 'credit_note_application', tenancy: 'private' },
  { name: 'credit_note_line_tax', tenancy: 'private' },
  { name: 'source_system', tenancy: 'private' },
  { name: 'trade', tenancy: 'private' },
  { name: 'holding', tenancy: 'private' },
  { name: 'budget_period', tenancy: 'private' },
  { name: 'general_ledger', tenancy: 'private' },
  { name: 'purchase_requisition', tenancy: 'private' },
  { name: 'purchase_order', tenancy: 'private' },
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
    businessContext: 'amount is positive. debit_account_id is the debit side and credit_account_id is the credit side. value_date is the accounting date. posting_date is the statement date. kind is opening, duplicate, journal, reversal, sales_invoice, sales_credit_note, sales_receipt, sales_settlement, or closing. status is active or reversed. posting_key is the idempotent reverse-and-repost key (partial unique while status=active).',
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

/** Model import behavior. The kernel calls this at startup. */
export function registerDomainImportExtensions(): void {
  registerGlImportExtension();
}

/** Document extractors and the document-type catalog. */
export function registerDomainExtractors(registry: DomainExtractorHost): void {
  registerGlExtractors(registry as Parameters<typeof registerGlExtractors>[0]);
}

/** Extra routes on the agent router, mounted under /api/agent. */
export function registerDomainAgentRoutes(router: Router): void {
  registerGlAgentRoutes(router);
}

/** Product HTTP routes mounted on the main /api router. */
export function registerDomainRoutes(router: Router): void {
  installEntityWriteGuard();
  registerGlRoutes(router);
  registerIntegrationsRoutes(router);
}

installEntityWriteGuard();
