const express = require('express');
const router  = express.Router();
const { staffAuth }                                                       = require('../middleware/auth');
const { requireRole, requirePermission, requireServiceAccess }            = require('../middleware/rbac');
const { privateNoStore }                                                  = require('../middleware/privateCache');
const { requireTrustedWrite }                                             = require('../middleware/origin');
const { getTransferOrders, createTransferOrder, updateTransferStatus }    = require('../controllers/transfers.controller');
const { idempotent }                                                       = require('../middleware/idempotency');

const plantTransferRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'PLANT_MANAGER');
const plantAccess        = requireServiceAccess('PLANT');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',               staffAuth, plantAccess, plantTransferRoles, getTransferOrders);
router.post('/',              staffAuth, plantAccess, requirePermission('plant.transfer'), idempotent({ scope: 'plant-transfers.create' }), createTransferOrder);
router.patch('/:id/status',   staffAuth, plantAccess, requirePermission('plant.transfer'), idempotent({ scope: 'plant-transfers.status' }), updateTransferStatus);

module.exports = router;
