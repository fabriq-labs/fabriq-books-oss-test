import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';
import { run_report } from '../../lib/reports';
import {
  getCurrentFYPeriod,
  normalizeFinancialYearType,
  type FinancialYearType,
} from '../../lib/financialYear';

export const getTrialBalanceSchema = {
  start_date: z
    .string()
    .optional()
    .describe('Period start date in YYYY-MM-DD format. If omitted, the current financial year start is used.'),
  end_date: z
    .string()
    .optional()
    .describe('Period end date in YYYY-MM-DD format. If omitted, today or the current financial year end is used.'),
  account_id: z
    .string()
    .optional()
    .describe('Optional account id to scope the trial balance. Use list_accounts first when the user provides a name such as ICICI.'),
  currency_id: z
    .string()
    .optional()
    .describe('Optional reporting currency id or ISO code override. If omitted, the org base currency is used.'),
  legal_entity_id: z
    .string()
    .optional()
    .describe('Optional legal entity id. Only used as a report filter when account_id is not supplied.'),
};

export type GetTrialBalanceParams = z.infer<z.ZodObject<typeof getTrialBalanceSchema>>;

interface AccountContext {
  id: string;
  name: string | null;
  code: string | null;
  legal_entity_id: string | null;
}

export function getTrialBalanceHandler(auth: AuthContext) {
  return async (params: GetTrialBalanceParams) => {
    const orgId = auth.user?.org_id;
    if (!orgId) throw new Error('Auth context missing org_id');

    validateDateParam('start_date', params.start_date);
    validateDateParam('end_date', params.end_date);

    const account = params.account_id
      ? await resolveAccount(params.account_id, orgId)
      : null;

    if (params.account_id && !account) {
      throw new Error(`No account found for account_id "${params.account_id}" in the authenticated org`);
    }

    if (
      account?.legal_entity_id &&
      params.legal_entity_id &&
      account.legal_entity_id !== params.legal_entity_id
    ) {
      throw new Error(
        `account_id "${account.id}" belongs to legal_entity_id "${account.legal_entity_id}", not "${params.legal_entity_id}"`
      );
    }

    const dateContextEntityId = account?.legal_entity_id ?? params.legal_entity_id;
    const period = await resolvePeriod(params.start_date, params.end_date, dateContextEntityId, orgId);

    const legalEntityIds =
      account
        ? undefined
        : params.legal_entity_id
          ? [params.legal_entity_id]
          : undefined;

    const filters = {
      from_date: period.start_date,
      to_date: period.end_date,
      account_id: account?.id,
      currency_id: params.currency_id,
      legal_entity_ids: legalEntityIds,
    };

    const data = await run_report(auth, 'trial_balance', filters);
    const rows = Array.isArray(data) ? data : [];

    return {
      tool: 'get_trial_balance',
      success: true,
      periodSource: period.source,
      filters,
      account: account
        ? {
            id: account.id,
            code: account.code,
            name: account.name,
            legal_entity_id: account.legal_entity_id,
          }
        : undefined,
      rowCount: rows.length,
      data: rows,
    };
  };
}

function validateDateParam(name: string, value: string | undefined): void {
  if (!value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must be in YYYY-MM-DD format`);
  }
}

async function resolveAccount(accountId: string, orgId: string): Promise<AccountContext | null> {
  return prisma.account.findFirst({
    where: { id: accountId, org_id: orgId },
    select: {
      id: true,
      name: true,
      code: true,
      legal_entity_id: true,
    },
  });
}

async function resolvePeriod(
  startDate: string | undefined,
  endDate: string | undefined,
  legalEntityId: string | undefined,
  orgId: string
): Promise<{ start_date: string; end_date: string; source: 'explicit' | 'current_financial_year' }> {
  if (startDate && endDate) {
    return { start_date: startDate, end_date: endDate, source: 'explicit' };
  }

  const fyType = await resolveFinancialYearType(legalEntityId, orgId);
  const currentFY = getCurrentFYPeriod(fyType);

  return {
    start_date: startDate ?? currentFY.from_date,
    end_date: endDate ?? currentFY.to_date,
    source: 'current_financial_year',
  };
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
