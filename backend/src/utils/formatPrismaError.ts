import { Prisma, PrismaClient } from '@prisma/client';

type PgLike = {
  message?: string;
  code?: string;
  detail?: string;
  hint?: string;
  severity?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
  position?: string;
  internalPosition?: string;
  where?: string;
};

function isPgLike(v: unknown): v is PgLike {
  return typeof v === 'object' && v !== null;
}

/**
 * Prisma known errors + nested driver / Postgres `cause` fields for structured logs.
 */
export function formatPrismaErrorForLog(error: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    out.kind = 'PrismaClientKnownRequestError';
    out.prismaCode = error.code;
    out.message = error.message;
    if (error.meta && typeof error.meta === 'object') {
      out.meta = { ...error.meta };
    }
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    out.kind = 'PrismaClientValidationError';
    out.message = error.message;
  } else if (error instanceof Prisma.PrismaClientRustPanicError) {
    out.kind = 'PrismaClientRustPanicError';
    out.message = error.message;
  } else if (error instanceof Error) {
    out.kind = error.name || 'Error';
    out.message = error.message;
    out.stack = error.stack;
  } else {
    out.kind = 'non-Error';
    out.message = String(error);
    return out;
  }

  const causes: PgLike[] = [];
  let cur: unknown = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  for (let d = 0; d < 6 && cur != null; d++) {
    if (isPgLike(cur)) {
      causes.push({
        message: cur.message,
        code: cur.code,
        detail: cur.detail,
        hint: cur.hint,
        severity: cur.severity,
        schema: cur.schema,
        table: cur.table,
        column: cur.column,
        constraint: cur.constraint,
        position: cur.position,
        internalPosition: cur.internalPosition,
        where: cur.where,
      });
      cur = (cur as { cause?: unknown }).cause;
    } else if (cur instanceof Error) {
      causes.push({ message: cur.message, code: (cur as Error & { code?: string }).code });
      cur = (cur as Error & { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  if (causes.length) {
    out.dbCauseChain = causes;
  }

  return out;
}

/** Per-model fields to include in createMany failure samples (keep payloads small). */
const CREATE_MANY_LOG_FIELDS_BY_MODEL: Record<string, string[]> = {
  posting: [
    'account_id',
    'credit_account_id',
    'legal_entity_id',
    'name',
    'value_date',
    'posting_date',
    'amount',
    'posting_type',
  ],
};

const MAX_GENERIC_ID_KEYS = 14;

function pickFieldsForCreateManySample(
  modelName: string,
  row: Record<string, unknown>
): Record<string, unknown> {
  const lower = modelName.toLowerCase();
  const explicit = CREATE_MANY_LOG_FIELDS_BY_MODEL[lower];
  const picked: Record<string, unknown> = {};
  if (explicit) {
    for (const k of explicit) {
      if (k in row) picked[k] = row[k];
    }
    return picked;
  }
  let idKeys = 0;
  for (const [k, v] of Object.entries(row)) {
    if (k.endsWith('_id') || k === 'id') {
      picked[k] = v;
      idKeys++;
      if (idKeys >= MAX_GENERIC_ID_KEYS) break;
    }
  }
  if (typeof row.name === 'string' && !('name' in picked)) {
    picked.name = row.name;
  }
  return picked;
}

/**
 * Head/tail row samples for createMany failures (Postgres does not report row index in batch INSERT).
 */
export function summarizeCreateManyBatchForLog(
  modelName: string,
  records: Record<string, unknown>[]
): Record<string, unknown> {
  const n = records.length;
  if (n === 0) {
    return { recordCount: 0, head: [], tail: null };
  }
  const headLen = Math.min(3, n);
  const head = records.slice(0, headLen).map((row, i) => ({
    batchIndex: i,
    fields: pickFieldsForCreateManySample(modelName, row),
  }));
  const tail =
    n > headLen
      ? {
          batchIndex: n - 1,
          fields: pickFieldsForCreateManySample(modelName, records[n - 1]!),
        }
      : null;
  return { recordCount: n, head, tail };
}

async function postingAccountFkHint(
  prisma: PrismaClient,
  orgId: string,
  records: Record<string, unknown>[]
): Promise<Record<string, unknown>> {
  const ids = new Set<string>();
  for (const r of records) {
    if (r.account_id != null && r.account_id !== '') ids.add(String(r.account_id));
    if (r.credit_account_id != null && r.credit_account_id !== '') ids.add(String(r.credit_account_id));
  }
  const all = [...ids];
  if (!all.length) {
    return { distinct_account_refs: 0, missing_in_org: [], exists_other_org: [] };
  }
  const inOrg = await prisma.account.findMany({
    where: { id: { in: all }, org_id: orgId },
    select: { id: true },
  });
  const inOrgSet = new Set(inOrg.map((a) => a.id));
  const missingInOrg = all.filter((id) => !inOrgSet.has(id));
  let existsOtherOrg: { id: string; org_id: string | null }[] = [];
  if (missingInOrg.length) {
    existsOtherOrg = await prisma.account.findMany({
      where: { id: { in: missingInOrg } },
      select: { id: true, org_id: true },
    });
  }
  return {
    distinct_account_refs: all.length,
    missing_in_org: missingInOrg.slice(0, 80),
    missing_in_org_count: missingInOrg.length,
    exists_other_org: existsOtherOrg.map((r) => ({ id: r.id, org_id: r.org_id })).slice(0, 40),
  };
}

export type CreateManyErrorLogOptions = {
  prisma: PrismaClient;
  modelName: string;
  orgId?: string | null;
  error: unknown;
  /** Rows actually sent to Prisma (e.g. after permission filter + org_id injection). */
  batchRecords: Record<string, unknown>[];
};

/**
 * Single payload for `logger.error('…', payload)` after createMany fails: Prisma/PG details,
 * batch samples, and optional DB hints (e.g. posting account FKs).
 */
export async function buildCreateManyErrorLogPayload(
  opts: CreateManyErrorLogOptions
): Promise<Record<string, unknown>> {
  const { prisma, modelName, orgId, error, batchRecords } = opts;
  const base = formatPrismaErrorForLog(error);
  const batch = summarizeCreateManyBatchForLog(modelName, batchRecords);

  let fkHint: Record<string, unknown> | undefined;
  if (
    orgId &&
    modelName.toLowerCase() === 'posting' &&
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  ) {
    try {
      fkHint = await postingAccountFkHint(prisma, orgId, batchRecords);
    } catch (hintErr) {
      fkHint = {
        hint_error: hintErr instanceof Error ? hintErr.message : String(hintErr),
      };
    }
  }

  return {
    model: modelName,
    ...base,
    batch,
    ...(fkHint ? { posting_account_fk_hint: fkHint } : {}),
  };
}
