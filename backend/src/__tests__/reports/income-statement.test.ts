/**
 * Debug harness for income_statement (perfin.getIncomeStatement).
 * Mirrors POST /api/report/income_statement with the same filters as the UI.
 *
 * Run from backend: npm test -- --testPathPattern=income-statement
 * Requires DATABASE_URL — see src/__tests__/env-setup.ts (.env.test or .env).
 */
import prisma from '../../lib/prisma';
import { run_report } from '../../lib/reports';
import type { AuthContext } from '../../auth/types';

/** Same payload shape as POST /api/report/income_statement body.filters */
const INCOME_STATEMENT_FILTERS = {
  from_date: '2026-01-01',
  to_date: '2026-01-31',
  currency: 'PHP',
  legal_entity_ids: ['org_61bee96b-ba6b-450a-82ea-7e719b927ca2'],
} as const;

const TEST_USER_EMAIL = 'pooja.saxena@demo-india.com';

describe('income_statement (perfin)', () => {
  jest.setTimeout(120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs income_statement with UI-equivalent filters for demo user', async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('Skip: DATABASE_URL not set');
      return;
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: TEST_USER_EMAIL },
      select: { id: true, email: true, name: true, org_id: true },
    });

    if (!dbUser?.org_id) {
      console.warn(`Skip: user ${TEST_USER_EMAIL} not found or org_id missing`);
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

    const data = await run_report(context, 'income_statement', { ...INCOME_STATEMENT_FILTERS });

    expect(Array.isArray(data)).toBe(true);

    // Helpful console output when debugging (inspect in test log)
    const rows = data as Array<{
      account_path?: string;
      account_name?: string;
      classification?: string;
      total_amount?: unknown;
      posting_count?: number;
    }>;
    console.log(
      JSON.stringify(
        {
          userEmail: TEST_USER_EMAIL,
          orgId: dbUser.org_id,
          filters: INCOME_STATEMENT_FILTERS,
          rowCount: rows.length,
          sample: rows.slice(0, 15),
        },
        null,
        2
      )
    );

    expect(rows.length).toBeGreaterThanOrEqual(0);
  });
});
