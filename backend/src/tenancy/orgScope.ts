/**
 * Request-path tenancy. Every model keeps org_id.
 * Shared defaults use org id `org_system`. Tenant writes never target that org
 * unless the caller is a platform admin.
 */

export const ORG_SYSTEM = 'org_system';

/** Readable as the caller org or org_system. Writes stay on the caller org. */
export const SHAREABLE_MODELS = new Set([
  'role',
  'workflow_flow',
  'workflow_state',
  'workflow_action',
  'view',
  'permission',
  'role_view',
  'prompt_template',
  'currency',
]);

/** No org_id column. Do not add an org predicate. */
export const MODELS_WITHOUT_ORG = new Set([
  'org',
  'agent_model_tool_config',
  'llm_trace_step',
]);

export type ModelTenancy = 'private' | 'shareable' | 'unscoped';

export function modelTenancy(modelName: string): ModelTenancy {
  const name = modelName.toLowerCase();
  if (MODELS_WITHOUT_ORG.has(name)) return 'unscoped';
  if (SHAREABLE_MODELS.has(name)) return 'shareable';
  return 'private';
}

export function readOrgScope(modelName: string, orgId: string): Record<string, unknown> | null {
  const kind = modelTenancy(modelName);
  if (kind === 'unscoped') return null;
  if (kind === 'shareable') {
    return { OR: [{ org_id: orgId }, { org_id: ORG_SYSTEM }] };
  }
  return { org_id: orgId };
}

export function writeOrgScope(
  modelName: string,
  orgId: string,
  isPlatformAdmin: boolean
): Record<string, unknown> | null {
  const kind = modelTenancy(modelName);
  if (kind === 'unscoped') return null;
  if (kind === 'shareable' && isPlatformAdmin) {
    return { OR: [{ org_id: orgId }, { org_id: ORG_SYSTEM }] };
  }
  return { org_id: orgId };
}

export function mergeWhere(existing: unknown, scope: Record<string, unknown> | null): Record<string, unknown> {
  const base = existing && typeof existing === 'object' ? existing as Record<string, unknown> : {};
  if (!scope) return base;
  if (Object.keys(base).length === 0) return scope;
  return { AND: [base, scope] };
}

/**
 * Where clause a mutation would send. Org B's id is included only as an id
 * predicate; the org predicate is always the caller, so the row is not matched.
 */
export function buildScopedWhere(
  modelName: string,
  where: Record<string, unknown>,
  orgId: string,
  mode: 'read' | 'write',
  isPlatformAdmin = false
): Record<string, unknown> {
  const scope = mode === 'write'
    ? writeOrgScope(modelName, orgId, isPlatformAdmin)
    : readOrgScope(modelName, orgId);
  return mergeWhere(where, scope);
}

/** Stamp org_id on create. Updates cannot move a row to another org. */
export function applyOrgOnWrite(
  modelName: string,
  data: Record<string, unknown>,
  orgId: string,
  isPlatformAdmin: boolean,
  isCreate: boolean
): void {
  const kind = modelTenancy(modelName);
  if (kind === 'unscoped') {
    delete data.org_id;
    return;
  }
  if (!isCreate) {
    if (kind === 'shareable' && isPlatformAdmin && data.org_id === ORG_SYSTEM) return;
    delete data.org_id;
    return;
  }
  if (kind === 'shareable' && isPlatformAdmin && data.org_id === ORG_SYSTEM) return;
  data.org_id = orgId;
}
