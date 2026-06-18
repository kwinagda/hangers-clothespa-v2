const express = require('express');
const router  = express.Router();
const { staffAuth }         = require('../middleware/auth');
const { requireRole, requireServiceAccess }       = require('../middleware/rbac');
const { PLANT_PIN_ROLES }   = require('../config/master-data');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const {
  getPlantDashboard, getPlantOrders, scanQRCode,
  getPlantOrder, updatePlantStage, flagIssue, generateTags,
} = require('../controllers/plant.controller');

const plantRoles = requireRole(...new Set([...PLANT_PIN_ROLES, 'SUPER_ADMIN', 'MANAGER']));

router.use(privateNoStore);
router.use(requireTrustedWrite);
const plantAccess = requireServiceAccess('PLANT');

router.get('/dashboard',        staffAuth, plantAccess, plantRoles, getPlantDashboard);
router.get('/orders',           staffAuth, plantAccess, plantRoles, getPlantOrders);
router.get('/scan/:qrCode',     staffAuth, plantAccess, plantRoles, scanQRCode);
router.get('/orders/:id',       staffAuth, plantAccess, plantRoles, getPlantOrder);
router.post('/orders/:id/stage',         staffAuth, plantAccess, plantRoles, updatePlantStage);
router.post('/orders/:id/flag',          staffAuth, plantAccess, plantRoles, flagIssue);
router.post('/orders/:id/generate-tags', staffAuth, plantAccess, plantRoles, generateTags);

module.exports = router;
