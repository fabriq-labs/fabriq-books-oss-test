import { ModelService } from '../services/core/ModelService';
import { AuthContext } from '../auth/types';
import logger from '../utils/logger';

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

async function resolveAccountIdForPosting(
  auth: AuthContext,
  nameOrId: string,
  legalEntityId?: string | null
): Promise<string> {
  const trimmed = String(nameOrId).trim();
  if (trimmed.startsWith('acco_')) return trimmed;

  const search: Array<{ field: string; operator: string; value: string }> = [
    { field: 'name', operator: 'icontains', value: trimmed },
  ];
  if (legalEntityId) {
    search.push({ field: 'legal_entity_id', operator: 'eq', value: legalEntityId });
  }

  const result = await modelService.search('account', auth, {
    search,
    pageSize: 25,
    page: 1,
  });
  const rows = extractSearchRows(result);
  const lower = trimmed.toLowerCase();

  let matches = rows.filter((r) => (r.name || '').toLowerCase() === lower);
  if (matches.length === 0) {
    matches = rows.filter((r) => (r.name || '').toLowerCase().includes(lower));
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
      `Multiple accounts match "${trimmed}". Matches: ${names}. Select the legal entity in the app header and retry.`
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

  logger.info('Posting create: resolved accounts, calling DAL', {
    account_id: data.account_id,
    credit_account_id: data.credit_account_id,
    legalEntityId,
  });

  return data;
}
