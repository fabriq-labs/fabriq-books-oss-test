/** Equity option contract multiplier (shares per contract). */
export const OPTION_CONTRACT_SIZE = 100;

/** Cap lots sent to Theta so a high-turnover equity book cannot blow the prompt. */
export const MAX_UNDERLYING_TRADES_IN_CONTEXT = 40;

export type OptionStrategyLabel =
  | 'covered_call'
  | 'naked_short_call'
  | 'long_call'
  | 'short_put'
  | 'long_put'
  | 'option';

export type CoverageTradeLeg = {
  trade_id: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  amount: number;
  value_date: string;
};

export function strategyForOption(
  optionType: 'C' | 'P' | null,
  positionQty: number
): OptionStrategyLabel {
  if (optionType === 'C') return positionQty < 0 ? 'naked_short_call' : 'long_call';
  if (optionType === 'P') return positionQty < 0 ? 'short_put' : 'long_put';
  return 'option';
}

/**
 * FIFO remaining long lots that still make up the current share position.
 * Sells consume the oldest buys; leftover short quantity is dropped.
 */
export function remainingLongLots(trades: CoverageTradeLeg[]): CoverageTradeLeg[] {
  const sorted = [...trades].sort((a, b) => {
    const byDate = a.value_date.localeCompare(b.value_date);
    return byDate !== 0 ? byDate : a.trade_id.localeCompare(b.trade_id);
  });

  const lots: CoverageTradeLeg[] = [];
  for (const trade of sorted) {
    if (trade.type === 'BUY') {
      lots.push({ ...trade });
      continue;
    }

    let toSell = trade.quantity;
    while (toSell > 1e-9 && lots.length > 0) {
      const lot = lots[0];
      if (lot.quantity <= toSell + 1e-9) {
        toSell -= lot.quantity;
        lots.shift();
      } else {
        const remainQty = lot.quantity - toSell;
        const remainFrac = remainQty / lot.quantity;
        lots[0] = {
          ...lot,
          quantity: remainQty,
          amount: lot.amount * remainFrac,
        };
        toSell = 0;
      }
    }
  }
  return lots;
}

function trimNum(n: number, decimals: number): string {
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(decimals);
  return s.replace(/\.?0+$/, '');
}

/** Flatten remaining stock lots into a prompt-safe string (modelContext is stringified). */
export function formatTradeLegsForPrompt(legs: CoverageTradeLeg[]): string {
  if (legs.length === 0) return '';
  const shown = legs.slice(0, MAX_UNDERLYING_TRADES_IN_CONTEXT);
  const lines = shown.map(
    (leg) =>
      `${leg.value_date} ${leg.type} ${trimNum(leg.quantity, 4)} @ ${trimNum(leg.price, 4)} (cash ${trimNum(leg.amount, 2)}; id ${leg.trade_id})`
  );
  if (legs.length > shown.length) {
    lines.push(`… ${legs.length - shown.length} more lot(s) omitted`);
  }
  return lines.join('\n');
}
