import { useUserData } from '@/hooks/useUserData';

/**
 * Currency formatting utilities using organization's currency settings
 */

export const useCurrencyFormatting = () => {
    const { getBaseCurrencyCode, getCurrencyValue, getOrganizationTimezone } = useUserData();

    const formatCurrency = (amount: number, options?: Intl.NumberFormatOptions): string => {
        const currencyCode = getBaseCurrencyCode();
        const currencyValue = getCurrencyValue();

        // Apply currency conversion if needed
        const convertedAmount = amount * currencyValue;

        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            ...options
        }).format(convertedAmount);
    };

    const formatAmount = (amount: number, showCurrency = true): string => {
        if (showCurrency) {
            return formatCurrency(amount);
        }

        const currencyValue = getCurrencyValue();
        const convertedAmount = amount * currencyValue;

        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(convertedAmount);
    };

    const getCurrencySymbol = (): string => {
        const currencyCode = getBaseCurrencyCode();
        const currencySymbols: Record<string, string> = {
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'INR': 'INR', // Use INR instead of ₹ for PDF compatibility
            'JPY': '¥',
            'CAD': 'C$',
            'AUD': 'A$',
            'CHF': 'CHF',
            'CNY': '¥',
            'SGD': 'S$'
        };

        return currencySymbols[currencyCode] || currencyCode;
    };

    const convertToBaseCurrency = (amount: number, fromCurrency?: string): number => {
        const currencyValue = getCurrencyValue();
        // If fromCurrency is different, you might need additional conversion logic
        return amount * currencyValue;
    };

    // Get PDF-compatible currency symbol (uses simpler symbols for better PDF support)
    const getPDFCurrencySymbol = (): string => {
        const currencyCode = getBaseCurrencyCode();
        const pdfCurrencySymbols: Record<string, string> = {
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'INR': 'INR', // PDF-compatible version
            'JPY': '¥',
            'CAD': 'C$',
            'AUD': 'A$',
            'CHF': 'CHF',
            'CNY': '¥',
            'SGD': 'S$'
        };

        return pdfCurrencySymbols[currencyCode] || currencyCode;
    };

    return {
        formatCurrency,
        formatAmount,
        getCurrencySymbol,
        getPDFCurrencySymbol,
        convertToBaseCurrency,
        getBaseCurrencyCode,
        getCurrencyValue,
        getOrganizationTimezone
    };
};

/**
 * Standalone currency formatting function (for use outside of React components)
 */
export const formatCurrencyStandalone = (
    amount: number,
    currencyCode: string,
    currencyValue: number = 1,
    options?: Intl.NumberFormatOptions
): string => {
    const convertedAmount = amount * currencyValue;

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        ...options
    }).format(convertedAmount);
};

/**
 * Currency validation utilities
 */
export const currencyUtils = {
    isValidCurrencyCode: (code: string): boolean => {
        const validCodes = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD'];
        return validCodes.includes(code.toUpperCase());
    },

    getCurrencyInfo: (code: string | null | undefined) => {
        const currencyInfo: Record<string, { symbol: string; name: string; decimals: number }> = {
            'USD': { symbol: '$', name: 'US Dollar', decimals: 2 },
            'EUR': { symbol: '€', name: 'Euro', decimals: 2 },
            'GBP': { symbol: '£', name: 'British Pound', decimals: 2 },
            'INR': { symbol: '₹', name: 'Indian Rupees', decimals: 2 },
            'JPY': { symbol: '¥', name: 'Japanese Yen', decimals: 0 },
            'CAD': { symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
            'AUD': { symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
            'CHF': { symbol: 'CHF', name: 'Swiss Franc', decimals: 2 },
            'CNY': { symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
            'SGD': { symbol: 'S$', name: 'Singapore Dollar', decimals: 2 }
        };

        const normalized =
            typeof code === "string" && code.trim() ? code.trim().toUpperCase() : "INR";

        return currencyInfo[normalized] || { symbol: code ?? "INR", name: code ?? "INR", decimals: 2 };
    },

    /** Symbol safe for PDF rendering (avoids Unicode symbols that may render as ? or wrong glyph) */
    getPdfSafeSymbol: (code: string): string => {
        const pdfSafe: Record<string, string> = {
            'USD': '$', 'EUR': 'EUR ', 'GBP': 'GBP ', 'INR': 'INR ',
            'JPY': 'JPY ', 'CAD': 'C$', 'AUD': 'A$', 'CHF': 'CHF ',
            'CNY': 'CNY ', 'SGD': 'S$'
        };
        return pdfSafe[code.toUpperCase()] || code + ' ';
    }
}; 