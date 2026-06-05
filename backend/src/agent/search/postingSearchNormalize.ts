import { AuthContext } from '../../auth/types';
import {
  computeDatePlaceholders,
  getAppTimezoneOffsetMinutes,
} from '../prompt/datePlaceholders';
import {
  alignAccountIdToHeaderLegalEntity,
  resolveAccountIdsForPostingSearch,
} from '../postingCreateHelpers';
import { userRequestedLastWeek } from './searchIntent';
import type { PostingSearchFilterOptions, SearchFilterEntry } from './searchFilterTypes';

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
export async function resolvePostingSearchAccountNames(
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

export function isExplicitPostingAccountSearch(filters: SearchFilterEntry[]): boolean {
  return filters.some(
    (f) =>
      (f.field === 'account_id' ||
        f.field === 'credit_account_id' ||
        f.field === 'account_name') &&
      POSTING_ACCOUNT_NAME_OPERATORS.has(f.operator.toLowerCase())
  );
}

/** Both debit and credit account ids set — transfer / "between two accounts". */
function isPostingTransferBetweenAccountsSearch(filters: SearchFilterEntry[]): boolean {
  const hasDebit = filters.some(
    (f) => f.field === 'account_id' && f.operator === 'eq'
  );
  const hasCredit = filters.some(
    (f) => f.field === 'credit_account_id' && f.operator === 'eq'
  );
  return hasDebit && hasCredit;
}

/** Do not drop header legal_entity_id on 0-row retry for dated / transfer pulls. */
export function shouldKeepEntityOnEmptyPostingSearch(filters: SearchFilterEntry[]): boolean {
  return (
    isPostingNamedDaySearch(filters) ||
    hasPostingAmountFilter(filters) ||
    isExplicitPostingDateRangeSearch(filters) ||
    isPostingTransferBetweenAccountsSearch(filters)
  );
}

/** "Yesterday" and named days use value_date — not created_at (created_at is for today OR only). */
function normalizePostingNamedDayUseValueDate(
  filters: SearchFilterEntry[]
): SearchFilterEntry[] {
  if (filters.some((f) => f.field === 'value_date')) {
    return filters.filter((f) => f.field !== 'created_at');
  }

  const createdGte = filters.find(
    (f) => f.field === 'created_at' && f.operator === 'gte'
  );
  const createdLte = filters.find(
    (f) => f.field === 'created_at' && f.operator === 'lte'
  );
  if (
    !createdGte ||
    !createdLte ||
    typeof createdGte.value !== 'string' ||
    typeof createdLte.value !== 'string'
  ) {
    return filters;
  }

  const ph = computeDatePlaceholders();
  const matchesYesterday =
    createdGte.value === ph.yesterdayStart && createdLte.value === ph.yesterdayEnd;
  const isNamedDay =
    sameUtcCalendarDay(createdGte.value, createdLte.value) &&
    !isPostingTodayBounds(createdGte.value, createdLte.value);

  if (!matchesYesterday && !isNamedDay) {
    return filters;
  }

  const withoutCreated = filters.filter((f) => f.field !== 'created_at');
  return [
    ...withoutCreated,
    {
      field: 'value_date',
      operator: 'gte',
      value: matchesYesterday ? ph.yesterdayStart : createdGte.value,
    },
    {
      field: 'value_date',
      operator: 'lte',
      value: matchesYesterday ? ph.yesterdayEnd : createdLte.value,
    },
  ];
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
export function isExplicitPostingDateRangeSearch(filters: SearchFilterEntry[]): boolean {
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

function appCalendarDayFromIso(iso: string): string {
  const offset = getAppTimezoneOffsetMinutes();
  const d = new Date(iso);
  const local = new Date(d.getTime() + offset * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** True only for today's bounds — not yesterday or other named single days. */
function isPostingTodayBounds(gte: string, lte: string): boolean {
  const ph = computeDatePlaceholders();
  if (gte === ph.todayStart && lte === ph.todayEnd) return true;
  if (!sameUtcCalendarDay(gte, lte)) return false;
  return appCalendarDayFromIso(gte) === appCalendarDayFromIso(ph.todayStart);
}

function isTodayPostingSearch(filters: SearchFilterEntry[]): boolean {
  const orFilter = filters.find((f) => f.field === 'or' && f.operator === 'or');
  if (orFilter && Array.isArray(orFilter.value)) {
    return (orFilter.value as Record<string, unknown>[]).some((branch) => {
      for (const field of ['created_at', 'value_date']) {
        const cond = branch[field] as { gte?: string; lte?: string } | undefined;
        if (
          cond?.gte &&
          cond?.lte &&
          isPostingTodayBounds(cond.gte, cond.lte)
        ) {
          return true;
        }
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
      isPostingTodayBounds(gte.value, lte.value)
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
            gte: ph.lastYearQ3Start,
            lt: ph.lastYearQ3End,
          },
        },
        {
          value_date: {
            gte: ph.lastYearFyQ3Start,
            lt: ph.lastYearFyQ3End,
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
      return { field: 'value_date', operator: 'gte', value: ph.lastMonthStart };
    }
    if (f === endF) {
      return { field: 'value_date', operator: 'lt', value: ph.monthStart };
    }
    return f;
  });
}

/** Previous calendar week (Mon–Sun): gte lastWeekStart, lt weekStart — not this week Mon→today. */
function normalizePostingLastWeekRange(
  filters: SearchFilterEntry[],
  userQuestion?: unknown
): SearchFilterEntry[] {
  const ph = computeDatePlaceholders();
  const wantsLastWeek = userRequestedLastWeek(userQuestion);

  const gteF = filters.find((f) => f.field === 'value_date' && f.operator === 'gte');
  const endF = filters.find(
    (f) =>
      f.field === 'value_date' && (f.operator === 'lte' || f.operator === 'lt')
  );

  const matchesLastWeekLower =
    gteF &&
    typeof gteF.value === 'string' &&
    (gteF.value === ph.lastWeekStart ||
      gteF.value.startsWith(ph.lastWeekStartDate));

  const misusedThisWeek =
    wantsLastWeek &&
    gteF &&
    typeof gteF.value === 'string' &&
    gteF.value === ph.weekStart;

  if (!wantsLastWeek && !matchesLastWeekLower && !misusedThisWeek) {
    return filters;
  }

  const without = filters.filter(
    (f) => f.field !== 'value_date' && f.field !== 'created_at'
  );
  return [
    ...without,
    { field: 'value_date', operator: 'gte', value: ph.lastWeekStart },
    { field: 'value_date', operator: 'lt', value: ph.weekStart },
  ];
}

const POSTING_AMOUNT_FILTER_OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);

export function hasPostingAmountFilter(filters: SearchFilterEntry[]): boolean {
  return filters.some(
    (f) =>
      f.field === 'amount' &&
      POSTING_AMOUNT_FILTER_OPERATORS.has(f.operator.toLowerCase())
  );
}

/** Single calendar day on value_date/created_at that is not today (yesterday, named day). */
export function isPostingNamedDaySearch(filters: SearchFilterEntry[]): boolean {
  for (const field of ['value_date', 'created_at'] as const) {
    const gte = filters.find((f) => f.field === field && f.operator === 'gte');
    const lte = filters.find((f) => f.field === field && f.operator === 'lte');
    if (
      gte &&
      lte &&
      typeof gte.value === 'string' &&
      typeof lte.value === 'string' &&
      sameUtcCalendarDay(gte.value, lte.value) &&
      !isPostingTodayBounds(gte.value, lte.value)
    ) {
      return true;
    }
  }
  return false;
}

/** Header legal entity scopes account, period, and amount list pulls; not today/recent/all-entities. */
function shouldScopePostingToHeaderEntity(
  filters: SearchFilterEntry[],
  options?: {
    headerLegalEntityId?: string | null;
    accountScoped?: boolean;
    searchAllEntities?: boolean;
  }
): boolean {
  if (options?.searchAllEntities) return false;
  const headerEntity = options?.headerLegalEntityId?.trim() || null;
  if (!headerEntity) return false;
  if (options?.accountScoped) return true;
  if (isPostingTransferBetweenAccountsSearch(filters)) return true;
  if (isPostingNamedDaySearch(filters)) return true;
  if (matchesLast7DaysValueDateRange(filters)) return false;
  if (isTodayPostingSearch(filters)) return false;
  if (isExplicitPostingDateRangeSearch(filters)) return true;
  return hasPostingAmountFilter(filters);
}

export function normalizePostingSearchFilters(
  filters: SearchFilterEntry[],
  options?: PostingSearchFilterOptions
): SearchFilterEntry[] {
  let normalized = normalizePostingAccountFilterFields(filters);
  normalized = normalizePostingNamedDayUseValueDate(normalized);
  normalized = normalizePostingJournalEntryFilters(normalized);
  normalized = normalizePostingPostedDateToValueDate(normalized);
  normalized = normalizePostingQ3LastYearRange(normalized);
  normalized = normalizePostingLastMonthRange(normalized);
  normalized = normalizePostingLastWeekRange(normalized, options?.userQuestion);

  if (shouldScopePostingToHeaderEntity(normalized, options)) {
    const headerEntity = options!.headerLegalEntityId!.trim();
    const withoutEntity = normalized.filter((f) => f.field !== 'legal_entity_id');
    return [
      ...withoutEntity,
      { field: 'legal_entity_id', operator: 'eq', value: headerEntity },
    ];
  }

  return normalized.filter((f) => f.field !== 'legal_entity_id');
}

/** LLM "recent" = last-7-day value_date window (often empty when demo data is older). */
export function matchesLast7DaysValueDateRange(filters: SearchFilterEntry[]): boolean {
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
export function injectPostingRecentListFallback(filters: SearchFilterEntry[]): SearchFilterEntry[] | null {
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
export function injectPostingTodayOrFallback(filters: SearchFilterEntry[]): SearchFilterEntry[] | null {
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

const POSTING_AMOUNT_LIST_PAGE_SIZE = 25;

/** Amount-only list pulls default to 25 rows; Q3/month "pull all" stays at 100. */
function isPostingAmountOnlyListSearch(filters: SearchFilterEntry[]): boolean {
  return (
    hasPostingAmountFilter(filters) && !isExplicitPostingDateRangeSearch(filters)
  );
}

/** DAL defaults to 10 rows when pageSize is omitted — bump for posting list pulls. */
export function resolvePostingSearchPageSize(params: {
  modelName: string;
  pageSize?: number;
  search?: unknown;
}): number | undefined {
  if (params.modelName !== 'posting') return params.pageSize;
  const max = POSTING_AGENT_MAX_PAGE_SIZE;
  const filters = Array.isArray(params.search)
    ? (params.search as SearchFilterEntry[])
    : [];
  if (isPostingAmountOnlyListSearch(filters)) {
    const requested = params.pageSize ?? POSTING_AMOUNT_LIST_PAGE_SIZE;
    return Math.min(requested, POSTING_AMOUNT_LIST_PAGE_SIZE);
  }
  if (params.pageSize != null && params.pageSize > 0) {
    return Math.min(params.pageSize, max);
  }
  return POSTING_AGENT_DEFAULT_PAGE_SIZE;
}
