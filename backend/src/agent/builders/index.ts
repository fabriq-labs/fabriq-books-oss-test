/**
 * Builders — deterministic handlers for action and report steps.
 * Domain handlers register from backend/src/domain/agentBuilders.ts.
 */

export { ActionBuilderRegistry } from './ActionBuilderRegistry';
export type { ActionBuilder, ActionBuildResult } from './ActionBuilderRegistry';

export { ReportFormatterRegistry } from './ReportFormatterRegistry';
export type { ReportFormatter } from './ReportFormatterRegistry';

import { ActionBuilderRegistry } from './ActionBuilderRegistry';
import { ReportFormatterRegistry } from './ReportFormatterRegistry';
import { registerDomainBuilders } from '../../domain/agentBuilders';

registerDomainBuilders(ActionBuilderRegistry, ReportFormatterRegistry);
