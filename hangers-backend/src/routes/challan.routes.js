const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const { requirePermission, requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { idempotent } = require('../middleware/idempotency');
const {
  getVendorPrices, upsertVendorPrice, bulkUpsertVendorPrices,
  getChallans, getChallan, createChallan, updateChallanStatus, receiveItems,
  getVendorBills, createVendorBill, approveVendorBill, payVendorBill,
  getChallanPDF, getVendorBillPDF,
} = require('../controllers/challan.controller');
const { listPlantPartners, createPlantPartner, updatePlantPartner } = require('../controllers/plant-partners.controller');

const plantRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'PLANT_MANAGER');
const financeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const plantAccess = requireServiceAccess('PLANT');
const financeAccess = requireServiceAccess('FINANCE');

router.get('/plant-partners', staffAuth, plantAccess, plantRoles, listPlantPartners);
router.post('/plant-partners', staffAuth, plantAccess, requirePermission('plant.manage_partners'), idempotent({ scope: 'plant-partners.create' }), createPlantPartner);
router.patch('/plant-partners/:id', staffAuth, plantAccess, requirePermission('plant.manage_partners'), idempotent({ scope: 'plant-partners.update' }), updatePlantPartner);

// Vendor price list
router.get ('/vendor-prices',            staffAuth, plantAccess, plantRoles, getVendorPrices);
router.post('/vendor-prices',            staffAuth, plantAccess, requirePermission('plant.manage_rates'), idempotent({ scope: 'vendor-prices.upsert' }), upsertVendorPrice);
router.post('/vendor-prices/bulk',       staffAuth, plantAccess, requirePermission('plant.manage_rates'), idempotent({ scope: 'vendor-prices.bulk' }), bulkUpsertVendorPrices);

// Challans
router.get ('/challans',                 staffAuth, plantAccess, plantRoles, getChallans);
router.get ('/challans/:id',             staffAuth, plantAccess, plantRoles, getChallan);
router.post('/challans',                 staffAuth, plantAccess, requirePermission('plant.create_challan'), idempotent({ scope: 'challans.create' }), createChallan);
router.patch('/challans/:id/status',     staffAuth, plantAccess, requirePermission('plant.process'), idempotent({ scope: 'challans.status' }), updateChallanStatus);
router.patch('/challans/:id/receive-items', staffAuth, plantAccess, requirePermission('plant.receive'), idempotent({ scope: 'challans.receipt' }), receiveItems);
router.get('/challans/:id/pdf',          staffAuth, plantAccess, plantRoles, getChallanPDF);
router.get('/vendor-bills/:id/pdf',      staffAuth, financeAccess, financeRoles, getVendorBillPDF);

// Vendor bills
router.get ('/vendor-bills',             staffAuth, financeAccess, financeRoles, getVendorBills);
router.post('/vendor-bills',             staffAuth, financeAccess, requirePermission('finance.vendor_invoice'), idempotent({ scope: 'vendor-bills.create' }), createVendorBill);
router.post('/vendor-bills/:id/approve', staffAuth, financeAccess, requirePermission('finance.vendor_invoice'), idempotent({ scope: 'vendor-bills.approve' }), approveVendorBill);
router.post('/vendor-bills/:id/payments', staffAuth, financeAccess, requirePermission('finance.vendor_payment'), idempotent({ scope: 'vendor-bills.payment' }), payVendorBill);

module.exports = router;
