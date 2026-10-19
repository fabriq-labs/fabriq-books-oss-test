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

    const getBaseCurrency = () => {
        return user?.org?.currency_master || null;
    };

    const getBaseCurrencyCode = (): string => {
        return user?.org?.currency_master?.base_currency || 'USD';
    };

    const getCurrencyValue = (): number => {
        return user?.org?.currency_master?.currency_value || 1;
    };

    const getBaseCurrencyDetails = () => {
        const currency = user?.org?.currency_master;
        // console.log('getBaseCurrencyDetails - Raw currency data:', currency);

        if (!currency) {
            console.log('getBaseCurrencyDetails - No currency data, using USD fallback');
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

        // Get currency symbol and full name
        const currencyInfo = {
            'USD': { symbol: '$', fullName: 'US Dollar' },
            'EUR': { symbol: '€', fullName: 'Euro' },
            'GBP': { symbol: '£', fullName: 'British Pound' },
            'INR': { symbol: 'INR', fullName: 'Indian Rupee' }, // Use INR instead of ₹ for PDF compatibility
            'JPY': { symbol: '¥', fullName: 'Japanese Yen' },
            'CAD': { symbol: 'C$', fullName: 'Canadian Dollar' },
            'AUD': { symbol: 'A$', fullName: 'Australian Dollar' },
            'CHF': { symbol: 'CHF', fullName: 'Swiss Franc' },
            'CNY': { symbol: '¥', fullName: 'Chinese Yuan' },
            'SGD': { symbol: 'S$', fullName: 'Singapore Dollar' }
        };

        // console.log('getBaseCurrencyDetails - Currency code:', currency.base_currency);
        // console.log('getBaseCurrencyDetails - Available currencies:', Object.keys(currencyInfo));

        const info = currencyInfo[currency.base_currency as keyof typeof currencyInfo] ||
            { symbol: currency.base_currency, fullName: currency.name || currency.base_currency };

        // console.log('getBaseCurrencyDetails - Selected info:', info);

        const result = {
            ...currency,
            symbol: info.symbol,
            fullName: info.fullName,
            isActive: currency.status === 'Active',
            effectiveDate: new Date(currency.effective_from),
            formattedValue: currency.currency_value.toFixed(4)
        };

        // console.log('getBaseCurrencyDetails - Final result:', result);
        return result;
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