/**
 * BrokerSyncService tests — always use mock connector.
 * Set QUESTRADE_USE_LIVE=true + QUESTRADE_CONNECTION_ID=<id> to run against
 * the real Questrade API (requires a live refresh token in source_system).
 */

import prisma from '../../lib/prisma';
import { runBrokerSync, getPortfolio } from '../../lib/integrations/broker/sync/broker_sync_service';
import * as connectorFactory from '../../lib/integrations/broker/connectors';
import { MockQuestradeServer } from './mock-questrade-server';
import {
  QT_ACCOUNTS_RESPONSE,
  QT_POSITIONS_TFSA,
  QT_POSITIONS_RRSP,
  QT_POSITIONS_MARGIN,
  QT_ACTIVITIES_TFSA,
} from './fixtures/questrade-responses';
import { BrokerConnector } from '../../lib/integrations/broker/connectors/types';

const USE_LIVE = process.env.QUESTRADE_USE_LIVE === 'true';
const LIVE_CONNECTION_ID = process.env.QUESTRADE_CONNECTION_ID ?? '';
const LIVE_ORG_ID = process.env.QUESTRADE_ORG_ID ?? 'org_broker_test';

const ORG_ID = 'org_broker_test';
const CONNECTION_ID = 'srcsys_qt_test';

jest.setTimeout(60000);

function buildMockConnector(server: MockQuestradeServer): BrokerConnector {
  return {
    getSystemType: () => 'questrade',
    ensureAuth: jest.fn().mockResolvedValue(undefined),
    getAccounts: jest.fn().mockResolvedValue(
      QT_ACCOUNTS_RESPONSE.accounts.map(a => ({
        externalId: a.number,
        name: `${a.type} ${a.number}`,
        type: a.type,
        status: a.status,
      }))
    ),
    getBalances: jest.fn().mockImplementation(async (id: string) => {
      const map: Record<string, object> = {
        '12345678': [{ currencyCode: 'CAD', cash: 5000, marketValue: 36200.1, totalEquity: 41200.1 }],
        '23456789': [{ currencyCode: 'CAD', cash: 2000, marketValue: 86000, totalEquity: 88000 }],
        '34567890': [
          { currencyCode: 'CAD', cash: 1000, marketValue: 10000, totalEquity: 11000 },
          { currencyCode: 'USD', cash: 500, marketValue: 8500, totalEquity: 9000 },
        ],
      };
      return map[id] ?? [];
    }),
    getPositions: jest.fn().mockImplementation(async (id: string) => {
      const { mapPosition } = await import('../../lib/integrations/broker/connectors/questrade/questrade_mappers');
      if (id === '12345678') return QT_POSITIONS_TFSA.positions.map(mapPosition);
      if (id === '23456789') return QT_POSITIONS_RRSP.positions.map(mapPosition);
      if (id === '34567890') return QT_POSITIONS_MARGIN.positions.map(mapPosition);
      return [];
    }),
    getActivities: jest.fn().mockImplementation(async (id: string) => {
      const { mapActivity } = await import('../../lib/integrations/broker/connectors/questrade/questrade_mappers');
      if (id === '12345678') return QT_ACTIVITIES_TFSA.activities.map(a => mapActivity(id, a)).filter(Boolean);
      return [];
    }),
  };
}

function skipIfNoDb() {
  if (!process.env.DATABASE_URL) {
    return true;
  }
  return false;
}

describe('BrokerSyncService', () => {
  let server: MockQuestradeServer;
  let factorySpy: jest.SpyInstance;

  beforeAll(async () => {
    if (skipIfNoDb() && !USE_LIVE) return;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      console.warn('DB unavailable — skipping BrokerSyncService tests');
    }
  });

  beforeEach(() => {
    if (USE_LIVE) return;
    server = new MockQuestradeServer();
    server.install();
    factorySpy = jest
      .spyOn(connectorFactory, 'createBrokerConnector')
      .mockResolvedValue(buildMockConnector(server));
  });

  afterEach(() => {
    if (!USE_LIVE) {
      server.uninstall();
      factorySpy.mockRestore();
    }
    jest.clearAllMocks();
  });

  const connId = USE_LIVE ? LIVE_CONNECTION_ID : CONNECTION_ID;
  const orgId = USE_LIVE ? LIVE_ORG_ID : ORG_ID;

  it('syncs 3 accounts from Questrade', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;
    const report = await runBrokerSync(connId, orgId);
    expect(report.accountsOk).toBe(3);
    expect(report.accountsFailed).toBe(0);
    expect(report.status).toMatch(/^(success|partial)$/);
  });

  it('upserts instruments for all positions', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;
    await runBrokerSync(connId, orgId);
    const symbols = ['VFV.TO', 'XEQT.TO', 'XIC.TO', 'AAPL'];
    for (const symbol of symbols) {
      const inst = await prisma.instrument.findFirst({ where: { symbol } });
      expect(inst).not.toBeNull();
    }
  });

  it('upserts holdings with correct quantity and market value', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;
    await runBrokerSync(connId, orgId);
    const vfv = await prisma.instrument.findFirst({ where: { symbol: 'VFV.TO' } });
    const account = await prisma.account.findFirst({ where: { inst_id: '12345678', org_id: orgId } });
    expect(vfv).not.toBeNull();
    expect(account).not.toBeNull();

    const holding = await prisma.holding.findFirst({
      where: { instrument_id: vfv!.id, account_id: account!.id },
    });
    expect(Number(holding!.quantity)).toBe(100);
    expect(Number(holding!.current_price)).toBe(128.4);
    expect(Number(holding!.market_value)).toBe(12840.0);
  });

  it('sets source_system_id on upserted holdings', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;
    await runBrokerSync(connId, orgId);
    const holdings = await prisma.holding.findMany({ where: { org_id: orgId } });
    for (const h of holdings) {
      expect(h.source_system_id).toBe(connId);
    }
  });

  it('upserts trades from activities', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;
    await runBrokerSync(connId, orgId);
    const trades = await prisma.trade.findMany({ where: { org_id: orgId } });
    expect(trades.length).toBeGreaterThan(0);
  });

  it('is idempotent — running sync twice produces the same counts', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;
    await runBrokerSync(connId, orgId);
    const holdingsBefore = await prisma.holding.count({ where: { org_id: orgId } });
    const tradesBefore = await prisma.trade.count({ where: { org_id: orgId } });

    await runBrokerSync(connId, orgId);
    const holdingsAfter = await prisma.holding.count({ where: { org_id: orgId } });
    const tradesAfter = await prisma.trade.count({ where: { org_id: orgId } });

    expect(holdingsAfter).toBe(holdingsBefore);
    expect(tradesAfter).toBe(tradesBefore);
  });

  it('deactivates holdings that disappeared from positions', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;

    // First sync — VFV.TO present
    await runBrokerSync(connId, orgId);
    const vfv = await prisma.instrument.findFirst({ where: { symbol: 'VFV.TO' } });
    const account = await prisma.account.findFirst({ where: { inst_id: '12345678', org_id: orgId } });
    const holdingBefore = await prisma.holding.findFirst({
      where: { instrument_id: vfv!.id, account_id: account!.id },
    });
    expect(holdingBefore?.is_active).toBe(true);

    // Second sync — VFV.TO removed from positions
    (factorySpy as jest.SpyInstance).mockResolvedValueOnce({
      ...buildMockConnector(server),
      getPositions: jest.fn().mockImplementation(async (id: string) => {
        if (id === '12345678') return []; // sold everything in TFSA
        const { mapPosition } = await import('../../lib/integrations/broker/connectors/questrade/questrade_mappers');
        if (id === '23456789') return QT_POSITIONS_RRSP.positions.map(mapPosition);
        if (id === '34567890') return QT_POSITIONS_MARGIN.positions.map(mapPosition);
        return [];
      }),
    });
    await runBrokerSync(connId, orgId);

    const holdingAfter = await prisma.holding.findFirst({
      where: { instrument_id: vfv!.id, account_id: account!.id },
    });
    expect(holdingAfter?.is_active).toBe(false);
  });

  it('continues with remaining accounts when one account fails', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;

    factorySpy.mockResolvedValueOnce({
      ...buildMockConnector(server),
      getPositions: jest.fn().mockImplementation(async (id: string) => {
        if (id === '12345678') throw new Error('Simulated account error');
        const { mapPosition } = await import('../../lib/integrations/broker/connectors/questrade/questrade_mappers');
        if (id === '23456789') return QT_POSITIONS_RRSP.positions.map(mapPosition);
        if (id === '34567890') return QT_POSITIONS_MARGIN.positions.map(mapPosition);
        return [];
      }),
    });

    const report = await runBrokerSync(connId, orgId);
    expect(report.accountsFailed).toBe(1);
    expect(report.accountsOk).toBe(2);
    expect(report.status).toBe('partial');
    expect(report.accountErrors[0].accountId).toBe('12345678');
  });
});

describe('getPortfolio', () => {
  const orgId = USE_LIVE ? LIVE_ORG_ID : ORG_ID;

  it('returns net worth in base currency (CAD) using exchange rates', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;
    const portfolio = await getPortfolio(orgId);
    expect(portfolio.baseCurrencyCode).toBe('CAD');
    expect(portfolio.totalNetWorthInBase).toBeGreaterThan(0);
  });

  it('includes positions with symbol and market value', async () => {
    if (skipIfNoDb() && !USE_LIVE) return;
    const portfolio = await getPortfolio(orgId);
    expect(portfolio.positions.length).toBeGreaterThan(0);
    const vfv = portfolio.positions.find(p => p.instrumentSymbol === 'VFV.TO');
    expect(vfv).toBeDefined();
    expect(Number(vfv!.marketValue)).toBeGreaterThan(0);
  });
});
