// ─────────────────────────────────────────────────────────────────────────────
// STAFF APP — API SERVICE
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// ── Change this to your WiFi IP when testing on a real phone ─────────────────
// Kevin's network: 'http://192.168.29.246:3000/api/v1'
// Android emulator: 'http://10.0.2.2:3000/api/v1'
const BASE_URL   = 'http://192.168.29.246:3000/api/v1';
const TOKEN_KEY  = 'hangers_staff_token';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    if (err.response?.status === 401) await SecureStore.deleteItemAsync(TOKEN_KEY);
    const msg = err.response?.data?.message || err.response?.data?.error || 'Something went wrong.';
    throw new Error(msg);
  }
);

export const saveToken  = (t: string) => SecureStore.setItemAsync(TOKEN_KEY, t);
export const getToken   = ()           => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken = ()           => SecureStore.deleteItemAsync(TOKEN_KEY);

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

// ── Delivery ──────────────────────────────────────────────────────────────────
export const deliveryAPI = {
  dashboard:     ()                          => api.get('/delivery/dashboard') as any,
  orders:        (type?: string)             => api.get('/delivery/orders', { params: { type } }) as any,
  order:         (id: string)                => api.get(`/delivery/orders/${id}`) as any,
  pickup:        (id: string, bagCount?: number, notes?: string) =>
    api.post(`/delivery/orders/${id}/pickup`, { bagCount, notes }) as any,
  deliver:       (id: string, notes?: string) =>
    api.post(`/delivery/orders/${id}/deliver`, { notes }) as any,
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
