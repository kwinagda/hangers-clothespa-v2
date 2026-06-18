// ─────────────────────────────────────────────────────────────────────────────
// STAFF APP — AUTH CONTEXT  (.tsx — contains JSX)
// ─────────────────────────────────────────────────────────────────────────────
import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, saveToken, getToken, clearToken, onAuthInvalidated } from '../services/api';

interface StaffUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: string;
  permissions?: string[];
}

interface AuthCtx {
  staff:           StaffUser | null;
  appType:         'plant' | 'delivery' | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  login:           (staff: StaffUser, token: string, appType: 'plant' | 'delivery') => Promise<void>;
  logout:          () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [staff,     setStaff]     = useState<StaffUser | null>(null);
  const [appType,   setAppType]   = useState<'plant' | 'delivery' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const r: any = await authAPI.me();
          const s = r.data?.staff;
          if (s) {
            setStaff(s);
            setAppType(r.data?.appType || 'delivery');
          }
        }
      } catch {
        await clearToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    return onAuthInvalidated(() => {
      setStaff(null);
      setAppType(null);
    });
  }, []);

  const login = async (
    staffData: StaffUser,
    token: string,
    type: 'plant' | 'delivery'
  ) => {
    await saveToken(token);
    setStaff(staffData);
    setAppType(type);
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.warn('Staff logout request failed; clearing local session anyway', error);
    }
    await clearToken();
    setStaff(null);
    setAppType(null);
  };

  return (
    <AuthContext.Provider
      value={{
        staff,
        appType,
        isLoading,
        isAuthenticated: !!staff,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
