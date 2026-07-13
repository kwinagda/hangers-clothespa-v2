const express = require('express');
const router  = express.Router();
const { staffAuth }                                                            = require('../middleware/auth');
const { requireRole, requireServiceAccess }                                    = require('../middleware/rbac');
const { privateNoStore }                                                       = require('../middleware/privateCache');
const { requireTrustedWrite }                                                  = require('../middleware/origin');
const { requireLaunchCapability }                                              = require('../middleware/launchCapabilities');
const { getRecurringPickups, createRecurringPickup, toggleRecurringPickup }    = require('../controllers/recurring.controller');

const officeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'COUNTER_STAFF', 'ACCOUNTS');
const crmAccess   = requireServiceAccess('CRM');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',              staffAuth, crmAccess, officeRoles, getRecurringPickups);
router.post('/',             staffAuth, crmAccess, officeRoles, requireLaunchCapability('recurringPickups', 'create'), createRecurringPickup);
router.patch('/:id/toggle',  staffAuth, crmAccess, officeRoles, requireLaunchCapability('recurringPickups', 'toggle'), toggleRecurringPickup);

module.exports = router;
