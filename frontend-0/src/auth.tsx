import React, { createContext, useContext, useEffect, useState } from "react";
import { clearToken, CurrentUser, getMe, getToken, isSuperAdmin, login as apiLogin } from "./api";

interface AuthValue {
  user: CurrentUser | null;
  loading: boolean;
  superAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const next = await getMe();
    setUser(next);
  };

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    refresh()
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    await apiLogin(email, password);
    await refresh();
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, superAdmin: isSuperAdmin(user), login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
