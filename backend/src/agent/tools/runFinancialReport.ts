/**
 * Financial report tool — wraps run_report (perfin.ts trial balance queries).
 */

import { tool } from 'ai';
import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import { run_report } from '../../lib/reports';
import {
  getCurrentFYPeriod,
  normalizeFinancialYearType,
  type FinancialYearType,
} from '../../lib/financialYear';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';

export const runFinancialReportSchema = z.object({
  report_id: z
    .enum(['trial_balance', 'monthly_trial_balance', 'income_statement'])
    .describe(
      'trial_balance: period opening/debits/credits/balance for one or all accounts. monthly_trial_balance: one row per account per month. income_statement: Income/Expense period totals.'
    ),
  from_date: z
    .string()
    .optional()
    .describe(
      'Period start (YYYY-MM-DD). Required when the user names a month, quarter, FY, or explicit range. Omit when the user asks for "current balance" with no period — the tool applies current financial year automatically.'
    ),
  to_date: z
    .string()
    .optional()
    .describe(
      'Period end (YYYY-MM-DD). Omit with from_date when no period in the user message — current FY (start through today) is applied.'
    ),
  account_id: z
    .string()
    .optional()
    .describe('Filter to a single account (trial_balance, monthly_trial_balance, and income_statement).'),
  currency_id: z.string().optional().describe('Reporting currency id or ISO code override.'),
  legal_entity_ids: z
    .array(z.string())
    .optional()
    .describe('Limit to accounts tagged with these legal entity ids.'),
  description: z.string().describe('Short label for why this report is being run.'),
});

type ReportPageContext = {
  recordId?: string | null;
  modelContext?: {
    from_date?: string;
    to_date?: string;
    startDate?: string;
    endDate?: string;
    legal_entity_id?: string;
    financial_year_label?: string;
  };
};

async function resolveFinancialYearType(
  accountId: string | undefined,
  legalEntityId: string | undefined
): Promise<FinancialYearType> {
  let entityId = legalEntityId;

  if (!entityId && accountId) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { legal_entity_id: true },
    });
    entityId = account?.legal_entity_id ?? undefined;
  }

  if (!entityId) {
    return 'JAN_DEC';
  }

  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { financial_year_type: true },
  });

  return normalizeFinancialYearType(entity?.financial_year_type ?? undefined);
}

export function runFinancialReportTool(auth: AuthContext, pageContext?: ReportPageContext) {
  const mc = pageContext?.modelContext;
  const defaultAccountId = pageContext?.recordId ?? undefined;
  const defaultLegalEntityId = mc?.legal_entity_id;

  const contextHints: string[] = [];
  contextHints.push(
    'When the user does not specify a month, quarter, or date range, omit from_date and to_date — the tool resolves the current financial year (FY start through today) from the account legal entity.'
  );
  if (defaultAccountId) {
    contextHints.push(`Default account_id from form: ${defaultAccountId}.`);
  }
  if (defaultLegalEntityId) {
    contextHints.push(`Default legal_entity_ids: ["${defaultLegalEntityId}"].`);
  }

  return tool({
    description: `Run a canonical financial report (same logic as Balance Sheet / Monthly Trial Balance UI).
Use trial_balance for account balance, opening balance, debits, credits, and total_balance for a date range.
Use monthly_trial_balance for month-by-month movement and cumulative balance (pass account_id to scope to one account).
Do NOT reimplement trial balance logic in raw SQL — use this tool.
${contextHints.join(' ')}`,
    parameters: runFinancialReportSchema,
    execute: async ({
      report_id,
      from_date,
      to_date,
      account_id,
      currency_id,
      legal_entity_ids,
      description,
    }) => {
      const orgId = auth.user?.org_id;
      if (!orgId) {
        return { tool: 'runFinancialReport', success: false, error: 'Missing org context' };
      }

      const resolvedAccountId = account_id || defaultAccountId || undefined;
      const resolvedLegalEntityIds =
        legal_entity_ids?.length
          ? legal_entity_ids
          : defaultLegalEntityId
            ? [defaultLegalEntityId]
            : undefined;

      const legalEntityId =
        resolvedLegalEntityIds?.[0] ?? defaultLegalEntityId ?? undefined;

      let resolvedFromDate = from_date;
      let resolvedToDate = to_date;
      let periodSource = 'explicit';

      if (!resolvedFromDate || !resolvedToDate) {
        const fyType = await resolveFinancialYearType(resolvedAccountId, legalEntityId);
        const period = getCurrentFYPeriod(fyType);
        resolvedFromDate = resolvedFromDate ?? period.from_date;
        resolvedToDate = resolvedToDate ?? period.to_date;
        periodSource = 'current_financial_year';
        logger.info('Applied current financial year default', {
          fyType,
          from_date: resolvedFromDate,
          to_date: resolvedToDate,
          label: period.label,
          account_id: resolvedAccountId,
          legal_entity_id: legalEntityId,
        });
      }

      if (!resolvedFromDate || !resolvedToDate) {
        return {
          tool: 'runFinancialReport',
          success: false,
          error: 'from_date and to_date could not be resolved',
        };
      }

      logger.info('Financial report requested', {
        report_id,
        from_date: resolvedFromDate,
        to_date: resolvedToDate,
        periodSource,
        account_id: resolvedAccountId,
        orgId,
        description,
      });

      try {
        const filters: Record<string, unknown> = {
          from_date: resolvedFromDate,
          to_date: resolvedToDate,
          account_id: resolvedAccountId,
          currency_id,
          legal_entity_ids: resolvedLegalEntityIds,
        };

        const data = await run_report(auth, report_id, filters);
        const rows = Array.isArray(data) ? data : [];

        return {
          tool: 'runFinancialReport',
          success: true,
          report_id,
          periodSource,
          filters: {
            from_date: resolvedFromDate,
            to_date: resolvedToDate,
            account_id: resolvedAccountId,
            currency_id,
            legal_entity_ids: resolvedLegalEntityIds,
          },
          rowCount: rows.length,
          data: rows,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Financial report failed', { report_id, error: message });
        return { tool: 'runFinancialReport', success: false, error: message };
      }
    },
  });
}
