// ─────────────────────────────────────────────────────────────────────────────
// STAFF APP — API SERVICE
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const resolveBaseUrl = () => {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const expoHost =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;

  if (expoHost) {
    const host = expoHost.split(':')[0];
    if (host) return `http://${host}:5001/api/v1`;
  }

  if (Platform.OS === 'android') return 'http://10.0.2.2:5001/api/v1';
  return 'http://localhost:5001/api/v1';
};

const BASE_URL   = resolveBaseUrl();
const TOKEN_KEY  = 'hangers_staff_token';
const authInvalidationListeners = new Set<() => void>();
const warnStorageFailure = (action: string, error: unknown) => {
  console.warn(`Staff app auth storage failed during ${action}`, error);
};

const normalizeApiResponse = (payload: any) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;

  if (
    Object.prototype.hasOwnProperty.call(payload, 'data') &&
    payload.data &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
  ) {
    return { ...payload, ...payload.data };
  }

  const { success, message, errors, ...rest } = payload;
  return { ...payload, data: rest };
};

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

const notifyAuthInvalidated = () => {
  authInvalidationListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('Staff app auth invalidation listener failed', error);
    }
  });
};

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch (error) {
    warnStorageFailure('token read', error);
  }
  return config;
});

api.interceptors.response.use(
  (res) => normalizeApiResponse(res.data),
  async (err) => {
    if (err.code === 'ECONNABORTED' || err.message === 'Network Error') {
      throw new Error(`Cannot reach server at ${BASE_URL}. Start backend or set EXPO_PUBLIC_API_URL.`);
    }
    const msg = err.response?.data?.message || err.response?.data?.error || 'Something went wrong.';
    if (
      err.response?.status === 401 &&
      /session expired|invalid token|account not found|deactivated/i.test(msg)
    ) {
      try {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } catch (error) {
        warnStorageFailure('token clear after auth invalidation', error);
      }
      notifyAuthInvalidated();
    }
    throw new Error(msg);
  }
);

export const saveToken  = (t: string) => SecureStore.setItemAsync(TOKEN_KEY, t);
export const getToken   = ()           => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken = ()           => SecureStore.deleteItemAsync(TOKEN_KEY);
export const onAuthInvalidated = (listener: () => void) => {
  authInvalidationListeners.add(listener);
  return () => {
    authInvalidationListeners.delete(listener);
  };
};

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  pinLogin:  (phone: string, pin: string) => api.post('/staff/auth/pin-login', { phone, pin }) as any,
  me:        () => api.get('/staff/auth/me') as any,
  logout:    () => api.post('/staff/auth/logout'),
  changePin: (currentPin: string, newPin: string) =>
    api.post('/staff/auth/change-pin', { currentPin, newPin }),
};

// ── Plant ─────────────────────────────────────────────────────────────────────
export const plantAPI = {
  dashboard: ()                        => api.get('/plant/dashboard') as any,
  orders:    (params?: any)            => api.get('/plant/orders', { params }) as any,
  scan:      (qrCode: string)          => api.get(`/plant/scan/${encodeURIComponent(qrCode)}`) as any,
  order:     (id: string)              => api.get(`/plant/orders/${id}`) as any,
  setStage:  (id: string, status: string, notes?: string) =>
    api.post(`/plant/orders/${id}/stage`, { status, notes }) as any,
  flagIssue:     (id: string, issueType: string, description?: string, itemIndex?: number) =>
    api.post(`/plant/orders/${id}/flag`, { issueType, description, itemIndex }) as any,
  generateTags:  (id: string) =>
    api.post(`/plant/orders/${id}/generate-tags`) as any,
};

export const metadataAPI = {
  getAll: () => api.get('/metadata') as any,
};

// ── Delivery ──────────────────────────────────────────────────────────────────
export const deliveryAPI = {
  dashboard:     ()                          => api.get('/delivery/dashboard') as any,
  orders:        (type?: string)             => api.get('/delivery/orders', { params: { type } }) as any,
  order:         (id: string)                => api.get(`/delivery/orders/${id}`) as any,
  pickup:        (id: string, bagCount?: number, notes?: string) =>
    api.post(`/delivery/orders/${id}/pickup`, { bagCount, notes }) as any,
  deliver:       (id: string, confirmCode: string, notes?: string) =>
    api.post(`/delivery/orders/${id}/deliver`, { confirmCode, notes }) as any,
  sendOtp:       (id: string)                =>
    api.post(`/delivery/orders/${id}/send-otp`) as any,
  verifyOtp:     (id: string, otp: string)   =>
    api.post(`/delivery/orders/${id}/verify-otp`, { otp }) as any,
  failed:        (id: string, reason: string) =>
    api.post(`/delivery/orders/${id}/failed`, { reason }) as any,
  collectCash:   (id: string, amount: number, notes?: string) =>
    api.post(`/delivery/orders/${id}/cash`, { amount, notes }) as any,
  summary:       ()                          => api.get('/delivery/summary') as any,
};

export default api;
