import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
import prisma from '../../lib/prisma';

export class PermissionService {
  private static readonly skipPermissionChecks: boolean = process.env.SKIP_PERMISSION_CHECKS === 'true';

  static async getView(viewName: string | null, modelName: string) {
    const whereClause: any = {
    model_name: modelName,
    ...(viewName !== 'workflow' ? { NOT: { name: 'workflow' } } : {})
    };
    if (viewName !== null) {
      whereClause.name = viewName;
    }
    const view = await prisma.view.findFirst({
      where: whereClause,
      include: { permissions: true }
    });

    return view;
  }

  static async getRoles(userId: string) {
    const userRoles = await prisma.role_user.findMany({
      where: { user_id: userId },
      include: { role: true }
    });
    return userRoles.map((ur: { role: any }) => ur.role);
  }

  static async getUserPermissions(userId: string) {
    // logger.debug('Fetching permissions for user', { userId });

    const userRoles = await prisma.role_user.findMany({
      where: { user_id: userId },
      include: {
        role: {
          include: {
            role_views: {
              include: {
                view: {
                  include: {
                    permissions: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // logger.debug('Found user roles', {
    //   userId,
    //   roleCount: userRoles.length,
    //   roles: userRoles.map((ur: { role: { name: string } }) => ur.role.name)
    // });

    const permissions: { [model: string]: { [field: string]: 'read' | 'write' | 'none' } } = {};

    userRoles.forEach((userRole: any) => {
      userRole.role.role_views.forEach((role_view: any) => {
        // logger.debug('Processing view', {
        //   viewName: role_view.view.name,
        //   model: role_view.view.model_name,
        //   fieldCount: role_view.view.permissions.length
        // });

        if (!permissions[role_view.view.model_name]) {
          permissions[role_view.view.model_name] = {};
        }

        // Check for wildcard permission
        const hasWildcardPermission = role_view.view.permissions.some((field: any) =>
          field.field_name === '*' && (field.access === 'read' || field.access === 'write')
        );

        if (hasWildcardPermission) {
          // If wildcard permission exists, grant access to all fields
          const wildcardAccess = role_view.view.permissions.find((field: any) => field.field_name === '*').access;
          permissions[role_view.view.model_name]['*'] = wildcardAccess;          
        } else {
          // Process individual field permissions
          role_view.view.permissions.forEach((field: any) => {
            const currentAccess = permissions[role_view.view.model_name][field.field_name];
            const newAccess = field.access as 'read' | 'write' | 'none';

            // Take the most permissive access level
            if (!currentAccess || newAccess === 'write') {
              permissions[role_view.view.model_name][field.fieldName] = newAccess;
            }
          });
        }
      });
    });

    // logger.debug('Final consolidated permissions', {
    //   userId,
    //   models: Object.keys(permissions),
    //   permissions
    // });

    return permissions;
  }

  static validatePermissions(
    context: AuthContext,
    modelName: string,
    operation: 'read' | 'write' | undefined
  ): { [field: string]: 'read' | 'write' | 'none' } {

    if (this.skipPermissionChecks) {
      // logger.debug('Permission checks disabled, granting full access', { modelName, operation });
      return { '*': 'write' };
    }

    if (!context.permissions) {
      logger.warn('No permissions found in context');
      throw new Error('Unauthorized: No permissions found');
    }

    const modelPermissions = context.permissions[modelName];
    if (!modelPermissions) {
      logger.warn(`No permissions found for model ${modelName}`);
      throw new Error(`Unauthorized: No permissions for model ${modelName}`);
    }

    // Check for wildcard permission first
    if (modelPermissions['*']) {
      const wildcardAccess = modelPermissions['*'];
      if (wildcardAccess === 'write' || (wildcardAccess === 'read' && operation === 'read')) {
        logger.debug('Wildcard permission granted', {
          model: modelName,
          operation,
          access: wildcardAccess
        });
        return modelPermissions;
      }
    }

    const hasPermission = Object.values(modelPermissions).some(
      access => access === operation || access === 'write'
    );

    if (!hasPermission) {
      logger.warn(`Insufficient permissions for ${operation} operation on ${modelName}`);
      throw new Error(`Unauthorized: Insufficient permissions for ${operation} operation`);
    }

    return modelPermissions;
  }

  static filterFieldsByPermission(
    data: any,
    permissions: { [field: string]: 'read' | 'write' | 'none' }
  ): any {
    // if (this.skipPermissionChecks) {
    //   logger.debug('Permission checks disabled, returning all fields');
    //   return data;
    // }

    if (!permissions) return data;

    // If wildcard permission exists, return all fields
    if (permissions['*'] === 'read' || permissions['*'] === 'write') {
      // logger.debug('Wildcard permission found, returning all fields');
      return data;
    }

    // If data is empty, return all fields with at least 'read' permission
    if (Object.keys(data).length === 0) {
      const result: any = {};
      Object.keys(permissions).forEach(field => {
        if (permissions[field] === 'read' || permissions[field] === 'write') {
          result[field] = true; // or any default value you want to assign
        }
      });
      return result;
    }

    const result: any = {};
    Object.keys(data).forEach(field => {
      if (permissions[field] === 'read' || permissions[field] === 'write') {
        result[field] = data[field];
      }
    });
    return result;
  }

  static checkFieldAccess(field: string, permission: 'read' | 'write' | 'none'): boolean {
    if (this.skipPermissionChecks) {
      return true;
    }
    return permission === 'read' || permission === 'write';
  }

  static validateFieldPermissions(
    requestedFields: string[],
    permissions: { [field: string]: 'read' | 'write' | 'none' }
  ): void {
    if (this.skipPermissionChecks) {
      // logger.debug('Permission checks disabled, allowing all fields');
      return;
    }

    // If wildcard permission exists, all fields are allowed
    if (permissions['*'] === 'read' || permissions['*'] === 'write') {
      // logger.debug('Wildcard permission granted for all fields');
      return;
    }

    const unauthorizedFields = requestedFields.filter(field => {
      const fieldPermission = permissions[field];
      logger.debug('Field permission check', {
        field,
        permission: fieldPermission,
        hasAccess: this.checkFieldAccess(field, fieldPermission)
      });
      return !this.checkFieldAccess(field, fieldPermission);
    });

    if (unauthorizedFields.length > 0) {
      logger.warn('Insufficient permissions for requested fields', {
        unauthorizedFields,
        availableFields: Object.keys(permissions)
      });
      throw new Error(`Unauthorized: No access to fields: ${unauthorizedFields.join(', ')}`);
    }
  }
} 
