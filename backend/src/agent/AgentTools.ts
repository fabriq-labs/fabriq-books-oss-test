import { tool } from 'ai';
import { z } from 'zod';
import { ModelService } from '../services/core/ModelService';
import {
  getCreateRecordSchema,
  getUpdateRecordSchema,
  searchRecordsSchema,
  identifyModelSchema,
  GENERIC_FUNCTIONS,
  updateChildRelationSchema,
  addChildrenToParentSchema,
  createChildItemSchema,
  deleteRelationSchema,
  updateChildItemSchema,
  advancedSqlQuerySchema,
  extractInvoiceFromFileSchema,
  erpConnectorSchema
} from './GenericFunctions';
import { AuthContext } from '../auth/types';
import { SYSTEM_FIELDS } from '../services/registry/ModelRegistry';
import { ModelRegistry } from '../services/registry/ModelRegistry';
import logger from '../utils/logger';
import { createERPConnector } from '../lib/integrations/connectors/index';
import prisma from '../lib/prisma';
import { ERPConnector } from '../lib/integrations/connectors/types';
import { computeDatePlaceholders } from './prompt/datePlaceholders';
import { getHandler, getAllMethodNames } from './handlers/erp/registry';
import { matchExtractedLineItemsToPO } from './invoiceMatching';
import {
  preparePostingCreatePayload,
  resolveAccountIdForPosting,
  resolveAccountIdsForPostingSearch,
  alignAccountIdToHeaderLegalEntity,
} from './postingCreateHelpers';

const modelService = ModelService.getInstance();

// Helper to extract description from GENERIC_FUNCTIONS by name
function getDescription(name: string) {
  const fn = GENERIC_FUNCTIONS.find(f => f.name === name);
  return fn ? fn.description : '';
}

function enrichRecordResult(result: any, modelName: string, tool: 'createRecord' | 'updateRecord' | 'createChildItem' | 'updateChildItem') {
  const record = result.data?.data || result.data || result; // adapt to your modelService return shape
  const metadata = ModelRegistry.getInstance().getModelMetadata(modelName);
  const columns = metadata
    ? metadata.fields
      .filter(f => !SYSTEM_FIELDS.includes(f.name))
      .map(f => ({
        field: f.name,
        label: f.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }))
    : (record && typeof record === 'object')
      ? Object.keys(record).filter(f => !SYSTEM_FIELDS.includes(f)).map(f => ({
        field: f,
        label: f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }))
      : [];

  return {
    tool,
    model: modelName,
    resultType: 'record',
    data: record,
    columns,
    actions: [
      { type: 'view', urlTemplate: `/${modelName}/:id` },
      { type: 'edit', urlTemplate: `/${modelName}/:id/edit` }
    ],
    uiHint: 'card',
    metaData: result.metaData || null
  };
}

const POSTING_CREATE_RECORD_DESCRIPTION =
  'Create a new posting. Use modelName "posting" (defaults from page context). ' +
  'In data: account_id = debit account name or id, credit_account_id = credit account name or id, ' +
  'description, amount, posting_date and value_date as DD-MM-YYYY (e.g. 01-01-2026). ' +
  'Same as createRecord for purchase_requisition — saves via DataAccessLayer.create. Do not use searchRecords to create.';

export function createRecordTool(
  auth: AuthContext,
  toolContext?: { modelName?: string; modelContext?: Record<string, any> }
) {
  const description =
    toolContext?.modelName === 'posting'
      ? POSTING_CREATE_RECORD_DESCRIPTION
      : getDescription('createRecord');

  return tool({
    parameters: getCreateRecordSchema(toolContext),
    description,
    execute: async (
      { modelName, data }: { modelName: string; data?: any },
      _options
    ) => {
      // Use modelName from input or fallback to context modelName
      const finalModelName = modelName || toolContext?.modelName;
      if (!finalModelName) {
        throw new Error('Model name is required. Please provide modelName parameter or ensure toolContext contains modelName.');
      }
      // Ensure data is provided
      if (!data) {
        throw new Error('Data is required for creating a record');
      }

      // Special handling for purchase_requisition model
      if (finalModelName === 'purchase_requisition') {
        // Ensure requester field is set
        if (!data.requester) {
          // Try to get user's name from auth context, fallback to user ID
          data.requester = auth.user?.name || auth.user?.email || auth.user?.id || 'Unknown User';
          logger.debug('Auto-setting requester field for purchase requisition', {
            requester: data.requester,
            userId: auth.user?.id
          });
        }
      }

      if (finalModelName === 'posting') {
        await preparePostingCreatePayload(auth, data, toolContext);
      }

      const result = await modelService.create(finalModelName, auth, data);
      const enrichedResult = enrichRecordResult(result, finalModelName, 'createRecord');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function updateRecordTool(auth: AuthContext, toolContext?: { modelName?: string }) {
  return tool({
    parameters: getUpdateRecordSchema(toolContext),
    description: getDescription('updateRecord'),
    execute: async (
      { modelName, id, data }: { modelName: string; id: string; data?: any },
      _options
    ) => {
      // Use modelName from input or fallback to context modelName
      const finalModelName = modelName || toolContext?.modelName;
      if (!finalModelName) {
        throw new Error('Model name is required. Please provide modelName parameter or ensure toolContext contains modelName.');
      }
      // Ensure data is provided
      if (!data) {
        throw new Error('Data is required for updating a record');
      }
      const result = await modelService.update(finalModelName, auth, id, data);
      const enrichedResult = enrichRecordResult(result, finalModelName, 'updateRecord');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

type SearchFilterEntry = { field: string; operator: string; value: unknown };

/** Flatten legacy search object `{ account_id: { eq: "X" }, filters: {…} }` into filter array. */
function legacySearchObjectToFilters(obj: Record<string, unknown>): SearchFilterEntry[] {
  const target =
    obj.filters && typeof obj.filters === 'object' && !Array.isArray(obj.filters)
      ? (obj.filters as Record<string, unknown>)
      : obj;
  const filters: SearchFilterEntry[] = [];
  for (const [field, conditions] of Object.entries(target)) {
    if (field === 'filters') continue;
    if (conditions === null) {
      filters.push({ field, operator: 'is_null', value: true });
    } else if (typeof conditions === 'object' && !Array.isArray(conditions)) {
      for (const [operator, value] of Object.entries(conditions as Record<string, unknown>)) {
        filters.push({ field, operator, value });
      }
    } else {
      filters.push({ field, operator: 'eq', value: conditions });
    }
  }
  return filters;
}

function coerceSearchFilters(search: unknown): SearchFilterEntry[] | undefined {
  if (search == null) return undefined;
  if (Array.isArray(search)) {
    return sanitizeSearchFilters(search) as SearchFilterEntry[];
  }
  if (typeof search !== 'object') return undefined;
  const obj = search as Record<string, unknown>;
  if (Array.isArray(obj.filters)) {
    return sanitizeSearchFilters(obj.filters) as SearchFilterEntry[];
  }
  if (typeof obj.field === 'string' && typeof obj.operator === 'string') {
    return sanitizeSearchFilters([obj]) as SearchFilterEntry[];
  }
  if (typeof obj.filters === 'object' || !obj.field) {
    const legacy = legacySearchObjectToFilters(obj);
    if (legacy.length > 0) return sanitizeSearchFilters(legacy) as SearchFilterEntry[];
  }
  return undefined;
}

function headerLegalEntityIdFromContext(
  toolContext?: { modelContext?: Record<string, unknown> }
): string | null {
  const mc = toolContext?.modelContext;
  if (!mc) return null;
  const id = mc.legalEntityId ?? mc.legal_entity_id;
  return id != null && String(id).trim() !== '' ? String(id) : null;
}

async function normalizeSearchParam(
  search: unknown,
  modelName?: string,
  auth?: AuthContext,
  toolContext?: { modelContext?: Record<string, unknown> }
): Promise<unknown> {
  const filters = coerceSearchFilters(search);
  if (!filters) return search;
  const headerLegalEntityId = headerLegalEntityIdFromContext(toolContext);
  if (modelName === 'account' && auth) {
    return normalizeAccountSearchFilters(filters, headerLegalEntityId);
  }
  if (modelName === 'posting' && auth) {
    const accountScoped = isExplicitPostingAccountSearch(filters);
    let normalized = normalizePostingSearchFilters(filters, {
      headerLegalEntityId,
      accountScoped,
    });
    normalized = await resolvePostingSearchAccountNames(
      normalized,
      auth,
      headerLegalEntityId
    );
    return normalized;
  }
  return filters;
}

/** Keep header legal_entity_id on account lookup; drop other auto-added entity filters. */
function normalizeAccountSearchFilters(
  filters: SearchFilterEntry[],
  headerLegalEntityId?: string | null
): SearchFilterEntry[] {
  return filters.filter((f) => {
    if (f.field !== 'legal_entity_id') return true;
    if (!headerLegalEntityId) return false;
    return f.operator === 'eq' && f.value === headerLegalEntityId;
  });
}

function normalizePostingAccountFilterFields(
  filters: SearchFilterEntry[]
): SearchFilterEntry[] {
  return filters.map((f) => {
    if (f.field === 'debit_account' || f.field === 'debit_account_id') {
      return { ...f, field: 'account_id' };
    }
    if (f.field === 'credit_account' || f.field === 'credit_account_name') {
      return { ...f, field: 'credit_account_id' };
    }
    if (f.field === 'account_name') {
      return { ...f, field: 'account_id' };
    }
    return f;
  });
}

const POSTING_ACCOUNT_NAME_OPERATORS = new Set(['eq', 'in', 'icontains', 'contains', 'ilike', 'like']);

/** Debit/Credit account name on account_id / credit_account_id → acco_… id before search. */
async function resolvePostingSearchAccountNames(
  filters: SearchFilterEntry[],
  auth: AuthContext,
  preferredLegalEntityId?: string | null
): Promise<SearchFilterEntry[]> {
  const resolved: SearchFilterEntry[] = [];
  for (const f of filters) {
    const op = f.operator.toLowerCase();
    const isAccountName =
      (f.field === 'account_id' || f.field === 'credit_account_id') &&
      POSTING_ACCOUNT_NAME_OPERATORS.has(op) &&
      typeof f.value === 'string' &&
      !f.value.trim().startsWith('acco_');
    if (isAccountName) {
      const { operator, value } = await resolveAccountIdsForPostingSearch(
        auth,
        String(f.value),
        preferredLegalEntityId
      );
      resolved.push({ ...f, operator, value });
    } else if (
      (f.field === 'account_id' || f.field === 'credit_account_id') &&
      (f.operator === 'eq' || f.operator === 'in') &&
      typeof f.value === 'string' &&
      f.value.trim().startsWith('acco_')
    ) {
      const aligned = await alignAccountIdToHeaderLegalEntity(
        auth,
        f.value,
        preferredLegalEntityId
      );
      resolved.push({ ...f, value: aligned });
    } else if (
      (f.field === 'account_id' || f.field === 'credit_account_id') &&
      f.operator === 'in' &&
      Array.isArray(f.value)
    ) {
      const ids = await Promise.all(
        (f.value as string[]).map((id) =>
          alignAccountIdToHeaderLegalEntity(auth, id, preferredLegalEntityId)
        )
      );
      resolved.push({ ...f, value: ids });
    } else {
      resolved.push(f);
    }
  }
  return resolved;
}

function isExplicitPostingAccountSearch(filters: SearchFilterEntry[]): boolean {
  return filters.some(
    (f) =>
      (f.field === 'account_id' ||
        f.field === 'credit_account_id' ||
        f.field === 'account_name') &&
      POSTING_ACCOUNT_NAME_OPERATORS.has(f.operator.toLowerCase())
  );
}

function sameUtcCalendarDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

/** Detect "today" list searches (or created_at/value_date same-day bounds). */
/** Multi-day value_date/created_at range (e.g. last month) — must not retry as "today". */
function isExplicitPostingDateRangeSearch(filters: SearchFilterEntry[]): boolean {
  for (const field of ['value_date', 'created_at'] as const) {
    const gte = filters.find((f) => f.field === field && f.operator === 'gte');
    const end = filters.find(
      (f) => f.field === field && (f.operator === 'lte' || f.operator === 'lt')
    );
    if (
      gte &&
      end &&
      typeof gte.value === 'string' &&
      typeof end.value === 'string' &&
      !sameUtcCalendarDay(gte.value, end.value)
    ) {
      return true;
    }
  }
  const orFilter = filters.find((f) => f.field === 'or' && f.operator === 'or');
  if (orFilter && Array.isArray(orFilter.value)) {
    return (orFilter.value as Record<string, unknown>[]).some((branch) => {
      const cond = branch.value_date as
        | { gte?: string; lt?: string; lte?: string }
        | undefined;
      const end = cond?.lt ?? cond?.lte;
      if (cond?.gte && end && typeof cond.gte === 'string' && typeof end === 'string') {
        return !sameUtcCalendarDay(cond.gte, end);
      }
      return false;
    });
  }
  return false;
}

function isTodayPostingSearch(filters: SearchFilterEntry[]): boolean {
  const orFilter = filters.find((f) => f.field === 'or' && f.operator === 'or');
  if (orFilter && Array.isArray(orFilter.value)) {
    return (orFilter.value as Record<string, unknown>[]).some((branch) => {
      for (const field of ['created_at', 'value_date']) {
        const cond = branch[field] as { gte?: string; lte?: string } | undefined;
        if (cond?.gte && cond?.lte && sameUtcCalendarDay(cond.gte, cond.lte)) return true;
      }
      return false;
    });
  }
  for (const field of ['value_date', 'created_at']) {
    const gte = filters.find((f) => f.field === field && f.operator === 'gte');
    const lte = filters.find((f) => f.field === field && f.operator === 'lte');
    if (
      gte &&
      lte &&
      typeof gte.value === 'string' &&
      typeof lte.value === 'string' &&
      sameUtcCalendarDay(gte.value, lte.value)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Postings saved today often have null legal_entity_id; LLM wrongly adds header org/entity id.
 */
/** ISO last-month bounds → date-only gte + lt so June rows are not included or shown as Jun 1. */
/** "Journal entries" = GL postings (neq DUPLICATE), not posting_type eq JOURNAL. */
function normalizePostingJournalEntryFilters(
  filters: SearchFilterEntry[]
): SearchFilterEntry[] {
  let out = filters.map((f) => {
    if (
      f.field === 'posting_type' &&
      f.operator === 'eq' &&
      String(f.value).toUpperCase() === 'JOURNAL'
    ) {
      return { field: 'posting_type', operator: 'neq', value: 'DUPLICATE' };
    }
    return f;
  });
  const hasNeqDuplicate = out.some(
    (f) =>
      f.field === 'posting_type' &&
      (f.operator === 'neq' || f.operator === 'ne') &&
      f.value === 'DUPLICATE'
  );
  const hasClosing = out.some(
    (f) => f.field === 'description' && f.operator === 'ncontains'
  );
  if (!hasNeqDuplicate) {
    out = [
      { field: 'posting_type', operator: 'neq', value: 'DUPLICATE' },
      ...out,
    ];
  }
  if (!hasClosing) {
    out = [
      ...out,
      { field: 'description', operator: 'ncontains', value: 'Closing' },
    ];
  }
  return out;
}

/** "Posted in Q3" means value_date (transaction date), not created_at. */
function normalizePostingPostedDateToValueDate(
  filters: SearchFilterEntry[]
): SearchFilterEntry[] {
  const hasValueDate = filters.some((f) => f.field === 'value_date');
  if (hasValueDate) return filters;

  const createdGte = filters.find((f) => f.field === 'created_at' && f.operator === 'gte');
  const createdEnd = filters.find(
    (f) =>
      f.field === 'created_at' &&
      (f.operator === 'lte' || f.operator === 'lt')
  );
  if (!createdGte || !createdEnd) return filters;

  const withoutCreated = filters.filter((f) => f.field !== 'created_at');
  return [
    ...withoutCreated,
    { field: 'value_date', operator: 'gte', value: createdGte.value },
    {
      field: 'value_date',
      operator: createdEnd.operator,
      value: createdEnd.value,
    },
  ];
}

function monthFromIsoDate(iso: string): number | null {
  const m = String(iso).slice(5, 7);
  const n = parseInt(m, 10);
  return Number.isNaN(n) ? null : n;
}

/** "Q3 of last year" on Indian books → FY Q3 (Oct–Dec); also accept calendar Jul–Sep attempts. */
function normalizePostingQ3LastYearRange(filters: SearchFilterEntry[]): SearchFilterEntry[] {
  const gteF = filters.find((f) => f.field === 'value_date' && f.operator === 'gte');
  const endF = filters.find(
    (f) =>
      f.field === 'value_date' && (f.operator === 'lte' || f.operator === 'lt')
  );
  if (!gteF || !endF || typeof gteF.value !== 'string' || typeof endF.value !== 'string') {
    return filters;
  }

  const ph = computeDatePlaceholders();
  const g = gteF.value.slice(0, 10);
  const e = String(endF.value).slice(0, 10);
  const gMonth = monthFromIsoDate(g);
  const eMonth = monthFromIsoDate(e);

  const looksLikeCalendarQ3 =
    gMonth != null &&
    gMonth >= 7 &&
    gMonth <= 9 &&
    (e.endsWith('-10-01') || eMonth === 9 || eMonth === 10);
  const looksLikeFyQ3 =
    gMonth != null &&
    gMonth >= 10 &&
    (eMonth == null || eMonth >= 10 || eMonth <= 3);
  const looksLikeQ3 =
    looksLikeCalendarQ3 ||
    looksLikeFyQ3 ||
    g === ph.lastYearQ3StartDate ||
    g === ph.lastYearFyQ3StartDate;

  if (!looksLikeQ3) {
    return filters;
  }

  const withoutValueDate = filters.filter(
    (f) => f.field !== 'value_date' || (f !== gteF && f !== endF)
  );
  return [
    ...withoutValueDate,
    {
      field: 'or',
      operator: 'or',
      value: [
        {
          value_date: {
            gte: ph.lastYearQ3StartDate,
            lt: ph.lastYearQ3EndDate,
          },
        },
        {
          value_date: {
            gte: ph.lastYearFyQ3StartDate,
            lt: ph.lastYearFyQ3EndDate,
          },
        },
      ],
    },
  ];
}

function normalizePostingLastMonthRange(filters: SearchFilterEntry[]): SearchFilterEntry[] {
  const gteF = filters.find((f) => f.field === 'value_date' && f.operator === 'gte');
  const endF = filters.find(
    (f) =>
      f.field === 'value_date' && (f.operator === 'lte' || f.operator === 'lt')
  );
  if (!gteF || !endF || typeof gteF.value !== 'string' || typeof endF.value !== 'string') {
    return filters;
  }

  const ph = computeDatePlaceholders();
  const matchesLastMonthBounds =
    (gteF.value === ph.lastMonthStart ||
      gteF.value.startsWith(ph.lastMonthStartDate)) &&
    (endF.value === ph.lastMonthEnd ||
      endF.value === ph.monthStart ||
      endF.value.startsWith(ph.monthStartDate));

  if (!matchesLastMonthBounds) {
    return filters;
  }

  return filters.map((f) => {
    if (f === gteF) {
      return { field: 'value_date', operator: 'gte', value: ph.lastMonthStartDate };
    }
    if (f === endF) {
      return { field: 'value_date', operator: 'lt', value: ph.monthStartDate };
    }
    return f;
  });
}

function normalizePostingSearchFilters(
  filters: SearchFilterEntry[],
  options?: { headerLegalEntityId?: string | null; accountScoped?: boolean }
): SearchFilterEntry[] {
  let normalized = normalizePostingAccountFilterFields(filters);
  normalized = normalizePostingJournalEntryFilters(normalized);
  normalized = normalizePostingPostedDateToValueDate(normalized);
  normalized = normalizePostingQ3LastYearRange(normalized);
  normalized = normalizePostingLastMonthRange(normalized);

  const headerEntity = options?.headerLegalEntityId?.trim() || null;
  if (options?.accountScoped && headerEntity) {
    const withoutEntity = normalized.filter((f) => f.field !== 'legal_entity_id');
    return [
      ...withoutEntity,
      { field: 'legal_entity_id', operator: 'eq', value: headerEntity },
    ];
  }

  return normalized.filter((f) => f.field !== 'legal_entity_id');
}

/** LLM "recent" = last-7-day value_date window (often empty when demo data is older). */
function matchesLast7DaysValueDateRange(filters: SearchFilterEntry[]): boolean {
  const ph = computeDatePlaceholders();
  const gteF = filters.find((f) => f.field === 'value_date' && f.operator === 'gte');
  const endF = filters.find((f) => f.field === 'value_date' && f.operator === 'lte');
  if (!gteF || !endF || typeof gteF.value !== 'string') {
    return false;
  }
  const g = String(gteF.value).slice(0, 10);
  return (
    gteF.value === ph.last7DaysStart ||
    g === ph.last7DaysStartDate ||
    String(gteF.value).startsWith(ph.last7DaysStartDate)
  );
}

/** No rows in last 7 days → return latest postings (base filters only; DAL orders by created_at desc). */
function injectPostingRecentListFallback(filters: SearchFilterEntry[]): SearchFilterEntry[] | null {
  if (!matchesLast7DaysValueDateRange(filters)) {
    return null;
  }
  const base = filters.filter(
    (f) =>
      f.field !== 'value_date' &&
      f.field !== 'created_at' &&
      !(f.field === 'or' && f.operator === 'or')
  );
  return base.length > 0 ? base : null;
}

/** When first posting search returns 0 rows, retry with standard today OR (timezone-safe via SearchQueryBuilder). */
function injectPostingTodayOrFallback(filters: SearchFilterEntry[]): SearchFilterEntry[] | null {
  const base = filters.filter(
    (f) =>
      f.field !== 'legal_entity_id' &&
      !(f.field === 'or' && f.operator === 'or') &&
      !['value_date', 'created_at'].includes(f.field)
  );
  const offset = parseInt(process.env.APP_TIMEZONE_OFFSET_MINUTES ?? '330', 10);
  const localNow = new Date(Date.now() + offset * 60 * 1000);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  startUtc.setUTCMinutes(startUtc.getUTCMinutes() - offset);
  const endUtc = new Date(startUtc);
  endUtc.setUTCDate(endUtc.getUTCDate() + 1);
  const gte = startUtc.toISOString();
  const lte = new Date(endUtc.getTime() - 1).toISOString();

  return [
    ...base,
    {
      field: 'or',
      operator: 'or',
      value: [
        { created_at: { gte, lte } },
        { value_date: { gte, lte } },
      ],
    },
  ];
}

/** Drop filters with missing values; skip unresolved prompt placeholders. */
const POSTING_AGENT_DEFAULT_PAGE_SIZE = 100;
const POSTING_AGENT_MAX_PAGE_SIZE = 200;

/** DAL defaults to 10 rows when pageSize is omitted — bump for posting list pulls. */
function resolvePostingSearchPageSize(params: {
  modelName: string;
  pageSize?: number;
}): number | undefined {
  if (params.modelName !== 'posting') return params.pageSize;
  const max = POSTING_AGENT_MAX_PAGE_SIZE;
  if (params.pageSize != null && params.pageSize > 0) {
    return Math.min(params.pageSize, max);
  }
  return POSTING_AGENT_DEFAULT_PAGE_SIZE;
}

function sanitizeSearchFilters(filters: unknown[]): unknown[] {
  return filters.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const f = entry as Record<string, unknown>;
    const value = f.value;
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'string' && /^\{\{.+\}\}$/.test(value.trim())) return false;
    return typeof f.field === 'string' && typeof f.operator === 'string';
  });
}

export function searchRecordsTool(
  auth: AuthContext,
  toolContext?: { modelContext?: Record<string, unknown> }
) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchRecords'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      const postingPageSize = resolvePostingSearchPageSize(params);
      let searchParam: unknown;
      try {
        searchParam = await normalizeSearchParam(
          params.search,
          params.modelName,
          auth,
          toolContext
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.parse(
          JSON.stringify({
            tool: 'searchRecords',
            model: params.modelName,
            resultType: 'list',
            recordCount: 0,
            totalCount: 0,
            returnedCount: 0,
            truncated: false,
            summary: message,
            error: message,
            data: [],
          })
        );
      }
      let normalized = {
        ...params,
        page: params.page ?? 1,
        pageSize: postingPageSize,
        search: searchParam,
      };
      let result = await modelService.search(normalized.modelName, auth, normalized);
      let enrichedResult = enrichSearchResult(result, params.modelName, {
        page: normalized.page,
        pageSize: postingPageSize,
      });

      if (
        params.modelName === 'posting' &&
        (enrichedResult.totalCount ?? enrichedResult.recordCount) === 0 &&
        Array.isArray(normalized.search)
      ) {
        const postingFilters = normalized.search as SearchFilterEntry[];
        const accountScoped = isExplicitPostingAccountSearch(postingFilters);
        const hadEntity = postingFilters.some((f) => f.field === 'legal_entity_id');

        if (accountScoped && hadEntity) {
          const withoutEntity = postingFilters.filter((f) => f.field !== 'legal_entity_id');
          normalized = { ...normalized, search: withoutEntity };
          result = await modelService.search('posting', auth, normalized);
          enrichedResult = enrichSearchResult(result, params.modelName, {
            page: normalized.page,
            pageSize: postingPageSize,
          });
        } else if (!accountScoped && matchesLast7DaysValueDateRange(postingFilters)) {
          const relaxed = injectPostingRecentListFallback(postingFilters);
          if (relaxed) {
            normalized = { ...normalized, search: relaxed };
            result = await modelService.search('posting', auth, normalized);
            enrichedResult = enrichSearchResult(result, params.modelName, {
              page: normalized.page,
              pageSize: postingPageSize,
            });
            if ((enrichedResult.totalCount ?? 0) > 0) {
              enrichedResult = {
                ...enrichedResult,
                summary:
                  `No postings with value_date in the last 7 days; showing ${enrichedResult.totalCount} most recent matching posting(s) instead. List them (description, amount, value_date as DD-MM-YYYY).`,
              };
            }
          }
        } else if (
          !accountScoped &&
          !isExplicitPostingDateRangeSearch(postingFilters)
        ) {
          const relaxed = injectPostingTodayOrFallback(postingFilters);
          if (relaxed) {
            normalized = { ...normalized, search: relaxed };
            result = await modelService.search('posting', auth, normalized);
            enrichedResult = enrichSearchResult(result, params.modelName, {
              page: normalized.page,
              pageSize: postingPageSize,
            });
          }
        }
      }

      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

// Specific search tools for related models
export function searchItemsTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchItems'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be item_master
      const searchParams = { ...params, modelName: 'item_master' };
      const result = await modelService.search('item_master', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'item_master');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchSuppliersTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchSuppliers'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be supplier
      const searchParams = { ...params, modelName: 'supplier' };
      const result = await modelService.search('supplier', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'supplier');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchDepartmentsTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchDepartments'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be department
      const searchParams = { ...params, modelName: 'department' };
      const result = await modelService.search('department', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'department');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchCostCentersTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchCostCenters'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be cost_center
      const searchParams = { ...params, modelName: 'cost_center' };
      const result = await modelService.search('cost_center', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'cost_center');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchLocationsTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchLocations'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be location
      const searchParams = { ...params, modelName: 'location' };
      const result = await modelService.search('location', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'location');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchProjectsTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchProjects'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be project_master
      const searchParams = { ...params, modelName: 'project_master' };
      const result = await modelService.search('project_master', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'project_master');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchBudgetPeriodsTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchBudgetPeriods'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be budget_period
      const searchParams = { ...params, modelName: 'budget_period' };
      const result = await modelService.search('budget_period', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'budget_period');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchBudgetLinesTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchBudgetLines'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be budget_line
      const searchParams = { ...params, modelName: 'budget_line' };
      const result = await modelService.search('budget_line', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'budget_line');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchCOATool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchCOA'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be coa
      const searchParams = { ...params, modelName: 'coa' };
      const result = await modelService.search('coa', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'coa');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchEntitiesTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchEntities'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be organization
      const searchParams = { ...params, modelName: 'entity' };
      const result = await modelService.search('entity', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'entity');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchEmployeesTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchEmployees'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be employee_master
      const searchParams = { ...params, modelName: 'employee_master' };
      const result = await modelService.search('employee_master', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'employee_master');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function searchUsersTool(auth: AuthContext) {
  return tool({
    parameters: searchRecordsSchema,
    description: getDescription('searchUsers'),
    execute: async (
      params: { modelName: string; search?: any; page?: number; pageSize?: number },
      _options
    ) => {
      // Force modelName to be user_master
      const searchParams = { ...params, modelName: 'user_master' };
      const result = await modelService.search('user_master', auth, searchParams);
      const enrichedResult = enrichSearchResult(result, 'user_master');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

function enrichSearchResult(
  result: any,
  modelName: string,
  pagination?: { page?: number; pageSize?: number }
) {
  const raw = result?.data;
  const records = Array.isArray(raw)
    ? raw.filter((row: unknown) => row && typeof row === 'object' && 'id' in (row as object))
    : [];
  const returnedCount = records.length;
  const totalCount =
    typeof result?.total === 'number' ? result.total : returnedCount;
  const truncated = totalCount > returnedCount;
  const page = pagination?.page ?? result?.page ?? 1;
  const pageSize = pagination?.pageSize ?? result?.pageSize;
  const columns = records.length > 0
    ? Object.keys(records[0])
      .filter(field => !SYSTEM_FIELDS.includes(field))
      .map(field => ({
        field,
        label: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }))
    : [];
  let summary: string;
  if (totalCount === 0) {
    summary = 'No records found matching your search criteria.';
  } else if (truncated) {
    summary =
      `Found ${totalCount} matching record(s); returned ${returnedCount} on page ${page}` +
      (pageSize ? ` (pageSize ${pageSize})` : '') +
      '. Do NOT say only ' +
      `${returnedCount} exist — state the full total ${totalCount}. Summarize or show a short sample from data; use page=2+ or analyticsQuery for full export.`;
  } else {
    summary =
      `Found ${totalCount} record(s). List them in your reply (description, amount, value_date as DD-MM-YYYY).`;
  }
  return {
    tool: 'searchRecords',
    model: modelName,
    resultType: records.length === 1 ? 'record' : 'list',
    recordCount: totalCount,
    totalCount,
    returnedCount,
    truncated,
    page,
    pageSize,
    summary,
    data: records,
    columns,
    actions: [
      { type: 'view', urlTemplate: `/${modelName}/:id` }
    ],
    uiHint: records.length === 1 ? 'card' : 'table',
    metaData: result.metaData || null
  };
}

export function identifyModelTool(auth: AuthContext) {
  return tool({
    parameters: identifyModelSchema,
    description: getDescription('identifyModel'),
    execute: async (
      { userIntent, availableModels }: { userIntent: string; availableModels: any[] },
      _options
    ) => {
      // Not implemented: This is a placeholder for future logic
      throw new Error('identifyModel tool is not implemented.');
    }
  });
}

export function updateChildRelationTool(auth: AuthContext) {
  return tool({
    parameters: updateChildRelationSchema,
    description: getDescription('updateChildRelation'),
    execute: async (
      { modelName, id, relation, childId, data },
      _options
    ) => {
      const result = await modelService.updateChild(modelName, auth, id, relation, childId, data);
      return JSON.parse(JSON.stringify(result));
    }
  });
}

export function addChildrenToParentTool(auth: AuthContext) {
  return tool({
    parameters: addChildrenToParentSchema,
    description: getDescription('addChildrenToParent'),
    execute: async (
      { modelName, id, relation, childIds },
      _options
    ) => {
      const result = await modelService.addChildrenToParent(modelName, id, relation, auth, childIds);
      return JSON.parse(JSON.stringify(result));
    }
  });
}

export function createChildItemTool(auth: AuthContext) {
  return tool({
    parameters: createChildItemSchema,
    description: getDescription('createChildItem'),
    execute: async (
      { parentModelName, parentId, childModelName, data },
      _options
    ) => {
      // Special handling for purchase requisition -> item relationship
      if (parentModelName === 'purchase_requisition' && childModelName === 'item') {
        // Create empty item with only the parent reference
        const itemData: any = {
          instance_id: parentId,
          ...data
        };

        // Handle need_by_date conversion: if it's just a date (YYYY-MM-DD), convert to ISO datetime
        if (itemData.need_by_date && typeof itemData.need_by_date === 'string') {
          // Check if it's just a date (YYYY-MM-DD) and convert to ISO datetime
          if (/^\d{4}-\d{2}-\d{2}$/.test(itemData.need_by_date)) {
            itemData.need_by_date = `${itemData.need_by_date}T00:00:00.000Z`;
          }
        }

        await modelService.create(childModelName, auth, itemData);

        logger.info('createChildItemTool', { parentId, childModelName, itemData });
        // Return the updated parent record with items relation
        const parentResult = await modelService.getById(parentModelName, auth, parentId);
        logger.info('createChildItemTool parentResult', { parentResult });
        const enrichedResult = enrichRecordResult(parentResult, parentModelName, 'createChildItem');
        const safeResult = JSON.parse(JSON.stringify(enrichedResult));
        return safeResult;
      }

      // For other parent-child relationships, create an empty child record
      await modelService.create(childModelName, auth, data || {});

      // Return the updated parent record
      const parentResult = await modelService.getById(parentModelName, auth, parentId);
      const enrichedResult = enrichRecordResult(parentResult, parentModelName, 'createChildItem');
      const safeResult = JSON.parse(JSON.stringify(enrichedResult));
      return safeResult;
    }
  });
}

export function deleteRelationTool(auth: AuthContext) {
  return tool({
    parameters: deleteRelationSchema,
    description: getDescription('deleteRelation'),
    execute: async (
      { modelName, id, relation, childId },
      _options
    ) => {
      const result = await modelService.deleteRelation(auth, modelName, id, relation, childId);
      return JSON.parse(JSON.stringify(result));
    }
  });
}

export function updateChildItemTool(auth: AuthContext) {
  return tool({
    parameters: updateChildItemSchema,
    description: getDescription('updateChildItem'),
    execute: async (
      { itemNumber, parentModelName, parentId, childModelName, data },
      _options
    ) => {
      try {
        logger.debug('Starting updateChildItemTool', { parentModelName, parentId, childModelName, data });

        // Extract fields from data object
        const {
          product_id,
          item_name,
          item_description,
          item_code,
          rate,
          quantity,
          need_by_date
        } = data || {};

        // First, get the parent record to access its items relation
        const initialParentResult = await modelService.getById(parentModelName, auth, parentId);

        if (!initialParentResult.data) {
          throw new Error(`Parent ${parentModelName} with ID ${parentId} not found.`);
        }

        // Get items from the parent's relation
        const parentItems = initialParentResult?.data?.items || initialParentResult?.data[childModelName] || [];

        if (!parentItems || parentItems.length === 0) {
          throw new Error(`No ${childModelName} items found for parent ${parentModelName} with ID ${parentId}.`);
        }

        // Now find the specific item by item_number within the parent's items
        const childItem = parentItems.find((item: any) =>
          item.item_number === itemNumber || item.id === itemNumber
        );

        if (!childItem) {
          throw new Error(`${childModelName} with item_number "${itemNumber}" not found in parent ${parentModelName} with ID ${parentId}. Available items: ${parentItems.map((item: any) => item.item_number || item.id).join(', ')}`);
        }

        // Get the correct ID for the child item - try different possible ID fields
        const childItemId = childItem.id || childItem.item_id || childItem.item_master_id;

        // Check if child item has a product assigned - check all possible product fields
        const hasProduct = childItem.product_id || childItem.product || childItem.product_name || childItem.item_id || childItem.item_master_id;

        logger.debug('Product check', {
          hasProduct,
          product_id: childItem.product_id,
          providedProductId: product_id,
          quantity: quantity,
          need_by_date: need_by_date
        });

        // Build update data object
        let updateData: any = {};

        // Handle product_id - can be an ID or a product name
        if (product_id !== undefined) {
          // Check if product_id is a valid UUID (product ID) or a product name
          const isProductId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product_id) ||
            /^[a-z]+_[0-9a-f-]+$/i.test(product_id); // Handle custom ID formats like 'prod_abc123'

          if (isProductId) {
            // Product is already an ID, use it directly
            updateData.product_id = product_id;
          } else {
            // Product is a name, search for it in item_master
            logger.debug('Searching for product by name (case-insensitive)', { productName: product_id });

            const searchResult = await modelService.search('item_master', auth, {
              search: [
                {
                  field: 'item_name',
                  operator: 'icontains',
                  value: product_id
                }
              ],
              page: 1,
              pageSize: 5
            });

            if (!searchResult.data || searchResult.data.length === 0) {
              // Return a structured response with available products
              logger.debug('Product not found, fetching available products for user selection', {
                searchedProduct: product_id,
                searchResult: searchResult
              });

              // Get a list of available products to show the user
              const availableProductsResult = await modelService.search('item_master', auth, {
                page: 1,
                pageSize: 10
              });

              const availableProducts = availableProductsResult.data || [];

              // Return a structured response that the AI can use to show available products
              const response = {
                tool: 'searchRecords',
                model: parentModelName,
                resultType: 'product_selection_required',
                message: `Product "${product_id}" not found in item_master. Here are some available products you can choose from:`,
                availableProducts: availableProducts.map((p: any) => ({
                  id: p.id,
                  name: p.item_name,
                  description: p.item_description,
                  type: p.item_type,
                  price: p.unit_price
                })),
                itemNumber: itemNumber,
                parentId: parentId,
                childModelName: childModelName,
                requestedProduct: product_id,
                requestedData: data,
                uiHint: 'product_selection',
                actions: [
                  {
                    type: 'select_product',
                    description: 'Please select a product from the list above or provide a different product name/ID',
                    availableProducts: availableProducts.map((p: any) => p.id)
                  }
                ]
              };

              logger.debug('Returning product selection response', {
                resultType: response.resultType,
                availableProductsCount: availableProducts.length,
                requestedProduct: product_id,
                itemNumber: itemNumber
              });

              return response;
            }

            // Use the first matching product
            const foundProduct = searchResult.data[0];
            updateData.product_id = foundProduct.id;

            logger.debug('Found product by name', {
              productName: product_id,
              foundProductId: foundProduct.id,
              foundProductName: foundProduct.item_name,
              totalResults: searchResult.data.length
            });

            // If multiple products found, log a warning but use the first one
            if (searchResult.data.length > 1) {
              logger.warn('Multiple products found for search term', {
                searchTerm: product_id,
                foundProducts: searchResult.data.map((p: any) => ({ id: p.id, name: p.item_name })),
                usingFirst: foundProduct.item_name
              });
            }
          }
        }

        // Determine if we can update quantity and need-by date
        // We can update if:
        // 1. Item already had a product (hasProduct is true), OR
        // 2. We just assigned a product in this request (product_id parameter was provided)
        const canUpdateQuantityAndDate = hasProduct || product_id !== undefined;

        logger.debug('Quantity and date update check', {
          hasProduct,
          productProvided: product_id !== undefined,
          canUpdateQuantityAndDate,
          quantityRequested: quantity !== undefined,
          needByDateRequested: need_by_date !== undefined
        });

        // Only allow quantity and need-by date updates if child item has a product (either existing or newly assigned)
        if (canUpdateQuantityAndDate) {
          if (quantity !== undefined) {
            updateData.quantity = quantity;
          }
          if (need_by_date !== undefined) {
            // Handle both date-only and full ISO datetime formats
            // If it's a full ISO datetime, we'll use it as-is
            // If it's just a date, we'll convert it to ISO datetime
            let processedNeedByDate = need_by_date;

            // Check if it's just a date (YYYY-MM-DD) and convert to ISO datetime
            if (/^\d{4}-\d{2}-\d{2}$/.test(need_by_date)) {
              processedNeedByDate = `${need_by_date}T00:00:00.000Z`;
            }

            updateData.need_by_date = processedNeedByDate;
          }
        } else {
          // If trying to update quantity/date without product, show available products
          if (quantity !== undefined || need_by_date !== undefined) {
            logger.debug('No product assigned, fetching available products for user selection', {
              itemNumber,
              quantity,
              need_by_date
            });

            // Get a list of available products to show the user
            const availableProductsResult = await modelService.search('item_master', auth, {
              page: 1,
              pageSize: 10
            });

            const availableProducts = availableProductsResult.data || [];

            // Return a structured response that the AI can use to show available products
            const response = {
              tool: 'updateChildItem',
              model: parentModelName,
              resultType: 'product_selection_required',
              message: `Cannot update quantity or need-by date for ${childModelName} ${itemNumber} because it has no product assigned. Please select a product from the list below:`,
              availableProducts: availableProducts.map((p: any) => ({
                id: p.id,
                name: p.item_name,
                description: p.item_description,
                type: p.item_type,
                price: p.unit_price
              })),
              itemNumber: itemNumber,
              parentId: parentId,
              childModelName: childModelName,
              requestedQuantity: quantity,
              requestedNeedByDate: need_by_date,
              uiHint: 'product_selection',
              actions: [
                {
                  type: 'select_product',
                  description: 'Please select a product from the list above to assign to this item',
                  availableProducts: availableProducts.map((p: any) => p.id)
                }
              ]
            };

            logger.debug('Returning product selection response (no product assigned)', {
              resultType: response.resultType,
              availableProductsCount: availableProducts.length,
              itemNumber: itemNumber,
              requestedQuantity: quantity,
              requestedNeedByDate: need_by_date
            });

            return response;
          }
        }

        // Handle other optional fields from data object
        if (item_name !== undefined) {
          updateData.item_name = item_name;
        }
        if (item_description !== undefined) {
          updateData.item_description = item_description;
        }
        if (item_code !== undefined) {
          updateData.item_code = item_code;
        }
        if (rate !== undefined) {
          updateData.rate = rate;
        }

        logger.debug('Update data prepared', { updateData, hasProduct, product_id });

        // Update the child item using the parent-child relationship
        logger.debug('Updating child item using updateChild', { parentModelName, parentId, relation: 'items', childItemId, updateData });

        // Use modelService.updateChild to update the child record through the parent relationship
        // Use 'items' as the relation name (plural) as shown in the metadata
        const updateResult = await modelService.updateChild(parentModelName, auth, parentId, 'items', childItemId, updateData);

        logger.debug('Update result', { updateResult });

        // Return the updated parent record with items relation
        logger.debug('Fetching updated parent record', { parentModelName, parentId });
        const parentResult = await modelService.getById(parentModelName, auth, parentId);
        const enrichedResult = enrichRecordResult(parentResult, parentModelName, 'updateChildItem');
        const safeResult = JSON.parse(JSON.stringify(enrichedResult));
        return safeResult;

      } catch (error) {
        logger.error('Error in updateChildItemTool', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          itemNumber,
          parentModelName,
          parentId,
          childModelName
        });
        throw error;
      }
    }
  });
}

// ============================================================================
// HELPER FUNCTIONS FOR COLUMN METADATA ANALYSIS
// ============================================================================

/**
 * Determines if a field represents currency values based on field name and value patterns
 */
function isCurrencyField(fieldName: string, value: any): boolean {
  const currencyFieldPatterns = [
    /amount/i, /price/i, /cost/i, /value/i, /total/i, /sum/i, /balance/i,
    /revenue/i, /expense/i, /budget/i, /payment/i, /fee/i, /charge/i,
    /_amount$/, /_price$/, /_cost$/, /_value$/, /_total$/, /_sum$/,
    /currency/i, /dollar/i, /euro/i, /pound/i, /yen/i
  ];

  const nameMatches = currencyFieldPatterns.some(pattern => pattern.test(fieldName));
  const valueMatches = typeof value === 'number' && (value % 1 !== 0 || value > 100);

  return nameMatches || valueMatches;
}

/**
 * Extracts currency code from field name or returns default
 */
function getCurrencyCode(fieldName: string, value: any): string | null {
  if (!isCurrencyField(fieldName, value)) return null;

  // Check for specific currency indicators in field names
  if (/usd|dollar/i.test(fieldName)) return 'USD';
  if (/eur|euro/i.test(fieldName)) return 'EUR';
  if (/gbp|pound/i.test(fieldName)) return 'GBP';
  if (/jpy|yen/i.test(fieldName)) return 'JPY';
  if (/cad|canadian/i.test(fieldName)) return 'CAD';
  if (/aud|australian/i.test(fieldName)) return 'AUD';

  // Default to USD for most business applications
  return 'USD';
}

/**
 * Determines the best display format for a field based on its characteristics
 */
function getDisplayFormat(fieldName: string, value: any, dataType: string): string {
  // Date/time formats
  if (dataType === 'string' && isDateString(value)) return 'date';
  if (dataType === 'string' && isDateTimeString(value)) return 'datetime';

  // Currency formats
  if (isCurrencyField(fieldName, value)) return 'currency';

  // Percentage formats
  if (fieldName.match(/percentage|percent|rate|ratio/i) ||
    (typeof value === 'number' && value <= 1 && value >= 0)) {
    return 'percentage';
  }

  // Number formats
  if (dataType === 'number') {
    if (Number.isInteger(value)) return 'integer';
    return 'decimal';
  }

  // Text formats
  if (dataType === 'string') {
    if (fieldName.match(/email/i)) return 'email';
    if (fieldName.match(/phone|tel/i)) return 'phone';
    if (fieldName.match(/url|link/i)) return 'url';
    return 'text';
  }

  // Boolean formats
  if (dataType === 'boolean') return 'boolean';

  return 'text';
}

/**
 * Calculates precision (decimal places) for numeric values
 */
function getPrecision(value: any, dataType: string): number | null {
  if (dataType === 'number' && typeof value === 'number') {
    const str = value.toString();
    const decimalIndex = str.indexOf('.');
    if (decimalIndex !== -1) {
      return str.length - decimalIndex - 1;
    }
    return 0; // Integer
  }
  return null;
}

/**
 * Checks if a string value represents a date
 */
function isDateString(value: any): boolean {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/.test(value) || // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}$/.test(value); // DD-MM-YYYY
}

/**
 * Checks if a string value represents a datetime
 */
function isDateTimeString(value: any): boolean {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) || // ISO datetime
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value); // SQL datetime
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
    currency: getCurrencyCode(field, value),
    format: getDisplayFormat(field, value, dataType),
    precision: getPrecision(value, dataType)
  };
}

export function advancedSqlQueryTool(auth: AuthContext) {
  return tool({
    parameters: advancedSqlQuerySchema,
    description: getDescription('advancedSqlQuery'),
    execute: async (
      { query, description, uiHint }: { query: string; description: string; uiHint?: string },
      _options
    ) => {
      try {
        logger.debug('Starting advancedSqlQueryTool', { query, description, uiHint });

        // Execute the SQL query using the model service
        const result = await modelService.executeSqlQuery(query, auth);

        logger.debug('Advanced SQL query result', {
          description,
          rowCount: result.data?.length || 0,
          hasError: !!result.error
        });

        // Handle different UI hint types with appropriate data structures
        const response = buildSqlResponse(result, description, uiHint);

        // Convert BigInt values to regular numbers for JSON serialization
        const safeResult = JSON.parse(JSON.stringify(response, (key, value) => {
          if (typeof value === 'bigint') {
            return Number(value);
          }
          return value;
        }));
        return safeResult;

      } catch (error) {
        logger.error('Error in advancedSqlQueryTool', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          query,
          description,
          uiHint
        });
        throw error;
      }
    }
  });
}

/**
 * Builds the appropriate response structure based on uiHint
 */
function buildSqlResponse(result: any, description: string, uiHint?: string) {
  const data = result.data || [];
  const hasData = data.length > 0;

  // Base response structure
  const baseResponse = {
    tool: 'advancedSqlQuery',
    description,
    error: result.error || null,
    metaData: result.metaData || null
  };

  // Handle metrics display (single row with multiple metrics)
  if (uiHint === 'metrics' && hasData) {
    return buildMetricsResponse(data, baseResponse);
  }

  // Handle table display (multiple rows with columns)
  return buildTableResponse(data, baseResponse, uiHint);
}

/**
 * Builds response structure for metrics display
 * Returns multiple metrics in a single row object for clean display
 */
function buildMetricsResponse(data: any[], baseResponse: any) {
  // For metrics, we want the first row as a single object with multiple metrics
  const metricsRow = data[0];
  const fields = Object.keys(metricsRow);

  return {
    ...baseResponse,
    resultType: 'metrics',
    data: metricsRow, // Single row object: {"total_spend": 2628, "pending_approvals": 5}
    columns: fields.map(field => createColumnMetadata(field, metricsRow[field])),
    rowCount: 1,
    uiHint: 'metrics',
    // Additional metrics-specific metadata
    displayType: 'metrics_grid',
    layout: 'horizontal' // Metrics typically displayed horizontally
  };
}

/**
 * Builds response structure for table/chart display
 * Returns multiple rows with column metadata
 */
function buildTableResponse(data: any[], baseResponse: any, uiHint?: string) {
  const hasData = data.length > 0;
  const fields = hasData ? Object.keys(data[0]) : [];

  return {
    ...baseResponse,
    resultType: 'sql_result',
    data, // Multiple rows: [{"field1": "value1"}, {"field1": "value2"}]
    columns: fields.map(field => createColumnMetadata(field, data[0][field])),
    rowCount: data.length,
    uiHint: uiHint || 'table'
  };
}

// ============================================================================
// INVOICE PROCESSING TOOLS
// ============================================================================

/**
 * Helper function for AI-powered PO line item matching
 */
function findBestPOMatch(invoiceItem: any, poLineItems: any[]): any {
  if (!poLineItems || poLineItems.length === 0) {
    return null;
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const poItem of poLineItems) {
    let score = 0;
    let reasons = [];

    // Exact item name match
    if (invoiceItem.item_name && poItem.item_name &&
      invoiceItem.item_name.toLowerCase() === poItem.item_name.toLowerCase()) {
      score += 50;
      reasons.push('Exact item name match');
    }

    // Partial item name match
    if (invoiceItem.item_name && poItem.item_name &&
      invoiceItem.item_name.toLowerCase().includes(poItem.item_name.toLowerCase())) {
      score += 30;
      reasons.push('Partial item name match');
    }

    // Rate similarity (within 10%)
    if (invoiceItem.rate && poItem.rate) {
      const rateDiff = Math.abs(invoiceItem.rate - poItem.rate) / poItem.rate;
      if (rateDiff <= 0.1) {
        score += 20;
        reasons.push('Rate similarity');
      }
    }

    // Quantity similarity
    if (invoiceItem.invoice_qty && poItem.quantity &&
      Math.abs(invoiceItem.invoice_qty - poItem.quantity) <= 1) {
      score += 15;
      reasons.push('Quantity similarity');
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        ...poItem,
        confidence: Math.min(score, 100),
        reason: reasons.join(', ')
      };
    }
  }

  return bestMatch;
}

/**
 * Process invoice PDF and extract data for form review (no database changes)
 */
export function processInvoiceFromPdfTool(auth: AuthContext) {
  return tool({
    parameters: z.object({
      pdfBuffer: z.string().describe('Base64 encoded PDF buffer'),
      orgId: z.string().describe('Organization ID'),
      poNumber: z.string().optional().describe('Purchase order number if known')
    }),
    description: 'Extract invoice data from PDF and prepare invoice form data for user review',
    execute: async ({ pdfBuffer, orgId, poNumber }, _options) => {
      try {
        logger.debug('Starting invoice PDF processing', { orgId, poNumber });

        // Convert base64 back to buffer
        const buffer = Buffer.from(pdfBuffer, 'base64');

        // Use ModelService to extract invoice data (consistent with other tools)
        const modelService = ModelService.getInstance();

        const extractionResult = await modelService.parseDocument(
          'invoice',
          auth,
          buffer,
          {
            extractorOptions: {
              includeMetadata: true,
              confidenceThreshold: 0.7
            }
          }
        );

        if (!extractionResult.success) {
          throw new Error(`Extraction failed: ${extractionResult.error || 'Unknown error'}`);
        }

        const extractedData = {
          success: true,
          data: extractionResult.data,
          confidence: extractionResult.metaData?.confidence || 100,
          metadata: extractionResult.metaData
        };

        logger.debug('Invoice extraction completed', {
          confidence: extractedData.confidence,
          hasLineItems: !!extractedData.data?.line_items
        });

        // Lookup PO if not provided (read-only operation)
        let poData = null;
        let poLineItems = [];
        const poNumberToUse = poNumber || extractedData.data.invoice.po_number;

        if (poNumberToUse) {
          logger.debug('Looking up purchase order', { poNumber: poNumberToUse });

          const poSearchResult = await modelService.search('purchase_order', auth, {
            search: [{ field: 'po_number', operator: 'eq', value: poNumberToUse }]
          });

          if (poSearchResult.data && poSearchResult.data.length > 0) {
            poData = poSearchResult.data[0];
            logger.debug('Purchase order found', { poId: poData.id });

            // Get PO line items for mapping
            const poItemsResult = await modelService.search('purchase_order_item', auth, {
              search: [{ field: 'instance_id', operator: 'eq', value: poData.id }]
            });
            poLineItems = poItemsResult.data || [];
            logger.debug('PO line items retrieved', { count: poLineItems.length });
          } else {
            logger.warn('Purchase order not found', { poNumber: poNumberToUse });
          }
        }

        // Prepare invoice form data (no database insert)
        const invoiceFormData = {
          // Invoice header data
          invoice_number: extractedData.data.invoice.invoice_number,
          invoice_date: extractedData.data.invoice.invoice_date,
          invoice_version: extractedData.data.invoice.invoice_version || 1,
          invoice_status: 'PENDING',
          invoice_type: 'PURCHASE',
          supplier_name: extractedData.data.invoice.supplier_name || poData?.supplier_details?.supplier_name,
          supplier_remarks: extractedData.data.invoice.supplier_remarks,
          shipping_terms: extractedData.data.invoice.shipping_terms || poData?.supplier_details?.shipping_terms?.shipping_terms,
          shipping_method: extractedData.data.invoice.shipping_method || poData?.supplier_details?.shipping_method?.shipping_method,
          payment_terms: extractedData.data.invoice.payment_terms || poData?.supplier_details?.payment_terms?.payment_terms,
          remit_to: extractedData.data.invoice.remit_to,
          bill_to: extractedData.data.invoice.bill_to,
          deliver_to: extractedData.data.invoice.deliver_to,
          requester_name: extractedData.data.invoice.requester_name || poData?.requester,
          requester_email: extractedData.data.invoice.requester_email,
          po_number: poNumberToUse,
          coa: extractedData.data.invoice.coa || poData?.coa?.coa_code,
          additional_tax: extractedData.data.invoice.additional_tax || 0,
          shipping_cost: extractedData.data.invoice.shipping_cost || 0,
          tax_on_shipping: extractedData.data.invoice.tax_on_shipping || 0,
          handling_cost: extractedData.data.invoice.handling_cost || 0,
          tax_on_handling: extractedData.data.invoice.tax_on_handling || 0,
          misc_cost: extractedData.data.invoice.misc_cost || 0,
          tax_on_misc: extractedData.data.invoice.tax_on_misc || 0,
          invoice_net_total: extractedData.data.invoice.invoice_net_total,
          shipping_handling_misc_total: extractedData.data.invoice.shipping_handling_misc_total || 0,
          invoice_total: extractedData.data.invoice.invoice_total,
          balance_amount: extractedData.data.invoice.balance_amount || extractedData.data.invoice.invoice_total,
          terms_and_conditions: extractedData.data.invoice.terms_and_conditions,

          // Reference data for form
          purchase_order_id: poData?.id,
          org_id: orgId,

          // AI mapping suggestions
          aiSuggestions: {
            confidence: extractedData.confidence,
            extractedAt: new Date().toISOString(),
            poMatchFound: !!poData,
            poNumber: poNumberToUse
          }
        };

        // Prepare line items with AI mapping suggestions
        const lineItemsFormData = (extractedData.data.line_items || []).map((invoiceItem: any, index: number) => {
          // Find best matching PO line item using AI logic
          const bestMatch = findBestPOMatch(invoiceItem, poLineItems);

          return {
            // Invoice line item data
            item_name: invoiceItem.item_name,
            item_number: invoiceItem.item_number || `ITEM-${index + 1}`,
            item_description: invoiceItem.item_description,
            item_type: invoiceItem.item_type,
            rate: invoiceItem.rate,
            ordered_quantity: invoiceItem.ordered_quantity,
            ordered_amount: invoiceItem.ordered_amount,
            invoice_qty: invoiceItem.invoice_qty,
            line_total: invoiceItem.line_total,
            invoiced_amount: invoiceItem.invoiced_amount,
            tax_type: invoiceItem.tax_type,
            tax_rate: invoiceItem.tax_rate,
            tax_rate_intra: invoiceItem.tax_rate_intra || 0,
            line_tax_amount: invoiceItem.line_tax_amount,
            po_number: poNumberToUse,
            need_by_date: invoiceItem.need_by_date,

            // AI mapping suggestions
            aiMapping: {
              suggestedPoItemId: bestMatch?.id,
              suggestedPoItemName: bestMatch?.item_name,
              matchConfidence: bestMatch?.confidence || 0,
              matchReason: bestMatch?.reason || 'No match found',
              requiresReview: !bestMatch || bestMatch.confidence < 80
            }
          };
        });

        logger.debug('Invoice processing completed', {
          invoiceFields: Object.keys(invoiceFormData).length,
          lineItemsCount: lineItemsFormData.length,
          poMatchFound: !!poData
        });

        return {
          tool: 'processInvoiceFromPdf',
          resultType: 'invoice_form_data',
          data: {
            invoice: invoiceFormData,
            lineItems: lineItemsFormData,
            extractedData: extractedData.data,
            poData: poData,
            poLineItems: poLineItems
          },
          message: `Invoice extracted successfully. Found ${lineItemsFormData.length} line items. ${poData ? 'Purchase order matched.' : 'No purchase order found.'}`,
          uiHint: 'invoice_form',
          actions: [
            {
              type: 'review_and_submit',
              description: 'Review the extracted data and submit to create invoice',
              url: '/invoice/create'
            }
          ]
        };

      } catch (error) {
        logger.error('Error in processInvoiceFromPdfTool', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          orgId,
          poNumber
        });

        return {
          tool: 'processInvoiceFromPdf',
          resultType: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          uiHint: 'error'
        };
      }
    }
  });
}

/**
 * Extract invoice data from uploaded file (PDF, image, etc.)
 * The AI SDK reads the file, extracts data according to the schema, and calls this tool with the extracted data.
 * If PO is found and all extracted line items match PO lines (by item name/code), creates the invoice and line items and returns created_invoice_id.
 */
export function extractInvoiceFromFileTool(auth: AuthContext) {
  return tool({
    parameters: extractInvoiceFromFileSchema,
    description: getDescription('extractInvoiceFromFile'),
    execute: async (params: { invoice: any; line_items: any[]; context?: any }, _options) => {
      try {
        logger.debug('Received extracted invoice data', {
          hasInvoice: !!params.invoice,
          lineItemsCount: params.line_items?.length || 0,
          hasContext: !!params.context,
          poNumber: params.invoice?.po_number
        });

        // Lookup purchase order if PO number is present in the invoice
        let purchaseOrder: any = null;
        const poNumber = params.invoice?.po_number;

        if (poNumber) {
          logger.debug('Looking up purchase order', { poNumber });

          try {
            const poSearchResult = await modelService.search('purchase_order', auth, {
              search: [{ field: 'po_number', operator: 'eq', value: poNumber }]
            });

            if (poSearchResult.success && poSearchResult.data && poSearchResult.data.length > 0) {
              purchaseOrder = { ...poSearchResult.data[0], metadata: poSearchResult.metaData };
            } else {
              logger.warn('Purchase order not found', { poNumber });
            }
          } catch (poError) {
            logger.error('Error searching for purchase order', {
              error: poError instanceof Error ? poError.message : 'Unknown error',
              poNumber
            });
            // Continue without PO data if search fails
          }
        }

        let createdInvoiceId: string | undefined;
        let rejectionReason: string | undefined;

        if (!poNumber) {
          rejectionReason = 'No PO number found on invoice';
        } else if (!purchaseOrder) {
          rejectionReason = `Purchase order not found for PO number: ${poNumber}`;
        } else if (!params.line_items?.length) {
          rejectionReason = 'No line items extracted from invoice';
        }

        if (purchaseOrder && params.line_items?.length > 0) {
          try {
            const poItemsResult = await modelService.search('purchase_order_item', auth, {
              search: [{ field: 'instance_id', operator: 'eq', value: purchaseOrder.id }]
            });
            const poLineItems = (poItemsResult.success && poItemsResult.data ? poItemsResult.data : []) as any[];

            const { allMatched, mapping } = matchExtractedLineItemsToPO(params.line_items, poLineItems);

            if (!allMatched || mapping.length !== params.line_items.length) {
              const extractedNames = params.line_items.map((li: any) => li.item_name || li.item_number || '(unnamed)');
              const poNames = poLineItems.map((li: any) => li.item_name || li.item_code || '(unnamed)');
              rejectionReason = `Line items do not match PO. Invoice items: [${extractedNames.join(', ')}]. PO items: [${poNames.join(', ')}]`;
            }

            if (allMatched && mapping.length === params.line_items.length) {
              const inv = params.invoice || {};
              const invoiceDate = inv.invoice_date
                ? (typeof inv.invoice_date === 'string' ? new Date(inv.invoice_date) : inv.invoice_date)
                : new Date();
              const invoiceData: any = {
                invoice_type: 'With PO',
                status: '9',
                invoice_number: inv.invoice_number,
                invoice_date: invoiceDate,
                supplier_name: inv.supplier_name,
                payment_terms: inv.payment_terms,
                shipping_terms: inv.shipping_terms,
                shipping_method: inv.shipping_method,
                po_number: purchaseOrder.po_number ?? poNumber,
                purchase_order_id: purchaseOrder.id,
                invoice_net_total: inv.invoice_net_total ?? inv.invoice_total,
                invoice_total: inv.invoice_total ?? inv.invoice_net_total,
                additional_tax: inv.additional_tax ?? 0,
                shipping_cost: inv.shipping_cost ?? 0,
                terms_and_conditions: inv.terms_and_conditions,
                org_id: auth.user?.org_id,
                created_by: auth.user?.id,
                modified_by: auth.user?.id
              };

              const lineItemsPayload = params.line_items.map((line: any, i: number) => ({
                item_name: line.item_name,
                item_number: line.item_number,
                item_description: line.item_description,
                item_type: line.item_type,
                rate: line.rate ?? 0,
                ordered_quantity: line.ordered_quantity ?? line.quantity ?? line.invoice_qty,
                ordered_amount: line.ordered_amount ?? line.line_total ?? line.invoiced_amount,
                invoice_qty: line.invoice_qty ?? line.quantity ?? line.ordered_quantity,
                line_total: line.line_total ?? line.invoiced_amount ?? line.ordered_amount,
                tax_rate: line.tax_rate,
                line_tax_amount: line.line_tax_amount,
                po_number: purchaseOrder.po_number ?? poNumber,
                purchase_order_item_id: mapping[i]?.poLineItemId,
                need_by_date: line.need_by_date ? (typeof line.need_by_date === 'string' ? new Date(line.need_by_date) : line.need_by_date) : undefined
              }));

              const createdInvoiceIdFromTx = await prisma.$transaction(async (tx: any) => {
                const createdInvoiceResult = await modelService.create('invoice', auth, invoiceData, {}, tx);
                if (!createdInvoiceResult.success || !createdInvoiceResult.data?.id) {
                  throw new Error(createdInvoiceResult.error ?? 'Failed to create invoice');
                }
                const createdInvoice = createdInvoiceResult.data;
                const addResult = await modelService.addChildrenToParent(
                  'invoice',
                  createdInvoice.id,
                  'invoice_line_item',
                  auth,
                  lineItemsPayload,
                  {},
                  tx
                );
                if (!addResult.success) {
                  throw new Error(addResult.error ?? 'Failed to add invoice line items');
                }
                return createdInvoice.id;
              });

              createdInvoiceId = createdInvoiceIdFromTx;
              logger.info('Auto-created invoice from extracted data with PO match', {
                invoiceId: createdInvoiceId,
                lineItemCount: lineItemsPayload.length
              });
            }
          } catch (createError) {
            const errMsg = createError instanceof Error ? createError.message : 'Unknown error';
            logger.error('Error auto-creating invoice in extractInvoiceFromFileTool', {
              error: errMsg,
              stack: createError instanceof Error ? createError.stack : undefined
            });
            rejectionReason = `Invoice creation failed: ${errMsg}`;
          }
        }

        // Build response data with invoice and purchase order details
        const responseData: any = {
          ...params,
          ...(purchaseOrder ? { purchase_order: purchaseOrder } : {})
        };
        const baseMessage = `Invoice extracted successfully. Found ${params.line_items?.length || 0} line items. ${purchaseOrder ? 'Purchase order found.' : 'No purchase order found.'} `;
        const message = createdInvoiceId
          ? `${baseMessage} Invoice created and matched to PO.`
          : baseMessage;

        const result: any = {
          tool: 'extractInvoiceFromFile',
          resultType: 'invoice_extraction',
          data: responseData,
          uiHint: 'invoice map',
          message
        };
        if (createdInvoiceId) {
          result.created_invoice_id = createdInvoiceId;
          result.invoice_auto_created = true;
        }
        if (rejectionReason) {
          result.rejection_reason = rejectionReason;
        }
        return result;
      } catch (error) {
        logger.error('Error in extractInvoiceFromFileTool', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });

        return {
          tool: 'extractInvoiceFromFile',
          resultType: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          uiHint: 'error'
        };
      }
    }
  });
}

/**
 * Unified ERP connector tool for querying ERP system data
 */
export function erpConnectorTool(auth: AuthContext, context?: any) {
  return tool({
    parameters: erpConnectorSchema,
    description: getDescription('erpConnector'),
    execute: async ({ method, params }, _options) => {
      try {
        logger.debug('Executing erpConnector tool', { method, params, orgId: auth.user?.org_id, recordId: context?.recordId });

        // Determine org_id: try auth context first, fallback to "Indian demo"
        const orgId = auth.user?.org_id || 'Indian demo';

        // Fetch org to get ERP system type
        const org = await prisma.org.findUnique({
          where: { id: orgId },
          select: { erp_system_type: true },
        });

        if (!org) {
          throw new Error(`Organization not found: ${orgId}`);
        }

        // Get ERP system type from org configuration, with fallback for backward compatibility
        const systemType = org.erp_system_type || process.env.ERP_TYPE || 'zoho_books';

        if (!systemType) {
          throw new Error(
            `ERP system type is not configured for organization '${orgId}'. ` +
            `Please configure the ERP system type in the organization settings.`
          );
        }

        // Find active ERP connection for the org
        const connection = await prisma.source_system.findFirst({
          where: {
            org_id: orgId,
            system_type: systemType,
            is_active: true,
          },
          orderBy: {
            created_at: 'desc',
          },
        });

        if (!connection) {
          throw new Error(
            `No active ERP connection found for org_id='${orgId}', system_type='${systemType}'. ` +
            `Please ensure the ERP integration is configured in the source_system table.`
          );
        }

        logger.debug('Found ERP connection', { connectionId: connection.id, orgId, systemType });

        // Create connector instance using factory
        const connector: ERPConnector = await createERPConnector(connection.id);

        // Get handler for the method
        const handler = getHandler(method);

        if (!handler) {
          const availableMethods = getAllMethodNames();
          throw new Error(
            `Invalid method '${method}'. Available methods are: ${availableMethods.join(', ')}`
          );
        }

        // Validate that method exists on connector
        if (typeof (connector as any)[method] !== 'function') {
          throw new Error(`Method '${method}' does not exist on the ERP connector`);
        }

        // Validate and prepare parameters using the handler
        let validatedParams: any;
        try {
          validatedParams = handler.validateParams(params, context, auth);
        } catch (validationError) {
          logger.error('Parameter validation failed', {
            method,
            error: validationError instanceof Error ? validationError.message : 'Unknown error',
            params,
            context: context ? { recordId: context.recordId, modelName: context.modelName } : undefined,
          });
          throw validationError;
        }

        // Execute the handler
        const result = await handler.execute(connector, validatedParams, context, auth);

        logger.debug('ERP connector method executed successfully', { method, hasResult: !!result });

        // Return structured result
        return {
          tool: 'erpConnector',
          method,
          success: true,
          data: result,
        };

      } catch (error) {
        logger.error('Error in erpConnectorTool', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          method,
          params,
          orgId: auth.user?.org_id,
        });

        return {
          tool: 'erpConnector',
          method,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  });
}