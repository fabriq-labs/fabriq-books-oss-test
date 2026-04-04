import React from 'react';
import { useUserData } from '@/hooks/useUserData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Example component showing how to use organization and currency data
 * This demonstrates accessing the complete user data structure from the API
 */
const OrganizationDataExample: React.FC = () => {
    const {
        user,
        getOrganizationDetails,
        getOrganizationLogo,
        getOrganizationTimezone,
        getBaseCurrency,
        getBaseCurrencyCode,
        getCurrencyValue,
        getBaseCurrencyDetails,
        getUserOrganization
    } = useUserData();

    const orgDetails = getOrganizationDetails();
    const currencyDetails = getBaseCurrency();

    if (!user) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Organization Data</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>No user data available</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Organization Information */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Organization Details
                        {getOrganizationLogo() && (
                            <img
                                src={getOrganizationLogo()!}
                                alt="Organization Logo"
                                className="w-6 h-6 rounded"
                            />
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-semibold mb-2">Basic Info</h4>
                            <p><strong>Name:</strong> {getUserOrganization()}</p>
                            <p><strong>ID:</strong> {orgDetails?.id || 'N/A'}</p>
                            <p><strong>Timezone:</strong> {getOrganizationTimezone()}</p>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-2">Currency Settings</h4>
                            <p><strong>Base Currency:</strong> {getBaseCurrencyCode()}</p>
                            <p><strong>Currency Value:</strong> {getCurrencyValue()}</p>
                            <p><strong>Currency ID:</strong> {orgDetails?.basecurrency_id || 'N/A'}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Currency Master Details */}
            {currencyDetails && (
                <Card>
                    <CardHeader>
                        <CardTitle>Currency Master Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h4 className="font-semibold mb-2">Currency Information</h4>
                                <p><strong>Name:</strong> {currencyDetails.name}</p>
                                <p><strong>Base Currency:</strong>
                                    <Badge variant="secondary" className="ml-2">
                                        {currencyDetails.base_currency}
                                    </Badge>
                                </p>
                                <p><strong>From Currency:</strong> {currencyDetails.from_currency}</p>
                                <p><strong>Status:</strong>
                                    <Badge
                                        variant={currencyDetails.status === 'Active' ? 'default' : 'destructive'}
                                        className="ml-2">
                                        {currencyDetails.status}
                                    </Badge>
                                </p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Exchange Rate Details</h4>
                                <p><strong>Currency Value:</strong> {currencyDetails.currency_value}</p>
                                <p><strong>Effective From:</strong> {new Date(currencyDetails.effective_from).toLocaleDateString()}</p>
                                <p><strong>Currency ID:</strong> {currencyDetails.id}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Enhanced Currency Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Enhanced Currency Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-semibold mb-2">Currency Display Info</h4>
                            <p><strong>Symbol:</strong>
                                <span className="ml-2 text-lg font-bold">
                                    {getBaseCurrencyDetails().symbol}
                                </span>
                            </p>
                            <p><strong>Full Name:</strong> {getBaseCurrencyDetails().fullName}</p>
                            <p><strong>Code:</strong> {getBaseCurrencyDetails().base_currency}</p>
                            <p><strong>Is Active:</strong>
                                <Badge
                                    variant={getBaseCurrencyDetails().isActive ? 'default' : 'destructive'}
                                    className="ml-2"
                                >
                                    {getBaseCurrencyDetails().isActive ? 'Yes' : 'No'}
                                </Badge>
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-2">Formatted Values</h4>
                            <p><strong>Exchange Rate:</strong> {getBaseCurrencyDetails().formattedValue}</p>
                            <p><strong>Effective Date:</strong> {getBaseCurrencyDetails().effectiveDate.toLocaleDateString()}</p>
                            <p><strong>Sample Amount:</strong>
                                <span className="ml-2 font-mono">
                                    {getBaseCurrencyDetails().symbol}1,234.56
                                </span>
                            </p>
                            <p><strong>Currency ID:</strong> {getBaseCurrencyDetails().id || 'N/A'}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Raw Data Display */}
            <Card>
                <CardHeader>
                    <CardTitle>Raw User Data Structure</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <pre className="text-xs overflow-auto">
                            {JSON.stringify(user, null, 2)}
                        </pre>
                    </div>
                </CardContent>
            </Card>

            {/* Usage Examples */}
            <Card>
                <CardHeader>
                    <CardTitle>Usage Examples</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h4 className="font-semibold mb-2">In Components</h4>
                        <div className="bg-gray-50 p-3 rounded text-sm">
                            <code>
                                {`// Get organization name
const orgName = getUserOrganization();

// Get currency code
const currency = getBaseCurrencyCode();

// Get timezone
const timezone = getOrganizationTimezone();

// Format currency
const amount = 1000;
const formatted = \`\${getBaseCurrencyCode()} \${(amount * getCurrencyValue()).toFixed(2)}\`;`}
                            </code>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2">Complete Organization Object</h4>
                        <div className="bg-gray-50 p-3 rounded text-sm">
                            <code>
                                {`// Access complete organization details
const org = getOrganizationDetails();
console.log(org.name, org.logo, org.customer_timezone);

// Access currency details
const currency = getBaseCurrency();
console.log(currency.base_currency, currency.currency_value);`}
                            </code>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default OrganizationDataExample; 