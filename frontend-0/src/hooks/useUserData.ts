import { useAuth } from '@/contexts/AuthContext';
import { User } from '@/models/User';

export const useUserData = () => {
    const { user, loading, isAuthenticated } = useAuth();



    const getUserName = (): string => {
        if (!user) return '';
        return user.name || user.email || 'Unknown User';
    };

    const getUserEmail = (): string => {
        return user?.email || '';
    };

    const getUserOrganization = (): string => {
        return user?.org?.name || 'No Organization';
    };

    const getOrganizationDetails = () => {
        return user?.org || null;
    };

    const getOrganizationLogo = (): string | null => {
        return user?.org?.logo || null;
    };

    const getOrganizationTimezone = (): string => {
        return user?.org?.customer_timezone || 'UTC';
    };

    const currencyInfo = {
        'USD': { symbol: '$', fullName: 'US Dollar' },
        'EUR': { symbol: '€', fullName: 'Euro' },
        'GBP': { symbol: '£', fullName: 'British Pound' },
        'INR': { symbol: 'INR', fullName: 'Indian Rupee' },
        'JPY': { symbol: '¥', fullName: 'Japanese Yen' },
        'CAD': { symbol: 'C$', fullName: 'Canadian Dollar' },
        'AUD': { symbol: 'A$', fullName: 'Australian Dollar' },
        'CHF': { symbol: 'CHF', fullName: 'Swiss Franc' },
        'CNY': { symbol: '¥', fullName: 'Chinese Yuan' },
        'SGD': { symbol: 'S$', fullName: 'Singapore Dollar' }
    } as const;

    /** Prefer org.currency.code, then org.base_currency, then legacy currency_master. */
    const resolveBaseCurrencyCode = (): string => {
        const fromRelation = user?.org?.currency?.code;
        if (fromRelation) return fromRelation;
        const fromOrg = user?.org?.base_currency;
        if (fromOrg) return fromOrg;
        return user?.org?.currency_master?.base_currency || 'USD';
    };

    const getBaseCurrency = () => {
        return user?.org?.currency_master || null;
    };

    const getBaseCurrencyCode = (): string => {
        return resolveBaseCurrencyCode();
    };

    const getCurrencyValue = (): number => {
        return user?.org?.currency_master?.currency_value || 1;
    };

    const getBaseCurrencyDetails = () => {
        const code = resolveBaseCurrencyCode();
        const legacy = user?.org?.currency_master;
        const relation = user?.org?.currency;
        const info = currencyInfo[code as keyof typeof currencyInfo] || {
            symbol: relation?.symbol || code,
            fullName: relation?.name || legacy?.name || code,
        };

        if (!legacy && !relation && !user?.org?.base_currency) {
            return {
                id: null,
                name: 'USD',
                base_currency: 'USD',
                from_currency: 'USD',
                effective_from: new Date().toISOString(),
                currency_value: 1,
                status: 'Active',
                symbol: '$',
                fullName: 'US Dollar',
                isActive: true,
                effectiveDate: new Date(),
                formattedValue: '1.0000'
            };
        }

        return {
            id: relation?.id || legacy?.id || null,
            name: relation?.name || legacy?.name || code,
            base_currency: code,
            from_currency: legacy?.from_currency || code,
            effective_from: legacy?.effective_from || new Date().toISOString(),
            currency_value: legacy?.currency_value ?? 1,
            status: legacy?.status || 'Active',
            symbol: info.symbol,
            fullName: info.fullName,
            isActive: (legacy?.status || 'Active') === 'Active',
            effectiveDate: new Date(legacy?.effective_from || Date.now()),
            formattedValue: (legacy?.currency_value ?? 1).toFixed(4)
        };
    };

    const getUserDepartment = (): string => {
        return user?.department?.name || 'No Department';
    };

    const getUserManager = (): string => {
        return user?.manager?.name || 'No Manager';
    };

    const isUserInDepartment = (departmentId: string): boolean => {
        return user?.department_id === departmentId;
    };

    const isUserInOrganization = (orgId: string): boolean => {
        return user?.org_id === orgId;
    };

    const hasPermission = (permission: string): boolean => {
        // You can implement permission logic here based on user roles
        // For now, returning true for all authenticated users
        return isAuthenticated;
    };

    const getUserInitials = (): string => {
        if (!user?.name) return user?.email?.charAt(0).toUpperCase() || 'U';

        const names = user.name.split(' ');
        if (names.length >= 2) {
            return `${names[0].charAt(0)}${names[1].charAt(0)}`.toUpperCase();
        }
        return names[0].charAt(0).toUpperCase();
    };

    const getUserRole = (): string | null => {
        // Return the first role name or null if no roles exis
        return user?.role_users?.[0]?.role?.name || null;
    };

    return {
        user,
        loading,
        isAuthenticated,
        getUserName,
        getUserEmail,
        getUserOrganization,
        getOrganizationDetails,
        getOrganizationLogo,
        getOrganizationTimezone,
        getBaseCurrency,
        getBaseCurrencyCode,
        getCurrencyValue,
        getBaseCurrencyDetails,
        getUserDepartment,
        getUserManager,
        isUserInDepartment,
        isUserInOrganization,
        hasPermission,
        getUserInitials,
        getUserRole,
    };
}; 