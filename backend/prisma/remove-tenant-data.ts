#!/usr/bin/env npx ts-node
/**
 * Remove all data for a given tenant (org).
 * Opposite of running setup-indian-demo.ts (or setup-nri-demo.ts) with --data-only:
 * deletes every record scoped by org_id, plus the org itself.
 *
 * Usage:
 *   npx ts-node prisma/remove-tenant-data.ts org_indian_demo
 *   npx ts-node prisma/remove-tenant-data.ts org_indian_demo --confirm
 *
 * Without --confirm, the script prints what would be deleted and exits.
 */

import prisma from '../src/lib/prisma';

// Parse CLI: npm run script passes node + ts-node + script path; org_id is the first arg that looks like an id (e.g. org_indian_demo)
const rest = process.argv.slice(2).filter((a) => a && !a.startsWith('--'));
const ORG_ID_ARG = rest.find((a) => !a.includes('/') && !a.endsWith('.ts')) ?? rest[0];
const CONFIRM = process.argv.includes('--confirm');

/** Tables with org_id, in FK-safe deletion order (children before parents). */
const ORG_TABLES = [
  'pending_action', 'agent_session', 'llm_trace', 'ai_activity_log', 'expense_report',
  'workflow_history', 'comment',
  'posting', 'trade', 'holding', 'instrument', 'category', 'category_group',
  'delivery_challan', 'credit_note', 'quote', 'sales_order', 'payment_receipt', 'invoice',
  'purchase_order_item', 'purchase_order', 'item', 'purchase_requisition', 'project_master',
  'general_ledger', 'budget_line', 'budget_period', 'employee_master', 'supplier_items',
  'item_master', 'cost_center', 'department', 'business_unit', 'location', 'customers',
  'supplier', 'payment_terms', 'tax_master', 'shipping_terms', 'shipping_method',
  'account', 'organization', 'base_model', 'workflow_instance', 'role_user', 'permission',
  'role_view', 'view', 'role', 'prompt_template', 'source_system', 'user',
  'workflow_action', 'workflow_state', 'workflow_flow', 'currency_master', 'exchange_rate',
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

async function getCount(model: string, where: object): Promise<number> {
  const delegate = (prisma as any)[model];
  if (!delegate?.count) return 0;
  return delegate.count({ where });
}

async function deleteMany(model: string, where: object): Promise<number> {
  const delegate = (prisma as any)[model];
  if (!delegate?.deleteMany) return 0;
  const result = await delegate.deleteMany({ where });
  return result.count ?? 0;
}

async function removeTenantData(orgId: string) {
  if (!orgId) {
    console.error('Usage: npx ts-node prisma/remove-tenant-data.ts <org_id> [--confirm]');
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
      try {
        const n = await getCount(model, w);
        if (n > 0) counts.push([model, n]);
      } catch {
        // model might not have org_id or might be named differently
      }
    }
    for (const { parent, child, childFk } of CHILD_DELETES) {
      try {
        const ids = await (prisma as any)[parent].findMany({ where: w, select: { id: true } }).then((r: { id: string }[]) => r.map((x) => x.id));
        if (ids.length > 0) {
          const n = await (prisma as any)[child].count({ where: { [childFk]: { in: ids } } });
          if (n > 0) counts.push([child, n]);
        }
      } catch {
        // ignore
      }
    }
    counts.sort((a, b) => b[1] - a[1]);
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
    const ids = await (prisma as any)[parent].findMany({ where: w, select: { id: true } }).then((r: { id: string }[]) => r.map((x) => x.id));
    if (ids.length > 0) {
      const result = await (prisma as any)[child].deleteMany({ where: { [childFk]: { in: ids } } });
      if (result.count > 0) {
        console.log(`  ${child}: ${result.count}`);
        total += result.count;
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

if (require.main === module) {
  removeTenantData(ORG_ID_ARG ?? '')
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export { removeTenantData };
