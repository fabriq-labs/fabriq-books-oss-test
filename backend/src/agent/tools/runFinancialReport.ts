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
import { resolvePostingHeaderLegalEntityId } from '../postingCreateHelpers';

function isAccountId(value: string | undefined): boolean {
  return Boolean(value && String(value).trim().startsWith('acco_'));
}

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
    .refine((v) => !v || isAccountId(v), {
      message:
        'account_id must be acco_… from a prior searchRecords on account — never pass the display name (e.g. "ICICI account"). Search first, then call this tool with the id.',
    })
    .describe(
      'acco_… id from searchRecords on account. When the user names an account, call searchRecords first (name icontains + header legal_entity_id), then pass the returned id here.'
    ),
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
    legalEntityId?: string;
    legal_entity_id?: string;
    from_date?: string;
    to_date?: string;
    startDate?: string;
    endDate?: string;
    financial_year_label?: string;
  };
};

type ReportRow = Record<string, unknown>;

function filterTrialBalanceRowsForDisplay(rows: ReportRow[]): ReportRow[] {
  return rows.filter((row) => {
    const level = Number(row.level ?? 0);
    if (level === 0) return true;
    return (
      Number(row.total_debits ?? 0) !== 0 ||
      Number(row.total_credits ?? 0) !== 0 ||
      Number(row.opening_balance ?? 0) !== 0 ||
      Number(row.balance ?? 0) !== 0 ||
      Number(row.total_balance ?? 0) !== 0
    );
  });
}

function enrichFinancialReportResult(
  reportId: string,
  rows: ReportRow[],
  description: string,
  filters: Record<string, unknown>
) {
  const displayRows =
    reportId === 'trial_balance' ? filterTrialBalanceRowsForDisplay(rows) : rows;

  const currencyCode =
    (displayRows[0]?.report_currency as string | undefined) ??
    (displayRows[0]?.account_currency as string | undefined) ??
    'INR';

  const columnMap: Record<string, { field: string; label: string }[]> = {
    trial_balance: [
      { field: 'account_name', label: 'Account' },
      { field: 'opening_balance', label: 'Opening' },
      { field: 'total_debits', label: 'Debits' },
      { field: 'total_credits', label: 'Credits' },
      { field: 'total_balance', label: 'Closing' },
    ],
    monthly_trial_balance: [
      { field: 'account_name', label: 'Account' },
      { field: 'period_month', label: 'Month' },
      { field: 'period_debits', label: 'Debits' },
      { field: 'period_credits', label: 'Credits' },
      { field: 'cumulative_balance', label: 'Balance' },
    ],
    income_statement: [
      { field: 'account_name', label: 'Account' },
      { field: 'classification', label: 'Type' },
      { field: 'total_amount', label: 'Amount' },
    ],
  };

  return {
    uiHint: 'financial_report' as const,
    description,
    report_id: reportId,
    filters,
    currencyCode,
    columns: columnMap[reportId] ?? columnMap.trial_balance,
    data: displayRows,
    rowCount: displayRows.length,
    totalRowCount: rows.length,
  };
}

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
  const defaultLegalEntityId = mc?.legalEntityId ?? mc?.legal_entity_id;

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
When the user names an account (e.g. "closing balance for ICICI account"): Step 1 — searchRecords on account (name icontains; header legal_entity_id is applied automatically). Step 2 — this tool with account_id = acco_… from that search and legal_entity_ids from header when set. NEVER pass account display names as account_id.
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

      const headerLegalEntityId =
        (await resolvePostingHeaderLegalEntityId(auth, pageContext)) ?? undefined;

      const resolvedAccountId = account_id || defaultAccountId || undefined;
      if (resolvedAccountId && !isAccountId(resolvedAccountId)) {
        return {
          tool: 'runFinancialReport',
          success: false,
          error: `account_id must be acco_…, not "${resolvedAccountId}". Call searchRecords on account first (name icontains + header legal_entity_id), then runFinancialReport with the id from that result.`,
        };
      }

      const resolvedLegalEntityIds =
        legal_entity_ids?.length
          ? legal_entity_ids
          : headerLegalEntityId
            ? [headerLegalEntityId]
            : defaultLegalEntityId
              ? [defaultLegalEntityId]
              : undefined;

      const legalEntityId =
        resolvedLegalEntityIds?.[0] ?? headerLegalEntityId ?? defaultLegalEntityId ?? undefined;

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
        const rows: ReportRow[] = Array.isArray(data) ? (data as ReportRow[]) : [];

        const resolvedFilters = {
          from_date: resolvedFromDate,
          to_date: resolvedToDate,
          account_id: resolvedAccountId,
          currency_id,
          legal_entity_ids: resolvedLegalEntityIds,
        };

        return {
          tool: 'runFinancialReport',
          success: true,
          periodSource,
          ...enrichFinancialReportResult(report_id, rows, description, resolvedFilters),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Financial report failed', { report_id, error: message });
        return { tool: 'runFinancialReport', success: false, error: message };
      }
    },
  });
}
