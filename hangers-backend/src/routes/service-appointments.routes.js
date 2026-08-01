const express = require('express');
const router = express.Router();

const { staffAuth } = require('../middleware/auth');
const { requirePermission, requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { idempotent } = require('../middleware/idempotency');
const {
  getAppointments,
  createAppointment,
  updateStatus,
  invoiceAppointment,
  recordAppointmentPayment,
  reverseAppointmentPayment,
} = require('../controllers/service-appointments.controller');

const crmAccess = requireServiceAccess('CRM');
const officeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS', 'COUNTER_STAFF');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/', staffAuth, crmAccess, officeRoles, getAppointments);
router.post('/', staffAuth, crmAccess, officeRoles, requirePermission('orders.create'), idempotent({ scope: 'field-service.appointment.create' }), createAppointment);
router.patch('/:id/status', staffAuth, crmAccess, officeRoles, requirePermission('orders.update'), idempotent({ scope: 'field-service.appointment.status' }), updateStatus);
router.post('/:id/invoice', staffAuth, crmAccess, officeRoles, requirePermission('finance.collect_payment'), idempotent({ scope: 'field-service.appointment.invoice' }), invoiceAppointment);
router.post('/:id/payments', staffAuth, crmAccess, officeRoles, requirePermission('finance.collect_payment'), idempotent({ scope: 'field-service.appointment.payment' }), recordAppointmentPayment);
router.post('/:id/payments/:paymentId/reversal', staffAuth, crmAccess, officeRoles, requirePermission('finance.refund'), idempotent({ scope: 'field-service.appointment.payment-reversal' }), reverseAppointmentPayment);

module.exports = router;
