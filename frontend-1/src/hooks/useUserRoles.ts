import { useAuth } from '@/contexts/AuthContext';
import { isBuyer, isFinanceTeam, getUserRoles, hasRole } from '@/utils/roleUtils';

/**
 * Hook to access user role utilities
 * Provides easy access to role-based checks for the current authenticated user
 */
export const useUserRoles = () => {
    const { user } = useAuth();

    return {
        // Check if current user is a buyer
        isBuyer: () => isBuyer(user),

        // Check if current user is in the Finance Team
        isFinanceTeam: () => isFinanceTeam(user),

        // Get all role names for current user
        getUserRoles: () => getUserRoles(user),

        // Check if current user has a specific role
        hasRole: (roleName: string) => hasRole(user, roleName),

        // Get the user object (for advanced usage)
        user
    };
}; 