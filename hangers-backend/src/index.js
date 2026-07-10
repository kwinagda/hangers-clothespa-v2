require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const { randomUUID } = require('crypto');
const authRoutes          = require('./routes/auth.routes');
const staffRoutes         = require('./routes/staff.routes');
const ordersRoutes        = require('./routes/orders.routes');
const customersRoutes     = require('./routes/customers.routes');
const paymentsRoutes      = require('./routes/payments.routes');
const customerOrderRoutes = require('./routes/customer-orders.routes');
const addressesRoutes     = require('./routes/addresses.routes');
const razorpayRoutes      = require('./routes/razorpay.routes');
const plantRoutes         = require('./routes/plant.routes');
const deliveryRoutes      = require('./routes/delivery.routes');
const servicesRoutes      = require('./routes/services.routes');
const cashbookRoutes      = require('./routes/cashbook.routes');
const expensesRoutes      = require('./routes/expenses.routes');
const arLedgerRoutes      = require('./routes/ar-ledger.routes');
const transfersRoutes     = require('./routes/transfers.routes');
const attendanceRoutes    = require('./routes/attendance.routes');
const couponsRoutes       = require('./routes/coupons.routes');
const loyaltyRoutes       = require('./routes/loyalty.routes');
const upchargesRoutes     = require('./routes/upcharges.routes');
const recurringRoutes     = require('./routes/recurring.routes');
const campaignsRoutes     = require('./routes/campaigns.routes');
const reportsRoutes       = require('./routes/reports.routes');
const searchRoutes        = require('./routes/search.routes');
const automationsRoutes   = require('./routes/automations.routes');
const challanRoutes       = require('./routes/challan.routes');
const staffWalletRoutes   = require('./routes/staff.wallet.routes');
const settingsRoutes      = require('./routes/settings.routes');
const securityRoutes      = require('./routes/security.routes');
const checkoutRoutes      = require('./routes/checkout.routes');
const ironRoutes          = require('./routes/iron.routes');
const metadataRoutes      = require('./routes/metadata.routes');
const quotationsRoutes    = require('./routes/quotations.routes');
const { syncPermissionCatalog } = require('./services/accessControl.service');
const { syncMasterDataSettings } = require('./services/masterData.service');
const app  = express();
const PORT = process.env.PORT || 5001;
const parseOriginList = (value) =>
  String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = new Set([
  ...parseOriginList(process.env.ALLOWED_ORIGINS),
  process.env.CRM_URL || 'http://localhost:5002',
  process.env.CUSTOMER_APP_URL || 'http://localhost:8081',
  process.env.STAFF_APP_URL || 'http://localhost:8082',
  'http://localhost:19006',
  'http://localhost:19000',
  'http://127.0.0.1:5002',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8082',
  'http://127.0.0.1:19000',
  'http://127.0.0.1:19006',
  'http://192.168.29.246:5002',
  'http://192.168.29.246:8081',
].filter(Boolean));

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 100 }));
// Stamp every request with a unique ID — surfaced in error logs and response headers
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
});
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ success: true, message: 'Hangers API is running', version: '4.0.0' }));

app.use('/api/v1/auth',            authRoutes);
// Staff (CRM + apps)
app.use('/api/v1/staff',                       staffRoutes);
// CRM
app.use('/api/v1/orders',                      ordersRoutes);
app.use('/api/v1/quotations',                 quotationsRoutes);
app.use('/api/v1/customers',                   customersRoutes);
app.use('/api/v1/payments',                    paymentsRoutes);
app.use('/api/v1',                             challanRoutes);
app.use('/api/v1/wallet',                      staffWalletRoutes);
app.use('/api/v1/settings',                    settingsRoutes);
app.use('/api/v1/security',                    securityRoutes);
app.use('/api/v1/checkout',                    checkoutRoutes);
// Customer app
app.use('/api/v1/customer/orders',    customerOrderRoutes);
app.use('/api/v1/customer/payments',  razorpayRoutes);
app.use('/api/v1/addresses',          addressesRoutes);
// Phase 4 — Plant & Delivery apps
app.use('/api/v1/plant',                       plantRoutes);
app.use('/api/v1/delivery',                    deliveryRoutes);
// Pricing catalog (public read, staff write)
app.use('/api/v1/services',                    servicesRoutes);
app.use('/api/v1/iron',                        ironRoutes);
app.use('/api/v1/metadata',                    metadataRoutes);
// Finance
app.use('/api/v1/cashbook',                    cashbookRoutes);
app.use('/api/v1/expenses',                    expensesRoutes);
app.use('/api/v1/ar-ledger',                   arLedgerRoutes);
// Plant operations
app.use('/api/v1/transfers',                   transfersRoutes);
// Staff
app.use('/api/v1/attendance',                  attendanceRoutes);
// Promotions
app.use('/api/v1/coupons',                     couponsRoutes);
app.use('/api/v1/loyalty',                     loyaltyRoutes);
app.use('/api/v1/upcharges',                   upchargesRoutes);
// Operations
app.use('/api/v1/recurring-pickups',           recurringRoutes);
// Marketing
app.use('/api/v1/campaigns',                   campaignsRoutes);
// Intelligence
app.use('/api/v1/reports',                     reportsRoutes);
app.use('/api/v1/search',                      searchRoutes);
app.use('/api/v1/automations',                 automationsRoutes);
// Refer & Earn
const referralRoutes  = require('./routes/referral.routes');
const walletRoutes    = require('./routes/wallet.routes');
const realtimeRoutes  = require('./routes/realtime.routes');
app.use('/api/v1/customer/referral',           referralRoutes);
app.use('/api/v1/customer/wallet',             walletRoutes);
app.use('/api/v1/realtime',                    realtimeRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  syncMasterDataSettings().catch((err) => {
    console.error('Master data settings sync failed:', err.message);
  });
  syncPermissionCatalog().catch((err) => {
    console.error('Permission catalog sync failed:', err.message);
  });
  console.log('\n─────────────────────────────────────────');
  console.log(`Hangers Clothes Spa - Phase 4`);
  console.log(`Server running on port ${PORT}`);
  console.log(`/api/v1/plant - Plant App`);
  console.log(`/api/v1/delivery - Delivery App`);
  console.log('─────────────────────────────────────────\n');
});

module.exports = app;
