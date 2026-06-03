/**
 * Debug harness for cash_flow (perfin.getCashFlowStatement).
 * Mirrors POST /api/report/cash_flow with the same filters as the UI.
 *
 * Run from backend:
 *   npm test -- --testPathPattern=cash-flow
 * Against backend/.env (not .env.test):
 *   USE_BACKEND_DOTENV=1 npm test -- --testPathPattern=cash-flow
 *
 * Requires DATABASE_URL — see src/__tests__/env-setup.ts (.env.test or .env).
 */
import prisma from '../../lib/prisma';
import { run_report } from '../../lib/reports';
import type { AuthContext } from '../../auth/types';

/** Same payload shape as POST /api/report/cash_flow body.filters */
const CASH_FLOW_FILTERS = {
  from_date: '2025-04-01',
  to_date: '2026-03-31',
  currency_id: 'curr_inr',
  legal_entity_ids: ['ent_f687b778-cfdf-4a7f-9883-c3a1217bb3e2'],
} as const;

const TEST_USER_EMAIL = 'prasanna@fabriqdata.com';
const TEST_ORG_ID = 'org_fabriq-labs-inc';

describe('cash_flow (perfin)', () => {
  jest.setTimeout(120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs cash_flow with UI-equivalent filters for demo user', async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('Skip: DATABASE_URL not set');
      return;
    }

    let dbUser = await prisma.user.findUnique({
      where: { email: TEST_USER_EMAIL },
      select: { id: true, email: true, name: true, org_id: true },
    });

    if (!dbUser?.org_id) {
      dbUser = await prisma.user.findFirst({
        where: { org_id: TEST_ORG_ID },
        select: { id: true, email: true, name: true, org_id: true },
      });
    }

    if (!dbUser?.org_id) {
      console.warn(`Skip: no user found for ${TEST_USER_EMAIL} or org ${TEST_ORG_ID}`);
      return;
    }

    const context: AuthContext = {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        org_id: dbUser.org_id,
      },
    };

    const result = await run_report(context, 'cash_flow', { ...CASH_FLOW_FILTERS });

    expect(result).toBeTruthy();
    expect(Array.isArray((result as { data?: unknown }).data)).toBe(true);

    const payload = result as {
      summary?: {
        opening_cash?: number;
        closing_cash?: number;
        net_change?: number;
        operating_total?: number;
        investing_total?: number;
        financing_total?: number;
      };
      data?: Array<{
        activity?: string;
        account_name?: string;
        net_cash?: number;
      }>;
    };

    console.log(
      JSON.stringify(
        {
          userEmail: TEST_USER_EMAIL,
          orgId: dbUser.org_id,
          filters: CASH_FLOW_FILTERS,
          summary: payload.summary,
          rowCount: payload.data?.length ?? 0,
          sample: payload.data?.slice(0, 15),
        },
        null,
        2
      )
    );

    expect(payload.summary).toBeDefined();
    expect(typeof payload.summary?.opening_cash).toBe('number');
    expect(typeof payload.summary?.closing_cash).toBe('number');
    expect(typeof payload.summary?.net_change).toBe('number');
    expect((payload.data?.length ?? 0)).toBeGreaterThanOrEqual(0);

    if ((payload.data?.length ?? 0) > 0) {
      expect(payload.summary?.operating_total).toBeDefined();
      expect(payload.summary?.investing_total).toBeDefined();
      expect(payload.summary?.financing_total).toBeDefined();
    }

    // When reporting currency differs from account currency, movement rows should be converted.
    if (dbUser.org_id === TEST_ORG_ID) {
      const cad = await run_report(context, 'cash_flow', { ...CASH_FLOW_FILTERS, currency_id: 'curr_cad', legal_entity_ids: ['org_f42159ce-658b-4152-8841-7c1b6f9e881a'] });
      const inr = await run_report(context, 'cash_flow', { ...CASH_FLOW_FILTERS, currency_id: 'curr_inr', legal_entity_ids: ['org_f42159ce-658b-4152-8841-7c1b6f9e881a'] });
      const cadPayload = cad as { data?: Array<{ net_cash?: number }>; summary?: { net_change?: number } };
      const inrPayload = inr as { data?: Array<{ net_cash?: number }>; summary?: { net_change?: number } };
      if ((cadPayload.data?.length ?? 0) > 0 && (inrPayload.data?.length ?? 0) > 0) {
        expect(Math.abs(Number(cadPayload.summary?.net_change ?? 0))).toBeLessThan(
          Math.abs(Number(inrPayload.summary?.net_change ?? 0))
        );
      }
    }
  });
});
