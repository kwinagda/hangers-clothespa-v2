const express = require('express');
const router  = express.Router();
const { staffAuth }                                                    = require('../middleware/auth');
const { requireRole, requireServiceAccess }                            = require('../middleware/rbac');
const { privateNoStore }                                               = require('../middleware/privateCache');
const { requireTrustedWrite }                                          = require('../middleware/origin');
const { getLoyaltyRules, updateLoyaltyRules, awardLoyaltyPoints }     = require('../controllers/loyalty.controller');

const adminRoles  = requireRole('SUPER_ADMIN', 'MANAGER');
const officeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'COUNTER_STAFF', 'ACCOUNTS');
const crmAccess   = requireServiceAccess('CRM');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/rules',    staffAuth, crmAccess, officeRoles, getLoyaltyRules);
router.put('/rules',    staffAuth, crmAccess, adminRoles,  updateLoyaltyRules);
router.post('/award',   staffAuth, crmAccess, officeRoles, awardLoyaltyPoints);

module.exports = router;
