import prisma from '../../../prisma';
import logger from '../../../../utils/logger';
import { BrokerConnector } from '../connectors/types';
import { isOptionSymbol, parseUnderlyingSymbolFromOption } from '../option_symbol';
import { upsertInstrument, resolveCurrencyId } from './upserts';

export interface OptionLinkTask {
  instrumentId: string;
  externalSymbolId?: number;
  optionSymbol: string;
  currencyCode?: string;
}

/**
 * Resolve option → underlying link and ensure underlying has external_symbol_id for quotes.
 * Always re-runs enrichment (does not skip when underlying_instrument_id is already set).
 */
export async function enrichOptionUnderlyings(
  connector: BrokerConnector,
  tasks: OptionLinkTask[]
): Promise<void> {
  const uniqueByInstrument = new Map(tasks.map((t) => [t.instrumentId, t]));

  for (const task of uniqueByInstrument.values()) {
    let underlyingSymbol: string | undefined;
    let underlyingSymbolId: number | undefined;
    let underlyingName: string | undefined;
    let currencyCode = task.currencyCode;

    if (task.externalSymbolId && connector.getSymbol) {
      try {
        const sym = await connector.getSymbol(task.externalSymbolId);
        if (sym) {
          underlyingSymbol = sym.underlyingSymbol ?? undefined;
          underlyingSymbolId = sym.underlyingSymbolId;
          underlyingName = sym.underlyingSymbol ?? sym.name;
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

    if (!underlyingSymbolId && connector.searchSymbol) {
      try {
        const found = await connector.searchSymbol(underlyingSymbol);
        if (found) {
          underlyingSymbolId = found.symbolId;
          underlyingName = underlyingName ?? found.name ?? found.symbol;
          currencyCode = currencyCode ?? found.currencyCode;
        }
      } catch (err) {
        logger.warn(`Failed to search symbol for underlying ${underlyingSymbol}`, err);
      }
    }

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

    if (underlyingSymbolId) {
      await prisma.instrument.update({
        where: { id: underlyingId },
        data: { external_symbol_id: underlyingSymbolId },
      });
    }

    await prisma.instrument.update({
      where: { id: task.instrumentId },
      data: { underlying_instrument_id: underlyingId },
    });
  }
}

async function ensureExternalSymbolIds(
  connector: BrokerConnector,
  instrumentIds: string[]
): Promise<void> {
  if (!connector.searchSymbol || instrumentIds.length === 0) return;

  const instruments = await prisma.instrument.findMany({
    where: { id: { in: instrumentIds }, external_symbol_id: null },
    select: { id: true, symbol: true },
  });

  for (const instrument of instruments) {
    try {
      const found = await connector.searchSymbol!(instrument.symbol);
      if (!found?.symbolId) continue;
      await prisma.instrument.update({
        where: { id: instrument.id },
        data: { external_symbol_id: found.symbolId },
      });
    } catch (err) {
      logger.warn(`Failed to resolve symbol id for ${instrument.symbol}`, err);
    }
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
    underlyingIdsToQuote.add(underlyingId);
  }

  if (underlyingIdsToQuote.size === 0) return;

  await ensureExternalSymbolIds(connector, Array.from(underlyingIdsToQuote));

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
