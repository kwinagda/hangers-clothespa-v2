const express = require('express');
const router  = express.Router();
const { staffAuth }                                               = require('../middleware/auth');
const { requireRole, requireServiceAccess }                       = require('../middleware/rbac');
const { privateNoStore }                                          = require('../middleware/privateCache');
const { requireTrustedWrite }                                     = require('../middleware/origin');
const { getCoupons, createCoupon, validateCoupon, toggleCoupon } = require('../controllers/coupons.controller');

const adminRoles  = requireRole('SUPER_ADMIN', 'MANAGER');
const officeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'COUNTER_STAFF', 'ACCOUNTS');
const crmAccess   = requireServiceAccess('CRM');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',              staffAuth, crmAccess, officeRoles, getCoupons);
router.post('/',             staffAuth, crmAccess, adminRoles,  createCoupon);
router.post('/validate',     staffAuth, crmAccess, officeRoles, validateCoupon);
router.patch('/:id/toggle',  staffAuth, crmAccess, adminRoles,  toggleCoupon);

module.exports = router;
