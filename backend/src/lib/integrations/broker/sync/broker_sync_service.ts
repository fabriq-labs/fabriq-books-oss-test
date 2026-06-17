import prisma from '../../../prisma';
import logger from '../../../../utils/logger';
import { createBrokerConnector } from '../connectors';
import { BrokerSyncStatus, ReauthRequiredError } from '../connectors/types';
import {
  deactivateStaleHoldings,
  resolveCurrencyId,
  upsertAccount,
  upsertHolding,
  upsertInstrument,
  upsertTrade,
} from './upserts';

const FIRST_SYNC_BACKFILL_DAYS = 90;

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  accountsOk: number;
  accountsFailed: number;
  instrumentsUpserted: number;
  holdingsUpserted: number;
  tradesUpserted: number;
  accountErrors: Array<{ accountId: string; error: string }>;
  status: BrokerSyncStatus;
}

async function getOrgBaseCurrencyId(orgId: string): Promise<string | null> {
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { basecurrency_id: true, base_currency: true },
  });
  if (org?.basecurrency_id) return org.basecurrency_id;
  if (org?.base_currency) return resolveCurrencyId(org.base_currency);
  return null;
}

export async function runBrokerSync(connectionId: string, orgId: string): Promise<SyncReport> {
  const startedAt = new Date();
  const report: SyncReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    accountsOk: 0,
    accountsFailed: 0,
    instrumentsUpserted: 0,
    holdingsUpserted: 0,
    tradesUpserted: 0,
    accountErrors: [],
    status: 'success',
  };

  const connection = await prisma.source_system.findFirst({
    where: { id: connectionId, org_id: orgId },
  });
  if (!connection) {
    throw new Error(`Broker connection ${connectionId} not found for org ${orgId}`);
  }

  const baseCurrencyId = await getOrgBaseCurrencyId(orgId);
  const lastSyncAt = connection.last_sync_at;
  const activityStart = lastSyncAt
    ? new Date(lastSyncAt)
    : new Date(startedAt.getTime() - FIRST_SYNC_BACKFILL_DAYS * 24 * 60 * 60 * 1000);

  try {
    const { connector } = await createBrokerConnector(connectionId);
    await connector.ensureAuth();
    const accounts = await connector.getAccounts();

    for (const accountDto of accounts) {
      try {
        const accountId = await upsertAccount(accountDto, orgId, connectionId, baseCurrencyId);

        const positions = await connector.getPositions(accountDto.externalId);
        const activeInstrumentIds: string[] = [];
        for (const position of positions) {
          const instrumentId = await upsertInstrument(position.instrument);
          report.instrumentsUpserted += 1;
          await upsertHolding(position, accountId, instrumentId, orgId, connectionId);
          report.holdingsUpserted += 1;
          activeInstrumentIds.push(instrumentId);
        }
        await deactivateStaleHoldings(accountId, activeInstrumentIds, connectionId);

        const activities = await connector.getActivities(accountDto.externalId, activityStart, startedAt);
        for (const trade of activities) {
          const instrumentId = trade.instrument ? await upsertInstrument(trade.instrument) : null;
          await upsertTrade(trade, accountId, instrumentId, orgId, connectionId);
          report.tradesUpserted += 1;
        }

        report.accountsOk += 1;
      } catch (accountError) {
        if (accountError instanceof ReauthRequiredError) {
          throw accountError;
        }
        report.accountsFailed += 1;
        report.accountErrors.push({
          accountId: accountDto.externalId,
          error: accountError instanceof Error ? accountError.message : String(accountError),
        });
        logger.error(`Broker sync failed for account ${accountDto.externalId}`, accountError);
      }
    }

    report.status = report.accountsFailed > 0 ? 'partial' : 'success';
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      report.status = 'reauth_required';
    } else {
      report.status = 'failed';
      logger.error(`Broker sync failed for connection ${connectionId}`, error);
    }
  }

  report.finishedAt = new Date().toISOString();

  await prisma.source_system.update({
    where: { id: connectionId },
    data: {
      last_sync_at: report.status === 'success' || report.status === 'partial' ? startedAt : connection.last_sync_at,
      last_sync_status: report as unknown as object,
    },
  });

  return report;
}

export interface PortfolioPosition {
  accountId: string;
  accountName: string | null;
  instrumentSymbol: string;
  instrumentName: string;
  quantity: string;
  marketValue: string | null;
  currencyCode: string | null;
  marketValueInBase: number | null;
}

export interface PortfolioSummary {
  baseCurrencyCode: string | null;
  totalNetWorthInBase: number;
  positions: PortfolioPosition[];
}

async function getLatestRate(
  orgId: string,
  fromCurrencyId: string,
  toCurrencyId: string
): Promise<number | null> {
  if (fromCurrencyId === toCurrencyId) return 1;
  const rate = await prisma.exchange_rate.findFirst({
    where: {
      org_id: orgId,
      from_currency_id: fromCurrencyId,
      to_currency_id: toCurrencyId,
      effective_date: { lte: new Date() },
    },
    orderBy: { effective_date: 'desc' },
  });
  return rate ? Number(rate.rate) : null;
}

export async function getPortfolio(orgId: string): Promise<PortfolioSummary> {
  const baseCurrencyId = await getOrgBaseCurrencyId(orgId);
  const baseCurrency = baseCurrencyId
    ? await prisma.currency.findUnique({ where: { id: baseCurrencyId }, select: { code: true } })
    : null;

  const holdings = await prisma.holding.findMany({
    where: { org_id: orgId, is_active: true },
    include: {
      account: { select: { name: true } },
      instrument: { select: { symbol: true, name: true } },
      currency: { select: { id: true, code: true } },
    },
  });

  const positions: PortfolioPosition[] = [];
  let totalNetWorthInBase = 0;

  for (const holding of holdings) {
    const marketValue = holding.market_value != null ? Number(holding.market_value) : null;
    let marketValueInBase: number | null = null;

    if (marketValue != null && baseCurrencyId && holding.currency_id) {
      const rate = await getLatestRate(orgId, holding.currency_id, baseCurrencyId);
      if (rate != null) {
        marketValueInBase = marketValue * rate;
        totalNetWorthInBase += marketValueInBase;
      }
    } else if (marketValue != null && (!baseCurrencyId || holding.currency_id === baseCurrencyId)) {
      marketValueInBase = marketValue;
      totalNetWorthInBase += marketValue;
    }

    positions.push({
      accountId: holding.account_id,
      accountName: holding.account?.name ?? null,
      instrumentSymbol: holding.instrument.symbol,
      instrumentName: holding.instrument.name,
      quantity: holding.quantity.toString(),
      marketValue: marketValue != null ? marketValue.toString() : null,
      currencyCode: holding.currency?.code ?? null,
      marketValueInBase,
    });
  }

  return {
    baseCurrencyCode: baseCurrency?.code ?? null,
    totalNetWorthInBase,
    positions,
  };
}
