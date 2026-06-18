const express = require('express');
const router  = express.Router();
const { staffAuth }                         = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore }                    = require('../middleware/privateCache');
const { requireTrustedWrite }               = require('../middleware/origin');
const { getAttendance, clockIn, clockOut }  = require('../controllers/attendance.controller');

const adminRoles  = requireRole('SUPER_ADMIN', 'MANAGER');
const crmAccess   = requireServiceAccess('CRM');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',             staffAuth, crmAccess, adminRoles, getAttendance);
router.post('/clock-in',    staffAuth, clockIn);
router.post('/clock-out',   staffAuth, clockOut);

module.exports = router;
