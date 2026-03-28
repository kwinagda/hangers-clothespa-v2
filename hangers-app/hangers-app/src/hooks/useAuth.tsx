// ─────────────────────────────────────────────────────────────────────────────
// AUTH CONTEXT — Global customer authentication state
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, saveToken, getToken, clearToken } from '../services/api';

interface Customer {
  id:        string;
  phone:     string;
  name:      string | null;
  email:     string | null;
  isNewUser?: boolean;
}

interface AuthContextType {
  customer:       Customer | null;
  isLoading:      boolean;
  isAuthenticated: boolean;
  login:          (customer: Customer, token: string) => Promise<void>;
  logout:         () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customer,  setCustomer]  = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check stored token on app launch
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const token = await getToken();
        if (token) {
          const response: any = await authAPI.getMe();
          setCustomer(response.data.customer);
        }
      } catch {
        await clearToken();
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, []);

  const login = async (customerData: Customer, token: string) => {
    await saveToken(token);
    setCustomer(customerData);
  };

  const logout = async () => {
    try { await authAPI.logout(); } catch {}
    await clearToken();
    setCustomer(null);
  };

  const refreshProfile = async () => {
    try {
      const response: any = await authAPI.getMe();
      setCustomer(response.data.customer);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{
      customer,
      isLoading,
      isAuthenticated: !!customer,
      login,
      logout,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
