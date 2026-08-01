/**
 * Remove one legal entity and all data scoped to it.
 *
 * Covers every Prisma model with `legal_entity_id`, plus child line items and
 * related docs that lack LE but hang off LE invoices / locations / accounts
 * (payment receipts, credit notes, sales orders / quotes / DCs, budgets, etc.).
 *
 * Does NOT delete the tenant (`org`) or org-wide masters (customers, suppliers,
 * item_master, users, tax_master, …) — only nulls FKs from those masters into
 * this entity's accounts when needed.
 */
import prisma from '../../lib/prisma';

export interface RemoveLegalEntityResult {
  entityId: string;
  entityName: string;
  orgId: string;
  dryRun: boolean;
  counts: Record<string, number>;
  total: number;
}

export interface LegalEntitySummary {
  id: string;
  organizationName: string;
  orgId: string;
  isHeadquarters: boolean;
  country: string | null;
  invoiceCount: number;
  postingCount: number;
  accountCount: number;
}

function isMissingTableError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2021'
  );
}

async function safeCount(model: string, where: object): Promise<number> {
  const delegate = (prisma as any)[model];
  if (!delegate?.count) return 0;
  try {
    return await delegate.count({ where });
  } catch (err) {
    if (isMissingTableError(err)) return 0;
    throw err;
  }
}

async function safeDeleteMany(model: string, where: object): Promise<number> {
  const delegate = (prisma as any)[model];
  if (!delegate?.deleteMany) return 0;
  try {
    const result = await delegate.deleteMany({ where });
    return result.count ?? 0;
  } catch (err) {
    if (isMissingTableError(err)) return 0;
    throw err;
  }
}

async function safeUpdateMany(model: string, where: object, data: object): Promise<number> {
  const delegate = (prisma as any)[model];
  if (!delegate?.updateMany) return 0;
  try {
    const result = await delegate.updateMany({ where, data });
    return result.count ?? 0;
  } catch (err) {
    if (isMissingTableError(err)) return 0;
    throw err;
  }
}

async function idsOf(
  model: string,
  where: object
): Promise<string[]> {
  const delegate = (prisma as any)[model];
  if (!delegate?.findMany) return [];
  try {
    const rows = await delegate.findMany({ where, select: { id: true } });
    return rows.map((r: { id: string }) => r.id);
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

function uniq(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** List legal entities with lightweight transaction counts (Super Admin UI). */
export async function listLegalEntities(orgId?: string): Promise<LegalEntitySummary[]> {
  const entities = await prisma.entity.findMany({
    where: orgId ? { org_id: orgId } : undefined,
    orderBy: [{ org_id: 'asc' }, { organization_name: 'asc' }],
    select: {
      id: true,
      organization_name: true,
      org_id: true,
      is_it_headquartres: true,
      country: true,
    },
  });

  const summaries: LegalEntitySummary[] = [];
  for (const e of entities) {
    const le = { legal_entity_id: e.id };
    const [invoiceCount, postingCount, accountCount] = await Promise.all([
      safeCount('invoice', le),
      safeCount('posting', le),
      safeCount('account', le),
    ]);
    summaries.push({
      id: e.id,
      organizationName: e.organization_name,
      orgId: e.org_id,
      isHeadquarters: String(e.is_it_headquartres || '').toLowerCase() === 'yes',
      country: e.country,
      invoiceCount,
      postingCount,
      accountCount,
    });
  }
  return summaries;
}

/**
 * Preview or delete all data for one legal entity.
 * Pass `confirm: true` to perform deletion; otherwise returns dry-run counts only.
 */
export async function removeLegalEntityData(
  entityId: string,
  options: { confirm?: boolean } = {}
): Promise<RemoveLegalEntityResult> {
  const confirm = Boolean(options.confirm);
  if (!entityId?.trim()) {
    throw new Error('legal entity id is required');
  }

  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity) {
    throw new Error(`Legal entity not found: ${entityId}`);
  }

  const le = { legal_entity_id: entityId };
  const orgId = entity.org_id;

  // ── Collect related IDs ───────────────────────────────────────────────────
  const invoices = await prisma.invoice.findMany({
    where: le,
    select: { id: true, wf_instance_id: true, sales_order_id: true },
  });
  const invoiceIds = invoices.map((i) => i.id);
  const invoiceWfIds = uniq(invoices.map((i) => i.wf_instance_id));
  const soFromInvoices = uniq(invoices.map((i) => i.sales_order_id));

  const accountIds = await idsOf('account', le);
  const locationIds = await idsOf('location', le);
  const poIds = await idsOf('purchase_order', le);
  const prIds = await idsOf('purchase_requisition', le);
  const plaidItemIds = await idsOf('plaid_item', le);
  const paymentTermsIds = await idsOf('payment_terms', le);
  const projectIds = await idsOf('project_master', le);

  const pos = await prisma.purchase_order.findMany({
    where: { id: { in: poIds } },
    select: { id: true, wf_instance_id: true },
  }).catch(() => [] as { id: string; wf_instance_id: string | null }[]);
  const prs = await prisma.purchase_requisition.findMany({
    where: { id: { in: prIds } },
    select: { id: true, wf_instance_id: true },
  }).catch(() => [] as { id: string; wf_instance_id: string | null }[]);

  // Sales docs have no legal_entity_id — scope via LE locations + invoices' SOs
  const soFromLocations = locationIds.length
    ? await idsOf('sales_order', { location_id: { in: locationIds } })
    : [];
  const soIds = uniq([...soFromInvoices, ...soFromLocations]);

  const quoteIds = uniq([
    ...(locationIds.length ? await idsOf('quote', { location_id: { in: locationIds } }) : []),
    ...(soIds.length ? await idsOf('quote', { sales_order_id: { in: soIds } }) : []),
    ...(projectIds.length ? await idsOf('quote', { project_id: { in: projectIds } }) : []),
  ]);

  const dcIds = uniq([
    ...(locationIds.length ? await idsOf('delivery_challan', { location_id: { in: locationIds } }) : []),
    ...(soIds.length ? await idsOf('delivery_challan', { sales_order_id: { in: soIds } }) : []),
  ]);

  const creditNoteIds = uniq([
    ...(invoiceIds.length ? await idsOf('credit_note', { invoice_id: { in: invoiceIds } }) : []),
    ...(locationIds.length ? await idsOf('credit_note', { location_id: { in: locationIds } }) : []),
    ...(soIds.length ? await idsOf('credit_note', { sales_order_id: { in: soIds } }) : []),
    ...(accountIds.length ? await idsOf('credit_note', { account_id: { in: accountIds } }) : []),
  ]);

  const receiptIds = uniq([
    ...(invoiceIds.length ? await idsOf('payment_receipt', { invoice_id: { in: invoiceIds } }) : []),
    ...(accountIds.length ? await idsOf('payment_receipt', { account_id: { in: accountIds } }) : []),
  ]);

  const lineItemIds = invoiceIds.length
    ? await idsOf('invoice_line_item', { instance_id: { in: invoiceIds } })
    : [];

  const soRows = soIds.length
    ? await prisma.sales_order.findMany({
        where: { id: { in: soIds } },
        select: { id: true, wf_instance_id: true },
      }).catch(() => [] as { id: string; wf_instance_id: string | null }[])
    : [];

  const wfIds = uniq([
    ...invoiceWfIds,
    ...pos.map((p) => p.wf_instance_id),
    ...prs.map((p) => p.wf_instance_id),
    ...soRows.map((s) => s.wf_instance_id),
  ]);

  const budgetPeriodIds = accountIds.length
    ? await idsOf('budget_period', { account_id: { in: accountIds } })
    : [];

  const holdingIds = accountIds.length
    ? await idsOf('holding', { account_id: { in: accountIds } })
    : [];

  const instanceIdsForAttachments = uniq([
    ...invoiceIds,
    ...poIds,
    ...prIds,
    ...soIds,
    ...quoteIds,
    ...dcIds,
    ...creditNoteIds,
    ...receiptIds,
  ]);

  // ── Build preview / delete plan counts ────────────────────────────────────
  const plan: Array<{ label: string; count: () => Promise<number>; run: () => Promise<number> }> = [];

  const addDirect = (label: string, model: string, where: object) => {
    plan.push({
      label,
      count: () => safeCount(model, where),
      run: () => safeDeleteMany(model, where),
    });
  };

  const addUpdate = (label: string, model: string, where: object, data: object) => {
    plan.push({
      label,
      count: () => safeCount(model, where),
      run: () => safeUpdateMany(model, where, data),
    });
  };

  // Clear FKs that would block account / entity deletes (counts = rows touched)
  if (accountIds.length) {
    addUpdate(
      'item_master.sales_account_id→null',
      'item_master',
      { sales_account_id: { in: accountIds } },
      { sales_account_id: null }
    );
    addUpdate(
      'item_master.purchase_account_id→null',
      'item_master',
      { purchase_account_id: { in: accountIds } },
      { purchase_account_id: null }
    );
    addUpdate(
      'trade.account_id→null',
      'trade',
      { account_id: { in: accountIds } },
      { account_id: null }
    );
    addUpdate(
      'trade.target_account_id→null',
      'trade',
      { target_account_id: { in: accountIds } },
      { target_account_id: null }
    );
    addUpdate(
      'account.hq_account_id→null',
      'account',
      { hq_account_id: { in: accountIds } },
      { hq_account_id: null }
    );
    addUpdate(
      'account.parent_account_id→null',
      'account',
      { parent_account_id: { in: accountIds } },
      { parent_account_id: null }
    );
  }

  // Transactions & bank feed
  addDirect('posting (by legal_entity_id)', 'posting', le);
  if (accountIds.length) {
    // Only catch postings that reference LE accounts but are not already LE-scoped
    const orphanByAccount = {
      account_id: { in: accountIds },
      OR: [{ legal_entity_id: null }, { legal_entity_id: { not: entityId } }],
    };
    const orphanByCredit = {
      credit_account_id: { in: accountIds },
      OR: [{ legal_entity_id: null }, { legal_entity_id: { not: entityId } }],
    };
    addDirect('posting (orphan by account_id)', 'posting', orphanByAccount);
    addDirect('posting (orphan by credit_account_id)', 'posting', orphanByCredit);
  }
  if (receiptIds.length) {
    addUpdate(
      'posting.payment_receipt_id→null',
      'posting',
      { payment_receipt_id: { in: receiptIds } },
      { payment_receipt_id: null, reconciliation_status: null, matched_reference: null }
    );
  }
  if (plaidItemIds.length) {
    addDirect('plaid_transaction', 'plaid_transaction', { plaid_item_id: { in: plaidItemIds } });
  }

  // Holdings require account_id — clear posting FKs then delete
  if (holdingIds.length) {
    addUpdate(
      'posting.holding_id→null',
      'posting',
      { holding_id: { in: holdingIds } },
      { holding_id: null }
    );
    addDirect('holding (by account_id)', 'holding', { id: { in: holdingIds } });
  }

  // Invoice tax / AR / AP document children
  if (lineItemIds.length) {
    addDirect('invoice_line_tax', 'invoice_line_tax', { invoice_line_item_id: { in: lineItemIds } });
  }
  if (creditNoteIds.length) {
    addDirect('credit_note_item', 'credit_note_item', { credit_note_id: { in: creditNoteIds } });
    addDirect('credit_note', 'credit_note', { id: { in: creditNoteIds } });
  }
  if (receiptIds.length) {
    addDirect('payment_receipt', 'payment_receipt', { id: { in: receiptIds } });
  }
  if (lineItemIds.length) {
    addDirect('invoice_line_item', 'invoice_line_item', { id: { in: lineItemIds } });
  }

  // Workflow + comments for LE documents
  if (wfIds.length) {
    addDirect('comment', 'comment', { wf_instance_id: { in: wfIds } });
    addDirect('workflow_history', 'workflow_history', { instance_id: { in: wfIds } });
    addDirect('base_model', 'base_model', { wf_instance_id: { in: wfIds } });
  }

  // Clear wf FK on parents before deleting workflow_instance / parents
  if (invoiceIds.length) {
    addUpdate('invoice.wf_instance_id→null', 'invoice', { id: { in: invoiceIds } }, { wf_instance_id: null });
  }
  if (poIds.length) {
    addUpdate('purchase_order.wf_instance_id→null', 'purchase_order', { id: { in: poIds } }, { wf_instance_id: null });
  }
  if (prIds.length) {
    addUpdate(
      'purchase_requisition.wf_instance_id→null',
      'purchase_requisition',
      { id: { in: prIds } },
      { wf_instance_id: null }
    );
  }
  if (soIds.length) {
    addUpdate('sales_order.wf_instance_id→null', 'sales_order', { id: { in: soIds } }, { wf_instance_id: null });
  }
  if (wfIds.length) {
    addDirect('workflow_instance', 'workflow_instance', { id: { in: wfIds } });
  }

  if (invoiceIds.length) {
    addDirect('invoice', 'invoice', { id: { in: invoiceIds } });
  }

  // Procurement
  if (poIds.length) {
    addDirect('purchase_order_item', 'purchase_order_item', { instance_id: { in: poIds } });
    addDirect('purchase_order', 'purchase_order', { id: { in: poIds } });
  }
  if (prIds.length) {
    addDirect('item (PR lines)', 'item', { instance_id: { in: prIds } });
    addDirect('purchase_requisition', 'purchase_requisition', { id: { in: prIds } });
  }

  // Sales pipeline (no LE column — location / SO scoped)
  if (dcIds.length) {
    addDirect('delivery_challan_item', 'delivery_challan_item', { delivery_challan_id: { in: dcIds } });
    addDirect('delivery_challan', 'delivery_challan', { id: { in: dcIds } });
  }
  if (quoteIds.length) {
    addDirect('quote_item', 'quote_item', { quote_id: { in: quoteIds } });
    addDirect('quote', 'quote', { id: { in: quoteIds } });
  }
  if (soIds.length) {
    addDirect('sales_order_item', 'sales_order_item', { sales_order_id: { in: soIds } });
    addDirect('sales_order', 'sales_order', { id: { in: soIds } });
  }

  if (instanceIdsForAttachments.length) {
    addDirect('attachment', 'attachment', { instance_id: { in: instanceIdsForAttachments } });
  }

  // Budgets tied to LE accounts
  if (budgetPeriodIds.length) {
    addDirect('budget_line', 'budget_line', { budget_period_id: { in: budgetPeriodIds } });
    addUpdate(
      'budget_period.account_id→null',
      'budget_period',
      { id: { in: budgetPeriodIds } },
      { account_id: null }
    );
  }

  // Org structure for this LE
  addDirect('employee_master', 'employee_master', le);
  addDirect('department', 'department', le);
  addDirect('cost_center', 'cost_center', le);
  addDirect('business_unit', 'business_unit', le);
  addDirect('location', 'location', le);
  if (paymentTermsIds.length) {
    // Null FKs from customers/suppliers/sales docs before deleting payment terms
    addUpdate(
      'customers.payment_term_id→null',
      'customers',
      { payment_term_id: { in: paymentTermsIds } },
      { payment_term_id: null }
    );
    addUpdate(
      'supplier.payment_term_id→null',
      'supplier',
      { payment_term_id: { in: paymentTermsIds } },
      { payment_term_id: null }
    );
    addUpdate(
      'purchase_order.payment_terms_id→null',
      'purchase_order',
      { payment_terms_id: { in: paymentTermsIds } },
      { payment_terms_id: null }
    );
    addUpdate(
      'sales_order.payment_terms_id→null',
      'sales_order',
      { payment_terms_id: { in: paymentTermsIds } },
      { payment_terms_id: null }
    );
    addUpdate(
      'invoice.payment_terms_id→null',
      'invoice',
      { payment_terms_id: { in: paymentTermsIds } },
      { payment_terms_id: null }
    );
  }
  addDirect('payment_terms', 'payment_terms', le);
  addDirect('general_ledger', 'general_ledger', le);
  addDirect('project_master', 'project_master', le);

  // Tax / integrations / COA / entity
  addDirect('entity_tax_settings', 'entity_tax_settings', le);
  addDirect('party_tax_registration', 'party_tax_registration', {
    party_type: 'entity',
    party_id: entityId,
  });
  addDirect('source_system', 'source_system', le);
  if (plaidItemIds.length) {
    addUpdate('account.plaid_item_id→null', 'account', { plaid_item_id: { in: plaidItemIds } }, { plaid_item_id: null });
    addDirect('plaid_item', 'plaid_item', { id: { in: plaidItemIds } });
  }
  addDirect('account', 'account', le);
  addDirect('entity', 'entity', { id: entityId });

  const counts: Record<string, number> = {};
  let total = 0;

  if (!confirm) {
    for (const step of plan) {
      const n = await step.count();
      counts[step.label] = n;
      total += n;
    }
    return {
      entityId,
      entityName: entity.organization_name,
      orgId,
      dryRun: true,
      counts,
      total,
    };
  }

  console.log(`[demo-data] Removing legal entity ${entityId} (${entity.organization_name})...`);
  for (const step of plan) {
    const n = await step.run();
    counts[step.label] = n;
    if (n > 0) {
      console.log(`  ${step.label}: ${n}`);
      total += n;
    }
  }
  console.log(`[demo-data] Done. Removed ${total} record(s) for legal entity ${entityId}.`);

  return {
    entityId,
    entityName: entity.organization_name,
    orgId,
    dryRun: false,
    counts,
    total,
  };
}
