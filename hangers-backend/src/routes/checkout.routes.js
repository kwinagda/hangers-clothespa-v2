const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const { validateCoupon, validateLoyalty } = require('../controllers/checkout.controller');

router.post('/validate-coupon',  staffAuth, validateCoupon);
router.post('/validate-loyalty', staffAuth, validateLoyalty);

module.exports = router;
