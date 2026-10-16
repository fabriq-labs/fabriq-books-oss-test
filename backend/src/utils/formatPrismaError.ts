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

  return {
    model: modelName,
    ...base,
    batch,
  };
}
