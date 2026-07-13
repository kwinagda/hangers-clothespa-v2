const express = require('express');
const router  = express.Router();
const { staffAuth }                                                                    = require('../middleware/auth');
const { requireRole, requireServiceAccess }                                            = require('../middleware/rbac');
const { privateNoStore }                                                               = require('../middleware/privateCache');
const { requireTrustedWrite }                                                          = require('../middleware/origin');
const { requireLaunchCapability }                                                      = require('../middleware/launchCapabilities');
const { getAutomations, createAutomation, toggleAutomation, updateAutomation }        = require('../controllers/automations.controller');

const adminRoles     = requireRole('SUPER_ADMIN', 'MANAGER');
const marketingAccess = requireServiceAccess('MARKETING');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',              staffAuth, marketingAccess, adminRoles, getAutomations);
router.post('/',             staffAuth, marketingAccess, adminRoles, requireLaunchCapability('automations', 'create'), createAutomation);
router.patch('/:id/toggle',  staffAuth, marketingAccess, adminRoles, requireLaunchCapability('automations', 'toggle'), toggleAutomation);
router.put('/:id',           staffAuth, marketingAccess, adminRoles, requireLaunchCapability('automations', 'update'), updateAutomation);

module.exports = router;
