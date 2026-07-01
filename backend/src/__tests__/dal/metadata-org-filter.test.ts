/**
 * Verifies METADATA_MODELS_WITHOUT_ORG_FILTER models are not org-scoped by DAL.
 */
import { DataAccessLayer } from '../../services/dal/DataAccessLayer';
import prisma from '../../lib/prisma';
import type { AuthContext } from '../../auth/types';

const EXEMPT_MODELS = [
  'role',
  'workflow_flow',
  'workflow_state',
  'workflow_action',
  'view',
  'permission',
  'role_view',
  'prompt_template',
  'agent_model_tool_config',
  'currency',
  'instrument',
] as const;

const NON_EXEMPT_MODELS = ['account', 'posting', 'supplier', 'user', 'role_user'] as const;

function mockContext(orgId = 'org_test'): AuthContext {
  return {
    user: {
      id: 'user_test',
      email: 'test@example.com',
      name: 'Test User',
      org_id: orgId,
      roles: ['Admin'],
    },
  } as AuthContext;
}

describe('METADATA_MODELS_WITHOUT_ORG_FILTER', () => {
  const dal = DataAccessLayer.getInstance(prisma);
  const addOrgFilter = (dal as any).addOrgFilter.bind(dal) as (
    model: string,
    options: { where?: Record<string, unknown> },
    context: AuthContext
  ) => { where?: Record<string, unknown> };
  const applyWriteScopeDefaults = (dal as any).applyWriteScopeDefaults.bind(dal) as (
    model: string,
    data: Record<string, unknown>,
    context: AuthContext
  ) => void;

  it.each(EXEMPT_MODELS)('read: %s does not get org_id filter', (model) => {
    const result = addOrgFilter(model, { where: { id: 'x' } }, mockContext());
    expect(result.where).toEqual({ id: 'x' });
    expect(result.where).not.toHaveProperty('org_id');
  });

  it.each(EXEMPT_MODELS)('write: %s does not get org_id injected', (model) => {
    const data: Record<string, unknown> = { name: 'test', org_id: 'should_be_stripped' };
    applyWriteScopeDefaults(model, data, mockContext());
    expect(data.org_id).toBeUndefined();
    expect(data.created_by).toBe('user_test');
    expect(data.modified_by).toBe('user_test');
  });

  it.each(NON_EXEMPT_MODELS)('read: %s gets org_id filter', (model) => {
    const result = addOrgFilter(model, { where: { id: 'x' } }, mockContext('org_abc'));
    expect(result.where).toEqual({ id: 'x', org_id: 'org_abc' });
  });

  it.each(NON_EXEMPT_MODELS)('write: %s gets org_id injected', (model) => {
    const data: Record<string, unknown> = { name: 'test' };
    applyWriteScopeDefaults(model, data, mockContext('org_abc'));
    expect(data.org_id).toBe('org_abc');
  });
});
