import { tool } from 'ai';
import { z } from 'zod';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
import { parseTaxPackageGoal } from '../taxPackage/parseGoal';
import { assembleTaxPackage, scanTaxPackage } from '../taxPackage/workpapers';
import type { TaxPackageIntake } from '../taxPackage/types';
import { getAgentSession, updateAgentSession } from '../services/SessionService';

export function prepareTaxPackageTool(auth: AuthContext, sessionId?: string) {
  return tool({
    description:
      'Build a Canadian T1 tax-package organizer from the ledger. phase=scan returns unmatched bank lines for the categorise gate. phase=assemble returns T4/T776/T2125/foreign/FTC worksheets, exclusions, and gaps. Always use the calendar tax year on both Canada and India entities. Do not invent numbers.',
    parameters: z.object({
      phase: z.enum(['scan', 'assemble']).describe('scan = unmatched gate; assemble = full workpapers'),
      tax_year: z.number().int().min(2000).max(2100).optional()
        .describe('Canadian calendar tax year, e.g. 2025'),
      recipient: z.string().optional().describe('CPA name, e.g. Meera Patel CPA'),
      include_foreign: z.boolean().optional().describe('Include India books as foreign income. Default true.'),
      basement_rentable_pct: z.number().min(0).max(100).nullable().optional()
        .describe('Milton basement rentable share for T776 occupancy costs. Null if unknown.'),
      goal: z.string().optional().describe('Original session goal, used to fill missing intake fields'),
    }),
    execute: async (params) => {
      const orgId = auth.user?.org_id;
      if (!orgId) {
        return { tool: 'prepareTaxPackage', success: false, error: 'Missing org context' };
      }
      const parsed = parseTaxPackageGoal(params.goal || '', {
        tax_year: params.tax_year,
        recipient: params.recipient,
        include_foreign: params.include_foreign,
        basement_rentable_pct: params.basement_rentable_pct ?? null,
      });
      const intake: TaxPackageIntake = {
        tax_year: params.tax_year ?? parsed.tax_year ?? 2025,
        recipient: params.recipient || parsed.recipient || 'Meera Patel CPA',
        include_foreign: params.include_foreign ?? parsed.include_foreign ?? true,
        basement_rentable_pct:
          params.basement_rentable_pct === undefined
            ? (parsed.basement_rentable_pct ?? null)
            : params.basement_rentable_pct,
      };
      try {
        const result = params.phase === 'scan'
          ? await scanTaxPackage(orgId, intake)
          : await assembleTaxPackage(orgId, intake);
        logger.info('prepareTaxPackage', {
          orgId,
          phase: params.phase,
          tax_year: intake.tax_year,
          unmatched: result.unmatched_count,
        });
        // Persist onto the session so builders/formatters do not depend on the LLM
        // copying the (large) tool JSON into accumulated_context_update.
        if (sessionId) {
          try {
            const session = await getAgentSession(sessionId);
            const existing = (session.accumulated_context as Record<string, any>) || {};
            const next = { ...existing, ...result };
            if (params.phase === 'scan') {
              next.workpapers = existing.workpapers ?? null;
            }
            await updateAgentSession(sessionId, { accumulated_context: next });
          } catch (persistErr: any) {
            logger.warn('prepareTaxPackage: failed to persist session context', {
              sessionId,
              error: persistErr?.message,
            });
          }
        }
        return { tool: 'prepareTaxPackage', success: true, ...result };
      } catch (err: any) {
        logger.error('prepareTaxPackage failed', { orgId, error: err?.message });
        return { tool: 'prepareTaxPackage', success: false, error: err?.message || 'Failed' };
      }
    },
  });
}
