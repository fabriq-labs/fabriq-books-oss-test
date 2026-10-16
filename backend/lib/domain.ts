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
export const DOMAIN_SQL_TABLES: readonly DomainSqlTable[] = [];

/** Models that start a workflow instance on create. */
export const DOMAIN_WORKFLOW_MODELS: readonly string[] = [];

/** Used when a session has no goal model. */
export const DEFAULT_GOAL_MODEL = '';

/** Extra models named in the system prompt for a goal model. */
export const RELATED_MODELS: Record<string, readonly string[]> = {};

/** Product sentences appended to the kernel prompt. */
export const PROMPT_EXAMPLES = '';

/** Model descriptions the agent uses for a domain. */
export const DOMAIN_MODEL_REGISTRY: Record<string, DomainModelDescriptor> = {};

/** Field keys a domain import mapping accepts. */
export const DOMAIN_IMPORT_FIELD_KEYS: readonly string[] = [];

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
