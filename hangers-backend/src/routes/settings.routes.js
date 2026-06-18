const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { getSettings, updateSettings, getPublicSettings } = require('../controllers/settings.controller');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const financeAccess = requireServiceAccess('FINANCE');

router.get('/public',  getPublicSettings);          // no auth — used by POS
router.get('/',        staffAuth, financeAccess, requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS'), getSettings);
router.patch('/',      staffAuth, financeAccess, requireRole('SUPER_ADMIN', 'MANAGER'), updateSettings);

module.exports = router;
