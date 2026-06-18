// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER ORDERS ROUTES — /api/v1/customer/orders
// Uses customerAuth middleware (JWT from customer login)
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');

// customerAuth = the middleware that verifies customer JWT tokens
// (already exists in your auth.js from Phase 1)
const { customerAuth } = require('../middleware/auth');
const { getMyOrders, getMyOrder, requestPickup } = require('../controllers/customer-orders.controller');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',                   customerAuth, getMyOrders);
router.get('/:id',                customerAuth, getMyOrder);
router.post('/pickup-request',    customerAuth, requestPickup);

module.exports = router;
