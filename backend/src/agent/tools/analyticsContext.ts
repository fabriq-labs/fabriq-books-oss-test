/**
 * Analytics Context Tool
 * 
 * Provides schema knowledge, multi-tenancy rules, and common query patterns
 * to the LLM for analytical queries. This tool should be called FIRST
 * before executing any analytical SQL query.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import { ModelRegistry } from '../../services/registry/ModelRegistry';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';

/**
 * Schema context that the LLM needs for building correct queries
 */
const SCHEMA_CONTEXT = {
  multiTenancyRules: {
    businessTables: [
      'item_master', 'supplier', 'customers', 'invoice', 'invoice_line_item',
      'purchase_requisition', 'item', 'purchase_order', 'purchase_order_item',
      'sales_order', 'sales_order_item', 'delivery_challan', 'credit_note',
      'quote', 'account', 'posting', 'payment_receipt',
      'workflow_instance', 'workflow_history'  // These have org_id!
    ],
    metadataTables: [
      'view', 'permission', 'role', 'role_user', 'role_view',
      'workflow_flow', 'workflow_state', 'workflow_action',
      'org', 'entity'
    ],
    rule: 'Business tables MUST filter by org_id. Metadata tables (definitions) do NOT filter by org_id.'
  },

  coreRelationships: {
    workflow: {
      description: 'Workflow system tracks approval states for business records',
      tables: ['workflow_flow', 'workflow_state', 'workflow_action', 'workflow_instance', 'workflow_history'],
      joins: [
        'workflow_instance.flow_id → workflow_flow.id (which workflow definition)',
        'workflow_instance.current_state_id → workflow_state.id (current state)',
        'workflow_instance.model_id → {business_record}.id (the actual record)',
        'workflow_instance.assigned_user_id → user.id (who needs to act)',
        'workflow_state.flow_id → workflow_flow.id (states belong to flows)',
        'workflow_state.assigned_role_id → role.id (role-based assignment)',
        'workflow_action.source_state_id → workflow_state.id (from state)',
        'workflow_action.target_state_id → workflow_state.id (to state)',
        'workflow_history.instance_id → workflow_instance.id (audit trail)'
      ],
      keyFields: {
        workflow_flow: 'id, name, model_name, is_active',
        workflow_state: 'id, flow_id, name, is_initial, is_final, assigned_for, assigned_role_id, assigned_user_id, sequence',
        workflow_instance: 'id, flow_id, model_id, current_state_id, current_state, assigned_user_id, status, org_id, created_at, modified_at',
        workflow_history: 'id, instance_id, from_state, to_state, action_id, performed_by, performed_at, comments'
      }
    },
    procurement: {
      description: 'Purchase flow: PR → PO → Invoice',
      tables: ['purchase_requisition', 'item', 'purchase_order', 'purchase_order_item', 'invoice', 'invoice_line_item'],
      joins: [
        'purchase_order.purchase_id → purchase_requisition.id (PO from PR)',
        'invoice.purchase_order_id → purchase_order.id (Invoice from PO)',
        'item.instance_id → purchase_requisition.id (PR line items)',
        'purchase_order_item.instance_id → purchase_order.id (PO line items)',
        'invoice_line_item.instance_id → invoice.id (Invoice line items)',
        'purchase_requisition.supplier_id → supplier.id',
        'purchase_order.supplier_id → supplier.id'
      ],
      keyFields: {
        purchase_requisition: 'id, pr_number, status, total_price, requester, org_id, wf_instance_id, created_by, created_at',
        purchase_order: 'id, po_number, status, total_price, purchase_id, supplier_id, org_id, wf_instance_id',
        invoice: 'id, invoice_number, invoice_status, invoice_type, invoice_total, purchase_order_id, org_id, wf_instance_id'
      }
    },
    sales: {
      description: 'Sales flow: SO → Delivery → Invoice → Payment',
      tables: ['sales_order', 'sales_order_item', 'delivery_challan', 'invoice', 'payment_receipt'],
      joins: [
        'delivery_challan.sales_order_id → sales_order.id',
        'invoice.sales_order_id → sales_order.id',
        'payment_receipt.invoice_id → invoice.id',
        'sales_order_item.sales_order_id → sales_order.id',
        'sales_order.customer_id → customers.id'
      ]
    },
    permissions: {
      description: 'User → Role → View → Permission chain for access control',
      tables: ['user', 'role', 'role_user', 'role_view', 'view', 'permission'],
      joins: [
        'role_user.user_id → user.id',
        'role_user.role_id → role.id',
        'role_view.role_id → role.id',
        'role_view.view_id → view.id',
        'permission.view_id → view.id',
        'view.model_name = target model name (string match, not FK)'
      ]
    }
  },

  commonPatterns: {
    pendingApprovals: `
-- Pending workflow approvals for an organization
SELECT 
    wi.id as instance_id,
    wi.model_id,
    wf.name as workflow_name,
    wf.model_name,
    ws.name as state_name,
    wi.assigned_user_id,
    u.email as assigned_to_email,
    u.name as assigned_to_name,
    wi.created_at,
    wi.modified_at,
    EXTRACT(EPOCH FROM (NOW() - wi.modified_at))/3600 as hours_in_state
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
JOIN workflow_state ws ON wi.current_state_id = ws.id
LEFT JOIN "user" u ON wi.assigned_user_id = u.id
WHERE wi.status = 'active' 
  AND wi.org_id = '{org_id}'
ORDER BY wi.modified_at ASC`,

    averageWaitTimeByState: `
-- Average wait time by workflow state
SELECT 
    wf.model_name,
    ws.name as state_name,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (NOW() - wi.modified_at))/3600) as avg_hours,
    AVG(EXTRACT(EPOCH FROM (NOW() - wi.modified_at))/86400) as avg_days
FROM workflow_instance wi
JOIN workflow_flow wf ON wi.flow_id = wf.id
JOIN workflow_state ws ON wi.current_state_id = ws.id
WHERE wi.status = 'active' 
  AND wi.org_id = '{org_id}'
GROUP BY wf.model_name, ws.name
ORDER BY avg_hours DESC`,

    recordCountsByModel: `
-- Count records by status for a model
SELECT 
    status,
    COUNT(*) as count
FROM {model}
WHERE org_id = '{org_id}'
GROUP BY status
ORDER BY count DESC`,

    workflowStateForModel: `
-- Get workflow state for a specific model type
SELECT 
    ws.id as state_id,
    ws.name as state_name,
    ws.is_initial,
    ws.is_final,
    ws.assigned_for,
    ws.sequence
FROM workflow_state ws
JOIN workflow_flow wf ON ws.flow_id = wf.id
WHERE wf.model_name = '{model_name}'
  AND wf.is_active = true
ORDER BY ws.sequence`,

    userRolesAndPermissions: `
-- Get user's roles and accessible models
SELECT DISTINCT
    r.name as role_name,
    v.model_name,
    v.name as view_name,
    string_agg(DISTINCT p.access, ', ') as access_levels
FROM role r
JOIN role_user ru ON r.id = ru.role_id
JOIN role_view rv ON r.id = rv.role_id
JOIN view v ON rv.view_id = v.id
LEFT JOIN permission p ON v.id = p.view_id
WHERE ru.user_id = '{user_id}'
GROUP BY r.name, v.model_name, v.name
ORDER BY v.model_name`
  }
};

/**
 * Analytics Context Tool Schema
 */
export const analyticsContextSchema = z.object({
  focus: z.enum(['workflow', 'procurement', 'sales', 'permissions', 'all']).optional()
    .describe('Which domain to focus schema context on. Use "workflow" for approval questions, "procurement" for PR/PO/Invoice questions.'),
  models: z.array(z.string()).optional()
    .describe('Specific models to get schema for (e.g., ["purchase_requisition", "workflow_instance"])')
});

/**
 * Creates the analytics context tool
 */
export function getAnalyticsContextTool(auth: AuthContext) {
  return tool({
    parameters: analyticsContextSchema,
    description: `Get database schema context for analytical queries.

**CALL THIS TOOL FIRST** before writing any analytical SQL query.

This tool provides:
- Your org_id (REQUIRED in WHERE clauses for business tables)
- Table relationships and JOIN paths
- Multi-tenancy rules (which tables need org_id filter)
- Common query patterns as templates

**When to use:**
- Questions about counts, totals, averages
- Questions about pending approvals or workflow states
- Questions that require JOINing multiple tables
- Questions about who raised/created/approved something

**Returns:** Schema context filtered to what you can access, with your org_id pre-filled.`,

    execute: async ({ focus = 'all', models }, _options) => {
      const orgId = auth.user?.org_id;
      const userId = auth.user?.id;

      logger.info('Analytics context requested', {
        focus,
        models,
        orgId,
        userId
      });

      // Get accessible models from user's permissions
      const accessibleModels = ModelRegistry.getInstance()
        .getAccessibleModels(auth.permissions || {})
        .map(m => m.name);

      // Fetch ACTUAL workflow states from database - CRITICAL for correct queries
      let actualWorkflowStates: any[] = [];
      let activeWorkflowSummary: any[] = [];

      try {
        // Get all workflow states with their flow (model) info
        const rawStates: any[] = await prisma.$queryRaw`
          SELECT 
            ws.id as state_id,
            ws.name as state_name,
            ws.is_initial,
            ws.is_final,
            ws.sequence,
            wf.model_name,
            wf.name as workflow_name
          FROM workflow_state ws
          JOIN workflow_flow wf ON ws.flow_id = wf.id
          WHERE wf.is_active = true
          ORDER BY wf.model_name, ws.sequence
        `;

        // Convert any BigInt/Decimal to plain JS types for serialization
        actualWorkflowStates = rawStates.map(row => ({
          ...row,
          sequence: row.sequence ? Number(row.sequence) : null
        }));

        // Get summary of active workflow instances by state (for the user's org)
        if (orgId) {
          const rawSummary: any[] = await prisma.$queryRaw`
            SELECT 
              wf.model_name,
              ws.name as state_name,
              ws.id as state_id,
              COUNT(*)::int as count,
              AVG(EXTRACT(EPOCH FROM (NOW() - wi.modified_at))/3600)::numeric(10,2) as avg_hours_in_state
            FROM workflow_instance wi
            JOIN workflow_flow wf ON wi.flow_id = wf.id
            JOIN workflow_state ws ON wi.current_state_id = ws.id
            WHERE wi.status = 'active' AND wi.org_id = ${orgId}
            GROUP BY wf.model_name, ws.name, ws.id
            ORDER BY wf.model_name, count DESC
          `;

          // Convert Decimal/BigInt to plain numbers for JSON serialization
          activeWorkflowSummary = rawSummary.map(row => ({
            ...row,
            count: Number(row.count),
            avg_hours_in_state: row.avg_hours_in_state ? Number(row.avg_hours_in_state) : null
          }));
        }

        logger.info('Fetched actual workflow states', {
          stateCount: actualWorkflowStates.length,
          activeSummaryCount: activeWorkflowSummary.length
        });
      } catch (error) {
        logger.warn('Failed to fetch workflow states from database', { error });
      }

      // Build context based on focus area
      let relevantContext: any = {
        // User context - CRITICAL for queries
        user: {
          org_id: orgId,
          user_id: userId,
          note: 'ALWAYS use org_id in WHERE clause for business table queries'
        },

        // What models the user can access
        accessibleModels: accessibleModels,

        // Multi-tenancy rules
        multiTenancyRules: SCHEMA_CONTEXT.multiTenancyRules
      };

      // Add workflow context with ACTUAL state names from database
      if (focus === 'all' || focus === 'workflow') {
        // Group states by model for easier reference
        const statesByModel: Record<string, any[]> = {};
        for (const state of actualWorkflowStates) {
          const model = state.model_name;
          if (!statesByModel[model]) {
            statesByModel[model] = [];
          }
          statesByModel[model].push({
            state_id: state.state_id,
            state_name: state.state_name,
            is_initial: state.is_initial,
            is_final: state.is_final,
            sequence: state.sequence
          });
        }

        relevantContext.workflow = {
          ...SCHEMA_CONTEXT.coreRelationships.workflow,
          // ACTUAL states from database - USE THESE EXACT NAMES IN QUERIES
          actualStates: {
            note: 'USE THESE EXACT STATE NAMES in your queries - do not guess or invent state names!',
            byModel: statesByModel
          },
          // Current active instances summary (shows what states have pending items)
          activeInstancesSummary: activeWorkflowSummary.length > 0 ? {
            note: 'Current distribution of active workflow instances by state',
            data: activeWorkflowSummary
          } : undefined,
          queryPatterns: {
            pendingApprovals: SCHEMA_CONTEXT.commonPatterns.pendingApprovals
              .replace(/\{org_id\}/g, orgId || '{org_id}'),
            averageWaitTime: SCHEMA_CONTEXT.commonPatterns.averageWaitTimeByState
              .replace(/\{org_id\}/g, orgId || '{org_id}'),
            workflowStates: SCHEMA_CONTEXT.commonPatterns.workflowStateForModel
          }
        };
      }

      // Add procurement context
      if (focus === 'all' || focus === 'procurement') {
        relevantContext.procurement = {
          ...SCHEMA_CONTEXT.coreRelationships.procurement,
          queryPatterns: {
            recordCounts: SCHEMA_CONTEXT.commonPatterns.recordCountsByModel
              .replace(/\{org_id\}/g, orgId || '{org_id}')
          }
        };
      }

      // Add sales context
      if (focus === 'all' || focus === 'sales') {
        relevantContext.sales = SCHEMA_CONTEXT.coreRelationships.sales;
      }

      // Add permissions context
      if (focus === 'all' || focus === 'permissions') {
        relevantContext.permissions = {
          ...SCHEMA_CONTEXT.coreRelationships.permissions,
          queryPatterns: {
            userPermissions: SCHEMA_CONTEXT.commonPatterns.userRolesAndPermissions
              .replace(/\{user_id\}/g, userId || '{user_id}')
          }
        };
      }

      return {
        tool: 'getAnalyticsContext',
        success: true,
        context: relevantContext,
        instructions: `
## How to use this context:

1. **WORKFLOW STATE NAMES (CRITICAL - DO NOT GUESS!):**
   - The actualStates section contains REAL state names from the database
   - ALWAYS use the exact state_name values provided (e.g., "Manager Review", NOT "Pending Approval")
   - Use state_id for JOINs: \`wi.current_state_id = '{state_id}'\`
   - Or use state name with JOIN: \`JOIN workflow_state ws ON wi.current_state_id = ws.id WHERE ws.name = '{exact_state_name}'\`
   - The activeInstancesSummary shows which states currently have pending items

2. **Multi-tenancy (CRITICAL):**
   - Business tables: ALWAYS include \`WHERE org_id = '${orgId}'\`
   - Metadata tables (workflow_flow, workflow_state, role, view, etc.): NO org_id filter

3. **Building JOINs:**
   - Use the join paths provided in the relationships section
   - Example: To get workflow state name, JOIN workflow_instance → workflow_state

4. **Common patterns:**
   - Use the queryPatterns as templates
   - Replace placeholders like {model_name} with actual values

5. **Multi-step queries:**
   - Step 1: Get IDs or configuration (e.g., workflow state IDs)
   - Step 2: Use those IDs for aggregation
   - Use the 'step' parameter in analyticsQuery to track progress

6. **Table naming:**
   - User table needs quotes: "user" (reserved word in PostgreSQL)
   - Other tables: use snake_case without quotes
        `
      };
    }
  });
}
