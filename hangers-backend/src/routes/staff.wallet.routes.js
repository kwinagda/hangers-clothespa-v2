const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const { requirePermission, requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { idempotent } = require('../middleware/idempotency');
const {
  getCustomerWallet,
  creditWallet,
  deductWallet,
  applyWalletToOrder,
} = require('../controllers/staff.wallet.controller');

const walletRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS', 'COUNTER_STAFF');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const financeAccess = requireServiceAccess('FINANCE');

router.get ('/:customerId',              staffAuth, financeAccess, walletRoles, getCustomerWallet);
router.post('/:customerId/credit',       staffAuth, financeAccess, requirePermission('finance.wallet_adjust'), idempotent({ scope: 'wallet.credit' }), creditWallet);
router.post('/:customerId/deduct',       staffAuth, financeAccess, requirePermission('finance.wallet_adjust'), idempotent({ scope: 'wallet.debit' }), deductWallet);
router.post('/:customerId/apply',        staffAuth, financeAccess, requirePermission('finance.collect_payment'), idempotent({ scope: 'wallet.apply' }), applyWalletToOrder);

module.exports = router;
