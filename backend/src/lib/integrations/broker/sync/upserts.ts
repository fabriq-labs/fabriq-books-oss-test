import prisma from '../../../prisma';
import logger from '../../../../utils/logger';
import {
  BrokerAccountDTO,
  BrokerBalanceDTO,
  BrokerInstrumentDTO,
  BrokerPositionDTO,
  BrokerTradeDTO,
} from '../connectors/types';

const currencyCache = new Map<string, string | null>();

/** Resolve a currency id from its ISO code. Currency is global master data. */
export async function resolveCurrencyId(code?: string): Promise<string | null> {
  if (!code) return null;
  const key = code.toUpperCase();
  if (currencyCache.has(key)) {
    return currencyCache.get(key) ?? null;
  }
  const currency = await prisma.currency.findUnique({ where: { code: key } });
  const id = currency?.id ?? null;
  currencyCache.set(key, id);
  if (!id) {
    logger.warn(`Currency not found for code ${key}; storing null currency_id`);
  }
  return id;
}

/**
 * Upsert an account by (source_record_id, source_system_id, org_id).
 * Using the source lineage fields as the key works across any broker —
 * inst_id is still populated for display but is not the upsert key.
 */
export async function upsertAccount(
  dto: BrokerAccountDTO,
  orgId: string,
  sourceSystemId: string,
  baseCurrencyId: string | null,
  legalEntityId: string | null = null
): Promise<string> {
  const existing = await prisma.account.findFirst({
    where: { source_record_id: dto.externalId, source_system_id: sourceSystemId, org_id: orgId },
    select: { id: true },
  });

  const data = {
    name: dto.name,
    inst_id: dto.externalId,
    org_id: orgId,
    is_active: true,
    last_sync_at: new Date(),
    source_system_id: sourceSystemId,
    source_record_id: dto.externalId,
    source_updated_at: new Date(),
    ...(baseCurrencyId ? { base_currency_id: baseCurrencyId } : {}),
    ...(legalEntityId ? { legal_entity_id: legalEntityId } : {}),
  };

  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await prisma.account.create({ data });
  return created.id;
}

/**
 * Upsert an instrument (global master data, no org filter). Match by ISIN first,
 * then by symbol.
 */
export async function upsertInstrument(
  dto: BrokerInstrumentDTO,
  options?: { externalSymbolId?: number; underlyingInstrumentId?: string }
): Promise<string> {
  const instrumentData = {
    symbol: dto.symbol,
    name: dto.name,
    type: dto.type,
    ...(options?.externalSymbolId != null ? { external_symbol_id: options.externalSymbolId } : {}),
    ...(dto.externalSymbolId != null ? { external_symbol_id: dto.externalSymbolId } : {}),
    ...(options?.underlyingInstrumentId
      ? { underlying_instrument_id: options.underlyingInstrumentId }
      : {}),
  };

  if (dto.isin) {
    const byIsin = await prisma.instrument.findUnique({ where: { isin: dto.isin }, select: { id: true } });
    if (byIsin) {
      await prisma.instrument.update({
        where: { id: byIsin.id },
        data: instrumentData,
      });
      return byIsin.id;
    }
  }

  const bySymbol = await prisma.instrument.findFirst({
    where: { symbol: dto.symbol },
    select: { id: true },
  });
  if (bySymbol) {
    await prisma.instrument.update({
      where: { id: bySymbol.id },
      data: {
        ...instrumentData,
        ...(dto.isin ? { isin: dto.isin } : {}),
      },
    });
    return bySymbol.id;
  }

  const created = await prisma.instrument.create({
    data: {
      ...instrumentData,
      isin: dto.isin ?? null,
    },
  });
  return created.id;
}

export async function updateInstrumentMarketData(
  instrumentId: string,
  currentPrice: number | null | undefined,
  currencyCode?: string
): Promise<void> {
  if (currentPrice == null) return;
  const priceCurrencyId = currencyCode ? await resolveCurrencyId(currencyCode) : null;
  await prisma.instrument.update({
    where: { id: instrumentId },
    data: {
      current_price: currentPrice,
      price_updated_at: new Date(),
      ...(priceCurrencyId ? { price_currency_id: priceCurrencyId } : {}),
    },
  });
}

/** Upsert a holding by (account_id, instrument_id). Returns instrument_id for stale tracking. */
export async function upsertHolding(
  position: BrokerPositionDTO,
  accountId: string,
  instrumentId: string,
  orgId: string,
  sourceSystemId: string
): Promise<void> {
  const currencyId = await resolveCurrencyId(position.currencyCode);
  await prisma.holding.upsert({
    where: { instrument_id_account_id: { instrument_id: instrumentId, account_id: accountId } },
    create: {
      org_id: orgId,
      account_id: accountId,
      instrument_id: instrumentId,
      quantity: position.quantity,
      average_cost: position.averageCost,
      current_price: position.currentPrice ?? null,
      market_value: position.marketValue ?? null,
      unrealized_pnl: position.unrealizedPnl ?? null,
      realized_pnl: position.realizedPnl ?? null,
      currency_id: currencyId,
      is_active: true,
      last_updated: new Date(),
      source_system_id: sourceSystemId,
    },
    update: {
      quantity: position.quantity,
      average_cost: position.averageCost,
      current_price: position.currentPrice ?? null,
      market_value: position.marketValue ?? null,
      unrealized_pnl: position.unrealizedPnl ?? null,
      realized_pnl: position.realizedPnl ?? null,
      currency_id: currencyId,
      is_active: true,
      last_updated: new Date(),
      source_system_id: sourceSystemId,
    },
  });
}

/**
 * Deactivate holdings for an account that were not present in the latest positions
 * response (sold-out positions).
 */
export async function deactivateStaleHoldings(
  accountId: string,
  activeInstrumentIds: string[],
  sourceSystemId: string
): Promise<void> {
  await prisma.holding.updateMany({
    where: {
      account_id: accountId,
      source_system_id: sourceSystemId,
      is_active: true,
      instrument_id: { notIn: activeInstrumentIds.length ? activeInstrumentIds : ['__none__'] },
    },
    data: { is_active: false, last_updated: new Date() },
  });
}

/** Upsert a trade by its deterministic trade_id. Returns true if newly created. */
export async function upsertTrade(
  trade: BrokerTradeDTO,
  accountId: string,
  instrumentId: string | null,
  orgId: string,
  sourceSystemId: string
): Promise<void> {
  await prisma.trade.upsert({
    where: { trade_id: trade.tradeId },
    create: {
      org_id: orgId,
      account_id: accountId,
      instrument_id: instrumentId,
      trade_id: trade.tradeId,
      type: trade.type,
      quantity: trade.quantity,
      price: trade.price,
      brokerage: trade.brokerage ?? null,
      tax: trade.tax ?? null,
      net_amount: trade.netAmount ?? null,
      total_amount: trade.totalAmount ?? null,
      value_date: trade.valueDate,
      name: trade.description ?? null,
      source_system_id: sourceSystemId,
    },
    update: {
      account_id: accountId,
      instrument_id: instrumentId,
      type: trade.type,
      quantity: trade.quantity,
      price: trade.price,
      brokerage: trade.brokerage ?? null,
      tax: trade.tax ?? null,
      net_amount: trade.netAmount ?? null,
      total_amount: trade.totalAmount ?? null,
      value_date: trade.valueDate,
      name: trade.description ?? null,
    },
  });
}

/** Find or create a global cash instrument for a given currency code (e.g. "CAD", "USD"). */
async function upsertCashInstrument(currencyCode: string): Promise<string> {
  const symbol = currencyCode.toUpperCase();
  const existing = await prisma.instrument.findFirst({
    where: { symbol, type: 'CASH' },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.instrument.create({
    data: { symbol, name: `${symbol} Cash`, type: 'CASH' },
  });
  return created.id;
}

/**
 * Sync cash balances as CASH-type holdings (one per currency per account).
 * Returns the instrument IDs upserted so the caller can keep them out of
 * the stale-holding deactivation list.
 */
export async function syncCashBalances(
  balances: BrokerBalanceDTO[],
  accountId: string,
  orgId: string,
  sourceSystemId: string
): Promise<string[]> {
  const activeInstrumentIds: string[] = [];

  for (const balance of balances) {
    if (!balance.cash) continue;

    const currencyCode = balance.currencyCode.toUpperCase();
    const currencyId = await resolveCurrencyId(currencyCode);
    const instrumentId = await upsertCashInstrument(currencyCode);
    activeInstrumentIds.push(instrumentId);
    await updateInstrumentMarketData(instrumentId, 1, currencyCode);

    await prisma.holding.upsert({
      where: { instrument_id_account_id: { instrument_id: instrumentId, account_id: accountId } },
      create: {
        org_id: orgId,
        account_id: accountId,
        instrument_id: instrumentId,
        quantity: balance.cash,
        average_cost: 1,
        current_price: 1,
        market_value: balance.cash,
        unrealized_pnl: 0,
        realized_pnl: 0,
        currency_id: currencyId,
        is_active: true,
        last_updated: new Date(),
        source_system_id: sourceSystemId,
      },
      update: {
        quantity: balance.cash,
        current_price: 1,
        market_value: balance.cash,
        unrealized_pnl: 0,
        currency_id: currencyId,
        is_active: true,
        last_updated: new Date(),
        source_system_id: sourceSystemId,
      },
    });
  }

  return activeInstrumentIds;
}
