import {
  BrokerOptionChainDTO,
  BrokerOptionExpiryDTO,
  BrokerOptionQuoteDTO,
  BrokerOptionRootDTO,
  BrokerOptionStrikeDTO,
} from '../types';

interface QtChainPerStrikePrice {
  strikePrice: number;
  callSymbolId: number;
  putSymbolId: number;
}

interface QtChainPerRoot {
  root?: string;
  optionRoot?: string;
  multiplier?: number;
  chainPerStrikePrice?: QtChainPerStrikePrice[];
}

interface QtOptionExpiry {
  expiryDate: string;
  description?: string;
  listingExchange?: string;
  optionExerciseType?: string;
  chainPerRoot?: QtChainPerRoot[];
}

interface QtOptionChainResponse {
  options?: QtOptionExpiry[];
  optionChain?: QtOptionExpiry[];
}

interface QtOptionQuote {
  symbolId: number;
  symbol?: string;
  underlying?: string;
  underlyingId?: number;
  bidPrice?: number;
  askPrice?: number;
  lastTradePrice?: number;
  lastTradePriceTrHrs?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
  volatility?: number;
  openInterest?: number;
  volume?: number;
  lastTradeSize?: number;
  isHalted?: boolean;
}

function mapStrike(raw: QtChainPerStrikePrice): BrokerOptionStrikeDTO {
  return {
    strikePrice: raw.strikePrice,
    callSymbolId: raw.callSymbolId,
    putSymbolId: raw.putSymbolId,
  };
}

function mapRoot(raw: QtChainPerRoot): BrokerOptionRootDTO {
  return {
    root: raw.optionRoot ?? raw.root ?? '',
    multiplier: raw.multiplier ?? 100,
    strikes: (raw.chainPerStrikePrice ?? []).map(mapStrike),
  };
}

function mapExpiry(raw: QtOptionExpiry): BrokerOptionExpiryDTO {
  return {
    expiryDate: raw.expiryDate,
    description: raw.description,
    listingExchange: raw.listingExchange,
    optionExerciseType: raw.optionExerciseType,
    chainPerRoot: (raw.chainPerRoot ?? []).map(mapRoot),
  };
}

export function mapOptionChain(
  underlyingSymbolId: number,
  raw: QtOptionChainResponse,
  underlyingSymbol?: string
): BrokerOptionChainDTO {
  const expiries = raw.optionChain ?? raw.options ?? [];
  return {
    underlyingSymbolId,
    underlyingSymbol,
    options: expiries.map(mapExpiry),
  };
}

export function mapOptionQuote(raw: QtOptionQuote): BrokerOptionQuoteDTO {
  return {
    symbolId: raw.symbolId,
    symbol: raw.symbol,
    underlying: raw.underlying,
    underlyingId: raw.underlyingId,
    bidPrice: raw.bidPrice,
    askPrice: raw.askPrice,
    lastTradePrice: raw.lastTradePrice,
    lastTradePriceTrHrs: raw.lastTradePriceTrHrs,
    delta: raw.delta,
    gamma: raw.gamma,
    theta: raw.theta,
    vega: raw.vega,
    rho: raw.rho,
    volatility: raw.volatility,
    openInterest: raw.openInterest,
    volume: raw.volume,
    lastTradeSize: raw.lastTradeSize,
    isHalted: raw.isHalted,
  };
}

export function countChainStats(chain: BrokerOptionChainDTO): { expiryCount: number; strikeCount: number } {
  let strikeCount = 0;
  for (const expiry of chain.options) {
    for (const root of expiry.chainPerRoot) {
      strikeCount += root.strikes.length;
    }
  }
  return { expiryCount: chain.options.length, strikeCount };
}
