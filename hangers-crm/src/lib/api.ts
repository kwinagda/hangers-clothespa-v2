import axios from 'axios'

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'
const api  = axios.create({ baseURL: API_BASE_URL, timeout: 15000, withCredentials: true })

export const idempotencyConfig = (scope: string) => {
  const randomId = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { headers: { 'X-Idempotency-Key': `${scope}:${randomId}` } }
}

const normalizeApiResponse = (payload: any) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload

  if (
    Object.prototype.hasOwnProperty.call(payload, 'data') &&
    payload.data &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
  ) {
    return { ...payload, ...payload.data }
  }

  const { success, message, errors, ...rest } = payload
  return { ...payload, data: rest }
}

api.interceptors.response.use(
  (r) => normalizeApiResponse(r.data),
  (err) => {
    if (err.response?.status === 428 && err.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined') {
      const path = window.location.pathname || ''
      if (path !== '/change-password') {
        window.location.replace('/change-password')
      }
    }
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname || ''
      if (path !== '/login') {
        window.location.replace('/login')
      }
    }
    throw new Error(err.response?.data?.message || 'Something went wrong')
  }
)

export const authAPI = {
  login:  (email: string, password: string) => api.post('/staff/auth/login', { email, password }) as any,
  me:     ()             => api.get('/staff/auth/me') as any,
  logout: ()             => api.post('/staff/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) => api.post('/staff/auth/change-password', { currentPassword, newPassword }) as any,
}
export const ordersAPI = {
  list:         (params?: any) => api.get('/orders', { params }) as any,
  stats:        ()             => api.get('/orders/stats') as any,
  get:          (id: string)   => api.get(`/orders/${id}`) as any,
  create:       (data: any)    => api.post('/orders', data, idempotencyConfig('crm-order')) as any,
  update:       (id: string, data: any) => api.patch(`/orders/${id}`, data, idempotencyConfig('crm-order-edit')) as any,
  updateStatus: (id: string, status: string, notes?: string, expectedVersion?: number) => api.patch(
    `/orders/${id}/status`,
    { status, notes, expectedVersion },
    idempotencyConfig('crm-order-status')
  ) as any,
  addItems:     (id: string, data: any) => api.patch(`/orders/${id}/items`, data, idempotencyConfig('crm-order-itemize')) as any,
  delete:       (id: string)   => api.delete(`/orders/${id}`, idempotencyConfig('crm-order-archive')),
}
export const quotationsAPI = {
  list:         (params?: any) => api.get('/quotations', { params }) as any,
  get:          (id: string)   => api.get(`/quotations/${id}`) as any,
  create:       (data: any)    => api.post('/quotations', data, idempotencyConfig('crm-quotation')) as any,
  update:       (id: string, data: any) => api.patch(`/quotations/${id}`, data, idempotencyConfig('crm-quotation-edit')) as any,
  updateStatus: (id: string, quotationStatus: string, reason?: string) => api.patch(`/quotations/${id}/status`, { quotationStatus, reason }, idempotencyConfig('crm-quotation-status')) as any,
  convert:      (id: string)   => api.post(`/quotations/${id}/convert`, {}, idempotencyConfig('crm-quotation-convert')) as any,
  share:        (id: string)   => api.post(`/quotations/${id}/share`) as any,
  pdfUrl:       (id: string) => `${API_BASE_URL}/quotations/${id}/pdf`,
}
export const customersAPI = {
  list:   (params?: any)          => api.get('/customers', { params }) as any,
  get:    (id: string)            => api.get(`/customers/${id}`) as any,
  referralReport: (params?: any)  => api.get('/customers/referrals/report', { params }) as any,
  create: (data: any)             => api.post('/customers', data) as any,
  update: (id: string, data: any) => api.patch(`/customers/${id}`, data) as any,
  addAddress: (id: string, data: any) => api.post(`/customers/${id}/addresses`, data) as any,
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
  record:      (data: any)                    => api.post('/payments', data, idempotencyConfig('crm-payment')) as any,
  dailySummary:(params?: any)                 => api.get('/payments/daily', { params }) as any,
  refund:      (orderId: string, data: any)   => api.post(`/orders/${orderId}/refunds`, data, idempotencyConfig('crm-refund')) as any,
}
export const servicesAPI = {
  getPriceList: ()           => api.get('/services') as any,
  getCatalog:   ()           => api.get('/services').then((r: any) => { const cat = r.data?.catalog || r.data || []; return cat.flatMap((g: any) => (g.items||[]).map((item: any) => ({id: item.id, name: item.name, basePrice: item.price, category: g.category, catalogName: g.category.replace(/\u2014/g, "—")}))); }) as any,
  saveCatalog:  (catalog: any) => api.put('/services', { catalog }) as any,
  createItem:   (data: any) => api.post('/services', data) as any,
  updateItem:   (id: string, data: any) => api.patch(`/services/${id}`, data) as any,
  deactivateItem: (id: string) => api.delete(`/services/${id}`) as any,
  getDailyIronRates: ()      => api.get('/services', { params: { category: 'DAILY_IRON' } }) as any,
}

export const metadataAPI = {
  getAll: () => api.get('/metadata') as any,
}

export const settingsAPI = {
  getAll: () => api.get('/settings') as any,
  update: (data: any) => api.patch('/settings', data) as any,
}

export const ironAPI = {
  listSubscriptions: (status?: string) => api.get('/iron/subscriptions', { params: status ? { status } : undefined }) as any,
  getSubscription: (customerId: string) => api.get(`/iron/subscriptions/${customerId}`) as any,
  createSubscription: (data: any) => api.post('/iron/subscriptions', data) as any,
  confirmSubscription: (id: string) => api.put(`/iron/subscriptions/${id}/confirm`) as any,
  updateSubscriptionStatus: (id: string, status: string, notes?: string) =>
    api.put(`/iron/subscriptions/${id}/status`, { status, notes }) as any,
  listLogs: (params?: { date?: string; start?: string; end?: string; customerId?: string }) =>
    api.get('/iron/logs', { params }) as any,
  getLogs: (customerId: string) => api.get(`/iron/logs/${customerId}`) as any,
  getLogsByPeriod: (customerId: string, start: string, end: string) =>
    api.get(`/iron/logs/${customerId}/period`, { params: { start, end } }) as any,
  createLog: (data: any) => api.post('/iron/logs', data, idempotencyConfig('crm-iron-log')) as any,
  createLogsBatch: (data: any) => api.post('/iron/logs/batch', data, idempotencyConfig('crm-iron-log-batch')) as any,
  deleteLog: (id: string, reason: string) => api.delete(`/iron/logs/${id}`, { ...idempotencyConfig('crm-iron-log-void'), data: { reason } }) as any,
  generateBill: (data: any) => api.post('/iron/bills/generate', data, idempotencyConfig('crm-iron-bill')) as any,
  getBills: (customerId: string) => api.get(`/iron/bills/customer/${customerId}`) as any,
  getBill: (billId: string) => api.get(`/iron/bills/${billId}`) as any,
  sendBill: (billId: string) => api.put(`/iron/bills/${billId}/send`, {}, idempotencyConfig('crm-iron-bill-send')) as any,
  recordPayment: (billId: string, data: { amount: number; paymentMethod?: string; reference?: string; notes?: string }) =>
    api.put(`/iron/bills/${billId}/pay`, data, idempotencyConfig('crm-iron-payment')) as any,
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
  add:    (data: any)     => api.post('/cashbook', data, idempotencyConfig('crm-cash-entry')),
}

// A3 — Expenses
export const expensesAPI = {
  get:    (month?: number, year?: number) => api.get(`/expenses?month=${month||''}&year=${year||''}`),
  add:    (data: any)  => api.post('/expenses', data, idempotencyConfig('crm-expense-create')),
  approve:(id: string, reason: string) => api.post(`/expenses/${id}/approve`, { reason }, idempotencyConfig('crm-expense-approve')),
  delete: (id: string, reason: string) => api.delete(`/expenses/${id}`, { ...idempotencyConfig('crm-expense-void'), data: { reason } }),
}

// A4 — AR Ledger
export const arAPI = {
  get: () => api.get('/ar-ledger'),
}

// A5 — Delivery Challans
export const challanAPI = {
  getAll:        ()                          => api.get('/challans'),
  getOne:        (id: string)                => api.get(`/challans/${id}`) as any,
  receiveItems:  (id: string, items: any[]) => api.patch(`/challans/${id}/receive-items`, { items }, idempotencyConfig('crm-challan-receipt')) as any,
  create:        (data: any)                 => api.post('/challans', data, idempotencyConfig('crm-challan')),
  setStatus:     (id: string, status: string) => api.patch(`/challans/${id}/status`, { status }, idempotencyConfig('crm-challan-status')),
}

export const deliveryAPI = {
  assignOrder: (id: string, riderId: string) => api.post(`/delivery/orders/${id}/assign`, { riderId }) as any,
}

export const vendorBillAPI = {
  getAll:  (plant?: string)           => api.get(`/vendor-bills${plant ? `?plant=${plant}` : ''}`),
  create:  (data: any)                => api.post('/vendor-bills', data, idempotencyConfig('crm-vendor-bill')),
  approve: (id: string)               => api.post(`/vendor-bills/${id}/approve`, {}, idempotencyConfig('crm-vendor-bill-approve')),
  pay:     (id: string, data: any)     => api.post(`/vendor-bills/${id}/payments`, data, idempotencyConfig('crm-vendor-payment')),
}

export const vendorPriceAPI = {
  getAll:  (plant?: string)           => api.get(`/vendor-prices${plant ? `?plant=${plant}` : ''}`),
  upsert:  (data: any)                => api.post('/vendor-prices', data, idempotencyConfig('crm-vendor-price')),
  bulkSave:(plant: string, prices: any[]) => api.post('/vendor-prices/bulk', { plant, prices }, idempotencyConfig('crm-vendor-price-bulk')),
}

// A6 — Transfer Orders
export const transferAPI = {
  getAll:   ()           => api.get('/transfers'),
  create:   (data: any)  => api.post('/transfers', data, idempotencyConfig('crm-plant-transfer')),
  setStatus:(id: string, status: string) => api.patch(`/transfers/${id}/status`, { status }, idempotencyConfig('crm-plant-transfer-status')),
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
  create: (data: any) => api.post('/orders/return', data, idempotencyConfig('crm-return-case')),
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

export const securityAPI = {
  accessCatalog: () => api.get('/security/access-catalog') as any,
  updateStaffPermissions: (staffId: string, permissions: Array<{ permission: string; granted: boolean }>) =>
    api.put(`/security/staff/${staffId}/permissions`, { permissions }) as any,
  updateStaffServiceAccess: (staffId: string, services: Array<{ serviceCode: string; allowed: boolean }>) =>
    api.put(`/security/staff/${staffId}/service-access`, { services }) as any,
}

export const walletAPI = {
  get:    (customerId: string)                        => api.get(`/wallet/${customerId}`) as any,
  credit: (customerId: string, data: any)             => api.post(`/wallet/${customerId}/credit`, data, idempotencyConfig('crm-wallet-credit')) as any,
  deduct: (customerId: string, data: any)             => api.post(`/wallet/${customerId}/deduct`, data, idempotencyConfig('crm-wallet-debit')) as any,
  apply:  (customerId: string, orderId: string, amount: number) => api.post(`/wallet/${customerId}/apply`, { orderId, amount }, idempotencyConfig('crm-wallet-apply')) as any,
}
