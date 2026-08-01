#!/usr/bin/env npx ts-node
/**
 * Remove tenant (org) data OR a single legal entity and related transactions.
 *
 * Tenant (org) wipe — deletes every org_id-scoped row, then the org:
 *   npx ts-node prisma/remove-tenant-data.ts org_indian_demo
 *   npx ts-node prisma/remove-tenant-data.ts org_indian_demo --confirm
 *   npm run remove-tenant-data -- org_indian_demo --confirm
 *
 * Legal entity wipe — invoices, bills, postings, COA, org-structure for one entity:
 *   npx ts-node prisma/remove-tenant-data.ts --legal-entity=org_mumbai_branch
 *   npx ts-node prisma/remove-tenant-data.ts --legal-entity=org_mumbai_branch --confirm
 *   npm run remove-tenant-data -- --legal-entity=org_us_office --confirm
 *
 * Without --confirm, prints what would be deleted and exits (dry run).
 */

import prisma from '../src/lib/prisma';
import { removeLegalEntityData } from '../src/utils/setup/removeLegalEntityData';

const argv = process.argv.slice(2);
const CONFIRM = argv.includes('--confirm');
const legalEntityFlag = argv.find((a) => a.startsWith('--legal-entity='));
const LEGAL_ENTITY_ID = legalEntityFlag
  ? legalEntityFlag.split('=').slice(1).join('=').trim()
  : undefined;

// Parse org id: first non-flag arg that looks like an id (not a path / .ts file)
const rest = argv.filter((a) => a && !a.startsWith('--'));
const ORG_ID_ARG = rest.find((a) => !a.includes('/') && !a.endsWith('.ts')) ?? rest[0];

/**
 * Tables with org_id, in FK-safe deletion order (children before parents).
 * Excludes METADATA_MODELS_WITHOUT_ORG_FILTER (global / shared, not tenant-owned):
 * role, workflow_flow, workflow_state, workflow_action, view, permission, role_view,
 * prompt_template, agent_model_tool_config, currency, instrument.
 */
const ORG_TABLES = [
  'pending_action', 'agent_session', 'llm_trace', 'ai_activity_log', 'expense_report', 'import_run',
  'workflow_history', 'comment',
  'plaid_transaction', 'posting', 'trade', 'holding',
  'delivery_challan', 'credit_note', 'quote', 'sales_order', 'payment_receipt', 'invoice',
  'purchase_order_item', 'purchase_order', 'item', 'purchase_requisition', 'project_master',
  'general_ledger', 'budget_line', 'budget_period', 'employee_master', 'supplier_items',
  'item_master', 'item_category', 'uom', 'cost_center', 'department', 'business_unit', 'location', 'customers',
  'supplier', 'payment_terms', 'tax_master', 'shipping_terms', 'shipping_method',
  'account', 'plaid_item', 'entity', 'base_model', 'workflow_instance', 'role_user',
  'source_system', 'agent_template', 'user',
  'exchange_rate','chat_thread',
  'instance_email_ingest', 'attachment', 'list_data', 'user_master',
] as const;

/** Child tables without org_id: delete by parent ids (run before deleting parents). */
const CHILD_DELETES: Array<{ parent: string; child: string; childFk: string }> = [
  { parent: 'delivery_challan', child: 'delivery_challan_item', childFk: 'delivery_challan_id' },
  { parent: 'credit_note', child: 'credit_note_item', childFk: 'credit_note_id' },
  { parent: 'quote', child: 'quote_item', childFk: 'quote_id' },
  { parent: 'sales_order', child: 'sales_order_item', childFk: 'sales_order_id' },
  { parent: 'invoice', child: 'invoice_line_item', childFk: 'instance_id' },
  { parent: 'instance_email_ingest', child: 'instance_email_ingest_item', childFk: 'instance_email_ingest_id' },
];

/** Prisma P2021 — table mapped by the model does not exist in this database. */
function isMissingTableError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2021'
  );
}

function logSkippedMissingTable(model: string, err: unknown): void {
  const meta =
    typeof err === 'object' && err !== null && 'meta' in err
      ? (err as { meta?: { modelName?: string; table?: string } }).meta
      : undefined;
  const label = meta?.modelName ?? model;
  const table = meta?.table;
  console.warn(`  [skip] ${label}: table does not exist in database${table ? ` (${table})` : ''}`);
  if (err instanceof Error) {
    console.warn(`         ${err.message}`);
  } else {
    console.warn('         ', err);
  }
}

async function getCount(model: string, where: object): Promise<number> {
  const delegate = (prisma as any)[model];
  if (!delegate?.count) return 0;
  try {
    return await delegate.count({ where });
  } catch (err) {
    if (isMissingTableError(err)) {
      logSkippedMissingTable(model, err);
      return 0;
    }
    throw err;
  }
}

async function deleteMany(model: string, where: object): Promise<number> {
  const delegate = (prisma as any)[model];
  if (!delegate?.deleteMany) return 0;
  try {
    const result = await delegate.deleteMany({ where });
    return result.count ?? 0;
  } catch (err) {
    if (isMissingTableError(err)) {
      logSkippedMissingTable(model, err);
      return 0;
    }
    throw err;
  }
}

async function removeTenantData(orgId: string) {
  if (!orgId) {
    console.error('Usage:');
    console.error('  npx ts-node prisma/remove-tenant-data.ts <org_id> [--confirm]');
    console.error('  npx ts-node prisma/remove-tenant-data.ts --legal-entity=<entity_id> [--confirm]');
    console.error('Example: npx ts-node prisma/remove-tenant-data.ts org_indian_demo --confirm');
    process.exit(1);
  }

  const org = await prisma.org.findUnique({ where: { id: orgId } });
  if (!org) {
    console.error(`Org not found: ${orgId}`);
    process.exit(1);
  }

  const w = { org_id: orgId };

  if (!CONFIRM) {
    console.log(`Would delete all data for tenant: ${orgId} (${org.name})`);
    console.log('Run with --confirm to perform deletion.');
    const counts: Array<[string, number]> = [];
    for (const model of ORG_TABLES) {
      const n = await getCount(model, w);
      counts.push([model, n]);
    }
    for (const { parent, child, childFk } of CHILD_DELETES) {
      let n = 0;
      try {
        const ids = await (prisma as any)[parent].findMany({ where: w, select: { id: true } }).then((r: { id: string }[]) => r.map((x) => x.id));
        if (ids.length > 0) {
          n = await getCount(child, { [childFk]: { in: ids } });
        }
      } catch (err) {
        if (isMissingTableError(err)) {
          logSkippedMissingTable(parent, err);
        } else {
          // model might not have org_id or might be named differently
        }
      }
      counts.push([child, n]);
    }
    for (const [name, c] of counts) console.log(`  ${name}: ${c}`);
    console.log('  org: 1');
    process.exit(0);
  }

  console.log(`Removing all data for tenant: ${orgId} (${org.name})...`);
  let total = 0;
  const step = async (label: string, fn: () => Promise<number>) => {
    const n = await fn();
    if (n > 0) {
      console.log(`  ${label}: ${n}`);
      total += n;
    }
  };

  // Delete child tables (no org_id) before their parents
  for (const { parent, child, childFk } of CHILD_DELETES) {
    try {
      const ids = await (prisma as any)[parent].findMany({ where: w, select: { id: true } }).then((r: { id: string }[]) => r.map((x) => x.id));
      if (ids.length > 0) {
        const n = await deleteMany(child, { [childFk]: { in: ids } });
        if (n > 0) {
          console.log(`  ${child}: ${n}`);
          total += n;
        }
      }
    } catch (err) {
      if (isMissingTableError(err)) {
        logSkippedMissingTable(parent, err);
      } else {
        throw err;
      }
    }
  }

  // Delete all tables with org_id in order
  for (const model of ORG_TABLES) {
    await step(model, () => deleteMany(model, w));
  }

  // Delete org
  await prisma.org.delete({ where: { id: orgId } });
  console.log('  org: 1');
  total += 1;

  console.log(`\nDone. Removed ${total} record(s) for tenant ${orgId}.`);
}

async function runLegalEntityMode(entityId: string) {
  if (!entityId) {
    console.error('Usage: npx ts-node prisma/remove-tenant-data.ts --legal-entity=<entity_id> [--confirm]');
    process.exit(1);
  }

  const result = await removeLegalEntityData(entityId, { confirm: CONFIRM });

  if (result.dryRun) {
    console.log(`Would delete legal entity: ${result.entityId} (${result.entityName})`);
    console.log(`Tenant org_id: ${result.orgId}`);
    console.log('Run with --confirm to perform deletion.');
    for (const [name, c] of Object.entries(result.counts)) {
      if (c > 0) console.log(`  ${name}: ${c}`);
    }
    console.log(`  total (incl. zero steps omitted above when confirming): ${result.total}`);
    return;
  }

  console.log(`\nDone. Removed ${result.total} record(s) for legal entity ${result.entityId}.`);
}

if (require.main === module) {
  const run = LEGAL_ENTITY_ID
    ? runLegalEntityMode(LEGAL_ENTITY_ID)
    : removeTenantData(ORG_ID_ARG ?? '');

  run
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export { removeTenantData };
export { removeLegalEntityData } from '../src/utils/setup/removeLegalEntityData';
