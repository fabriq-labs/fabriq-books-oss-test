/**
 * Analytics Query Tool
 * 
 * Enhanced SQL query tool with:
 * - Multi-tenancy enforcement (org_id validation)
 * - Permission-aware execution
 * - Multi-step query support for complex analysis
 * - Read-only enforcement
 */

import { tool } from 'ai';
import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import { ModelService } from '../../services/core/ModelService';
import { ModelRegistry, SYSTEM_FIELDS } from '../../services/registry/ModelRegistry';
import logger from '../../utils/logger';

const modelService = ModelService.getInstance();

/**
 * Tables that REQUIRE org_id filtering (business/transactional data)
 */
const BUSINESS_TABLES = new Set([
  'item_master', 'supplier', 'customers', 'invoice', 'invoice_line_item',
  'purchase_requisition', 'item', 'purchase_order', 'purchase_order_item',
  'sales_order', 'sales_order_item', 'delivery_challan', 'credit_note',
  'quote', 'account', 'posting', 'payment_receipt',
  'workflow_instance', 'workflow_history',  // These have org_id!
  'employee_master', 'department', 'cost_center', 'location', 'project_master',
  'budget_period', 'budget_line', 'coa', 'entity'
]);

/**
 * Tables that should NOT be filtered by org_id (system/metadata)
 */
const METADATA_TABLES = new Set([
  'workflow_flow', 'workflow_state', 'workflow_action',
  'view', 'permission', 'role', 'role_user', 'role_view',
  'org', 'user', 'prompt_template', 'source_system'
]);

/**
 * Validates that the query is read-only and checks for org_id usage
 */
function validateQuery(
  query: string,
  orgId: string
): { valid: boolean; warnings: string[]; error?: string } {
  const warnings: string[] = [];
  const lowerQuery = query.toLowerCase();

  // Check for unsubstituted template placeholders (e.g. {{org_id}}, {{user_id}})
  const placeholderMatch = query.match(/\{\{[^}]+\}\}/g);
  if (placeholderMatch) {
    return {
      valid: false,
      warnings: [],
      error: `Query contains unsubstituted placeholders: ${placeholderMatch.join(', ')}. ` +
        `Do not write {{...}} in SQL — org_id filtering is applied automatically by this tool.`
    };
  }

  // Check for write operations (CRITICAL - block these)
  const writePatterns = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke)\b/i;
  if (writePatterns.test(query)) {
    return {
      valid: false,
      warnings: [],
      error: 'Only SELECT queries are allowed. Write operations (INSERT, UPDATE, DELETE, etc.) are not permitted.'
    };
  }

  // Check for transaction commands
  if (/\b(begin|commit|rollback|savepoint)\b/i.test(query)) {
    return {
      valid: false,
      warnings: [],
      error: 'Transaction commands are not allowed.'
    };
  }

  // Extract table names from query (simplified extraction)
  const tableMatches = query.match(/\bfrom\s+["']?(\w+)["']?|\bjoin\s+["']?(\w+)["']?/gi) || [];
  const tables = tableMatches
    .map(m => m.replace(/^(from|join)\s+["']?/i, '').replace(/["']?$/, '').toLowerCase())
    .filter(Boolean);

  // Check if business tables have org_id filter
  const businessTablesInQuery = tables.filter(t => BUSINESS_TABLES.has(t));

  for (const table of businessTablesInQuery) {
    // Simple check - look for org_id in the query
    // This is a heuristic, not perfect, but provides guidance
    const hasOrgIdFilter =
      lowerQuery.includes(`${table}.org_id`) ||
      lowerQuery.includes(`org_id = '${orgId.toLowerCase()}'`) ||
      lowerQuery.includes(`org_id='${orgId.toLowerCase()}'`);

    if (!hasOrgIdFilter && !lowerQuery.includes('org_id')) {
      warnings.push(
        `Table '${table}' is a business table that should be filtered by org_id = '${orgId}'. ` +
        `Query may return data from other organizations if org_id filter is missing.`
      );
    }
  }

  return { valid: true, warnings };
}

/**
 * Determines if a field represents currency values
 */
function isCurrencyField(fieldName: string, value: any): boolean {
  const currencyPatterns = [
    /amount/i, /price/i, /cost/i, /value/i, /total/i, /sum/i, /balance/i,
    /revenue/i, /expense/i, /budget/i, /payment/i, /fee/i, /charge/i
  ];
  return currencyPatterns.some(pattern => pattern.test(fieldName)) &&
    typeof value === 'number';
}

/**
 * Creates enhanced column metadata for frontend formatting
 */
function createColumnMetadata(field: string, value: any) {
  const dataType = typeof value;

  return {
    field,
    label: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    dataType,
    isCurrency: isCurrencyField(field, value),
    isNumeric: dataType === 'number',
    isDate: dataType === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
  };
}

/**
 * Analytics Query Tool Schema
 */
export const analyticsQuerySchema = z.object({
  query: z.string()
    .describe('SQL SELECT query. MUST include org_id filter for business tables. Use the context from getAnalyticsContext.'),
  description: z.string()
    .describe('What this query is trying to answer (for logging and debugging)'),
  step: z.number().optional()
    .describe('Current step number in multi-step analysis (1, 2, 3...). Use for complex queries that build on previous results.'),
  reasoning: z.string().optional()
    .describe('Why this query is needed and how it relates to the user question'),
  uiHint: z.enum(['table', 'metrics', 'chart', 'card']).optional()
    .describe('How to display the results: table (default), metrics (single row KPIs), chart (for trends), card (single record)')
});

/**
 * Creates the analytics query tool
 */
export function analyticsQueryTool(auth: AuthContext) {
  return tool({
    parameters: analyticsQuerySchema,
    description: `Execute analytical SQL queries with permission and multi-tenancy enforcement.

**IMPORTANT RULES:**
1. **ALWAYS call getAnalyticsContext first** to get org_id and schema context
2. **ALWAYS include org_id = '{org_id}'** in WHERE clause for business tables
3. **Only SELECT queries** are allowed (no INSERT, UPDATE, DELETE)
4. Use **step parameter** for multi-step analysis

**Multi-step analysis example:**
- Step 1: Get workflow state ID for "Manager Review"
- Step 2: Count instances in that state and calculate average wait time

**Business tables (need org_id):** purchase_requisition, purchase_order, invoice, workflow_instance, etc.
**Metadata tables (no org_id):** workflow_flow, workflow_state, role, view, etc.

**Table naming:** Use "user" (with quotes) for user table, snake_case for others.`,

    execute: async ({ query, description, step, reasoning, uiHint }, _options) => {
      const orgId = auth.user?.org_id;
      const userId = auth.user?.id;

      logger.info('Analytics query execution', {
        description,
        step,
        reasoning,
        orgId,
        userId,
        queryPreview: query.substring(0, 200)
      });

      try {
        // Validate the query
        const validation = validateQuery(query, orgId || '');

        if (!validation.valid) {
          logger.warn('Query validation failed', {
            error: validation.error,
            query: query.substring(0, 200)
          });

          return {
            tool: 'analyticsQuery',
            step,
            description,
            success: false,
            error: validation.error,
            uiHint: 'error'
          };
        }

        // Log warnings but don't block execution
        if (validation.warnings.length > 0) {
          logger.warn('Query validation warnings', {
            warnings: validation.warnings,
            query: query.substring(0, 200)
          });
        }

        // Execute the query
        const result = await modelService.executeSqlQuery(query, auth);

        if (result.error) {
          logger.error('SQL query execution error', {
            error: result.error,
            query: query.substring(0, 200)
          });

          return {
            tool: 'analyticsQuery',
            step,
            description,
            success: false,
            error: result.error,
            uiHint: 'error'
          };
        }

        const data = result.data || [];
        const rowCount = data.length;

        logger.info('Analytics query completed', {
          description,
          step,
          rowCount,
          hasWarnings: validation.warnings.length > 0
        });

        // Build column metadata from first row
        const columns = rowCount > 0
          ? Object.keys(data[0])
            .filter(f => !SYSTEM_FIELDS.includes(f))
            .map(f => createColumnMetadata(f, data[0][f]))
          : [];

        // Convert BigInt to Number for JSON serialization
        const safeData = JSON.parse(JSON.stringify(data, (key, value) => {
          if (typeof value === 'bigint') {
            return Number(value);
          }
          return value;
        }));

        // Determine result type based on data shape
        let resultType = 'sql_result';
        let effectiveUiHint = uiHint || 'table';

        if (rowCount === 1 && columns.length <= 5) {
          resultType = 'metrics';
          effectiveUiHint = uiHint || 'metrics';
        } else if (rowCount === 1) {
          resultType = 'record';
          effectiveUiHint = uiHint || 'card';
        }

        return {
          tool: 'analyticsQuery',
          step,
          description,
          reasoning,
          success: true,
          resultType,
          data: resultType === 'metrics' ? safeData[0] : safeData,
          columns,
          rowCount,
          uiHint: effectiveUiHint,
          warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
          // Guidance for next step
          nextStepHint: step
            ? `Results from step ${step} are available. Use these to inform step ${step + 1} if needed.`
            : undefined
        };

      } catch (error) {
        logger.error('Analytics query unexpected error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          query: query.substring(0, 200)
        });

        return {
          tool: 'analyticsQuery',
          step,
          description,
          success: false,
          error: error instanceof Error ? error.message : 'Query execution failed',
          uiHint: 'error'
        };
      }
    }
  });
}

/**
 * Export the schema for use in GENERIC_FUNCTIONS
 */
export { analyticsQuerySchema as schema };
