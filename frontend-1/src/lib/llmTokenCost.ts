/**
 * Rough cost estimates from OpenRouter list prices for google/gemini-3.5-flash.
 * Source: https://openrouter.ai/google/gemini-3.5-flash (Google Vertex / AI Studio)
 * Cached input is billed at the Cache read rate; uncached at the full Input rate.
 * Estimates only — actual billed amounts may differ by provider routing / discounts.
 */
export const GEMINI_35_FLASH_OPENROUTER_RATES = {
  inputPerMillion: 1.5,
  outputPerMillion: 9.0,
  cacheReadPerMillion: 0.15,
} as const;

export interface TokenCostBreakdown {
  uncachedPromptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  /** Cost if every prompt token were billed at full input rate. */
  costWithoutCache: number;
  /** Cost with cache reads billed at cacheReadPerMillion. */
  costWithCache: number;
  /** costWithoutCache - costWithCache */
  savings: number;
  /** 0–100, null when no prompt tokens */
  savingsPct: number | null;
}

function usd(tokens: number, ratePerMillion: number): number {
  return (tokens / 1_000_000) * ratePerMillion;
}

export function estimateGemini35FlashCost(params: {
  promptTokens?: number | null;
  completionTokens?: number | null;
  cachedPromptTokens?: number | null;
}): TokenCostBreakdown {
  const rates = GEMINI_35_FLASH_OPENROUTER_RATES;
  const prompt = Math.max(0, params.promptTokens ?? 0);
  const completion = Math.max(0, params.completionTokens ?? 0);
  const cached = Math.min(prompt, Math.max(0, params.cachedPromptTokens ?? 0));
  const uncached = prompt - cached;

  const costWithCache =
    usd(uncached, rates.inputPerMillion) +
    usd(cached, rates.cacheReadPerMillion) +
    usd(completion, rates.outputPerMillion);

  const costWithoutCache =
    usd(prompt, rates.inputPerMillion) + usd(completion, rates.outputPerMillion);

  const savings = costWithoutCache - costWithCache;
  const savingsPct =
    costWithoutCache > 0 ? (100 * savings) / costWithoutCache : null;

  return {
    uncachedPromptTokens: uncached,
    cachedPromptTokens: cached,
    completionTokens: completion,
    costWithoutCache,
    costWithCache,
    savings,
    savingsPct,
  };
}

export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(count?: number | null): string {
  if (count == null) return "—";
  return count.toLocaleString();
}
