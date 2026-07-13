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
  createOrder, updateOrder, updateOrderStatus, addItemsToOrder, deleteOrder, recordPayment, refundPayment, createReturnOrder,
} = require('../controllers/orders.controller');
const { staffAuth } = require('../middleware/auth');
const { requirePermission, requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { idempotent } = require('../middleware/idempotency');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const crmAccess = requireServiceAccess('CRM');
const financeAccess = requireServiceAccess('FINANCE');

// Stats — must be before /:id
router.get('/stats',         staffAuth, crmAccess, requirePermission('orders.view'), getOrderStats);
router.get('/',              staffAuth, crmAccess, requirePermission('orders.view'), listOrders);
router.get('/:id',           staffAuth, crmAccess, requirePermission('orders.view'), getOrder);
router.post('/',             staffAuth, crmAccess, requirePermission('orders.create'), idempotent({ scope: 'orders.create' }), createOrder);
router.patch('/:id',         staffAuth, crmAccess, requirePermission('orders.edit'), idempotent({ scope: 'orders.edit' }), updateOrder);
router.patch('/:id/status',  staffAuth, crmAccess, requirePermission('orders.update_status'), idempotent({ scope: 'orders.status' }), updateOrderStatus);
router.post('/:id/payments', staffAuth, crmAccess, requirePermission('finance.collect_payment'), idempotent({ scope: 'orders.payment' }), recordPayment);
router.post('/:id/refunds',  staffAuth, crmAccess, requirePermission('finance.refund'), idempotent({ scope: 'orders.refund' }), refundPayment);
router.patch('/:id/items',   staffAuth, crmAccess, requirePermission('orders.edit'), idempotent({ scope: 'orders.itemize' }), addItemsToOrder);
router.delete('/:id',        staffAuth, crmAccess, requirePermission('orders.delete'), idempotent({ scope: 'orders.archive' }), deleteOrder);
router.post('/return',       staffAuth, crmAccess, requirePermission('orders.create'), idempotent({ scope: 'orders.return-case' }), createReturnOrder);

module.exports = router;
