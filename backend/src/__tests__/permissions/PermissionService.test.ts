import type { AuthContext } from '../../auth/types';
import { PermissionService } from '../../services/permissions/PermissionService';
import prisma from '../../lib/prisma';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    view: { findFirst: jest.fn() },
    role_user: { findMany: jest.fn() },
  },
}));

const mockPrisma = prisma as unknown as {
  view: { findFirst: jest.Mock };
  role_user: { findMany: jest.Mock };
};

function authWithPermissions(
  permissions: NonNullable<AuthContext['permissions']>
): AuthContext {
  return {
    user: {
      id: 'user_1',
      email: 'u@example.com',
      name: 'Test',
      org_id: 'org_1',
    },
    permissions,
  };
}

describe('PermissionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getView (used when resolving a view + its field ACLs from metadata)', () => {
    it('loads a named view for a model and excludes workflow views by default', async () => {
      const viewRow = { id: 'v1', name: 'default', model_name: 'sales_order', permissions: [] };
      mockPrisma.view.findFirst.mockResolvedValue(viewRow);

      const result = await PermissionService.getView('default', 'sales_order');
      expect(result).toBe(viewRow);
      expect(mockPrisma.view.findFirst).toHaveBeenCalledWith({
        where: {
          model_name: 'sales_order',
          NOT: { name: 'workflow' },
          name: 'default',
        },
        include: { permissions: true },
      });
    });

    it('does not exclude workflow when the requested view is workflow', async () => {
      const viewRow = { id: 'v1', name: 'workflow', model_name: 'sales_order', permissions: [] };
      mockPrisma.view.findFirst.mockResolvedValue(viewRow);

      const result = await PermissionService.getView('workflow', 'sales_order');
      expect(result).toBe(viewRow);
      expect(mockPrisma.view.findFirst).toHaveBeenCalledWith({
        where: {
          model_name: 'sales_order',
          name: 'workflow',
        },
        include: { permissions: true },
      });
    });

    it('when viewName is null, matches any view name for the model (still hides workflow)', async () => {
      mockPrisma.view.findFirst.mockResolvedValue(null);
      await PermissionService.getView(null, 'item');
      expect(mockPrisma.view.findFirst).toHaveBeenCalledWith({
        where: {
          model_name: 'item',
          NOT: { name: 'workflow' },
        },
        include: { permissions: true },
      });
    });
  });

  describe('getRoles', () => {
    it('returns role records for the user', async () => {
      const roles = [{ id: 'r1', name: 'Admin' }];
      mockPrisma.role_user.findMany.mockResolvedValue([
        { user_id: 'u1', role_id: 'r1', role: roles[0] },
      ]);

      const result = await PermissionService.getRoles('u1');
      expect(result).toEqual(roles);
      expect(mockPrisma.role_user.findMany).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
        include: { role: true },
      });
    });
  });

  describe('getUserPermissions (builds the permissions map stored on AuthContext)', () => {
    it('merges field ACLs across role_views and picks the most permissive access', async () => {
      mockPrisma.role_user.findMany.mockResolvedValue([
        {
          role: {
            role_views: [
              {
                view: {
                  model_name: 'sales_order',
                  permissions: [
                    { field_name: 'id', access: 'read' },
                    { field_name: 'total', access: 'read' },
                  ],
                },
              },
              {
                view: {
                  model_name: 'sales_order',
                  permissions: [{ field_name: 'total', access: 'write' }],
                },
              },
            ],
          },
        },
      ]);

      const perms = await PermissionService.getUserPermissions('user_1');

      expect(perms).toEqual({
        sales_order: {
          id: 'read',
          total: 'write',
        },
      });
    });

    it('uses a wildcard row when present instead of per-field rows', async () => {
      mockPrisma.role_user.findMany.mockResolvedValue([
        {
          role: {
            role_views: [
              {
                view: {
                  model_name: 'item',
                  permissions: [
                    { field_name: '*', access: 'read' },
                    { field_name: 'sku', access: 'write' },
                  ],
                },
              },
            ],
          },
        },
      ]);

      const perms = await PermissionService.getUserPermissions('user_1');

      expect(perms).toEqual({ item: { '*': 'read' } });
    });
  });

  describe('validatePermissions (gate before read/write handlers)', () => {
    it('throws when the context has no permissions map', () => {
      const ctx: AuthContext = {
        user: {
          id: 'user_1',
          email: 'u@example.com',
          name: 'Test',
          org_id: 'org_1',
        },
      };

      expect(() => PermissionService.validatePermissions(ctx, 'sales_order', 'read')).toThrow(
        'Unauthorized: No permissions found'
      );
    });

    it('throws when the model is missing from the permissions map', () => {
      const ctx = authWithPermissions({ item: { id: 'read' } });

      expect(() => PermissionService.validatePermissions(ctx, 'sales_order', 'read')).toThrow(
        'Unauthorized: No permissions for model sales_order'
      );
    });

    it('allows read and write when wildcard is write', () => {
      const ctx = authWithPermissions({ sales_order: { '*': 'write' } });

      expect(PermissionService.validatePermissions(ctx, 'sales_order', 'read')).toEqual({
        '*': 'write',
      });
      expect(PermissionService.validatePermissions(ctx, 'sales_order', 'write')).toEqual({
        '*': 'write',
      });
    });

    it('allows read but not write when wildcard is read-only', () => {
      const ctx = authWithPermissions({ sales_order: { '*': 'read' } });

      expect(PermissionService.validatePermissions(ctx, 'sales_order', 'read')).toEqual({
        '*': 'read',
      });
      expect(() => PermissionService.validatePermissions(ctx, 'sales_order', 'write')).toThrow(
        'Unauthorized: Insufficient permissions for write operation'
      );
    });

    it('allows operations when any field grants the operation (no wildcard)', () => {
      const ctx = authWithPermissions({
        sales_order: { id: 'read', internal_note: 'none' },
      });

      expect(PermissionService.validatePermissions(ctx, 'sales_order', 'read')).toEqual(
        ctx.permissions!.sales_order
      );
    });

    it('treats write on any field as sufficient for read operations', () => {
      const ctx = authWithPermissions({
        sales_order: { id: 'write', internal_note: 'none' },
      });

      expect(PermissionService.validatePermissions(ctx, 'sales_order', 'read')).toEqual(
        ctx.permissions!.sales_order
      );
    });

    it('throws when no field grants the requested operation', () => {
      const ctx = authWithPermissions({
        sales_order: { id: 'read', total: 'read' },
      });

      expect(() => PermissionService.validatePermissions(ctx, 'sales_order', 'write')).toThrow(
        'Unauthorized: Insufficient permissions for write operation'
      );
    });
  });

  describe('filterFieldsByPermission (strip disallowed columns from payloads / responses)', () => {
    it('returns the payload unchanged when permissions are missing', () => {
      const data = { a: 1, b: 2 };
      expect(PermissionService.filterFieldsByPermission(data, null as unknown as never)).toBe(data);
    });

    it('returns all keys when wildcard read or write is present', () => {
      const data = { a: 1, secret: 'x' };
      expect(PermissionService.filterFieldsByPermission(data, { '*': 'read' })).toEqual(data);
      expect(PermissionService.filterFieldsByPermission(data, { '*': 'write' })).toEqual(data);
    });

    it('when data is empty, returns a map of allowed field names (used for empty update / select shapes)', () => {
      expect(
        PermissionService.filterFieldsByPermission({}, { id: 'read', secret: 'none', total: 'write' })
      ).toEqual({ id: true, total: true });
    });

    it('filters object keys to only read/write fields', () => {
      expect(
        PermissionService.filterFieldsByPermission(
          { id: '1', secret: 'x', total: 10 },
          { id: 'read', secret: 'none', total: 'write' }
        )
      ).toEqual({ id: '1', total: 10 });
    });
  });

  describe('checkFieldAccess', () => {
    it('returns true only for read or write levels', () => {
      expect(PermissionService.checkFieldAccess('any', 'read')).toBe(true);
      expect(PermissionService.checkFieldAccess('any', 'write')).toBe(true);
      expect(PermissionService.checkFieldAccess('any', 'none')).toBe(false);
    });
  });

  describe('validateFieldPermissions (GraphQL-style explicit field lists)', () => {
    it('no-ops when wildcard grants all fields', () => {
      expect(() =>
        PermissionService.validateFieldPermissions(['id', 'total'], { '*': 'read' })
      ).not.toThrow();
    });

    it('throws listing fields that are missing or none', () => {
      expect(() =>
        PermissionService.validateFieldPermissions(['id', 'total', 'missing'], {
          id: 'read',
          total: 'none',
        })
      ).toThrow('Unauthorized: No access to fields: total, missing');
    });
  });
});
