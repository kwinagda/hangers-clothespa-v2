const express  = require('express');
const router   = express.Router();
const { staffAuth } = require('../middleware/auth');
const {
  recordPayment,
  getOrderPayments,
  getDailySummary,
  getReceivables,
} = require('../controllers/payments.controller');

router.post('/',                      staffAuth, recordPayment);
router.get('/daily',                  staffAuth, getDailySummary);
router.get('/receivables',            staffAuth, getReceivables);
router.get('/order/:orderId',         staffAuth, getOrderPayments);

module.exports = router;
