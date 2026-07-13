const express = require('express');
const router  = express.Router();
const { staffAuth }         = require('../middleware/auth');
const { requireRole, requirePermission, requireServiceAccess }       = require('../middleware/rbac');
const { PLANT_PIN_ROLES }   = require('../config/master-data');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { idempotent } = require('../middleware/idempotency');
const {
  getPlantDashboard, getPlantOrders, scanQRCode,
  getPlantOrder, updatePlantStage, flagIssue, resolveIssue, generateTags,
} = require('../controllers/plant.controller');

const plantRoles = requireRole(...new Set([...PLANT_PIN_ROLES, 'SUPER_ADMIN', 'MANAGER']));

router.use(privateNoStore);
router.use(requireTrustedWrite);
const plantAccess = requireServiceAccess('PLANT');

router.get('/dashboard',        staffAuth, plantAccess, plantRoles, getPlantDashboard);
router.get('/orders',           staffAuth, plantAccess, plantRoles, getPlantOrders);
router.get('/scan/:qrCode',     staffAuth, plantAccess, plantRoles, scanQRCode);
router.get('/orders/:id',       staffAuth, plantAccess, plantRoles, getPlantOrder);
router.post('/orders/:id/stage',         staffAuth, plantAccess, requirePermission('plant.update_stage'), idempotent({ scope: 'plant.stage' }), updatePlantStage);
router.post('/orders/:id/flag',          staffAuth, plantAccess, requirePermission('plant.quality_check'), idempotent({ scope: 'plant.issue' }), flagIssue);
router.post('/issues/:issueId/resolve',  staffAuth, plantAccess, requirePermission('plant.quality_check'), idempotent({ scope: 'plant.issue.resolve' }), resolveIssue);
router.post('/orders/:id/generate-tags', staffAuth, plantAccess, requirePermission('plant.scan'), idempotent({ scope: 'plant.tags' }), generateTags);

module.exports = router;
