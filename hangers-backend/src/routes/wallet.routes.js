const express = require('express');
const router  = express.Router();
const { customerAuth } = require('../middleware/auth');
const { getWallet }    = require('../controllers/wallet.controller');

router.get('/', customerAuth, getWallet);

module.exports = router;
