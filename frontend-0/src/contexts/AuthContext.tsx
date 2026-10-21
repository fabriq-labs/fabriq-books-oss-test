import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { User } from '@/models/User';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { userAPI } from '@/api/api';
import { userStorage } from '@/utils/userStorage';
import Cookies from 'js-cookie';
import { triggerChatReset } from '@/utils/chatSessionBridge';
import { buildSignInRedirect } from '@/lib/authRedirect';

// Type for the API response structure
interface UserAPIResponse {
  success: boolean;
  data: User;
  metaData: any;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isMeApiLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-fetch `/api/metadata/user/me` and replace the cached user (e.g. after an org rename). */
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDetailsFetched, setUserDetailsFetched] = useState(false);
  const [isMeApiLoading, setIsMeApiLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Step 4: App Initialization - Check authentication status on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setLoading(true);

        // Check if we have a valid session token
        const token = Cookies.get('__session');
        if (!token) {
          setUser(null);
          setUserDetailsFetched(true);
          setLoading(false);
          return;
        }

        // Step 3: Session Caching - Check cache first (performance optimization)
        const cachedUser = userStorage.getUserData();
        if (cachedUser) {
          setUser(cachedUser);
          setUserDetailsFetched(true);
          setLoading(false);
          setIsMeApiLoading(false);
          return; // Use cached data
        }

        // Fetch fresh user data from API
        setIsMeApiLoading(true);
        const response = await userAPI.getCurrentUser() as UserAPIResponse;
        if (response && response.success && response.data) {
          const userData = response.data;
          setUser(userData);
          userStorage.setUserData(userData); // Cache in sessionStorage
          setUserDetailsFetched(true);
        } else {
          setUser(null);
          setUserDetailsFetched(true);
          toast.error('No user data received from server');
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setUser(null);
        setUserDetailsFetched(true);
        toast.error('Failed to verify authentication');
      } finally {
        setIsMeApiLoading(false);
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Check for session expiration and redirect to login if not authenticated
  useEffect(() => {
    // Check if session has expired
    if (user && userStorage.isSessionExpired()) {
      console.log('Session expired, logging out user');
      logout();
      return;
    }

    // Redirect to login if not authenticated and not on an auth route
    const publicAuthRoutes = ['/auth', '/sign-in', '/signup'];
    // Dev-only harnesses (ClarificationCard preview, etc.)
    const isDevPublicRoute =
      import.meta.env.DEV && location.pathname.startsWith('/dev/');
    if (!loading && !user && !publicAuthRoutes.includes(location.pathname) && !isDevPublicRoute) {
      navigate(buildSignInRedirect(location.pathname, location.search));
    }
  }, [user, loading, location.pathname, navigate]);

  // Step 2: AuthContext Login Function (Lines 108-155)
  const login = async (email: string, password: string) => {
    setLoading(true);

    try {
      // 2a. Send credentials to backend
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      // 2b. Handle errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Login failed');
      }

      // 2c. Get JWT token from response
      const data = await response.json(); // { token: "jwt_token_here" }

      // 2d. Store token in cookie
      Cookies.remove('__session');
      Cookies.set('__session', data.token, { expires: 1 }); // 1 day expiry

      // 2e. Fetch user details using the token
      setIsMeApiLoading(true);
      const userResponse = await userAPI.getCurrentUser() as UserAPIResponse;
      if (userResponse && userResponse.success && userResponse.data) {
        setUser(userResponse.data);
        userStorage.setUserData(userResponse.data); // Cache in sessionStorage
        setUserDetailsFetched(true);

        triggerChatReset();
        toast.success('Login successful!');
        // 2f. Post-login navigation is handled by PublicAuthRoute (App.tsx),
        // which reads the same ?redirect= param once isAuthenticated flips —
        // keeping a single source of truth avoids a navigation race here.
      } else {
        throw new Error('Failed to fetch user data after login');
      }
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsMeApiLoading(false);
      setLoading(false);
    }
  };

  const refreshUser = useCallback(async () => {
    const response = await userAPI.getCurrentUser() as UserAPIResponse;
    if (response && response.success && response.data) {
      setUser(response.data);
      userStorage.setUserData(response.data);
    }
  }, []);

  const logout = () => {
    triggerChatReset();
    // Clear all user-related data first
    setUser(null);
    setUserDetailsFetched(false);
    setIsMeApiLoading(false);

    // Clear session token
    Cookies.remove('__session');

    // Clear all session storage data
    userStorage.clearAllUserData();

    // Navigate to sign-in page
    navigate('/sign-in');
    toast.info('You have been logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ user, loading, isMeApiLoading, login, logout, refreshUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};