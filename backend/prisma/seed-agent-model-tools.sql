-- Seed per-model agent tool configs aligned with prompt templates (prisma/metadata/prompt-templates/)
-- and agent_model_tool_config_view metadata.
-- Run after migration adds agent_model_tool_config table.
-- Safe to re-run: upserts on model_name (updates tools/descriptions from prompts).

INSERT INTO agent_model_tool_config (
  id, model_name, display_name, description, model_tools, include_analytics_tools, is_active, sort_order, created_at, modified_at
) VALUES
(
  'amtc_default',
  'default',
  'Default',
  'No page model context. Unified chat adds getAnalyticsContext + analyticsQuery when include_analytics_tools is true.',
  ARRAY['searchRecords', 'advancedSqlQuery', 'extractInvoiceFromFile', 'createRecord'],
  true,
  true,
  0,
  NOW(),
  NOW()
),
(
  'amtc_posting',
  'posting',
  'Posting / Transactions',
  'Prompts: posting_view (view_d8b6c832) — default, analytics, reconciliation. searchRecords for lists/filters; createRecord/updateRecord for postings; analyticsQuery for aggregates; suggestReconciliationMatches; categorizePostings; runFinancialReport for account closing/opening balance from finance chat.',
  ARRAY[
    'searchRecords', 'createRecord', 'updateRecord', 'advancedSqlQuery',
    'suggestReconciliationMatches', 'categorizePostings', 'runFinancialReport'
  ],
  true,
  true,
  10,
  NOW(),
  NOW()
),
(
  'amtc_account',
  'account',
  'Account / Chart of Accounts',
  'Prompts: account_view (view_35b26fd1) — default + analytics. searchRecords for account lookup; runFinancialReport (trial_balance) for closing balance — never sum postings manually; createRecord/updateRecord for COA maintenance.',
  ARRAY['searchRecords', 'createRecord', 'updateRecord', 'advancedSqlQuery', 'runFinancialReport'],
  true,
  true,
  20,
  NOW(),
  NOW()
),
(
  'amtc_invoice',
  'invoice',
  'Invoice',
  'Prompts: invoice_view (view_0e6394e6) — default + invoice_extractor. searchRecords, create/update invoice, processInvoiceFromPdf, extractInvoiceFromFile, erpConnector.',
  ARRAY[
    'searchRecords', 'createRecord', 'updateRecord',
    'processInvoiceFromPdf', 'extractInvoiceFromFile', 'advancedSqlQuery', 'erpConnector'
  ],
  true,
  true,
  30,
  NOW(),
  NOW()
),
(
  'amtc_purchase_order',
  'purchase_order',
  'Purchase Order',
  'Prompts: purchase_order_view (view_e110af2c) — default. Standard CRUD + search + advancedSqlQuery + erpConnector.',
  ARRAY['searchRecords', 'createRecord', 'updateRecord', 'advancedSqlQuery', 'erpConnector'],
  true,
  true,
  40,
  NOW(),
  NOW()
),
(
  'amtc_purchase_requisition',
  'purchase_requisition',
  'Purchase Requisition',
  'Prompts: purchase_requisition_view (view_35eca395) — default + line_item. PR CRUD, child lines, related master search tools (supplier, item, department, etc.).',
  ARRAY[
    'searchRecords', 'createRecord', 'updateRecord', 'createChildItem', 'updateChildItem',
    'advancedSqlQuery', 'erpConnector',
    'searchItems', 'searchSuppliers', 'searchDepartments', 'searchCostCenters', 'searchLocations',
    'searchProjects', 'searchBudgetPeriods', 'searchBudgetLines', 'searchCOA', 'searchEntities',
    'searchEmployees', 'searchUsers'
  ],
  true,
  true,
  50,
  NOW(),
  NOW()
),
(
  'amtc_instrument',
  'instrument',
  'Instrument / Option Position Analysis',
  'Prompts: instrument_view (view_0498aa82) — options_analysis. No tools: position + live Greeks are pushed in via modelContext by the frontend (fetched once, deterministically) before the chat turn, so the LLM never needs — and should never trigger — its own quote fetch or DB lookup for this conversation.',
  ARRAY[]::text[],
  false,
  true,
  40,
  NOW(),
  NOW()
),
(
  'amtc_fallback',
  '_fallback',
  'Other Models',
  'Default tool set for page models without a dedicated agent_model_tool_config row.',
  ARRAY['searchRecords', 'createRecord', 'updateRecord', 'advancedSqlQuery', 'erpConnector'],
  true,
  true,
  99,
  NOW(),
  NOW()
)
ON CONFLICT (model_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  model_tools = EXCLUDED.model_tools,
  include_analytics_tools = EXCLUDED.include_analytics_tools,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  modified_at = NOW();
