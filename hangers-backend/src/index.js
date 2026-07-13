require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const { randomUUID } = require('crypto');
const prisma = require('./config/database');
const { closeConnection } = require('./queues/connection');
const { getAllowedOrigins, validateEnvironment } = require('./config/env');
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
const reconciliationRoutes = require('./routes/reconciliation.routes');
const opsRoutes             = require('./routes/ops.routes');
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
const publicRoutes        = require('./routes/public.routes');
const { syncPermissionCatalog } = require('./services/accessControl.service');
const { syncMasterDataSettings } = require('./services/masterData.service');
const { globalApiLimiter } = require('./middleware/rateLimit');
const app  = express();
const PORT = process.env.PORT || 5001;
const environment = validateEnvironment();
const readiness = {
  startedAt: new Date().toISOString(),
  ready: false,
  checks: {
    masterData: 'pending',
    permissions: 'pending',
  },
  error: null,
};
app.locals.readiness = readiness;
const allowedOrigins = new Set(getAllowedOrigins());

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: environment.isProduction
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
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
});
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ success: true, message: 'Hangers API process is alive', version: '4.0.0' }));
app.get('/ready', async (_req, res) => {
  const status = app.locals.readiness;
  let database = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'failed';
  }
  const ready = status.ready && database === 'ok';
  return res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'Hangers API is ready' : 'Hangers API is not ready',
    data: { ...status, ready, checks: { ...status.checks, database } },
  });
});

app.use('/api/v1', globalApiLimiter);

app.use('/api/v1/auth',            authRoutes);
app.use('/api/v1/public',          publicRoutes);
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
app.use('/api/v1/reconciliation',              reconciliationRoutes);
app.use('/api/v1/ops',                         opsRoutes);
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

const runStartupChecks = async () => {
  try {
    await syncMasterDataSettings();
    readiness.checks.masterData = 'ok';
    await syncPermissionCatalog();
    readiness.checks.permissions = 'ok';
    readiness.ready = true;
    readiness.readyAt = new Date().toISOString();
  } catch (err) {
    readiness.ready = false;
    readiness.error = err?.message || 'Startup initialization failed';
    if (readiness.checks.masterData === 'pending') readiness.checks.masterData = 'failed';
    else if (readiness.checks.permissions === 'pending') readiness.checks.permissions = 'failed';
    throw err;
  }
};

let server;
const startServer = async () => {
  await runStartupChecks();
  server = app.listen(PORT, () => {
  console.log('\n─────────────────────────────────────────');
  console.log(`Hangers Clothes Spa - Phase 4`);
  console.log(`Server running on port ${PORT}`);
  console.log(`/api/v1/plant - Plant App`);
  console.log(`/api/v1/delivery - Delivery App`);
  console.log('─────────────────────────────────────────\n');
  });
  return server;
};

if (require.main === module) {
  const shutdown = async (signal) => {
    console.info(`[api] ${signal} received, draining HTTP connections`);
    const forceTimer = setTimeout(() => process.exit(1), 25_000);
    forceTimer.unref();
    try {
      if (server) await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
      await closeConnection();
      await prisma.$disconnect();
      clearTimeout(forceTimer);
      process.exit(0);
    } catch (err) {
      console.error('[api] graceful shutdown failed:', err?.message || err);
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  startServer().catch((err) => {
    console.error('Startup initialization failed:', err?.message || err);
    process.exit(1);
  });
}

module.exports = { app, startServer, runStartupChecks, readiness };
