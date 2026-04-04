import React from 'react';
import { useUserData } from '@/hooks/useUserData';
import { useCurrencyFormatting } from '@/utils/currencyUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Example component demonstrating the getBaseCurrencyDetails function
 * Shows all the enhanced currency information available
 */
const CurrencyDetailsExample: React.FC = () => {
    const { getBaseCurrencyDetails } = useUserData();
    const { formatCurrency } = useCurrencyFormatting();

    const currencyDetails = getBaseCurrencyDetails();

    // Sample amounts for demonstration
    const sampleAmounts = [100, 1000, 10000, 1234.56, 999999.99];

    return (
        <div className="space-y-6">
            {/* Currency Details Overview */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <span className="text-2xl">{currencyDetails.symbol}</span>
                        Currency Details
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <h4 className="font-semibold mb-3">Basic Information</h4>
                            <div className="space-y-2">
                                <p><strong>Code:</strong> {currencyDetails.base_currency}</p>
                                <p><strong>Name:</strong> {currencyDetails.fullName}</p>
                                <p><strong>Symbol:</strong> {currencyDetails.symbol}</p>
                                <p><strong>Status:</strong>
                                    <Badge
                                        variant={currencyDetails.isActive ? 'default' : 'destructive'}
                                        className="ml-2"
                                    >
                                        {currencyDetails.status}
                                    </Badge>
                                </p>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-3">Exchange Rate</h4>
                            <div className="space-y-2">
                                <p><strong>Value:</strong> {currencyDetails.formattedValue}</p>
                                <p><strong>From Currency:</strong> {currencyDetails.from_currency}</p>
                                <p><strong>Effective Date:</strong> {currencyDetails.effectiveDate.toLocaleDateString()}</p>
                                <p><strong>Currency ID:</strong> {currencyDetails.id || 'N/A'}</p>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-3">Sample Formatting</h4>
                            <div className="space-y-2">
                                {sampleAmounts.slice(0, 3).map((amount, index) => (
                                    <p key={index}>
                                        <strong>{amount}:</strong> {formatCurrency(amount)}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Currency Formatting Examples */}
            <Card>
                <CardHeader>
                    <CardTitle>Currency Formatting Examples</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-semibold mb-3">Formatted Amounts</h4>
                            <div className="space-y-2">
                                {sampleAmounts.map((amount, index) => (
                                    <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                        <span className="font-mono">{amount}</span>
                                        <span className="font-semibold">{formatCurrency(amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-3">Currency Information</h4>
                            <div className="space-y-2">
                                <div className="p-3 bg-blue-50 rounded">
                                    <p><strong>Symbol:</strong> {currencyDetails.symbol}</p>
                                    <p><strong>Full Name:</strong> {currencyDetails.fullName}</p>
                                    <p><strong>Code:</strong> {currencyDetails.base_currency}</p>
                                </div>
                                <div className="p-3 bg-green-50 rounded">
                                    <p><strong>Exchange Rate:</strong> {currencyDetails.formattedValue}</p>
                                    <p><strong>Is Active:</strong> {currencyDetails.isActive ? 'Yes' : 'No'}</p>
                                    <p><strong>Effective From:</strong> {currencyDetails.effectiveDate.toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Usage Code Examples */}
            <Card>
                <CardHeader>
                    <CardTitle>Usage Examples</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h4 className="font-semibold mb-2">Basic Usage</h4>
                        <div className="bg-gray-50 p-3 rounded text-sm">
                            <code>
                                {`// Get complete currency details
const currency = getBaseCurrencyDetails();

// Access individual properties
const symbol = currency.symbol;           // "$"
const name = currency.fullName;           // "US Dollar"
const code = currency.base_currency;      // "USD"
const isActive = currency.isActive;       // true
const rate = currency.formattedValue;     // "1.0000"`}
                            </code>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2">Display Examples</h4>
                        <div className="bg-gray-50 p-3 rounded text-sm">
                            <code>
                                {`// Display currency symbol
<span className="currency-symbol">{currencyDetails.symbol}</span>

// Display formatted amount
<span className="amount">{formatCurrency(1234.56)}</span>

// Display currency name
<span className="currency-name">{currencyDetails.fullName}</span>

// Check if currency is active
{currencyDetails.isActive && <span>Active Currency</span>}`}
                            </code>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2">Conditional Rendering</h4>
                        <div className="bg-gray-50 p-3 rounded text-sm">
                            <code>
                                {`// Show different content based on currency status
{currencyDetails.isActive ? (
  <div>Currency is active and ready to use</div>
) : (
  <div>Currency is inactive</div>
)}

// Format amounts with currency symbol
const displayAmount = \`\${currencyDetails.symbol}\${amount.toFixed(2)}\`;`}
                            </code>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Interactive Demo */}
            <Card>
                <CardHeader>
                    <CardTitle>Interactive Demo</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <span className="text-2xl font-bold">{currencyDetails.symbol}</span>
                            <div>
                                <h3 className="font-semibold">{currencyDetails.fullName}</h3>
                                <p className="text-sm text-gray-600">Code: {currencyDetails.base_currency}</p>
                            </div>
                            <Badge variant={currencyDetails.isActive ? 'default' : 'destructive'}>
                                {currencyDetails.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 border rounded">
                                <h4 className="font-semibold mb-2">Exchange Rate</h4>
                                <p className="text-2xl font-mono">{currencyDetails.formattedValue}</p>
                                <p className="text-sm text-gray-600">Effective from {currencyDetails.effectiveDate.toLocaleDateString()}</p>
                            </div>

                            <div className="p-4 border rounded">
                                <h4 className="font-semibold mb-2">Sample Amount</h4>
                                <p className="text-2xl font-mono">{formatCurrency(1234.56)}</p>
                                <p className="text-sm text-gray-600">Formatted with current settings</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default CurrencyDetailsExample; 