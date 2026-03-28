import axios from 'axios'
import Cookies from 'js-cookie'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'
const api  = axios.create({ baseURL: BASE, timeout: 15000 })

api.interceptors.request.use((config) => {
  const token = Cookies.get('crm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use(
  (r) => r.data,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      Cookies.remove('crm_token')
      window.location.href = '/login'
    }
    throw new Error(err.response?.data?.message || 'Something went wrong')
  }
)

export const authAPI = {
  login:  (email: string, password: string) => api.post('/staff/auth/login', { email, password }) as any,
  me:     ()             => api.get('/staff/auth/me') as any,
  logout: ()             => api.post('/staff/auth/logout'),
}
export const ordersAPI = {
  list:         (params?: any) => api.get('/orders', { params }) as any,
  stats:        ()             => api.get('/orders/stats') as any,
  get:          (id: string)   => api.get(`/orders/${id}`) as any,
  create:       (data: any)    => api.post('/orders', data) as any,
  updateStatus: (id: string, status: string, notes?: string) => api.patch(`/orders/${id}/status`, { status, notes }) as any,
  addItems:     (id: string, data: any) => api.patch(`/orders/${id}/items`, data) as any,
  delete:       (id: string)   => api.delete(`/orders/${id}`),
}
export const customersAPI = {
  list:   (params?: any)          => api.get('/customers', { params }) as any,
  get:    (id: string)            => api.get(`/customers/${id}`) as any,
  create: (data: any)             => api.post('/customers', data) as any,
  update: (id: string, data: any) => api.patch(`/customers/${id}`, data) as any,
  findByPhone: (phone: string) => api.get(`/customers?search=${phone}`) as any,
}
export const staffAPI = {
  list:        ()                             => api.get('/staff/list') as any,
  create:      (data: any)                    => api.post('/staff/create', data) as any,
  update:      (id: string, data: any)        => api.put(`/staff/${id}`, data) as any,
  deactivate:  (id: string)                   => api.put(`/staff/${id}/deactivate`) as any,
  reactivate:  (id: string)                   => api.put(`/staff/${id}/reactivate`) as any,
  resetPin:    (id: string)                   => api.post(`/staff/${id}/reset-pin`) as any,
}
export const paymentsAPI = {
  byOrder:     (orderId: string)              => api.get(`/payments/order/${orderId}`) as any,
  record:      (data: any)                    => api.post('/payments', data) as any,
  dailySummary:(params?: any)                 => api.get('/payments/daily', { params }) as any,
}
export const servicesAPI = {
  getPriceList: ()           => api.get('/services') as any,
  getCatalog:   ()           => api.get('/services').then((r: any) => { const cat = r.data?.catalog || r.data || []; return cat.flatMap((g: any) => (g.items||[]).map((item: any) => ({id: item.id, name: item.name, basePrice: item.price, category: g.category, catalogName: g.category.replace(/\u2014/g, "—")}))); }) as any,
  saveCatalog:  (catalog: any) => api.put('/services', { catalog }) as any,
}
export default api;
// ─────────────────────────────────────────────────────────────────────────────
// PHASE A — API ADDITIONS
// APPEND everything below to the bottom of:
// hangers-crm/src/lib/api.ts
// ─────────────────────────────────────────────────────────────────────────────

// A1 — Customer stats
export const statsAPI = {
  customer: (id: string) => api.get(`/customers/${id}/stats`),
}

// A2 — Cash book
export const cashBookAPI = {
  get:    (date?: string) => api.get(`/cashbook${date ? `?date=${date}` : ''}`),
  add:    (data: any)     => api.post('/cashbook', data),
}

// A3 — Expenses
export const expensesAPI = {
  get:    (month?: number, year?: number) => api.get(`/expenses?month=${month||''}&year=${year||''}`),
  add:    (data: any)  => api.post('/expenses', data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
}

// A4 — AR Ledger
export const arAPI = {
  get: () => api.get('/ar-ledger'),
}

// A5 — Delivery Challans
export const challanAPI = {
  getAll:        ()                          => api.get('/challans'),
  getOne:        (id: string)                => api.get(`/challans/${id}`) as any,
  receiveItems:  (id: string, items: any[]) => api.patch(`/challans/${id}/receive-items`, { items }) as any,
  create:        (data: any)                 => api.post('/challans', data),
  setStatus:     (id: string, status: string) => api.patch(`/challans/${id}/status`, { status }),
}

export const vendorBillAPI = {
  getAll:  (plant?: string)           => api.get(`/vendor-bills${plant ? `?plant=${plant}` : ''}`),
  create:  (data: any)                => api.post('/vendor-bills', data),
  pay:     (id: string)               => api.patch(`/vendor-bills/${id}/pay`),
}

export const vendorPriceAPI = {
  getAll:  (plant?: string)           => api.get(`/vendor-prices${plant ? `?plant=${plant}` : ''}`),
  upsert:  (data: any)                => api.post('/vendor-prices', data),
  bulkSave:(plant: string, prices: any[]) => api.post('/vendor-prices/bulk', { plant, prices }),
}

// A6 — Transfer Orders
export const transferAPI = {
  getAll:   ()           => api.get('/transfers'),
  create:   (data: any)  => api.post('/transfers', data),
  setStatus:(id: string, status: string) => api.patch(`/transfers/${id}/status`, { status }),
}

// A7 — Attendance
export const attendanceAPI = {
  get:      (params?: any) => api.get('/attendance', { params }),
  clockIn:  (staffId: string) => api.post('/attendance/clock-in', { staffId }),
  clockOut: (staffId: string) => api.post('/attendance/clock-out', { staffId }),
}

// A8 — Coupons
export const couponsAPI = {
  getAll:   ()            => api.get('/coupons'),
  create:   (data: any)   => api.post('/coupons', data),
  validate: (data: any)   => api.post('/coupons/validate', data),
  toggle:   (id: string)  => api.patch(`/coupons/${id}/toggle`),
}

// A10 — Loyalty
export const loyaltyAPI = {
  getRules:    ()         => api.get('/loyalty/rules'),
  updateRules: (data: any)=> api.put('/loyalty/rules', data),
  award:       (data: any)=> api.post('/loyalty/award', data),
}

// A11 — Upcharges
export const upchargesAPI = {
  getAll:  ()           => api.get('/upcharges'),
  create:  (data: any)  => api.post('/upcharges', data),
}

// A12 — Customer tag
export const customerTagAPI = {
  update: (id: string, data: any) => api.patch(`/customers/${id}/tag`, data),
}

// A13 — Recurring pickups
export const recurringAPI = {
  getAll:  ()           => api.get('/recurring-pickups'),
  create:  (data: any)  => api.post('/recurring-pickups', data),
  toggle:  (id: string) => api.patch(`/recurring-pickups/${id}/toggle`),
}

// A14 — Return orders
export const returnOrderAPI = {
  create: (data: any) => api.post('/orders/return', data),
}

// A15 — Campaigns
export const campaignsAPI = {
  getAll:  ()           => api.get('/campaigns'),
  create:  (data: any)  => api.post('/campaigns', data),
  send:    (id: string) => api.post(`/campaigns/${id}/send`),
}

// A16 — Reports
export const reportsAPI = {
  get: (type: string, from?: string, to?: string) =>
    api.get(`/reports?type=${type}&from=${from||''}&to=${to||''}`),
}

// A17 — Advanced search
export const searchAPI = {
  query: (params: any) => api.get('/search', { params }),
}

// A18 — Automations
export const automationsAPI = {
  getAll:  ()                        => api.get('/automations'),
  create:  (data: any)               => api.post('/automations', data),
  toggle:  (id: string)              => api.patch(`/automations/${id}/toggle`),
  update:  (id: string, data: any)   => api.put(`/automations/${id}`, data),
}

// Staff list (used in attendance page)
export const staffListAPI = {
  getAll: () => api.get(`/staff/list`),
}

export const walletAPI = {
  get:    (customerId: string)                        => api.get(`/wallet/${customerId}`) as any,
  credit: (customerId: string, data: any)             => api.post(`/wallet/${customerId}/credit`, data) as any,
  deduct: (customerId: string, data: any)             => api.post(`/wallet/${customerId}/deduct`, data) as any,
  apply:  (customerId: string, orderId: string, amount: number) => api.post(`/wallet/${customerId}/apply`, { orderId, amount }) as any,
}
