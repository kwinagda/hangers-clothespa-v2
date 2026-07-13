const express = require('express');
const router = express.Router();
const {
  listQuotations,
  getQuotation,
  getQuotationPDF,
  createQuotationShare,
  createQuotation,
  updateQuotation,
  updateQuotationStatus,
  convertQuotation,
} = require('../controllers/quotations.controller');
const { staffAuth } = require('../middleware/auth');
const { requirePermission, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { idempotent } = require('../middleware/idempotency');

router.use(privateNoStore);
router.use(requireTrustedWrite);

const crmAccess = requireServiceAccess('CRM');

router.get('/', staffAuth, crmAccess, requirePermission('orders.view'), listQuotations);
router.get('/:id', staffAuth, crmAccess, requirePermission('orders.view'), getQuotation);
router.get('/:id/pdf', staffAuth, crmAccess, requirePermission('orders.view'), getQuotationPDF);
router.post('/:id/share', staffAuth, crmAccess, requirePermission('orders.view'), createQuotationShare);
router.post('/', staffAuth, crmAccess, requirePermission('orders.create'), idempotent({ scope: 'quotations.create' }), createQuotation);
router.patch('/:id', staffAuth, crmAccess, requirePermission('orders.edit'), idempotent({ scope: 'quotations.edit' }), updateQuotation);
router.patch('/:id/status', staffAuth, crmAccess, requirePermission('orders.edit'), idempotent({ scope: 'quotations.status' }), updateQuotationStatus);
router.post('/:id/convert', staffAuth, crmAccess, requirePermission('orders.create'), idempotent({ scope: 'quotations.convert' }), convertQuotation);

module.exports = router;
