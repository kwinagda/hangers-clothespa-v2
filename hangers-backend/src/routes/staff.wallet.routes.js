const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
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
router.post('/:customerId/credit',       staffAuth, financeAccess, walletRoles, creditWallet);
router.post('/:customerId/deduct',       staffAuth, financeAccess, walletRoles, deductWallet);
router.post('/:customerId/apply',        staffAuth, financeAccess, walletRoles, applyWalletToOrder);

module.exports = router;
