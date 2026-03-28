// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY ROUTES — /api/v1/customer/payments
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();

const { customerAuth } = require('../middleware/auth');
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
  getPaymentHistory,
} = require('../controllers/razorpay.controller');

router.get ('/history',              customerAuth, getPaymentHistory);
router.post('/razorpay/create-order',customerAuth, createRazorpayOrder);
router.post('/razorpay/verify',      customerAuth, verifyRazorpayPayment);

module.exports = router;
