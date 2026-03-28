// ─────────────────────────────────────────────────────────────────────────────
// API SERVICE — All calls to the Hangers Backend
// Change BASE_URL to your server's IP when testing on a real phone
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// ── Change this to your computer's local IP when testing on phone ─────────────
// e.g. 'http://192.168.1.10:5000'  (run `ipconfig` on Windows or `ifconfig` on Mac)
// For emulator use: 'http://10.0.2.2:5000' (Android) or 'http://localhost:5000' (iOS sim)
const BASE_URL = 'http://192.168.29.246:3000/api/v1';

const TOKEN_KEY = 'hangers_auth_token';

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Attach token to every request ─────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

// ── Handle 401 globally (token expired) ──────────────────────────────────────
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      // Navigation to login handled at component level
    }
    const message = error.response?.data?.message || 'Something went wrong. Please try again.';
    throw new Error(message);
  }
);

// ── Token management ──────────────────────────────────────────────────────────
export const saveToken  = (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const getToken   = ()              => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken = ()              => SecureStore.deleteItemAsync(TOKEN_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

export const authAPI = {
  /**
   * Send OTP via WhatsApp
   * @param phone - 10-digit Indian number
   */
  sendOtp: (phone: string) =>
    api.post('/auth/send-otp', { phone }),

  /**
   * Verify OTP and get auth token
   */
  verifyOtp: (phone: string, otp: string, name?: string, email?: string) =>
    api.post('/auth/verify-otp', { phone, otp, name, email }),

  /**
   * Get current customer profile
   */
  getMe: () =>
    api.get('/auth/me'),

  /**
   * Logout
   */
  logout: () =>
    api.post('/auth/logout'),
};

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES & PRICING ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

export const servicesAPI = {
  /**
   * Get full price list grouped by service category
   */
  getPriceList: () =>
    api.get('/services/price-list'),

  /**
   * Get all service categories
   */
  getCategories: () =>
    api.get('/services/categories'),
};

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

export const ordersAPI = {
  /**
   * Place a new order
   */
  createOrder: (orderData: any) =>
    api.post('/orders', orderData),

  /**
   * Get customer's own orders
   */
  getMyOrders: (page = 1, limit = 20) =>
    api.get(`/orders/my?page=${page}&limit=${limit}`),

  /**
   * Get single order details
   */
  getOrderById: (orderId: string) =>
    api.get(`/orders/${orderId}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// ADDRESSES ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

export const addressAPI = {
  getAll: () =>
    api.get('/addresses'),

  create: (data: any) =>
    api.post('/addresses', data),

  update: (id: string, data: any) =>
    api.put(`/addresses/${id}`, data),

  delete: (id: string) =>
    api.delete(`/addresses/${id}`),

  setDefault: (id: string) =>
    api.patch(`/addresses/${id}/default`),
};

export default api;
