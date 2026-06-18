const express = require('express');
const router = express.Router();

const { staffAuth, customerAuth } = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { PLANT_PIN_ROLES } = require('../config/master-data');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
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

const ironStaffRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS', 'COUNTER_STAFF');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const crmAccess = requireServiceAccess('CRM');

router.get('/subscriptions', staffAuth, crmAccess, ironStaffRoles, listSubscriptions);
router.get('/subscriptions/:customerId', staffAuth, crmAccess, ironStaffRoles, getSubscription);
router.post('/subscriptions', staffAuth, crmAccess, ironStaffRoles, createSubscription);
router.put('/subscriptions/:id/confirm', staffAuth, crmAccess, ironStaffRoles, confirmSubscription);
router.put('/subscriptions/:id/status', staffAuth, crmAccess, ironStaffRoles, updateSubscriptionStatus);

router.get('/logs', staffAuth, crmAccess, ironStaffRoles, listAllLogs);
router.get('/logs/:customerId/period', staffAuth, crmAccess, ironStaffRoles, getLogsByPeriod);
router.get('/logs/:customerId', staffAuth, crmAccess, ironStaffRoles, getLogs);
router.post('/logs', staffAuth, crmAccess, ironStaffRoles, createLog);
router.delete('/logs/:id', staffAuth, crmAccess, requireRole('SUPER_ADMIN', 'MANAGER'), deleteLog);

router.post('/bills/generate', staffAuth, crmAccess, ironStaffRoles, generateBill);
router.get('/bills/customer/:customerId', staffAuth, crmAccess, ironStaffRoles, listBillsForCustomer);
router.get('/bills/:billId', staffAuth, crmAccess, ironStaffRoles, getBillById);
router.put('/bills/:billId/send', staffAuth, crmAccess, ironStaffRoles, sendBill);
router.put('/bills/:billId/pay', staffAuth, crmAccess, ironStaffRoles, recordBillPayment);

router.post('/customer/apply', customerAuth, applyForSubscription);
router.get('/customer/subscription', customerAuth, getOwnSubscription);
router.get('/customer/logs/month', customerAuth, getOwnLogsByMonth);
router.get('/customer/logs', customerAuth, getOwnLogs);
router.get('/customer/bills', customerAuth, getOwnBills);
router.put('/customer/subscription/pause', customerAuth, pauseOwnSubscription);

module.exports = router;
