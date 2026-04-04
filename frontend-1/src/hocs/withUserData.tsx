import React from 'react';
import { useUserData } from '@/hooks/useUserData';
import { User } from '@/models/User';

interface WithUserDataProps {
    user: User | null;
    loading: boolean;
    isAuthenticated: boolean;
    getUserName: () => string;
    getUserEmail: () => string;
    getUserOrganization: () => string;
    getOrganizationDetails: () => any;
    getOrganizationLogo: () => string | null;
    getOrganizationTimezone: () => string;
    getBaseCurrency: () => any;
    getBaseCurrencyCode: () => string;
    getCurrencyValue: () => number;
    getBaseCurrencyDetails: () => any;
    getUserDepartment: () => string;
    getUserManager: () => string;
    isUserInDepartment: (departmentId: string) => boolean;
    isUserInOrganization: (orgId: string) => boolean;
    hasPermission: (permission: string) => boolean;
    getUserInitials: () => string;
}

export const withUserData = <P extends object>(
    Component: React.ComponentType<P & WithUserDataProps>
) => {
    const WithUserDataComponent = (props: P) => {
        const userData = useUserData();

        return <Component {...props} {...userData} />;
    };

    WithUserDataComponent.displayName = `withUserData(${Component.displayName || Component.name})`;

    return WithUserDataComponent;
}; 