import { User } from '@/models/User';

const USER_DATA_KEY = 'userData';
const USER_DATA_TIMESTAMP_KEY = 'userDataTimestamp';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export interface CachedUserData {
    user: User;
    timestamp: number;
}

export const userStorage = {
    // Step 3: Session Caching - Store user data with timestamp (30-minute cache)
    setUserData: (user: User): void => {
        try {
            sessionStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
            sessionStorage.setItem(USER_DATA_TIMESTAMP_KEY, Date.now().toString());
        } catch (error) {
            console.error('Error storing user data in session storage:', error);
        }
    },

    // Step 3: Session Caching - Retrieve cached data
    getUserData: (): User | null => {
        try {
            const userData = sessionStorage.getItem(USER_DATA_KEY);
            const timestamp = sessionStorage.getItem(USER_DATA_TIMESTAMP_KEY);

            if (!userData || !timestamp) {
                return null;
            }

            const cacheAge = Date.now() - parseInt(timestamp);
            if (cacheAge > CACHE_DURATION) {
                // Cache expired, remove it
                userStorage.clearUserData();
                return null;
            }

            return JSON.parse(userData) as User;
        } catch (error) {
            console.error('Error retrieving user data from session storage:', error);
            userStorage.clearUserData();
            return null;
        }
    },

    // Check if cached user data is valid
    isUserDataValid: (): boolean => {
        try {
            const userData = sessionStorage.getItem(USER_DATA_KEY);
            const timestamp = sessionStorage.getItem(USER_DATA_TIMESTAMP_KEY);

            if (!userData || !timestamp) {
                return false;
            }

            const cacheAge = Date.now() - parseInt(timestamp);
            return cacheAge <= CACHE_DURATION;
        } catch (error) {
            return false;
        }
    },

    // Clear user data from session storage
    clearUserData: (): void => {
        try {
            sessionStorage.removeItem(USER_DATA_KEY);
            sessionStorage.removeItem(USER_DATA_TIMESTAMP_KEY);
        } catch (error) {
            console.error('Error clearing user data from session storage:', error);
        }
    },

    // Clear all user-related session storage data
    clearAllUserData: (): void => {
        try {
            // Clear our specific user data
            userStorage.clearUserData();

            // Clear any other user-related session storage items
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && (
                    key.includes('user') ||
                    key.includes('auth') ||
                    key.includes('token') ||
                    key.includes('session') ||
                    key.includes('login')
                )) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => sessionStorage.removeItem(key));

            console.log('All user-related session data cleared');
        } catch (error) {
            console.error('Error clearing all user data from session storage:', error);
        }
    },

    // Get cache age in minutes
    getCacheAge: (): number => {
        try {
            const timestamp = sessionStorage.getItem(USER_DATA_TIMESTAMP_KEY);
            if (!timestamp) return 0;

            const cacheAge = Date.now() - parseInt(timestamp);
            return Math.floor(cacheAge / (60 * 1000)); // Convert to minutes
        } catch (error) {
            return 0;
        }
    },

    // Check if session has expired (for automatic logout)
    isSessionExpired: (maxSessionHours: number = 8): boolean => {
        try {
            const timestamp = sessionStorage.getItem(USER_DATA_TIMESTAMP_KEY);
            if (!timestamp) return true;

            const sessionAge = Date.now() - parseInt(timestamp);
            const maxSessionAge = maxSessionHours * 60 * 60 * 1000; // Convert hours to milliseconds

            return sessionAge > maxSessionAge;
        } catch (error) {
            return true;
        }
    },

    // Force refresh user data (clear cache to force API call)
    forceRefresh: (): void => {
        userStorage.clearUserData();
    }
}; 