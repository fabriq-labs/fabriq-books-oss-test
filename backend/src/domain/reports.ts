import { AuthContext } from '../auth/types';

export type ReportHandler = (context: AuthContext, reportId: string, filters: unknown) => Promise<unknown>;

/** Report id → handler. Empty until a domain registers one. */
export const reportHandlers: Record<string, ReportHandler> = {};

export async function run_report(context: AuthContext, reportId: string, filters: unknown) {
  const handler = reportHandlers[reportId];
  if (!handler) {
    return { success: false, error: `No report registered for ${reportId}` };
  }
  return handler(context, reportId, filters);
}
