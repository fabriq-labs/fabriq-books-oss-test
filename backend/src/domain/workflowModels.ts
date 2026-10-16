/**
 * Domain models that start a workflow instance on create.
 * Add a model name here after its workflow_flow row exists.
 */
export const DOMAIN_WORKFLOW_MODELS: readonly string[] = [];

export function isDomainWorkflowModel(modelName: string): boolean {
  return DOMAIN_WORKFLOW_MODELS.includes(modelName);
}
