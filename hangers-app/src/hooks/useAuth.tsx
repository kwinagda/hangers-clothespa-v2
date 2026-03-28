// ─────────────────────────────────────────────────────────────────────────────
// AUTH CONTEXT — Global customer authentication state
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { authAPI, saveToken, getToken, clearToken } from '../services/api';

// ── Push notification setup (item 13) ─────────────────────────────────────────
async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : {}
    )).data;
    await authAPI.savePushToken(token);
  } catch {
    // Non-blocking — push notifications are optional
  }
}

interface Customer {
  id:            string;
  phone:         string;
  name:          string | null;
  email:         string | null;
  isNewUser?:    boolean;
  notifWhatsApp?: boolean;
  notifPush?:    boolean;
  pushToken?:    string | null;
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
    // Register for push notifications after login (non-blocking)
    registerForPushNotificationsAsync();
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
