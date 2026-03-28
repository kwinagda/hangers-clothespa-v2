const express = require('express');
const router  = express.Router();
const { customerAuth }   = require('../middleware/auth');
const { getReferralInfo } = require('../controllers/referral.controller');

router.get('/', customerAuth, getReferralInfo);

module.exports = router;
