/**
 * Two orgs. Act as org A. Shareable rows include org_system.
 * A write where-clause for org A does not match org B.
 */
import { DataAccessLayer } from '../../services/dal/DataAccessLayer';
import prisma from '../../lib/prisma';
import type { AuthContext } from '../../auth/types';
import { ORG_SYSTEM, buildScopedWhere } from '../../tenancy/orgScope';

const SHAREABLE = [
  'role',
  'workflow_flow',
  'workflow_state',
  'workflow_action',
  'view',
  'permission',
  'role_view',
  'prompt_template',
  'currency',
] as const;

const PRIVATE = ['user', 'role_user', 'workflow_instance', 'comment'] as const;

function mockContext(orgId = 'org_a', isPlatformAdmin = false): AuthContext {
  return {
    user: {
      id: 'user_test',
      email: 'test@example.com',
      name: 'Test User',
      org_id: orgId,
    },
    isPlatformAdmin,
  };
}

describe('org scope', () => {
  const dal = DataAccessLayer.getInstance(prisma);
  const addOrgFilter = (dal as any).addOrgFilter.bind(dal) as (
    model: string,
    options: { where?: Record<string, unknown> },
    context: AuthContext,
    mode?: 'read' | 'write'
  ) => { where?: Record<string, unknown> };
  const applyWriteScopeDefaults = (dal as any).applyWriteScopeDefaults.bind(dal) as (
    model: string,
    data: Record<string, unknown>,
    context: AuthContext
  ) => void;

  it.each(SHAREABLE)('read: %s includes the caller org and org_system', (model) => {
    const result = addOrgFilter(model, { where: { id: 'x' } }, mockContext());
    expect(result.where).toEqual({
      AND: [{ id: 'x' }, { OR: [{ org_id: 'org_a' }, { org_id: ORG_SYSTEM }] }],
    });
  });

  it.each(SHAREABLE)('write: %s is stamped with the caller org', (model) => {
    const data: Record<string, unknown> = { name: 'test', org_id: 'should_be_replaced' };
    applyWriteScopeDefaults(model, data, mockContext());
    expect(data.org_id).toBe('org_a');
    expect(data.created_by).toBe('user_test');
  });

  it('platform admin may create a shareable row on org_system', () => {
    const data: Record<string, unknown> = { name: 'default', org_id: ORG_SYSTEM };
    applyWriteScopeDefaults('workflow_flow', data, mockContext('org_a', true));
    expect(data.org_id).toBe(ORG_SYSTEM);
  });

  it.each(PRIVATE)('read: %s is limited to the caller org', (model) => {
    const result = addOrgFilter(model, { where: { id: 'x' } }, mockContext());
    expect(result.where).toEqual({ AND: [{ id: 'x' }, { org_id: 'org_a' }] });
  });

  it('deleteMany for org A does not match an org B id by itself', () => {
    const where = buildScopedWhere('user', { id: { in: ['user_b'] } }, 'org_a', 'write');
    expect(where).toEqual({
      AND: [{ id: { in: ['user_b'] } }, { org_id: 'org_a' }],
    });
    expect(JSON.stringify(where)).not.toContain('org_b');
  });

  it('agent_model_tool_config has no org column and is not filtered', () => {
    const result = addOrgFilter('agent_model_tool_config', { where: { id: 'x' } }, mockContext());
    expect(result.where).toEqual({ id: 'x' });
  });
});
