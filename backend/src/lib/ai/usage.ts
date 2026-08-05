/**
 * Provider-agnostic prompt-cache usage extraction.
 *
 * The Vercel AI SDK (v4) reports base token counts in `result.usage`
 * ({ promptTokens, completionTokens, totalTokens }) but surfaces prompt-cache
 * accounting only through provider-specific `providerMetadata`. This module
 * normalises those provider shapes into two numbers we can store on `llm_trace`:
 *
 *   - cachedPromptTokens  : input tokens served FROM cache at a discount
 *   - cacheCreationTokens : input tokens WRITTEN to the cache at a premium
 *                           (Anthropic only; other providers have no separate
 *                           write metric and report null here)
 *
 * Known provider shapes (as of AI SDK 4.3.x):
 *   OpenAI / OpenRouter(OpenAI): providerMetadata.openai.cachedPromptTokens
 *   Anthropic:                   providerMetadata.anthropic.cacheReadInputTokens
 *                                providerMetadata.anthropic.cacheCreationInputTokens
 *   Google (Vertex/Gemini):      providerMetadata.google.cachedContentTokenCount
 *                                (also seen nested under usageMetadata)
 *   Bedrock:                     providerMetadata.bedrock.usage.cacheReadInputTokens
 *                                providerMetadata.bedrock.usage.cacheWriteInputTokens
 *
 * The extractor is intentionally defensive: it checks the documented keys first,
 * then falls back to a shallow scan for `*cache*` numeric keys so a provider/SDK
 * upgrade that renames a field still yields a best-effort number instead of null.
 */

export interface CacheUsage {
  /** Input tokens read from cache (discounted). Null if the provider reported none. */
  cachedPromptTokens: number | null;
  /** Input tokens written to cache (premium). Null for providers with no write metric. */
  cacheCreationTokens: number | null;
}

/** Loose shape — providerMetadata values are typed as JSONValue by the SDK. */
type AnyMeta = Record<string, any> | undefined | null;

const EMPTY: CacheUsage = { cachedPromptTokens: null, cacheCreationTokens: null };

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/** Sum two nullable counts, preserving null when both are null. */
function addNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

/**
 * Shallow-scan an object for the first numeric value whose key matches `re`.
 * Looks one level deep (e.g. `{ usage: { cacheReadInputTokens } }`) as well.
 */
function scanForNumber(obj: AnyMeta, re: RegExp): number | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const [key, val] of Object.entries(obj)) {
    if (re.test(key)) {
      const n = toPositiveInt(val);
      if (n != null) return n;
    }
    if (val && typeof val === 'object') {
      for (const [k2, v2] of Object.entries(val as Record<string, any>)) {
        if (re.test(k2)) {
          const n = toPositiveInt(v2);
          if (n != null) return n;
        }
      }
    }
  }
  return null;
}

/**
 * Extract normalised cache usage from a single call's `providerMetadata`.
 * Returns all-null when metadata is absent or reports no caching.
 */
export function extractCacheUsage(providerMetadata: AnyMeta): CacheUsage {
  if (!providerMetadata || typeof providerMetadata !== 'object') return { ...EMPTY };

  const openai = providerMetadata.openai as AnyMeta;
  const anthropic = providerMetadata.anthropic as AnyMeta;
  const google = providerMetadata.google as AnyMeta;
  const bedrock = providerMetadata.bedrock as AnyMeta;

  // Documented keys first.
  let cachedPromptTokens: number | null =
    toPositiveInt(openai?.cachedPromptTokens) ??
    toPositiveInt(anthropic?.cacheReadInputTokens) ??
    toPositiveInt(google?.cachedContentTokenCount) ??
    toPositiveInt(google?.usageMetadata?.cachedContentTokenCount) ??
    toPositiveInt(bedrock?.usage?.cacheReadInputTokens);

  let cacheCreationTokens: number | null =
    toPositiveInt(anthropic?.cacheCreationInputTokens) ??
    toPositiveInt(bedrock?.usage?.cacheWriteInputTokens);

  // Defensive fallback: scan every provider namespace for cache-ish keys.
  if (cachedPromptTokens == null || cacheCreationTokens == null) {
    for (const ns of Object.values(providerMetadata)) {
      if (cachedPromptTokens == null) {
        cachedPromptTokens = scanForNumber(ns as AnyMeta, /cach.*(read|prompt|content).*token|token.*cach/i);
      }
      if (cacheCreationTokens == null) {
        cacheCreationTokens = scanForNumber(ns as AnyMeta, /cach.*(creat|write).*token/i);
      }
    }
  }

  return { cachedPromptTokens, cacheCreationTokens };
}

/**
 * Sum cache usage across the per-step `providerMetadata` of a multi-step
 * generateText/streamText result. The SDK's top-level `providerMetadata`
 * reflects only the final step, so multi-step agent turns must be summed to
 * get true cache totals for the whole call.
 */
export function sumCacheUsageFromSteps(
  steps: Array<{ providerMetadata?: AnyMeta }> | undefined | null
): CacheUsage {
  if (!steps || steps.length === 0) return { ...EMPTY };
  let cachedPromptTokens: number | null = null;
  let cacheCreationTokens: number | null = null;
  for (const step of steps) {
    const u = extractCacheUsage(step?.providerMetadata);
    cachedPromptTokens = addNullable(cachedPromptTokens, u.cachedPromptTokens);
    cacheCreationTokens = addNullable(cacheCreationTokens, u.cacheCreationTokens);
  }
  return { cachedPromptTokens, cacheCreationTokens };
}

/**
 * Best-effort cache usage for a result that may expose per-step metadata,
 * a top-level `providerMetadata`, or neither. Prefers the per-step sum
 * (accurate for multi-step turns) and falls back to top-level metadata.
 */
export function resolveCacheUsage(result: {
  steps?: Array<{ providerMetadata?: AnyMeta }> | null;
  providerMetadata?: AnyMeta;
}): CacheUsage {
  const fromSteps = sumCacheUsageFromSteps(result.steps);
  if (fromSteps.cachedPromptTokens != null || fromSteps.cacheCreationTokens != null) {
    return fromSteps;
  }
  return extractCacheUsage(result.providerMetadata);
}
