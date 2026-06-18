const express = require('express');
const router  = express.Router();
const { customerAuth }   = require('../middleware/auth');
const { getReferralInfo } = require('../controllers/referral.controller');
const { privateNoStore } = require('../middleware/privateCache');

router.use(privateNoStore);

router.get('/', customerAuth, getReferralInfo);

module.exports = router;
