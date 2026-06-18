const express = require('express');
const router = express.Router();
const { staffAuth } = require('../middleware/auth');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const {
  getAccessCatalog,
  listAuditLogs,
  listAuthThrottles,
  updateStaffServiceAccess,
} = require('../controllers/security.controller');

const adminRoles = requireRole('SUPER_ADMIN', 'MANAGER');
const crmAccess = requireServiceAccess('CRM');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/audit-logs', staffAuth, crmAccess, adminRoles, listAuditLogs);
router.get('/auth-throttles', staffAuth, crmAccess, adminRoles, listAuthThrottles);
router.get('/access-catalog', staffAuth, crmAccess, adminRoles, getAccessCatalog);
router.put('/staff/:id/service-access', staffAuth, crmAccess, adminRoles, updateStaffServiceAccess);

module.exports = router;
