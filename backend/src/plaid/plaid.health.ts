export type PlaidConnectionStatus = 'healthy' | 'error';

export interface PlaidConnectionHealth {
  status: PlaidConnectionStatus;
  error_code: string | null;
  error_message: string | null;
  consent_expires_at: Date | null;
}

interface PlaidItemErrorShape {
  error_code?: string | null;
  error_message?: string | null;
}

export function extractPlaidApiError(
  err: unknown,
): { error_code: string; error_message: string } | null {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data || typeof data.error_code !== 'string' || data.error_code.length === 0) {
    return null;
  }
  const errorMessage =
    typeof data.error_message === 'string' && data.error_message.length > 0
      ? data.error_message
      : data.error_code;
  return { error_code: data.error_code, error_message: errorMessage };
}

export function healthFromPlaidItem(item: {
  error?: PlaidItemErrorShape | null;
  consent_expiration_time?: string | null;
}): PlaidConnectionHealth {
  const consent = parseConsent(item.consent_expiration_time);
  const code = item.error?.error_code ? String(item.error.error_code) : null;
  if (code) {
    return {
      status: 'error',
      error_code: code,
      error_message: item.error?.error_message || code,
      consent_expires_at: consent,
    };
  }
  return {
    status: 'healthy',
    error_code: null,
    error_message: null,
    consent_expires_at: consent,
  };
}

export function healthFromThrown(err: unknown): PlaidConnectionHealth {
  const parsed = extractPlaidApiError(err);
  if (parsed) {
    return {
      status: 'error',
      error_code: parsed.error_code,
      error_message: parsed.error_message,
      consent_expires_at: null,
    };
  }
  return {
    status: 'error',
    error_code: 'PLAID_REQUEST_FAILED',
    error_message: err instanceof Error ? err.message : 'Plaid request failed',
    consent_expires_at: null,
  };
}

export function plaidErrorToThrow(err: unknown): Error {
  const parsed = extractPlaidApiError(err);
  if (!parsed) {
    return err instanceof Error ? err : new Error('Plaid request failed');
  }
  return new Error(`${parsed.error_code}: ${parsed.error_message}`);
}

function parseConsent(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
