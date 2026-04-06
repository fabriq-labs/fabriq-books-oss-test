import React from 'react';
import { useUserData } from '@/hooks/useUserData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Simple test component to verify currency symbol handling
 */
const CurrencyTestExample: React.FC = () => {
    const { getBaseCurrencyDetails, getBaseCurrencyCode } = useUserData();

    const currencyDetails = getBaseCurrencyDetails();

    const testCurrencySymbol = () => {
        console.log('=== Currency Symbol Test ===');
        console.log('Currency Details:', currencyDetails);
        console.log('Symbol type:', typeof currencyDetails.symbol);
        console.log('Symbol value:', currencyDetails.symbol);
        console.log('Symbol charCode:', currencyDetails.symbol.charCodeAt(0));
        console.log('Symbol length:', currencyDetails.symbol.length);

        // Test different ways to display the symbol
        const testAmount = 1234.56;
        console.log('Test amount with symbol:', `${currencyDetails.symbol}${testAmount.toFixed(2)}`);
        console.log('Test amount with code:', `${currencyDetails.base_currency} ${testAmount.toFixed(2)}`);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Currency Symbol Test</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <h3 className="font-semibold mb-2">Current Currency Info</h3>
                    <p><strong>Code:</strong> {currencyDetails.base_currency}</p>
                    <p><strong>Symbol:</strong> <span className="font-mono">{currencyDetails.symbol}</span></p>
                    <p><strong>Full Name:</strong> {currencyDetails.fullName}</p>
                    <p><strong>Symbol Type:</strong> {typeof currencyDetails.symbol}</p>
                    <p><strong>Symbol Length:</strong> {currencyDetails.symbol.length}</p>
                </div>

                <div>
                    <h3 className="font-semibold mb-2">Test Display</h3>
                    <p className="text-lg">
                        <span className="font-mono">{currencyDetails.symbol}1,234.56</span>
                    </p>
                    <p className="text-lg">
                        <span className="font-mono">{currencyDetails.base_currency} 1,234.56</span>
                    </p>
                </div>

                <Button onClick={testCurrencySymbol} variant="outline">
                    Test Currency Symbol in Console
                </Button>
            </CardContent>
        </Card>
    );
};

export default CurrencyTestExample; 