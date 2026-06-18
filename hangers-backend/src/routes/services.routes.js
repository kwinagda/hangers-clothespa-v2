const express = require('express');
const router  = express.Router();
const { staffAuth }   = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { getServices, upsertServices, createServiceItem, updateServiceItem, deactivateServiceItem } = require('../controllers/services.controller');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');

const adminRoles = requireRole('SUPER_ADMIN','MANAGER','ACCOUNTS');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const crmAccess = requireServiceAccess('CRM');

// Public — customer app and CRM both call this
router.get('/', getServices);

// Staff-only — pricing admin
router.post('/', staffAuth, crmAccess, adminRoles, createServiceItem);
router.put('/', staffAuth, crmAccess, adminRoles, upsertServices);
router.patch('/:id', staffAuth, crmAccess, adminRoles, updateServiceItem);
router.delete('/:id', staffAuth, crmAccess, adminRoles, deactivateServiceItem);

module.exports = router;
