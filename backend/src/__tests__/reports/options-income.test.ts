/**
 * Debug harness for options_income report.
 * Run from backend: npm test -- --testPathPattern=options-income
 */
import prisma from '../../lib/prisma';
import { run_report } from '../../lib/reports';
import type { AuthContext } from '../../auth/types';

const OPTIONS_INCOME_FILTERS = {
  from_date: '2026-01-01',
  to_date: '2026-12-31',
  report_currency: 'CAD',
} as const;

describe('options_income (investments)', () => {
  jest.setTimeout(120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs options_income and returns closed/open sections', async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('Skip: DATABASE_URL not set');
      return;
    }

    const trade = await prisma.trade.findFirst({
      where: { instrument: { type: 'OPTION' } },
      select: { org_id: true },
    });

    if (!trade?.org_id) {
      console.warn('Skip: no option trades in database');
      return;
    }

    const dbUser = await prisma.user.findFirst({
      where: { org_id: trade.org_id },
      select: { id: true, email: true, name: true, org_id: true },
    });

    if (!dbUser?.org_id) {
      console.warn('Skip: no user for org with option trades');
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

    const data = await run_report(context, 'options_income', { ...OPTIONS_INCOME_FILTERS });

    expect(data).toMatchObject({
      report_currency: expect.any(String),
      from_date: OPTIONS_INCOME_FILTERS.from_date,
      to_date: OPTIONS_INCOME_FILTERS.to_date,
      closed: expect.objectContaining({
        transactions: expect.any(Array),
        total_profit_loss: expect.any(Number),
      }),
      open: expect.objectContaining({
        transactions: expect.any(Array),
        total_profit_loss: expect.any(Number),
      }),
      total_income: expect.any(Number),
    });

    const result = data as {
      closed: { transactions: Array<{ profit_loss: number }>; total_profit_loss: number };
      open: { transactions: Array<{ profit_loss: number }>; total_profit_loss: number };
      total_income: number;
    };

    expect(result.closed.total_profit_loss).toBeCloseTo(
      result.closed.transactions.reduce((s, t) => s + t.profit_loss, 0),
      2
    );
    expect(result.open.total_profit_loss).toBeCloseTo(
      result.open.transactions.reduce((s, t) => s + t.profit_loss, 0),
      2
    );

    console.log(
      JSON.stringify(
        {
          orgId: dbUser.org_id,
          filters: OPTIONS_INCOME_FILTERS,
          closedCount: result.closed.transactions.length,
          openCount: result.open.transactions.length,
          total_income: result.total_income,
        },
        null,
        2
      )
    );
  });
});
