const express  = require('express');
const router   = express.Router();
const { staffAuth } = require('../middleware/auth');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { requirePermission, requireRole, requireServiceAccess } = require('../middleware/rbac');
const { idempotent } = require('../middleware/idempotency');
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

router.post('/',                      staffAuth, financeAccess, requirePermission('finance.collect_payment'), idempotent(), recordPayment);
router.get('/daily',                  staffAuth, financeAccess, financeRoles, getDailySummary);
router.get('/receivables',            staffAuth, financeAccess, financeRoles, getReceivables);
router.get('/order/:orderId',         staffAuth, financeAccess, financeRoles, getOrderPayments);

module.exports = router;
