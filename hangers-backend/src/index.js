require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const path      = require('path');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const { randomUUID } = require('crypto');
const { createTraceContext, runWithTraceContext } = require('./utils/trace-context');
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
const razorpaySavedCardRoutes = require('./routes/razorpay-saved-cards.routes');
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
const contentRoutes       = require('./routes/content.routes');
const logsRoutes          = require('./routes/logs.routes');
const challanRoutes       = require('./routes/challan.routes');
const staffWalletRoutes   = require('./routes/staff.wallet.routes');
const settingsRoutes      = require('./routes/settings.routes');
const securityRoutes      = require('./routes/security.routes');
const checkoutRoutes      = require('./routes/checkout.routes');
const ironRoutes          = require('./routes/iron.routes');
const serviceAppointmentsRoutes = require('./routes/service-appointments.routes');
const metadataRoutes      = require('./routes/metadata.routes');
const quotationsRoutes    = require('./routes/quotations.routes');
const publicRoutes        = require('./routes/public.routes');
const websitePickupRequestsRoutes = require('./routes/website-pickup-requests.routes');
const webhookRoutes = require('./routes/webhooks.routes');
const { syncPermissionCatalog } = require('./services/accessControl.service');
const { syncMasterDataSettings } = require('./services/masterData.service');
const { processOutboxBatch } = require('./services/outbox.service');
const { globalApiLimiter } = require('./middleware/rateLimit');
const { matchesLocalQaConfiguration, matchesLocalQaProfile } = require('./utils/local-qa-profile');
const { shouldRunDevOutbox } = require('./utils/dev-outbox');
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
const localQaReadOnlyRequested = process.env.LOCAL_SKIP_STARTUP_SYNC === 'true';

const inspectDatabaseIdentity = async () => {
  const [database] = await prisma.$queryRaw`SELECT current_database() AS name, current_user AS username, host(inet_server_addr()) AS address, inet_server_port() AS port`;
  return database;
};

const databaseMatchesLocalQaProfile = (database) => matchesLocalQaProfile({
  isProduction: environment.isProduction,
  databaseName: database?.name,
  databaseUser: database?.username,
  databaseAddress: database?.address,
  databasePort: Number(database?.port),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  outboxWorker: process.env.DEV_OUTBOX_WORKER,
  outboxHomeOnly: process.env.DEV_OUTBOX_HOME_ONLY,
  skipStartupSync: process.env.LOCAL_SKIP_STARTUP_SYNC,
});

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
  exposedHeaders: ['Retry-After', 'X-Request-Id', 'X-Trace-Id'],
}));

// Stamp the request before body parsers so malformed or oversized requests also
// receive a traceable response ID.
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || randomUUID();
  const trace = createTraceContext(req.headers.traceparent);
  trace.requestId = id;
  req.headers['x-request-id'] = id;
  req.id = id;
  req.traceId = trace.traceId;
  req.spanId = trace.spanId;
  res.setHeader('x-request-id', id);
  res.setHeader('x-trace-id', trace.traceId);
  runWithTraceContext(trace, next);
});

// Razorpay signs the exact raw JSON bytes. Preserve them only for the webhook
// route; all other JSON requests continue through the normal parser.
app.use(express.json({
  limit: '1mb',
  strict: true,
  verify: (req, _res, buf) => {
    if (/^\/api\/v1\/webhooks\/razorpay(?:\/(?:test|live))?$/.test(req.path)) req.rawBody = Buffer.from(buf);
  },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 100 }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ success: true, message: 'Hangers API process is alive', version: '4.0.0' }));
app.get('/', (_req, res) => res.json({
  success: true,
  message: 'Hangers API',
  version: '4.0.0',
  health: '/health',
  ready: '/ready',
  basePath: '/api/v1',
}));
app.get('/ready', async (_req, res) => {
  const status = app.locals.readiness;
  let database = 'ok';
  let localQaProfileMatches;
  try {
    const identity = await inspectDatabaseIdentity();
    if (localQaReadOnlyRequested || !environment.isProduction) {
      localQaProfileMatches = databaseMatchesLocalQaProfile(identity);
    }
    if (localQaReadOnlyRequested && !localQaProfileMatches) database = 'failed';
  } catch {
    database = 'failed';
  }
  const ready = status.ready && database === 'ok';
  const data = { ...status, ready, checks: { ...status.checks, database } };
  if (!environment.isProduction) data.localQaProfileMatches = localQaProfileMatches === true;
  return res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'Hangers API is ready' : 'Hangers API is not ready',
    data,
  });
});

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  immutable: true,
  maxAge: '180d',
  fallthrough: false,
}));

// Provider callbacks use their own HMAC authentication and durable inbox; do not
// let a user-facing IP rate limit suppress legitimate Razorpay retries.
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1', globalApiLimiter);

app.use('/api/v1/auth',            authRoutes);
app.use('/api/v1/public',          publicRoutes);
// Staff (CRM + apps)
app.use('/api/v1/staff',                       staffRoutes);
// CRM
app.use('/api/v1/orders',                      ordersRoutes);
app.use('/api/v1/quotations',                 quotationsRoutes);
app.use('/api/v1/customers',                   customersRoutes);
app.use('/api/v1/website-pickup-requests',      websitePickupRequestsRoutes);
app.use('/api/v1/payments',                    paymentsRoutes);
app.use('/api/v1',                             challanRoutes);
app.use('/api/v1/wallet',                      staffWalletRoutes);
app.use('/api/v1/settings',                    settingsRoutes);
app.use('/api/v1/security',                    securityRoutes);
app.use('/api/v1/checkout',                    checkoutRoutes);
// Customer app
app.use('/api/v1/customer/orders',    customerOrderRoutes);
app.use('/api/v1/customer/payments/razorpay/saved-cards', razorpaySavedCardRoutes);
app.use('/api/v1/customer/payments',  razorpayRoutes);
app.use('/api/v1/addresses',          addressesRoutes);
// Phase 4 — Plant & Delivery apps
app.use('/api/v1/plant',                       plantRoutes);
app.use('/api/v1/delivery',                    deliveryRoutes);
// Pricing catalog (public read, staff write)
app.use('/api/v1/services',                    servicesRoutes);
app.use('/api/v1/iron',                        ironRoutes);
app.use('/api/v1/service-appointments',        serviceAppointmentsRoutes);
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
app.use('/api/v1/content',                     contentRoutes);
app.use('/api/v1/logs',                        logsRoutes);
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
    if (localQaReadOnlyRequested) {
      const configurationMatches = matchesLocalQaConfiguration({
        databaseUrl: process.env.DATABASE_URL,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        outboxWorker: process.env.DEV_OUTBOX_WORKER,
        outboxHomeOnly: process.env.DEV_OUTBOX_HOME_ONLY,
        skipStartupSync: process.env.LOCAL_SKIP_STARTUP_SYNC,
      });
      if (environment.isProduction || !configurationMatches) {
        throw new Error('LOCAL_SKIP_STARTUP_SYNC requires the exact loopback PostgreSQL Razorpay Test QA configuration');
      }
      const identity = await inspectDatabaseIdentity();
      if (!databaseMatchesLocalQaProfile(identity)) {
        throw new Error('Connected database identity does not match the local Razorpay Test QA profile');
      }
      readiness.checks.masterData = 'skipped-local-read-only';
      readiness.checks.permissions = 'skipped-local-read-only';
      readiness.ready = true;
      readiness.readyAt = new Date().toISOString();
      return;
    }

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
let devOutboxTimer = null;
let devOutboxRunning = false;

const startDevOutboxPoller = () => {
  if (!localQaReadOnlyRequested || !shouldRunDevOutbox({ isProduction: environment.isProduction, workerEnabled: process.env.DEV_OUTBOX_WORKER,
    homeOnly: process.env.DEV_OUTBOX_HOME_ONLY, razorpayKeyId: process.env.RAZORPAY_KEY_ID }) || devOutboxTimer) return;
  const drainOutbox = async () => {
    if (devOutboxRunning) return;
    devOutboxRunning = true;
    try {
      let processed;
      do {
        processed = await processOutboxBatch({ limit: 25, homeOnly: true });
      } while (processed === 25);
    } catch (err) {
      console.error('[api-dev-outbox] drain failed:', err?.message || err);
    } finally {
      devOutboxRunning = false;
    }
  };
  devOutboxTimer = setInterval(drainOutbox, 2_000);
  drainOutbox();
  console.info('[api-dev-outbox] Home-only Test outbox processor active');
};

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
  startDevOutboxPoller();
  return server;
};

if (require.main === module) {
  const shutdown = async (signal) => {
    console.info(`[api] ${signal} received, draining HTTP connections`);
    const forceTimer = setTimeout(() => process.exit(1), 25_000);
    forceTimer.unref();
    try {
      if (devOutboxTimer) clearInterval(devOutboxTimer);
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
