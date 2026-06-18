const express  = require('express');
const router   = express.Router();
const { staffAuth } = require('../middleware/auth');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const {
  recordPayment,
  getOrderPayments,
  getDailySummary,
  getReceivables,
} = require('../controllers/payments.controller');

const financeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS');
const financeAccess = requireServiceAccess('FINANCE');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.post('/',                      staffAuth, financeAccess, financeRoles, recordPayment);
router.get('/daily',                  staffAuth, financeAccess, financeRoles, getDailySummary);
router.get('/receivables',            staffAuth, financeAccess, financeRoles, getReceivables);
router.get('/order/:orderId',         staffAuth, financeAccess, financeRoles, getOrderPayments);

module.exports = router;
