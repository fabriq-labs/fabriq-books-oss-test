import prisma from '../../../prisma';
import logger from '../../../../utils/logger';
import { BrokerConnector } from '../connectors/types';
import { isOptionSymbol, parseUnderlyingSymbolFromOption } from '../option_symbol';
import { upsertInstrument, updateInstrumentMarketData, resolveCurrencyId } from './upserts';

export interface OptionLinkTask {
  instrumentId: string;
  externalSymbolId?: number;
  optionSymbol: string;
  currencyCode?: string;
}

export async function linkOptionUnderlyings(
  connector: BrokerConnector,
  tasks: OptionLinkTask[]
): Promise<void> {
  const uniqueByInstrument = new Map(tasks.map((t) => [t.instrumentId, t]));

  for (const task of uniqueByInstrument.values()) {
    const existing = await prisma.instrument.findUnique({
      where: { id: task.instrumentId },
      select: { underlying_instrument_id: true },
    });
    if (existing?.underlying_instrument_id) continue;

    let underlyingSymbol: string | undefined;
    let underlyingSymbolId: number | undefined;
    let underlyingName: string | undefined;
    let currencyCode = task.currencyCode;

    if (task.externalSymbolId && connector.getSymbol) {
      try {
        const sym = await connector.getSymbol(task.externalSymbolId);
        if (sym?.underlyingSymbol) {
          underlyingSymbol = sym.underlyingSymbol;
          underlyingSymbolId = sym.underlyingSymbolId;
          underlyingName = sym.underlyingSymbol;
          currencyCode = currencyCode ?? sym.currencyCode;
        }
      } catch (err) {
        logger.warn(`Failed to resolve underlying for option ${task.optionSymbol}`, err);
      }
    }

    if (!underlyingSymbol) {
      underlyingSymbol = parseUnderlyingSymbolFromOption(task.optionSymbol) ?? undefined;
    }
    if (!underlyingSymbol) continue;

    const underlyingId = await upsertInstrument(
      {
        symbol: underlyingSymbol,
        name: underlyingName ?? underlyingSymbol,
        type: 'STOCK',
        currencyCode,
        externalSymbolId: underlyingSymbolId,
      },
      { externalSymbolId: underlyingSymbolId }
    );

    await prisma.instrument.update({
      where: { id: task.instrumentId },
      data: { underlying_instrument_id: underlyingId },
    });
  }
}

export async function refreshUnderlyingQuotes(
  connector: BrokerConnector,
  directlyHeldInstrumentIds: Set<string>
): Promise<void> {
  if (!connector.getQuotes) return;

  const optionsWithUnderlying = await prisma.instrument.findMany({
    where: {
      underlying_instrument_id: { not: null },
      holdings: { some: { is_active: true } },
    },
    select: {
      underlying_instrument_id: true,
      underlying: {
        select: { id: true, external_symbol_id: true },
      },
    },
  });

  const underlyingIdsToQuote = new Set<string>();
  for (const row of optionsWithUnderlying) {
    const underlyingId = row.underlying_instrument_id;
    if (!underlyingId || directlyHeldInstrumentIds.has(underlyingId)) continue;
    if (row.underlying?.external_symbol_id != null) {
      underlyingIdsToQuote.add(underlyingId);
    }
  }

  if (underlyingIdsToQuote.size === 0) return;

  const underlyings = await prisma.instrument.findMany({
    where: {
      id: { in: Array.from(underlyingIdsToQuote) },
      external_symbol_id: { not: null },
    },
    select: { id: true, external_symbol_id: true },
  });

  const symbolIdToInstrumentId = new Map<number, string>();
  const symbolIds: number[] = [];
  for (const underlying of underlyings) {
    if (underlying.external_symbol_id != null) {
      symbolIds.push(underlying.external_symbol_id);
      symbolIdToInstrumentId.set(underlying.external_symbol_id, underlying.id);
    }
  }

  if (symbolIds.length === 0) return;

  try {
    const quotes = await connector.getQuotes(symbolIds);
    const now = new Date();
    for (const quote of quotes) {
      const instrumentId = symbolIdToInstrumentId.get(quote.symbolId);
      if (!instrumentId || quote.lastTradePrice == null) continue;
      const priceCurrencyId = quote.currencyCode
        ? await resolveCurrencyId(quote.currencyCode)
        : null;
      await prisma.instrument.update({
        where: { id: instrumentId },
        data: {
          current_price: quote.lastTradePrice,
          price_updated_at: now,
          ...(priceCurrencyId ? { price_currency_id: priceCurrencyId } : {}),
        },
      });
    }
  } catch (err) {
    logger.warn('Failed to refresh underlying quotes', err);
  }
}
