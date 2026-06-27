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
