/**
 * Canonical agent tool catalog (checkbox labels for Super Admin UI).
 * Per-model tool assignment is loaded from agent_model_tool_config (seeded via
 * prisma/seed-agent-model-tools.sql on setup).
 */

export type ToolCatalogEntry = {
  name: string;
  label: string;
  description: string;
  category: 'crud' | 'search' | 'analytics' | 'session' | 'other';
};

/** All tools that can be assigned to a model (session tools are injected separately). */
export const AGENT_TOOL_CATALOG: ToolCatalogEntry[] = [
  { name: 'searchRecords', label: 'Search Records', description: 'Metadata-driven search on any model', category: 'search' },
  { name: 'createRecord', label: 'Create Record', description: 'Create a new record', category: 'crud' },
  { name: 'updateRecord', label: 'Update Record', description: 'Update an existing record', category: 'crud' },
  { name: 'createChildItem', label: 'Create Child Item', description: 'Add a line item to a parent record', category: 'crud' },
  { name: 'updateChildItem', label: 'Update Child Item', description: 'Update a line item on a parent record', category: 'crud' },
  { name: 'advancedSqlQuery', label: 'Advanced SQL', description: 'Permission-aware SQL for joins and aggregates', category: 'analytics' },
  { name: 'getAnalyticsContext', label: 'Analytics Context', description: 'Schema and relationship context for analytics', category: 'analytics' },
  { name: 'analyticsQuery', label: 'Analytics Query', description: 'Run analytical SQL queries', category: 'analytics' },
  { name: 'searchUsers', label: 'Search Users', description: 'Search users', category: 'search' },
  { name: 'queueActions', label: 'Queue Actions', description: 'Queue pending actions for human review (sessions)', category: 'session' },
  { name: 'requestClarification', label: 'Request Clarification', description: 'Ask the user a structured question (sessions)', category: 'session' },
];

/** model_name in agent_model_tool_config for unlisted page models (see seed SQL). */
export const FALLBACK_MODEL_NAME = '_fallback';

export function getCatalogToolNames(): string[] {
  return AGENT_TOOL_CATALOG.map((t) => t.name);
}
