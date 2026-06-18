const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validateCoupon, validateLoyalty } = require('../controllers/checkout.controller');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');

const officeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'COUNTER_STAFF', 'ACCOUNTS');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.post('/validate-coupon',  staffAuth, officeRoles, validateCoupon);
router.post('/validate-loyalty', staffAuth, officeRoles, validateLoyalty);

module.exports = router;
