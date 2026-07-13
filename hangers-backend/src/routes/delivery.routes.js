const express = require('express');
const router  = express.Router();
const { staffAuth }   = require('../middleware/auth');
const { requireRole, requirePermission, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { idempotent } = require('../middleware/idempotency');
const {
  deliveryOtpSendLimiter,
  deliveryOtpVerifyLimiter,
} = require('../middleware/rateLimit');
const { DELIVERY_MANAGER_ROLES, DELIVERY_PIN_ROLES } = require('../config/master-data');
const {
  getDeliveryDashboard, getMyOrders, getDeliveryOrder,
  markPickedUp, markDelivered, markFailed, collectCash,
  sendDeliveryOtpController, verifyDeliveryOtpController,
  getDailySummary, assignOrder,
} = require('../controllers/delivery.controller');

const delivRoles = requireRole(...new Set([...DELIVERY_PIN_ROLES, 'SUPER_ADMIN', 'MANAGER']));
const mgrRoles   = requireRole(...DELIVERY_MANAGER_ROLES);

router.use(privateNoStore);
router.use(requireTrustedWrite);
const deliveryAccess = requireServiceAccess('DELIVERY');

router.get('/dashboard',                  staffAuth, deliveryAccess, delivRoles, getDeliveryDashboard);
router.get('/orders',                     staffAuth, deliveryAccess, delivRoles, getMyOrders);
router.get('/orders/:id',                 staffAuth, deliveryAccess, delivRoles, getDeliveryOrder);
router.post('/orders/:id/pickup',         staffAuth, deliveryAccess, requirePermission('delivery.execute'), idempotent({ scope: 'delivery.pickup' }), markPickedUp);
router.post('/orders/:id/deliver',        staffAuth, deliveryAccess, requirePermission('delivery.execute'), idempotent({ scope: 'delivery.deliver' }), markDelivered);
router.post('/orders/:id/send-otp',       staffAuth, deliveryAccess, delivRoles, deliveryOtpSendLimiter, sendDeliveryOtpController);
router.post('/orders/:id/verify-otp',     staffAuth, deliveryAccess, delivRoles, deliveryOtpVerifyLimiter, verifyDeliveryOtpController);
router.post('/orders/:id/failed',         staffAuth, deliveryAccess, requirePermission('delivery.execute'), idempotent({ scope: 'delivery.failed' }), markFailed);
router.post('/orders/:id/cash',           staffAuth, deliveryAccess, requirePermission('finance.collect_payment'), idempotent({ scope: 'delivery.cash' }), collectCash);
router.post('/orders/:id/assign',         staffAuth, deliveryAccess, requirePermission('delivery.assign'), idempotent({ scope: 'delivery.assign' }), assignOrder);
router.get('/summary',                    staffAuth, deliveryAccess, delivRoles, getDailySummary);

module.exports = router;
