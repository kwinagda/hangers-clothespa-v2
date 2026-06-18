// ─────────────────────────────────────────────────────────────────────────────
// ORDERS ROUTES — Add to src/index.js
// ─────────────────────────────────────────────────────────────────────────────
// In src/index.js, add these two lines after your existing routes:
//
//   const ordersRouter    = require('./routes/orders.routes');
//   const customersRouter = require('./routes/customers.routes');
//   app.use('/api/v1/orders',    ordersRouter);
//   app.use('/api/v1/customers', customersRouter);
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const {
  listOrders, getOrderStats, getOrder,
  createOrder, updateOrderStatus, addItemsToOrder, deleteOrder, recordPayment,
} = require('../controllers/orders.controller');
const { staffAuth } = require('../middleware/auth');
const { requirePermission, requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const crmAccess = requireServiceAccess('CRM');
const financeAccess = requireServiceAccess('FINANCE');

// Stats — must be before /:id
router.get('/stats',         staffAuth, crmAccess, requirePermission('orders.view'), getOrderStats);
router.get('/',              staffAuth, crmAccess, requirePermission('orders.view'), listOrders);
router.get('/:id',           staffAuth, crmAccess, requirePermission('orders.view'), getOrder);
router.post('/',             staffAuth, crmAccess, requirePermission('orders.create'), createOrder);
router.patch('/:id/status',  staffAuth, crmAccess, requirePermission('orders.update_status'), updateOrderStatus);
router.post('/:id/payments', staffAuth, financeAccess, requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS', 'COUNTER_STAFF'), recordPayment);
router.patch('/:id/items',   staffAuth, crmAccess, requirePermission('orders.edit'), addItemsToOrder);
router.delete('/:id',        staffAuth, crmAccess, requireRole('SUPER_ADMIN', 'MANAGER'), deleteOrder);

module.exports = router;
