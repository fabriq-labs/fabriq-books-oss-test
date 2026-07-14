import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';
import { run_report } from '../../lib/reports';
import type {
  OptionsIncomeResult,
  OptionsIncomeSection,
  OptionsIncomeTransactionRow,
} from '../../lib/reports/investments';
import {
  getCurrentFYPeriod,
  normalizeFinancialYearType,
  type FinancialYearType,
} from '../../lib/financialYear';

const DEFAULT_REPORT_CURRENCY = 'USD';
const OPTION_CONTRACT_SIZE = 100;

export const getOptionsIncomeSchema = {
  from_date: z
    .string()
    .optional()
    .describe(
      'Period start date (YYYY-MM-DD). If omitted with to_date, uses the current financial year start.'
    ),
  to_date: z
    .string()
    .optional()
    .describe(
      'Period end date (YYYY-MM-DD). If omitted with from_date, uses the current financial year end.'
    ),
  report_currency: z
    .string()
    .optional()
    .describe('Reporting currency ISO code or currency id. Defaults to USD.'),
  section: z
    .enum(['open', 'closed', 'all'])
    .optional()
    .describe(
      'Which sections to return. Defaults to open (period cash flows + marks on still-open positions). Use closed or all for realized round-trips.'
    ),
  account_id: z
    .string()
    .optional()
    .describe('Optional broker/investment account id to scope the report.'),
  connection_id: z
    .string()
    .optional()
    .describe('Optional source_system id to scope trades to one broker connection.'),
  legal_entity_id: z
    .string()
    .optional()
    .describe('Optional legal entity id filter when account_id is not supplied.'),
};

export type GetOptionsIncomeParams = z.infer<z.ZodObject<typeof getOptionsIncomeSchema>>;

function validateDateParam(name: string, value: string | undefined): void {
  if (!value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must be in YYYY-MM-DD format`);
  }
}

async function resolveFinancialYearType(
  legalEntityId: string | undefined,
  orgId: string
): Promise<FinancialYearType> {
  const entity = legalEntityId
    ? await prisma.entity.findFirst({
        where: { id: legalEntityId, org_id: orgId },
        select: { financial_year_type: true },
      })
    : await prisma.entity.findFirst({
        where: { org_id: orgId, is_it_headquartres: 'Yes' },
        select: { financial_year_type: true },
      });

  return normalizeFinancialYearType(entity?.financial_year_type ?? undefined);
}

async function resolvePeriod(
  fromDate: string | undefined,
  toDate: string | undefined,
  legalEntityId: string | undefined,
  orgId: string
): Promise<{ from_date: string; to_date: string; source: 'explicit' | 'current_financial_year' }> {
  if (fromDate && toDate) {
    return { from_date: fromDate, to_date: toDate, source: 'explicit' };
  }

  const fyType = await resolveFinancialYearType(legalEntityId, orgId);
  const currentFY = getCurrentFYPeriod(fyType);

  return {
    from_date: fromDate ?? currentFY.from_date,
    to_date: toDate ?? currentFY.to_date,
    source: 'current_financial_year',
  };
}

function computeLegMarketValue(row: OptionsIncomeTransactionRow): number | null {
  const leg = row.open_leg;
  const mark = row.option_current_price;
  if (!leg || mark == null) return null;
  return mark * leg.quantity * OPTION_CONTRACT_SIZE;
}

/** Mark-to-market unrealized P/L vs premium paid/received (matches Options Income UI). */
function computeLegUnrealizedPnl(row: OptionsIncomeTransactionRow): number | null {
  const leg = row.open_leg;
  const marketValue = computeLegMarketValue(row);
  if (!leg || marketValue == null) return null;
  return leg.type === 'BUY' ? marketValue - leg.amount : leg.amount - marketValue;
}

function sumOpenProceeds(rows: OptionsIncomeTransactionRow[]): {
  inflow: number;
  outflow: number;
  net: number;
} {
  return rows.reduce(
    (acc, row) => {
      const leg = row.open_leg;
      if (!leg) return acc;
      if (leg.type === 'SELL') {
        acc.inflow += leg.amount;
        acc.net += leg.amount;
      } else {
        acc.outflow += leg.amount;
        acc.net -= leg.amount;
      }
      return acc;
    },
    { inflow: 0, outflow: 0, net: 0 }
  );
}

function sumOpenValuation(rows: OptionsIncomeTransactionRow[]): {
  market_value: number;
  unrealized_pnl: number;
  priced_row_count: number;
} {
  return rows.reduce(
    (acc, row) => {
      const mv = computeLegMarketValue(row);
      const pnl = computeLegUnrealizedPnl(row);
      if (mv != null) acc.market_value += mv;
      if (pnl != null) {
        acc.unrealized_pnl += pnl;
        acc.priced_row_count += 1;
      }
      return acc;
    },
    { market_value: 0, unrealized_pnl: 0, priced_row_count: 0 }
  );
}

function enrichOpenTransactions(
  rows: OptionsIncomeTransactionRow[]
): Array<
  OptionsIncomeTransactionRow & {
    market_value: number | null;
    mark_to_market_unrealized_pnl: number | null;
  }
> {
  return rows.map((row) => ({
    ...row,
    market_value: computeLegMarketValue(row),
    mark_to_market_unrealized_pnl: computeLegUnrealizedPnl(row),
  }));
}

function sectionPayload(section: OptionsIncomeSection, enrichOpen: boolean) {
  return {
    transactions: enrichOpen
      ? enrichOpenTransactions(section.transactions)
      : section.transactions,
    total_acquisition_cost: section.total_acquisition_cost,
    total_sale_cost: section.total_sale_cost,
    total_profit_loss: section.total_profit_loss,
    positions: section.positions,
    total_income: section.total_income,
    total_premium_collected: section.total_premium_collected,
    total_premium_paid: section.total_premium_paid,
  };
}

export function getOptionsIncomeHandler(auth: AuthContext) {
  return async (params: GetOptionsIncomeParams) => {
    const orgId = auth.user?.org_id;
    if (!orgId) throw new Error('Auth context missing org_id');

    validateDateParam('from_date', params.from_date);
    validateDateParam('to_date', params.to_date);

    if (params.account_id) {
      const account = await prisma.account.findFirst({
        where: { id: params.account_id, org_id: orgId },
        select: { id: true },
      });
      if (!account) {
        throw new Error(
          `No account found for account_id "${params.account_id}" in the authenticated org`
        );
      }
    }

    const section = params.section ?? 'open';
    const reportCurrency = params.report_currency ?? DEFAULT_REPORT_CURRENCY;
    const period = await resolvePeriod(
      params.from_date,
      params.to_date,
      params.legal_entity_id,
      orgId
    );

    const filters: Record<string, unknown> = {
      from_date: period.from_date,
      to_date: period.to_date,
      report_currency: reportCurrency,
      connection_id: params.connection_id,
      account_id: params.account_id,
      legal_entity_id: params.legal_entity_id,
    };

    const full = (await run_report(auth, 'options_income', filters)) as OptionsIncomeResult;

    const openRows = full.open.transactions;
    const openProceeds = sumOpenProceeds(openRows);
    const openValuation = sumOpenValuation(openRows);

    const data: {
      report_currency: string;
      from_date: string;
      to_date: string;
      open?: ReturnType<typeof sectionPayload>;
      closed?: ReturnType<typeof sectionPayload>;
      total_income?: number;
    } = {
      report_currency: full.report_currency,
      from_date: full.from_date,
      to_date: full.to_date,
    };

    if (section === 'open' || section === 'all') {
      data.open = sectionPayload(full.open, true);
    }
    if (section === 'closed' || section === 'all') {
      data.closed = sectionPayload(full.closed, false);
    }
    if (section === 'all') {
      data.total_income = full.total_income;
    }

    return {
      tool: 'get_options_income',
      success: true,
      periodSource: period.source,
      filters: {
        from_date: period.from_date,
        to_date: period.to_date,
        report_currency: reportCurrency,
        section,
        account_id: params.account_id ?? null,
        connection_id: params.connection_id ?? null,
        legal_entity_id: params.legal_entity_id ?? null,
      },
      summary: {
        report_currency: full.report_currency,
        from_date: full.from_date,
        to_date: full.to_date,
        open_transaction_count: openRows.length,
        open_position_count: full.open.positions.length,
        open_proceeds: openProceeds,
        open_market_value: openValuation.market_value,
        open_unrealized_pnl: openValuation.unrealized_pnl,
        open_priced_row_count: openValuation.priced_row_count,
        closed_transaction_count: full.closed.transactions.length,
        closed_profit_loss: full.closed.total_profit_loss,
      },
      notes: [
        'Default section is open — period premium cash flows on still-open option positions.',
        'Open may have multiple transaction rows per instrument (one per unmatched period leg). Group by instrument_id / symbol when counting positions.',
        'summary.open_unrealized_pnl and mark_to_market_unrealized_pnl use option mark × qty × 100 vs premium; holding.unrealized_pnl on rows may differ slightly.',
        'For a point-in-time holdings snapshot (qty/avg cost/MTM only), use get_portfolio_summary.data.options instead.',
      ],
      data,
    };
  };
}
