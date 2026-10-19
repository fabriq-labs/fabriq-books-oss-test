export type IntegrationPostResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

export async function postJsonWithApiKey(
  url: string,
  apiKey: string,
  body: unknown
): Promise<IntegrationPostResult> {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await r.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { ok: r.ok, status: r.status, data };
}

export function messageFromIntegrationResponse(data: unknown, httpStatus: number): string {
  const root = data as Record<string, unknown> | undefined;
  const detail = root?.detail !== undefined ? root.detail : data;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    const o = detail as Record<string, unknown>;
    const nestedErr = o.error;
    if (nestedErr && typeof nestedErr === 'object' && 'message' in nestedErr) {
      const m = String((nestedErr as { message?: unknown }).message ?? '').trim();
      if (m) return m;
    }
    if ('message' in o) {
      const m = String(o.message ?? '').trim();
      if (m) return m;
    }
  }
  return `Integration sync failed (${httpStatus})`;
}

export function mapUpstreamHttpStatus(upstreamStatus: number): number {
  return upstreamStatus >= 500 ? 502 : upstreamStatus;
}

/** `SYNC_SERVICE_URL` (or legacy INTEGRATION_SYNC_URL) + `/sync`. */
export function resolveSyncServiceBaseUrl(): string | undefined {
  const raw =
    process.env.SYNC_SERVICE_URL?.trim() ||
    process.env.INTEGRATION_SYNC_URL?.trim() ||
    (process.env.ENABLE_SYNC_SERVICE !== 'false' ? 'http://127.0.0.1:8090' : undefined);
  return raw || undefined;
}

export function buildIntegrationSyncUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/sync`;
}
