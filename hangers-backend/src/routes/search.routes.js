const express = require('express');
const router  = express.Router();
const { staffAuth }                         = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore }                    = require('../middleware/privateCache');
const { requireTrustedWrite }               = require('../middleware/origin');
const { advancedSearch }                    = require('../controllers/search.controller');

const officeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'COUNTER_STAFF', 'ACCOUNTS');
const crmAccess   = requireServiceAccess('CRM');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/', staffAuth, crmAccess, officeRoles, advancedSearch);

module.exports = router;
