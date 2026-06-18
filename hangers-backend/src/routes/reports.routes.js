const express = require('express');
const router  = express.Router();
const { staffAuth }                         = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore }                    = require('../middleware/privateCache');
const { requireTrustedWrite }               = require('../middleware/origin');
const { getReport }                         = require('../controllers/reports.controller');

const officeRoles   = requireRole('SUPER_ADMIN', 'MANAGER', 'COUNTER_STAFF', 'ACCOUNTS');
const reportsAccess = requireServiceAccess('REPORTS');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/', staffAuth, reportsAccess, officeRoles, getReport);

module.exports = router;
