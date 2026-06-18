const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const {
  getVendorPrices, upsertVendorPrice, bulkUpsertVendorPrices,
  getChallans, getChallan, createChallan, updateChallanStatus, receiveItems,
  getVendorBills, createVendorBill, payVendorBill,
  getChallanPDF, getVendorBillPDF,
} = require('../controllers/challan.controller');

const plantRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'PLANT_MANAGER');
const financeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const plantAccess = requireServiceAccess('PLANT');
const financeAccess = requireServiceAccess('FINANCE');

// Vendor price list
router.get ('/vendor-prices',            staffAuth, plantAccess, plantRoles, getVendorPrices);
router.post('/vendor-prices',            staffAuth, plantAccess, plantRoles, upsertVendorPrice);
router.post('/vendor-prices/bulk',       staffAuth, plantAccess, plantRoles, bulkUpsertVendorPrices);

// Challans
router.get ('/challans',                 staffAuth, plantAccess, plantRoles, getChallans);
router.get ('/challans/:id',             staffAuth, plantAccess, plantRoles, getChallan);
router.post('/challans',                 staffAuth, plantAccess, plantRoles, createChallan);
router.patch('/challans/:id/status',     staffAuth, plantAccess, plantRoles, updateChallanStatus);
router.patch('/challans/:id/receive-items', staffAuth, plantAccess, plantRoles, receiveItems);
router.get('/challans/:id/pdf',          staffAuth, plantAccess, plantRoles, getChallanPDF);
router.get('/vendor-bills/:id/pdf',      staffAuth, financeAccess, financeRoles, getVendorBillPDF);

// Vendor bills
router.get ('/vendor-bills',             staffAuth, financeAccess, financeRoles, getVendorBills);
router.post('/vendor-bills',             staffAuth, financeAccess, financeRoles, createVendorBill);
router.patch('/vendor-bills/:id/pay',    staffAuth, financeAccess, financeRoles, payVendorBill);

module.exports = router;
