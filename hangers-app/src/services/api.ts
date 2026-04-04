// ─────────────────────────────────────────────────────────────────────────────
// API SERVICE v3 — All endpoints: auth, orders, addresses, payments, Razorpay
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
    if (host) return `http://${host}:3000/api/v1`;
  }

  if (Platform.OS === 'android') return 'http://10.0.2.2:3000/api/v1';
  return 'http://localhost:3000/api/v1';
};

const BASE_URL = resolveBaseUrl();

const TOKEN_KEY = 'hangers_auth_token';
const authInvalidationListeners = new Set<() => void>();

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
    } catch {}
  });
};

// Attach token to every request
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

// Handle 401
api.interceptors.response.use(
  (res) => normalizeApiResponse(res.data),
  async (err) => {
    if (err.code === 'ECONNABORTED' || err.message === 'Network Error') {
      throw new Error(`Cannot reach server at ${BASE_URL}. Start backend or set EXPO_PUBLIC_API_URL.`);
    }
    const message = err.response?.data?.message || err.response?.data?.error || 'Something went wrong.';
    if (
      err.response?.status === 401 &&
      /session expired|invalid token|account not found|deactivated/i.test(message)
    ) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      notifyAuthInvalidated();
    }
    throw new Error(message);
  }
);

export const saveToken  = (t: string) => SecureStore.setItemAsync(TOKEN_KEY, t);
export const getToken   = ()          => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken = ()          => SecureStore.deleteItemAsync(TOKEN_KEY);
export const onAuthInvalidated = (listener: () => void) => {
  authInvalidationListeners.add(listener);
  return () => {
    authInvalidationListeners.delete(listener);
  };
};

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  sendOtp:   (phone: string)                                               => api.post('/auth/send-otp',  { phone }),
  verifyOtp: (phone: string, otp: string, name?: string, referredByCode?: string)  => api.post('/auth/verify-otp',{ phone, otp, name, referredByCode }),
  getMe:     ()                                                            => api.get('/auth/me'),
  logout:    ()                                                            => api.post('/auth/logout'),

  /** Update name / language */
  updateProfile: (data: { name?: string; preferredLanguage?: 'ENGLISH' | 'HINDI' | 'MARATHI' }) =>
    api.patch('/auth/profile', data),

  /** Save Expo push token for notifications */
  savePushToken: (pushToken: string)                                       => api.post('/auth/push-token', { pushToken }),

  /** Toggle WhatsApp / push notification preferences */
  updateNotificationPrefs: (prefs: { notifWhatsApp?: boolean; notifPush?: boolean }) =>
    api.patch('/auth/notifications', prefs),
};

// ── SERVICES / PRICING ────────────────────────────────────────────────────────
export const servicesAPI = {
  getPriceList: () => api.get('/services'),
  getDailyIronRates: () => api.get('/services', { params: { category: 'DAILY_IRON' } }),
};

export const metadataAPI = {
  getAll: () => api.get('/metadata'),
};

export const ironAPI = {
  apply: (data?: { notes?: string }) => api.post('/iron/customer/apply', data || {}),
  getSubscription: () => api.get('/iron/customer/subscription'),
  getLogs: () => api.get('/iron/customer/logs'),
  getLogsByMonth: (month: number, year: number) =>
    api.get('/iron/customer/logs/month', { params: { month, year } }),
  getBills: () => api.get('/iron/customer/bills'),
  pauseSubscription: () => api.put('/iron/customer/subscription/pause'),
};

// ── REFERRAL ──────────────────────────────────────────────────────────────────
export const referralAPI = {
  getInfo: () => api.get('/customer/referral'),
};

// ── WALLET ────────────────────────────────────────────────────────────────────
export const walletAPI = {
  getWallet: () => api.get('/customer/wallet'),
};

// ── CUSTOMER ORDERS ───────────────────────────────────────────────────────────
export const ordersAPI = {
  /** Get my order history */
  getMyOrders: (page = 1, limit = 50) =>
    api.get(`/customer/orders?page=${page}&limit=${limit}`),

  /** Get single order for tracking */
  getOrderById: (orderId: string) =>
    api.get(`/customer/orders/${orderId}`),

  /** Book a pickup from the app */
  bookPickup: (data: {
    customerId?: string;
    pickupDate:   string;
    pickupTimeSlot?: string;
    timeSlot?:    string;
    serviceTypes?: string[];
    pickupAddress?: string;
    savedAddressId?: string;
    address?:      string;
    notes?:       string;
    items?:       any[];
    subtotal?:    number;
    estimatedAmount?: number;
    source?: string;
    totalAmount?: number;
    useWalletCredits?: boolean;
  }) => api.post('/customer/orders/pickup-request', data),
};

// ── PAYMENTS ──────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  /** Get customer's full payment history */
  getHistory: () => api.get('/customer/payments/history'),

  /** Step 1 — create a Razorpay order on backend */
  createRazorpayOrder: (orderId: string) =>
    api.post('/customer/payments/razorpay/create-order', { orderId }),

  /** Step 2 — verify payment after checkout completes */
  verifyRazorpayPayment: (data: {
    orderId:            string;
    razorpayOrderId:    string;
    razorpayPaymentId:  string;
    razorpaySignature:  string;
    amount:             number;
  }) => api.post('/customer/payments/razorpay/verify', data),
};

// ── ADDRESSES ─────────────────────────────────────────────────────────────────
export const addressAPI = {
  list:       ()                       => api.get('/addresses'),
  getAll:     ()                       => api.get('/addresses'),
  create:     (data: any)              => api.post('/addresses', data),
  update:     (id: string, data: any)  => api.patch(`/addresses/${id}`, data),
  delete:     (id: string)             => api.delete(`/addresses/${id}`),
  setDefault: (id: string)             => api.patch(`/addresses/${id}/default`),
};

export default api;
