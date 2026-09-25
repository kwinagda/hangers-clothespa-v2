const express = require('express');
const { handleRazorpayWebhook } = require('../controllers/webhooks.controller');

const router = express.Router();
router.post('/razorpay/:mode(test|live)', handleRazorpayWebhook);
router.post('/razorpay', handleRazorpayWebhook);

module.exports = router;
