// ─────────────────────────────────────────────────────────────────────────────
// API SERVICE v3 — All endpoints: auth, orders, addresses, payments, Razorpay
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// ── Change this to your computer's WiFi IP when testing on real phone ────────
const BASE_URL = 'http://192.168.29.246:3000/api/v1';

const TOKEN_KEY = 'hangers_auth_token';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

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
  (res) => res.data,
  async (err) => {
    if (err.response?.status === 401) await SecureStore.deleteItemAsync(TOKEN_KEY);
    const message = err.response?.data?.message || err.response?.data?.error || 'Something went wrong.';
    throw new Error(message);
  }
);

export const saveToken  = (t: string) => SecureStore.setItemAsync(TOKEN_KEY, t);
export const getToken   = ()          => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken = ()          => SecureStore.deleteItemAsync(TOKEN_KEY);

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  sendOtp:   (phone: string)                                               => api.post('/auth/send-otp',  { phone }),
  verifyOtp: (phone: string, otp: string, name?: string, email?: string, referredByCode?: string)  => api.post('/auth/verify-otp',{ phone, otp, name, email, referredByCode }),
  getMe:     ()                                                            => api.get('/auth/me'),
  logout:    ()                                                            => api.post('/auth/logout'),

  /** Update name / email */
  updateProfile: (data: { name?: string; email?: string })                => api.patch('/auth/profile', data),

  /** Save Expo push token for notifications */
  savePushToken: (pushToken: string)                                       => api.post('/auth/push-token', { pushToken }),

  /** Toggle WhatsApp / push notification preferences */
  updateNotificationPrefs: (prefs: { notifWhatsApp?: boolean; notifPush?: boolean }) =>
    api.patch('/auth/notifications', prefs),
};

// ── SERVICES / PRICING ────────────────────────────────────────────────────────
export const servicesAPI = {
  getPriceList: () => api.get('/services'),
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
  update:     (id: string, data: any)  => api.put(`/addresses/${id}`, data),
  delete:     (id: string)             => api.delete(`/addresses/${id}`),
  setDefault: (id: string)             => api.patch(`/addresses/${id}/default`),
};

export default api;
