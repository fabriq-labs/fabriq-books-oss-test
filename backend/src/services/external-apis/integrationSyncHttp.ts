/**
 * Low-level HTTP helpers for calling the Python integration sync service (or similar JSON APIs with X-API-Key).
 */

export type IntegrationPostResult = {
  ok: boolean;
  status: number;
  /** Parsed JSON body, or `{ raw: string }` if response was not JSON. */
  data: unknown;
};

/**
 * POST JSON with `X-API-Key`. Parses JSON body; on parse failure stores raw text under `data.raw`.
 */
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

/** Human-readable error from FastAPI-style `{ detail }` or plain JSON error bodies. */
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

/** Map 5xx from upstream to 502 Bad Gateway when proxying to clients. */
export function mapUpstreamHttpStatus(upstreamStatus: number): number {
  return upstreamStatus >= 500 ? 502 : upstreamStatus;
}

/** Normalize base URL: `INTEGRATION_SYNC_URL` + `/sync`. */
export function buildIntegrationSyncUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/sync`;
}
