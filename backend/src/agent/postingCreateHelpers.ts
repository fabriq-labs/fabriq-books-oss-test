import { ModelService } from '../services/core/ModelService';
import { AuthContext } from '../auth/types';
import logger from '../utils/logger';
import prisma from '../lib/prisma';

const modelService = ModelService.getInstance();

/** YYYY-MM-DD (and similar) → ISO-8601 DateTime for Prisma DateTime fields */
export function toIsoDateTime(value: unknown, fieldLabel: string): string {
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  if (!s) {
    throw new Error(`${fieldLabel} is required`);
  }
  // Date only: 2026-01-01
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T00:00:00.000Z`;
  }
  // DD-MM-YYYY or DD/MM/YYYY (posting form UI)
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${month}-${day}T00:00:00.000Z`;
  }
  // Already ISO-like
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  throw new Error(
    `Invalid ${fieldLabel} "${s}". Use DD-MM-YYYY (e.g. 01-01-2026) as on the posting form, or full ISO datetime.`
  );
}

function extractSearchRows(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result.data?.data)) return result.data.data;
  return [];
}

/** Same legal entity id used for createRecord and posting searchRecords. */
export async function resolvePostingHeaderLegalEntityId(
  auth: AuthContext,
  toolContext?: { modelContext?: Record<string, unknown> }
): Promise<string | null> {
  const mc = toolContext?.modelContext || {};
  const direct = mc.legalEntityId ?? mc.legal_entity_id;
  if (direct != null && String(direct).trim() !== '') {
    return String(direct).trim();
  }
  if (mc.legalEntityName) {
    return resolveLegalEntityId(auth, String(mc.legalEntityName));
  }
  return null;
}

async function resolveLegalEntityId(
  auth: AuthContext,
  hint?: string | null
): Promise<string | null> {
  if (!hint) return null;
  const trimmed = String(hint).trim();
  if (trimmed.startsWith('org_')) return trimmed;
  const result = await modelService.search('entity', auth, {
    search: [{ field: 'legal_name', operator: 'icontains', value: trimmed }],
    pageSize: 10,
    page: 1,
  });
  const rows = extractSearchRows(result);
  const exact = rows.find(
    (r) => (r.legal_name || '').toLowerCase() === trimmed.toLowerCase()
  );
  if (exact?.id) return exact.id;
  if (rows.length === 1) return rows[0].id;
  const partial = rows.filter((r) =>
    (r.legal_name || '').toLowerCase().includes(trimmed.toLowerCase())
  );
  if (partial.length === 1) return partial[0].id;
  return null;
}

function matchAccountsByName(rows: any[], trimmed: string): any[] {
  const lower = trimmed.toLowerCase();
  let matches = rows.filter((r) => (r.name || '').toLowerCase() === lower);
  if (matches.length === 0) {
    matches = rows.filter((r) => (r.name || '').toLowerCase().includes(lower));
  }
  return matches;
}

/** Org-wide COA lookup (bypasses view-scoped search that can hide accounts under other entities). */
async function findAccountsByNameOrgWide(
  auth: AuthContext,
  trimmed: string
): Promise<Array<{ id: string; name: string | null; legal_entity_id: string | null }>> {
  const orgId = auth.user?.org_id;
  if (!orgId) return [];

  const prismaRows = await prisma.account.findMany({
    where: {
      org_id: orgId,
      name: { contains: trimmed, mode: 'insensitive' },
    },
    take: 50,
    select: { id: true, name: true, legal_entity_id: true },
  });
  if (prismaRows.length > 0) return prismaRows;

  const result = await modelService.search('account', auth, {
    search: [{ field: 'name', operator: 'icontains', value: trimmed }],
    pageSize: 50,
    page: 1,
  });
  return extractSearchRows(result);
}

/** Same COA code under the header legal entity (fixes wrong-entity acco_ id from the model). */
export async function alignAccountIdToHeaderLegalEntity(
  auth: AuthContext,
  accountId: string,
  preferredLegalEntityId?: string | null
): Promise<string> {
  const trimmed = String(accountId).trim();
  const entityId = preferredLegalEntityId?.trim();
  if (!trimmed.startsWith('acco_') || !entityId || !auth.user?.org_id) {
    return trimmed;
  }

  const account = await prisma.account.findFirst({
    where: { id: trimmed, org_id: auth.user.org_id },
    select: { id: true, code: true, legal_entity_id: true },
  });
  if (!account?.code || account.legal_entity_id === entityId) {
    return trimmed;
  }

  const sibling = await prisma.account.findFirst({
    where: {
      org_id: auth.user.org_id,
      legal_entity_id: entityId,
      code: account.code,
    },
    select: { id: true },
  });
  return sibling?.id ?? trimmed;
}

/**
 * Resolve account name → id(s) for posting list/search.
 * When header legal entity is set, prefer that entity's COA row (one eq) — do not search every entity.
 */
export async function resolveAccountIdsForPostingSearch(
  auth: AuthContext,
  nameOrId: string,
  preferredLegalEntityId?: string | null
): Promise<{ operator: 'eq' | 'in'; value: string | string[] }> {
  const trimmed = String(nameOrId).trim();
  if (trimmed.startsWith('acco_')) {
    const aligned = await alignAccountIdToHeaderLegalEntity(
      auth,
      trimmed,
      preferredLegalEntityId
    );
    return { operator: 'eq', value: aligned };
  }

  const rows = await findAccountsByNameOrgWide(auth, trimmed);
  const matches = matchAccountsByName(rows, trimmed);

  if (matches.length === 0) {
    throw new Error(
      `No account found for name "${trimmed}". Lookup is org-wide (do not filter account search by header legal entity).`
    );
  }

  const exact = rows.filter((r) => (r.name || '').toLowerCase() === trimmed.toLowerCase());
  const pool = exact.length > 0 ? exact : matches;

  const entityId = preferredLegalEntityId?.trim() || null;
  if (entityId) {
    const forEntity = pool.filter((r) => r.legal_entity_id === entityId);
    if (forEntity.length === 1) {
      return { operator: 'eq', value: forEntity[0].id };
    }
    if (forEntity.length > 1) {
      return { operator: 'in', value: forEntity.map((r) => r.id as string) };
    }
  }

  if (pool.length === 1) {
    return { operator: 'eq', value: pool[0].id };
  }
  return { operator: 'in', value: pool.map((r) => r.id as string) };
}

export async function resolveAccountIdForPosting(
  auth: AuthContext,
  nameOrId: string,
  legalEntityId?: string | null
): Promise<string> {
  const trimmed = String(nameOrId).trim();
  if (trimmed.startsWith('acco_')) return trimmed;

  const result = await modelService.search('account', auth, {
    search: [{ field: 'name', operator: 'icontains', value: trimmed }],
    pageSize: 50,
    page: 1,
  });
  const rows = extractSearchRows(result);
  let matches = matchAccountsByName(rows, trimmed);

  if (legalEntityId && matches.length > 1) {
    const inEntity = matches.filter((r) => r.legal_entity_id === legalEntityId);
    if (inEntity.length === 1) return inEntity[0].id;
    if (inEntity.length > 1) matches = inEntity;
  }

  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    const names = matches
      .slice(0, 5)
      .map(
        (m) =>
          `${m.name} (${m.legal_entity?.legal_name || m.legal_entity_id || 'unknown entity'})`
      )
      .join('; ');
    throw new Error(
      `Multiple accounts match "${trimmed}". Matches: ${names}. Ask which entity or use a more specific account name.`
    );
  }

  throw new Error(
    `No account found for name "${trimmed}"${legalEntityId ? ' in the selected legal entity' : ''}.`
  );
}

/** Normalize posting payload and resolve account names → ids before DAL create */
export async function preparePostingCreatePayload(
  auth: AuthContext,
  data: Record<string, any>,
  toolContext?: { modelContext?: Record<string, any> }
): Promise<Record<string, any>> {
  if (data.debit_account && !data.account_id) {
    data.account_id = data.debit_account;
  }
  if (data.credit_account && !data.credit_account_id) {
    data.credit_account_id = data.credit_account;
  }
  if (data.debit_account_id && !data.account_id) {
    data.account_id = data.debit_account_id;
  }
  delete data.debit_account_id;
  delete data.debit_account;
  delete data.credit_account;

  const missing: string[] = [];
  if (!data.description) missing.push('description');
  if (data.amount == null || data.amount === '') missing.push('amount');
  if (!data.account_id) missing.push('account_id (Debit Account)');
  if (!data.credit_account_id) missing.push('credit_account_id (Credit Account)');
  if (!data.posting_date) missing.push('posting_date (Posting Date)');
  if (!data.value_date) missing.push('value_date (Value Date)');
  if (missing.length > 0) {
    throw new Error(
      `Cannot create posting — missing: ${missing.join(', ')}. Ask the user for all required fields.`
    );
  }

  if (typeof data.amount === 'string') {
    const parsed = parseFloat(String(data.amount).replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(parsed)) data.amount = parsed;
  }

  data.posting_date = toIsoDateTime(data.posting_date, 'posting_date');
  data.value_date = toIsoDateTime(data.value_date, 'value_date');

  const mc = toolContext?.modelContext || {};
  let legalEntityId: string | null =
    mc.legalEntityId || mc.legal_entity_id || null;
  if (!legalEntityId && mc.legalEntityName) {
    legalEntityId = await resolveLegalEntityId(auth, mc.legalEntityName);
  }
  if (data.legal_entity_id) {
    legalEntityId = String(data.legal_entity_id);
    delete data.legal_entity_id;
  }

  data.account_id = await resolveAccountIdForPosting(
    auth,
    data.account_id,
    legalEntityId
  );
  data.credit_account_id = await resolveAccountIdForPosting(
    auth,
    data.credit_account_id,
    legalEntityId
  );

  if (legalEntityId && !data.legal_entity_id) {
    data.legal_entity_id = legalEntityId;
  }

  logger.info('Posting create: resolved accounts, calling DAL', {
    account_id: data.account_id,
    credit_account_id: data.credit_account_id,
    legal_entity_id: data.legal_entity_id,
  });

  return data;
}
