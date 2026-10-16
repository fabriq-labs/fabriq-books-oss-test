import { AuthContext } from '../auth/types';
import { reportHandlers } from '../../lib/domain';

export type { ReportHandler } from '../../lib/domain';
export { reportHandlers };

export async function run_report(context: AuthContext, reportId: string, filters: unknown) {
  const handler = reportHandlers[reportId];
  if (!handler) {
    return { success: false, error: `No report registered for ${reportId}` };
  }
  return handler(context, reportId, filters);
}
