const express = require('express');
const router  = express.Router();
const { staffAuth }   = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { DELIVERY_MANAGER_ROLES, DELIVERY_PIN_ROLES } = require('../config/master-data');
const {
  getDeliveryDashboard, getMyOrders, getDeliveryOrder,
  markPickedUp, markDelivered, markFailed, collectCash,
  sendDeliveryOtpController, verifyDeliveryOtpController,
  getDailySummary, assignOrder,
} = require('../controllers/delivery.controller');

const delivRoles = requireRole(...new Set([...DELIVERY_PIN_ROLES, 'SUPER_ADMIN', 'MANAGER']));
const mgrRoles   = requireRole(...DELIVERY_MANAGER_ROLES);

router.get('/dashboard',                  staffAuth, delivRoles, getDeliveryDashboard);
router.get('/orders',                     staffAuth, delivRoles, getMyOrders);
router.get('/orders/:id',                 staffAuth, delivRoles, getDeliveryOrder);
router.post('/orders/:id/pickup',         staffAuth, delivRoles, markPickedUp);
router.post('/orders/:id/deliver',        staffAuth, delivRoles, markDelivered);
router.post('/orders/:id/send-otp',       staffAuth, delivRoles, sendDeliveryOtpController);
router.post('/orders/:id/verify-otp',     staffAuth, delivRoles, verifyDeliveryOtpController);
router.post('/orders/:id/failed',         staffAuth, delivRoles, markFailed);
router.post('/orders/:id/cash',           staffAuth, delivRoles, collectCash);
router.post('/orders/:id/assign',         staffAuth, mgrRoles,   assignOrder);
router.get('/summary',                    staffAuth, delivRoles, getDailySummary);

module.exports = router;
