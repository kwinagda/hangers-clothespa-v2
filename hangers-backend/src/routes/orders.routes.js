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

// Stats — must be before /:id
router.get('/stats',         staffAuth, getOrderStats);
router.get('/',              staffAuth, listOrders);
router.get('/:id',           staffAuth, getOrder);
router.post('/',             staffAuth, createOrder);
router.patch('/:id/status',  staffAuth, updateOrderStatus);
router.post('/:id/payments', staffAuth, recordPayment);
router.patch('/:id/items',   staffAuth, addItemsToOrder);
router.delete('/:id',        staffAuth, deleteOrder);

module.exports = router;
