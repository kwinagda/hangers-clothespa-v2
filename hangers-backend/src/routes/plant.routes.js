const express = require('express');
const router  = express.Router();
const { staffAuth }         = require('../middleware/auth');
const { requireRole }       = require('../middleware/rbac');
const { PLANT_PIN_ROLES }   = require('../config/master-data');
const {
  getPlantDashboard, getPlantOrders, scanQRCode,
  getPlantOrder, updatePlantStage, flagIssue, generateTags,
} = require('../controllers/plant.controller');

const plantRoles = requireRole(...new Set([...PLANT_PIN_ROLES, 'SUPER_ADMIN', 'MANAGER']));

router.get('/dashboard',        staffAuth, plantRoles, getPlantDashboard);
router.get('/orders',           staffAuth, plantRoles, getPlantOrders);
router.get('/scan/:qrCode',     staffAuth, plantRoles, scanQRCode);
router.get('/orders/:id',       staffAuth, plantRoles, getPlantOrder);
router.post('/orders/:id/stage',         staffAuth, plantRoles, updatePlantStage);
router.post('/orders/:id/flag',          staffAuth, plantRoles, flagIssue);
router.post('/orders/:id/generate-tags', staffAuth, plantRoles, generateTags);

module.exports = router;
