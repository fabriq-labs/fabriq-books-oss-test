import { User } from '@/models/User';

/**
 * Utility methods for role-based checks
 */

export interface Role {
    id: string;
    name: string;
}

export interface RoleUser {
    id: string;
    role_id: string;
    user_id: string;
    role: Role;
}

/**
 * Check if the user is a buyer based on their role
 * @param user - User object with role_users array
 * @returns boolean - true if user has a role with "Buyer" in the name
 */
export const isBuyer = (user: User | null): boolean => {
    if (!user || !user.role_users || !Array.isArray(user.role_users)) {
        return false;
    }

    return user.role_users.some(roleUser =>
        roleUser.role &&
        roleUser.role.name &&
        roleUser.role.name.toLowerCase().includes('buyer')
    );
};

/**
 * Check if the user is in the Finance Team based on their role
 * @param user - User object with role_users array
 * @returns boolean - true if user has a role with "Finance Team" in the name
 */
export const isFinanceTeam = (user: User | null): boolean => {
    if (!user || !user.role_users || !Array.isArray(user.role_users)) {
        return false;
    }

    return user.role_users.some(roleUser =>
        roleUser.role &&
        roleUser.role.name &&
        roleUser.role.name.toLowerCase().includes('finance team')
    );
};

/**
 * Get all role names for a user
 * @param user - User object with role_users array
 * @returns string[] - Array of role names
 */
export const getUserRoles = (user: User | null): string[] => {
    if (!user || !user.role_users || !Array.isArray(user.role_users)) {
        return [];
    }

    return user.role_users
        .map(roleUser => roleUser.role?.name)
        .filter(Boolean) as string[];
};

/**
 * Check if user has a specific role
 * @param user - User object with role_users array
 * @param roleName - Role name to check for (case-insensitive)
 * @returns boolean - true if user has the specified role
 */
export const hasRole = (user: User | null, roleName: string): boolean => {
    if (!user || !user.role_users || !Array.isArray(user.role_users)) {
        return false;
    }

    return user.role_users.some(roleUser =>
        roleUser.role &&
        roleUser.role.name &&
        roleUser.role.name.toLowerCase().includes(roleName.toLowerCase())
    );
};

/** Platform super-user (metadata governance, /api/admin, etc.). */
export const isSuperAdmin = (user: User | null): boolean =>
    hasRole(user, 'Super Admin');

/** Tenant administrator (org users, connections, etc.). */
export const isTenantAdmin = (user: User | null): boolean =>
    hasRole(user, 'Admin') || isSuperAdmin(user);