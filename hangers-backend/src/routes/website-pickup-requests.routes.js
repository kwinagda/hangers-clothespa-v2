const express = require('express');
const { staffAuth } = require('../middleware/auth');
const { requirePermission, requireServiceAccess } = require('../middleware/rbac');
const { idempotent } = require('../middleware/idempotency');
const { listPickupRequests, getPickupRequest, updatePickupRequestStatus, preparePickupOrder, retryPickupWhatsApp } = require('../controllers/website-pickup-requests.controller');

const router = express.Router();
const crmAccess = requireServiceAccess('CRM');

router.get('/', staffAuth, crmAccess, requirePermission('pickup_requests.view'), listPickupRequests);
router.get('/:id', staffAuth, crmAccess, requirePermission('pickup_requests.view'), getPickupRequest);
router.patch('/:id/status', staffAuth, crmAccess, requirePermission('pickup_requests.manage'), idempotent({ scope: 'pickup-request.status' }), updatePickupRequestStatus);
router.post('/:id/prepare-order', staffAuth, crmAccess, requirePermission('pickup_requests.manage'), idempotent({ scope: 'pickup-request.prepare-order' }), preparePickupOrder);
router.post('/:id/notifications/:activityId/retry', staffAuth, crmAccess, requirePermission('pickup_requests.manage'), idempotent({ scope: 'pickup-request.notification-retry' }), retryPickupWhatsApp);

module.exports = router;
