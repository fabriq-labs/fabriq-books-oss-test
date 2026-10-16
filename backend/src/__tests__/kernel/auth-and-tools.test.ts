/**
 * Two orgs. Act as org A. These cases do not open a database connection.
 * Org B is the id that must not appear in a caller-org predicate.
 */
import { authMiddleware } from '../../auth/middleware';
import { isPublicAuthPath } from '../../auth/publicPaths';
import { assignmentDenial } from '../../workflow-engine/core/assignment';
import { MUTATING_AGENT_TOOLS, withoutMutatingTools } from '../../agent/ToolManager';
import { assertTenantSql } from '../../services/analytics/sqlExecutor';
import { PermissionService } from '../../services/permissions/PermissionService';
import type { AuthContext } from '../../auth/types';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('kernel auth', () => {
  it('public login path is recognized', () => {
    expect(isPublicAuthPath('/api/auth/login')).toBe(true);
    expect(isPublicAuthPath('/api/health')).toBe(true);
    expect(isPublicAuthPath('/api/workflow/flows')).toBe(false);
  });

  it('public login path calls next', async () => {
    const next = jest.fn();
    const res = mockRes();
    await authMiddleware({ originalUrl: '/api/auth/login', headers: {}, body: {}, path: '/login' } as any, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('a bad token on workflow flows returns 401', async () => {
    const next = jest.fn();
    const res = mockRes();
    await authMiddleware(
      { originalUrl: '/api/workflow/flows', headers: { authorization: 'Bearer not-a-token' }, body: {}, path: '/flows' } as any,
      res,
      next
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses SKIP_PERMISSION_CHECKS in production', () => {
    const previousNode = process.env.NODE_ENV;
    const previousSkip = process.env.SKIP_PERMISSION_CHECKS;
    process.env.NODE_ENV = 'production';
    process.env.SKIP_PERMISSION_CHECKS = 'true';
    try {
      const context = { user: { id: 'u', email: 'a@b.c', name: 'a', org_id: 'org_a' }, permissions: {} } as AuthContext;
      expect(() => PermissionService.validatePermissions(context, 'user', 'read')).toThrow(/SKIP_PERMISSION_CHECKS/);
    } finally {
      process.env.NODE_ENV = previousNode;
      if (previousSkip === undefined) delete process.env.SKIP_PERMISSION_CHECKS;
      else process.env.SKIP_PERMISSION_CHECKS = previousSkip;
    }
  });
});

describe('kernel workflow assignment', () => {
  it('unknown assigned_for denies', () => {
    expect(assignmentDenial({
      assigned_for: 'ANYONE',
      userId: 'user_a',
      userRoleIds: [],
    })).toMatch(/not allowed/);
  });

  it('ROLE with a null role id denies', () => {
    expect(assignmentDenial({
      assigned_for: 'ROLE',
      assigned_role_id: null,
      userId: 'user_a',
      userRoleIds: ['role_1'],
    })).toMatch(/required role/);
  });
});

describe('kernel supervised tools', () => {
  it('supervised tool set has no createRecord', () => {
    const tools = withoutMutatingTools({
      createRecord: {},
      searchRecords: {},
      queueActions: {},
    }, 'supervised');
    expect(tools.createRecord).toBeUndefined();
    expect(tools.searchRecords).toBeDefined();
    expect(tools.queueActions).toBeDefined();
    expect(MUTATING_AGENT_TOOLS.has('createRecord')).toBe(true);
  });
});

describe('kernel analytics sql', () => {
  it('rejects SQL on a tenant table without the caller org predicate', () => {
    expect(() => assertTenantSql('SELECT * FROM workflow_instance', 'org_a')).toThrow(/org_id/);
  });

  it('allows a select that names the caller org', () => {
    expect(() => assertTenantSql(
      "SELECT id FROM workflow_instance WHERE org_id = 'org_a'",
      'org_a'
    )).not.toThrow();
  });

  it('rejects a table outside the kernel', () => {
    expect(() => assertTenantSql("SELECT * FROM invoice WHERE org_id = 'org_a'", 'org_a')).toThrow(/not allowed/);
  });
});
