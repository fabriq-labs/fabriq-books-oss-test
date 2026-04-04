import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserData } from '@/hooks/useUserData';
import { userStorage } from '@/utils/userStorage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Example component demonstrating the hybrid session management approach
 * This shows how user data is handled across page refreshes and logout
 */
const SessionManagementExample: React.FC = () => {
    const { user, logout, isAuthenticated } = useAuth();
    const {
        getUserName,
        getUserEmail,
        getUserOrganization,
        getOrganizationDetails,
        getOrganizationLogo,
        getOrganizationTimezone,
        getBaseCurrency,
        getBaseCurrencyCode,
        getCurrencyValue,
        getBaseCurrencyDetails
    } = useUserData();

    const handleLogout = () => {
        // This will:
        // 1. Clear React context state
        // 2. Clear all session storage data
        // 3. Sign out from Clerk
        // 4. Navigate to sign-in page
        logout();
    };

    const handleForceRefresh = () => {
        // Force a fresh API call by clearing cache
        userStorage.forceRefresh();
        window.location.reload(); // Reload to trigger fresh fetch
    };

    const handleCheckSessionStatus = () => {
        const cacheAge = userStorage.getCacheAge();
        const isExpired = userStorage.isSessionExpired();
        const isValid = userStorage.isUserDataValid();
        const currencyDetails = getBaseCurrencyDetails();

        console.log('Session Status:', {
            cacheAge: `${cacheAge} minutes`,
            isExpired,
            isValid,
            userData: user ? 'Present' : 'Not present',
            currencySymbol: currencyDetails.symbol,
            currencyCode: currencyDetails.base_currency,
            organization: getUserOrganization()
        });

        alert(`Session Status:
Cache Age: ${cacheAge} minutes
Is Expired: ${isExpired}
Is Valid: ${isValid}
User Data: ${user ? 'Present' : 'Not present'}
Currency Symbol: ${currencyDetails.symbol}
Currency Code: ${currencyDetails.base_currency}
Organization: ${getUserOrganization()}`);
    };

    if (!isAuthenticated) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Session Management Example</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Please log in to see session management features.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Hybrid Session Management</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h3 className="font-semibold mb-2">User Information</h3>
                            <p><strong>Name:</strong> {getUserName()}</p>
                            <p><strong>Email:</strong> {getUserEmail()}</p>
                            <p><strong>Organization:</strong> {getUserOrganization()}</p>
                            <p><strong>Timezone:</strong> {getOrganizationTimezone()}</p>
                            <p><strong>Base Currency:</strong> {getBaseCurrencyCode()}</p>
                            <p><strong>Currency Value:</strong> {getCurrencyValue()}</p>
                            <p><strong>Currency Symbol:</strong> {getBaseCurrencyDetails().symbol}</p>
                            <p><strong>Currency Name:</strong> {getBaseCurrencyDetails().fullName}</p>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Session Status</h3>
                            <p><strong>Cache Age:</strong> {userStorage.getCacheAge()} minutes</p>
                            <p><strong>Session Valid:</strong> {userStorage.isUserDataValid() ? 'Yes' : 'No'}</p>
                            <p><strong>Session Expired:</strong> {userStorage.isSessionExpired() ? 'Yes' : 'No'}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button onClick={handleCheckSessionStatus} variant="outline">
                            Check Session Status
                        </Button>
                        <Button onClick={handleForceRefresh} variant="outline">
                            Force Refresh Data
                        </Button>
                        <Button onClick={handleLogout} variant="destructive">
                            Logout (Clear Session)
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>How It Works</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div>
                        <h4 className="font-semibold">1. Login Flow</h4>
                        <p className="text-sm text-gray-600">
                            User authenticates → API call → Store in React Context + Session Storage
                        </p>
                    </div>

                    <div>
                        <h4 className="font-semibold">2. Page Refresh</h4>
                        <p className="text-sm text-gray-600">
                            Check Session Storage → Load from cache (if valid) → No API call needed
                        </p>
                    </div>

                    <div>
                        <h4 className="font-semibold">3. Page Navigation</h4>
                        <p className="text-sm text-gray-600">
                            Use React Context → Instant access → No API call
                        </p>
                    </div>

                    <div>
                        <h4 className="font-semibold">4. Logout</h4>
                        <p className="text-sm text-gray-600">
                            Clear React Context → Clear Session Storage → Sign out from Clerk
                        </p>
                    </div>

                    <div>
                        <h4 className="font-semibold">5. Session Expiration</h4>
                        <p className="text-sm text-gray-600">
                            Automatic check → Force logout if expired → Clear all data
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SessionManagementExample; 