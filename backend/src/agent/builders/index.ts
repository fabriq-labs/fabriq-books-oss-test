/**
 * Builders — deterministic handlers for action and report steps.
 *
 * Import this module once at startup to register all builders and formatters.
 */

export { ActionBuilderRegistry } from './ActionBuilderRegistry';
export type { ActionBuilder, ActionBuildResult } from './ActionBuilderRegistry';

export { ReportFormatterRegistry } from './ReportFormatterRegistry';
export type { ReportFormatter } from './ReportFormatterRegistry';

// ── Register built-in builders ──────────────────────────────────

import { ActionBuilderRegistry } from './ActionBuilderRegistry';
import { ReportFormatterRegistry } from './ReportFormatterRegistry';
import { ReconciliationActionBuilder } from './ReconciliationActionBuilder';
import { ReconciliationReportFormatter } from './ReconciliationReportFormatter';

ActionBuilderRegistry.register(ReconciliationActionBuilder);
ReportFormatterRegistry.register(ReconciliationReportFormatter);
