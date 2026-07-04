import type {
  BrokerOptionChainDTO,
  BrokerOptionExpiryDTO,
  BrokerOptionQuoteDTO,
  BrokerOptionRootDTO,
  BrokerOptionStrikeDTO,
} from '../connectors/types';

export const DEFAULT_EXPIRY_LIMIT = 4;
export const MAX_EXPIRY_LIMIT = 8;
export const DEFAULT_STRIKE_LIMIT = 15;
export const MAX_STRIKE_LIMIT = 25;
export const MAX_QUOTED_CONTRACTS = 100;
export const DEFAULT_OTM_PCT = 0.20;
export const MAX_STRIKE_BAND_PCT = 0.50;

export type OptionSide = 'Call' | 'Put';

export interface EffectiveOptionFilters {
  optionType: OptionSide;
  minStrike: number;
  maxStrike: number;
  expiryDate?: string;
  expiryOffset: number;
  expiryLimit: number;
  strikeOffset: number;
  strikeLimit: number;
  includeQuotes: boolean;
}

export interface TrimmedStrikeRow extends BrokerOptionStrikeDTO {
  quote?: BrokerOptionQuoteDTO | null;
}

export interface TrimmedExpiryRow {
  expiryDate: string;
  optionExerciseType?: string;
  root: string;
  multiplier: number;
  strikes: TrimmedStrikeRow[];
}

export interface TruncationInfo {
  applied: boolean;
  reasons: string[];
  chainStats: {
    totalExpiriesAvailable: number;
    totalStrikesInBand: number;
    expiriesReturned: number;
    strikesReturned: number;
    quotesReturned: number;
  };
  moreAvailable: boolean;
  pagination: {
    nextExpiryOffset: number | null;
    hint: string;
  };
  effectiveFilters: EffectiveOptionFilters;
}

export interface TrimResult {
  chain: TrimmedExpiryRow[];
  truncation: TruncationInfo;
  expectedQuoteSymbolIds: number[];
}

function parseExpiryDate(expiryDate: string): Date {
  return new Date(expiryDate);
}

function expiryDateOnly(expiryDate: string): string {
  return expiryDate.slice(0, 10);
}

function collectStrikesInBand(
  roots: BrokerOptionRootDTO[],
  minStrike: number,
  maxStrike: number
): Array<{ root: BrokerOptionRootDTO; strike: BrokerOptionStrikeDTO }> {
  const rows: Array<{ root: BrokerOptionRootDTO; strike: BrokerOptionStrikeDTO }> = [];
  for (const root of roots) {
    for (const strike of root.strikes) {
      if (strike.strikePrice >= minStrike && strike.strikePrice <= maxStrike) {
        rows.push({ root, strike });
      }
    }
  }
  rows.sort((a, b) => a.strike.strikePrice - b.strike.strikePrice);
  return rows;
}

export function computeEffectiveStrikeBand(params: {
  lastPrice: number;
  optionType: OptionSide;
  minStrike?: number;
  maxStrike?: number;
}): { minStrike: number; maxStrike: number; reasons: string[] } {
  const reasons: string[] = [];
  const bandMin = params.lastPrice * (1 - MAX_STRIKE_BAND_PCT);
  const bandMax = params.lastPrice * (1 + MAX_STRIKE_BAND_PCT);

  let defaultMin: number;
  let defaultMax: number;
  if (params.optionType === 'Call') {
    defaultMin = params.lastPrice;
    defaultMax = params.lastPrice * (1 + DEFAULT_OTM_PCT);
  } else {
    defaultMin = params.lastPrice * (1 - DEFAULT_OTM_PCT);
    defaultMax = params.lastPrice;
  }

  let minStrike = params.minStrike ?? defaultMin;
  let maxStrike = params.maxStrike ?? defaultMax;

  if (params.minStrike == null || params.maxStrike == null) {
    reasons.push(
      params.optionType === 'Call'
        ? 'default_strike_band_atm_to_plus_20pct_otm'
        : 'default_strike_band_minus_20pct_otm_to_atm'
    );
  }

  const clampedMin = Math.max(bandMin, minStrike);
  const clampedMax = Math.min(bandMax, maxStrike);
  if (clampedMin !== minStrike || clampedMax !== maxStrike) {
    reasons.push('strike_band_clamped_to_plus_minus_50pct_from_last_price');
  }

  if (clampedMin > clampedMax) {
    return { minStrike: defaultMin, maxStrike: defaultMax, reasons: [...reasons, 'invalid_strike_range_reset_to_defaults'] };
  }

  return { minStrike: clampedMin, maxStrike: clampedMax, reasons };
}

export function trimOptionChain(
  skeleton: BrokerOptionChainDTO,
  filters: EffectiveOptionFilters
): TrimResult {
  const reasons: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let expiries = skeleton.options.filter((e) => parseExpiryDate(e.expiryDate) >= today);
  expiries.sort((a, b) => parseExpiryDate(a.expiryDate).getTime() - parseExpiryDate(b.expiryDate).getTime());

  const totalExpiriesAvailable = expiries.length;

  if (filters.expiryDate) {
    const target = filters.expiryDate.slice(0, 10);
    expiries = expiries.filter((e) => expiryDateOnly(e.expiryDate) === target);
    if (expiries.length === 0) {
      reasons.push('expiry_date_not_found');
    }
  } else {
    const expiryLimit = Math.min(Math.max(filters.expiryLimit, 1), MAX_EXPIRY_LIMIT);
    if (filters.expiryLimit > MAX_EXPIRY_LIMIT) {
      reasons.push(`expiry_limit_clamped_to_${MAX_EXPIRY_LIMIT}`);
    } else if (filters.expiryLimit !== DEFAULT_EXPIRY_LIMIT) {
      reasons.push(`expiry_limit_set_to_${expiryLimit}`);
    } else {
      reasons.push(`expiries_limited_to_${DEFAULT_EXPIRY_LIMIT}`);
    }

    if (filters.expiryOffset > 0) {
      reasons.push(`expiry_offset_${filters.expiryOffset}`);
    }

    if (filters.expiryOffset >= expiries.length) {
      expiries = [];
      reasons.push('expiry_offset_beyond_available_expiries');
    } else {
      expiries = expiries.slice(filters.expiryOffset, filters.expiryOffset + expiryLimit);
    }
  }

  const strikeLimit = Math.min(Math.max(filters.strikeLimit, 1), MAX_STRIKE_LIMIT);
  if (filters.strikeLimit > MAX_STRIKE_LIMIT) {
    reasons.push(`strike_limit_clamped_to_${MAX_STRIKE_LIMIT}`);
  } else if (filters.strikeLimit !== DEFAULT_STRIKE_LIMIT) {
    reasons.push(`strike_limit_set_to_${strikeLimit}`);
  } else {
    reasons.push(`strikes_limited_to_${DEFAULT_STRIKE_LIMIT}_per_expiry`);
  }

  let totalStrikesInBand = 0;
  let strikesReturned = 0;
  let quotesBudget = MAX_QUOTED_CONTRACTS;
  const trimmedChain: TrimmedExpiryRow[] = [];
  const expectedQuoteSymbolIds: number[] = [];

  for (const expiry of expiries) {
    if (quotesBudget <= 0) {
      reasons.push(`quoted_contracts_capped_at_${MAX_QUOTED_CONTRACTS}`);
      break;
    }

    const primaryRoot = expiry.chainPerRoot[0];
    if (!primaryRoot) continue;

    const inBand = collectStrikesInBand(expiry.chainPerRoot, filters.minStrike, filters.maxStrike);
    totalStrikesInBand += inBand.length;

    let slice = inBand;
    if (filters.strikeOffset > 0) {
      slice = slice.slice(filters.strikeOffset);
      reasons.push(`strike_offset_${filters.strikeOffset}`);
    }
    slice = slice.slice(0, Math.min(strikeLimit, quotesBudget));

    if (slice.length === 0) continue;

    const strikes: TrimmedStrikeRow[] = slice.map(({ strike }) => {
      const symbolId = filters.optionType === 'Call' ? strike.callSymbolId : strike.putSymbolId;
      expectedQuoteSymbolIds.push(symbolId);
      return { ...strike };
    });

    strikesReturned += strikes.length;
    quotesBudget -= strikes.length;

    trimmedChain.push({
      expiryDate: expiry.expiryDate,
      optionExerciseType: expiry.optionExerciseType,
      root: primaryRoot.root,
      multiplier: primaryRoot.multiplier,
      strikes,
    });
  }

  const moreAvailable =
    filters.expiryDate == null &&
    (filters.expiryOffset + Math.min(filters.expiryLimit, MAX_EXPIRY_LIMIT) < totalExpiriesAvailable ||
      totalStrikesInBand > strikesReturned);

  return {
    chain: trimmedChain,
    expectedQuoteSymbolIds,
    truncation: {
      applied: reasons.length > 0,
      reasons,
      chainStats: {
        totalExpiriesAvailable,
        totalStrikesInBand,
        expiriesReturned: trimmedChain.length,
        strikesReturned,
        quotesReturned: 0,
      },
      moreAvailable,
      pagination: {
        nextExpiryOffset:
          filters.expiryDate == null && moreAvailable
            ? filters.expiryOffset + Math.min(filters.expiryLimit, MAX_EXPIRY_LIMIT)
            : null,
        hint: moreAvailable
          ? 'Call again with expiry_offset or expiry_date for the next slice'
          : 'No additional slices available for current filters',
      },
      effectiveFilters: filters,
    },
  };
}

export function mergeQuotesIntoChain(
  trimResult: TrimResult,
  quotes: BrokerOptionQuoteDTO[],
  optionType: OptionSide
): TrimResult {
  const quoteById = new Map(quotes.map((q) => [q.symbolId, q]));
  let quotesReturned = 0;

  for (const expiry of trimResult.chain) {
    for (const strike of expiry.strikes) {
      const symbolId = optionType === 'Call' ? strike.callSymbolId : strike.putSymbolId;
      const quote = quoteById.get(symbolId) ?? null;
      strike.quote = quote;
      if (quote) quotesReturned++;
    }
  }

  return {
    ...trimResult,
    truncation: {
      ...trimResult.truncation,
      chainStats: {
        ...trimResult.truncation.chainStats,
        quotesReturned,
      },
    },
  };
}
