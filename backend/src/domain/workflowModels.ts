import { DOMAIN_WORKFLOW_MODELS } from '../../lib/domain';

export { DOMAIN_WORKFLOW_MODELS };

export function isDomainWorkflowModel(modelName: string): boolean {
  return DOMAIN_WORKFLOW_MODELS.includes(modelName);
}
