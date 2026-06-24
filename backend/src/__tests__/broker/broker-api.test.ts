/**
 * HTTP API tests for /api/broker-sync/* routes.
 * Uses supertest + mocked sync service.
 */

import request from 'supertest';
import app from '../../app';
import * as syncService from '../../lib/integrations/broker/sync/broker_sync_service';
import * as loader from '../../lib/integrations/broker/shared/broker-connection-loader';
import prisma from '../../lib/prisma';

jest.mock('../../lib/integrations/broker/sync/broker_sync_service');
jest.mock('../../lib/integrations/broker/shared/broker-connection-loader');

const mockRunSync = syncService.runBrokerSync as jest.MockedFunction<typeof syncService.runBrokerSync>;
const mockGetPortfolio = syncService.getPortfolio as jest.MockedFunction<typeof syncService.getPortfolio>;

const ORG_ID = 'org_broker_test';

// Minimal auth header — adjust to match the project's test auth pattern
const AUTH_HEADER = { 'x-test-org-id': ORG_ID, 'x-test-user-id': 'usr_broker_test' };

describe('POST /api/broker-sync/run', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with sync report on success', async () => {
    const report = {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      accountsOk: 3,
      accountsFailed: 0,
      instrumentsUpserted: 4,
      holdingsUpserted: 4,
      tradesUpserted: 3,
      accountErrors: [],
      status: 'success' as const,
    };
    mockRunSync.mockResolvedValue(report);

    const res = await request(app)
      .post('/api/broker-sync/run')
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.reports[0].status).toBe('success');
  });

  it('returns 409 when sync returns reauth_required', async () => {
    mockRunSync.mockResolvedValue({
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      accountsOk: 0,
      accountsFailed: 0,
      instrumentsUpserted: 0,
      holdingsUpserted: 0,
      tradesUpserted: 0,
      accountErrors: [],
      status: 'reauth_required' as const,
    });

    const res = await request(app)
      .post('/api/broker-sync/run')
      .set(AUTH_HEADER);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/broker-sync/run');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/broker-sync/portfolio', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns portfolio with netWorth and positions', async () => {
    mockGetPortfolio.mockResolvedValue({
      baseCurrencyCode: 'CAD',
      totalNetWorthInBase: 152340.55,
      positions: [
        {
          accountId: 'acct_1',
          accountName: 'TFSA 12345678',
          instrumentSymbol: 'VFV.TO',
          instrumentName: 'Vanguard S&P 500',
          quantity: '100',
          marketValue: '12840.00',
          currencyCode: 'CAD',
          marketValueInBase: 12840.0,
        },
      ],
    });

    const res = await request(app)
      .get('/api/broker-sync/portfolio')
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.baseCurrencyCode).toBe('CAD');
    expect(res.body.totalNetWorthInBase).toBe(152340.55);
    expect(res.body.positions).toHaveLength(1);
  });
});

describe('POST /api/broker-sync/connections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when personalAccessToken is missing', async () => {
    const res = await request(app)
      .post('/api/broker-sync/connections')
      .set(AUTH_HEADER)
      .send({ name: 'My Questrade' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/broker-sync/connections')
      .set(AUTH_HEADER)
      .send({ personalAccessToken: 'tok123' });

    expect(res.status).toBe(400);
  });
});
