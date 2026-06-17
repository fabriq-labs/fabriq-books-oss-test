import prisma from '../../../prisma';
import logger from '../../../../utils/logger';
import {
  BrokerAccountDTO,
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
 * Upsert an account by (inst_id, org_id). inst_id holds the broker's external
 * account number for this connection.
 */
export async function upsertAccount(
  dto: BrokerAccountDTO,
  orgId: string,
  sourceSystemId: string,
  baseCurrencyId: string | null
): Promise<string> {
  const existing = await prisma.account.findFirst({
    where: { inst_id: dto.externalId, org_id: orgId },
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
export async function upsertInstrument(dto: BrokerInstrumentDTO): Promise<string> {
  if (dto.isin) {
    const byIsin = await prisma.instrument.findUnique({ where: { isin: dto.isin }, select: { id: true } });
    if (byIsin) {
      await prisma.instrument.update({
        where: { id: byIsin.id },
        data: { symbol: dto.symbol, name: dto.name, type: dto.type },
      });
      return byIsin.id;
    }
  }

  const bySymbol = await prisma.instrument.findFirst({
    where: { symbol: dto.symbol },
    select: { id: true },
  });
  if (bySymbol) {
    if (dto.isin) {
      await prisma.instrument.update({ where: { id: bySymbol.id }, data: { isin: dto.isin } });
    }
    return bySymbol.id;
  }

  const created = await prisma.instrument.create({
    data: { symbol: dto.symbol, name: dto.name, type: dto.type, isin: dto.isin ?? null },
  });
  return created.id;
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
