const express = require('express');
const router  = express.Router();
const { staffAuth }                                                                    = require('../middleware/auth');
const { requireRole, requireServiceAccess }                                            = require('../middleware/rbac');
const { privateNoStore }                                                               = require('../middleware/privateCache');
const { requireTrustedWrite }                                                          = require('../middleware/origin');
const { getAutomations, createAutomation, toggleAutomation, updateAutomation }        = require('../controllers/automations.controller');

const adminRoles     = requireRole('SUPER_ADMIN', 'MANAGER');
const marketingAccess = requireServiceAccess('MARKETING');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',              staffAuth, marketingAccess, adminRoles, getAutomations);
router.post('/',             staffAuth, marketingAccess, adminRoles, createAutomation);
router.patch('/:id/toggle',  staffAuth, marketingAccess, adminRoles, toggleAutomation);
router.put('/:id',           staffAuth, marketingAccess, adminRoles, updateAutomation);

module.exports = router;
