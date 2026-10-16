import prisma from '../../lib/prisma';
import { AuthContext } from '../../auth/types';
import { DataAccessResult } from '../types';
import logger from '../../utils/logger';
import { MODELS_WITHOUT_ORG, SHAREABLE_MODELS, modelTenancy } from '../../tenancy/orgScope';

const KNOWN_TABLES = new Set([
  ...MODELS_WITHOUT_ORG,
  ...SHAREABLE_MODELS,
  'user',
  'role_user',
  'base_model',
  'workflow_instance',
  'workflow_history',
  'comment',
  'attachment',
  'ai_activity_log',
  'import_run',
  'llm_trace',
  'llm_trace_step',
  'agent_template',
  'agent_session',
  'agent_message',
  'pending_action',
  'chat_thread',
]);

const FORBIDDEN = /\b(drop|delete|truncate|alter|insert|update|grant|revoke|copy)\b/i;

/**
 * Reject SQL that is not a single SELECT, names a table outside the kernel,
 * or reads a tenant table without the caller's org id in the predicate.
 */
export function assertTenantSql(query: string, orgId: string): void {
  const trimmed = query.trim();
  if (!/^select\b/i.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed');
  }
  if (trimmed.includes(';')) {
    throw new Error('Multiple SQL statements are not allowed');
  }
  if (FORBIDDEN.test(trimmed)) {
    throw new Error('SQL query contains a forbidden keyword');
  }

  const tables = [...trimmed.matchAll(/\b(?:from|join)\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi)]
    .map((match) => match[1].toLowerCase());

  if (tables.length === 0) {
    throw new Error('SQL query must name a table');
  }

  for (const table of tables) {
    if (!KNOWN_TABLES.has(table)) {
      throw new Error(`Table ${table} is not allowed`);
    }
    if (MODELS_WITHOUT_ORG.has(table)) continue;
    const kind = modelTenancy(table);
    if (kind === 'private' || kind === 'shareable') {
      const hasOrgPredicate = trimmed.toLowerCase().includes('org_id') && trimmed.includes(orgId);
      if (!hasOrgPredicate) {
        throw new Error(`SQL query on ${table} must filter org_id to the caller org`);
      }
    }
  }
}

export async function executeAnalyticsSql(query: string, context: AuthContext): Promise<DataAccessResult> {
  if (!context.user?.org_id) {
    return { success: false, error: 'Authentication required' };
  }
  try {
    assertTenantSql(query, context.user.org_id);
    const result = await prisma.$queryRawUnsafe(query);
    return {
      success: true,
      data: Array.isArray(result) ? result : [result],
      metaData: null,
    };
  } catch (error: any) {
    logger.warn('Analytics SQL rejected or failed', { error: error.message });
    return {
      success: false,
      data: null,
      metaData: null,
      error: error.message,
    };
  }
}
