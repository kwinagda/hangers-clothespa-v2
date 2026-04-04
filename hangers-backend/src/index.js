require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');

const { errorHandler, notFound } = require('./middleware/errorHandler');
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
const phaseARoutes        = require('./routes/phaseA.routes');
const challanRoutes       = require('./routes/challan.routes');
const staffWalletRoutes   = require('./routes/staff.wallet.routes');
const settingsRoutes      = require('./routes/settings.routes');
const checkoutRoutes      = require('./routes/checkout.routes');
const ironRoutes          = require('./routes/iron.routes');
const metadataRoutes      = require('./routes/metadata.routes');
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: [
    process.env.CRM_URL          || 'http://localhost:3001',
    process.env.CUSTOMER_APP_URL || 'http://localhost:8081',
    'http://localhost:19006', 'http://localhost:19000',
    'http://192.168.29.246:3001', 'http://192.168.29.246:8081',
  ],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ success: true, message: 'Hangers API is running', version: '4.0.0' }));

app.use('/api/v1/auth',            authRoutes);
// Staff (CRM + apps)
app.use('/api/v1/staff',                       staffRoutes);
// CRM
app.use('/api/v1/orders',                      ordersRoutes);
app.use('/api/v1/customers',                   customersRoutes);
app.use('/api/v1/payments',                    paymentsRoutes);
app.use('/api/v1',                             challanRoutes);
app.use('/api/v1/wallet',                      staffWalletRoutes);
app.use('/api/v1/settings',                    settingsRoutes);
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
app.use('/api/v1',                             phaseARoutes);
// Refer & Earn
const referralRoutes = require('./routes/referral.routes');
const walletRoutes   = require('./routes/wallet.routes');
app.use('/api/v1/customer/referral',           referralRoutes);
app.use('/api/v1/customer/wallet',             walletRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log('\n─────────────────────────────────────────');
  console.log(`Hangers Clothes Spa - Phase 4`);
  console.log(`Server running on port ${PORT}`);
  console.log(`/api/v1/plant - Plant App`);
  console.log(`/api/v1/delivery - Delivery App`);
  console.log('─────────────────────────────────────────\n');
});

module.exports = app;
