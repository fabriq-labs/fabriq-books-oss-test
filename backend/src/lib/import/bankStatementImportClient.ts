import axios, { AxiosInstance } from 'axios';

/** Posting fields the bank-statement import script may send (identity CSV→model mapping). */
export const POSTING_BANK_IMPORT_FIELD_KEYS = new Set([
  'name',
  'description',
  'value_date',
  'posting_date',
  'amount',
  'account_id',
  'credit_account_id',
  'legal_entity_id',
  'notes',
]);

/**
 * Build upload `mapping` for posting imports: union of field keys across all rows.
 * Required because debit lines set `credit_account_id` and credit lines set `account_id`;
 * using only the first row omits keys needed for later rows (UploadService drops unmapped keys).
 */
export function buildPostingImportFieldMapping(
  rows: Record<string, unknown>[]
): Record<string, string> {
  const keysSeen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (POSTING_BANK_IMPORT_FIELD_KEYS.has(key)) {
        keysSeen.add(key);
      }
    }
  }
  const mapping: Record<string, string> = {};
  for (const key of keysSeen) {
    mapping[key] = key;
  }
  return mapping;
}

/**
 * Normalize backend base URL for REST clients: strip trailing slash and a trailing `/api`
 * segment so paths like `/api/parse-document/...` resolve correctly.
 */
export function normalizeFabriqApiBaseUrl(url: string): string {
  let normalized = url.replace(/\/$/, '');
  if (normalized.endsWith('/api')) {
    normalized = normalized.replace(/\/api$/, '');
  }
  return normalized;
}

export type FabriqImportAuth =
  | { bearerToken: string; apiKey?: never }
  | { apiKey: string; bearerToken?: never };

/**
 * Axios instance for bank-statement import: either JWT or X-API-Key (mutually exclusive).
 */
export function createFabriqImportAxios(
  baseURL: string,
  auth: FabriqImportAuth
): AxiosInstance {
  const hasToken = auth.bearerToken != null && auth.bearerToken !== '';
  const hasKey = auth.apiKey != null && auth.apiKey !== '';
  if (hasToken === hasKey) {
    throw new Error('Provide exactly one of bearerToken or apiKey');
  }

  const headers: Record<string, string> = {};
  if (hasToken) {
    headers.Authorization = `Bearer ${auth.bearerToken}`;
  } else {
    headers['X-API-Key'] = auth.apiKey!;
  }

  return axios.create({
    baseURL,
    headers,
    timeout: 120000,
  });
}
