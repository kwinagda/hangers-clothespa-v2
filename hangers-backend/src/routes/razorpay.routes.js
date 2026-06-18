// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY ROUTES — /api/v1/customer/payments
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();

const { customerAuth } = require('../middleware/auth');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
  getPaymentHistory,
} = require('../controllers/razorpay.controller');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get ('/history',              customerAuth, getPaymentHistory);
router.post('/razorpay/create-order',customerAuth, createRazorpayOrder);
router.post('/razorpay/verify',      customerAuth, verifyRazorpayPayment);

module.exports = router;
