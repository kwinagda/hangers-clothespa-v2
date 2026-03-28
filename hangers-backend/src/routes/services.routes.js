const express = require('express');
const router  = express.Router();
const { staffAuth }   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { getServices, upsertServices } = require('../controllers/services.controller');

const adminRoles = requireRole('SUPER_ADMIN','MANAGER','ACCOUNTS');

// Public — customer app and CRM both call this
router.get('/', getServices);

// Staff-only — pricing admin
router.put('/', staffAuth, adminRoles, upsertServices);

module.exports = router;
