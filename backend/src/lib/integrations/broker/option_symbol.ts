/** Questrade option symbols: NVDA10Jul26P175.00, GOOG10Jul26C405.00 */
export const OPTION_SYMBOL_RE = /\d{1,2}[A-Z][a-z]{2}\d{2}[CP]\d+(\.\d+)?$/;

export function isOptionSymbol(symbol: string): boolean {
  return OPTION_SYMBOL_RE.test(symbol);
}

/** Best-effort parse of underlying ticker from Questrade option symbol (fallback when symbols API unavailable). */
export function parseUnderlyingSymbolFromOption(optionSymbol: string): string | null {
  const match = optionSymbol.match(/^([A-Z]+)\d/);
  return match?.[1] ?? null;
}

/** Parse strike from Questrade option symbol, e.g. NVDA10Jul26P175.00 → 175 */
export function parseStrikeFromOption(optionSymbol: string): number | null {
  const match = optionSymbol.match(/[CP](\d+(?:\.\d+)?)$/);
  return match ? Number(match[1]) : null;
}

/** Parse option type from Questrade option symbol. */
export function parseOptionTypeFromOption(optionSymbol: string): 'C' | 'P' | null {
  const match = optionSymbol.match(/([CP])\d+(?:\.\d+)?$/);
  return match?.[1] === 'C' || match?.[1] === 'P' ? match[1] : null;
}
