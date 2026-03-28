const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const {
  getCustomerWallet,
  creditWallet,
  deductWallet,
  applyWalletToOrder,
} = require('../controllers/staff.wallet.controller');

router.get ('/:customerId',              staffAuth, getCustomerWallet);
router.post('/:customerId/credit',       staffAuth, creditWallet);
router.post('/:customerId/deduct',       staffAuth, deductWallet);
router.post('/:customerId/apply',        staffAuth, applyWalletToOrder);

module.exports = router;
