const express = require('express');
const router = express.Router();

const { staffAuth, customerAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  listSubscriptions,
  getSubscription,
  createSubscription,
  confirmSubscription,
  updateSubscriptionStatus,
  listAllLogs,
  getLogs,
  getLogsByPeriod,
  createLog,
  deleteLog,
  generateBill,
  listBillsForCustomer,
  getBillById,
  sendBill,
  recordBillPayment,
  applyForSubscription,
  getOwnSubscription,
  getOwnLogs,
  getOwnLogsByMonth,
  getOwnBills,
  pauseOwnSubscription,
} = require('../controllers/iron.controller');

router.get('/subscriptions', staffAuth, listSubscriptions);
router.get('/subscriptions/:customerId', staffAuth, getSubscription);
router.post('/subscriptions', staffAuth, createSubscription);
router.put('/subscriptions/:id/confirm', staffAuth, confirmSubscription);
router.put('/subscriptions/:id/status', staffAuth, updateSubscriptionStatus);

router.get('/logs', staffAuth, listAllLogs);
router.get('/logs/:customerId/period', staffAuth, getLogsByPeriod);
router.get('/logs/:customerId', staffAuth, getLogs);
router.post('/logs', staffAuth, createLog);
router.delete('/logs/:id', staffAuth, requireRole('SUPER_ADMIN', 'MANAGER'), deleteLog);

router.post('/bills/generate', staffAuth, generateBill);
router.get('/bills/customer/:customerId', staffAuth, listBillsForCustomer);
router.get('/bills/:billId', staffAuth, getBillById);
router.put('/bills/:billId/send', staffAuth, sendBill);
router.put('/bills/:billId/pay', staffAuth, recordBillPayment);

router.post('/customer/apply', customerAuth, applyForSubscription);
router.get('/customer/subscription', customerAuth, getOwnSubscription);
router.get('/customer/logs/month', customerAuth, getOwnLogsByMonth);
router.get('/customer/logs', customerAuth, getOwnLogs);
router.get('/customer/bills', customerAuth, getOwnBills);
router.put('/customer/subscription/pause', customerAuth, pauseOwnSubscription);

module.exports = router;
