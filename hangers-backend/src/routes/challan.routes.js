const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const {
  getVendorPrices, upsertVendorPrice, bulkUpsertVendorPrices,
  getChallans, getChallan, createChallan, updateChallanStatus, receiveItems,
  getVendorBills, createVendorBill, payVendorBill,
  getChallanPDF, getVendorBillPDF,
} = require('../controllers/challan.controller');

// Vendor price list
router.get ('/vendor-prices',            staffAuth, getVendorPrices);
router.post('/vendor-prices',            staffAuth, upsertVendorPrice);
router.post('/vendor-prices/bulk',       staffAuth, bulkUpsertVendorPrices);

// Challans
router.get ('/challans',                 staffAuth, getChallans);
router.get ('/challans/:id',             staffAuth, getChallan);
router.post('/challans',                 staffAuth, createChallan);
router.patch('/challans/:id/status',     staffAuth, updateChallanStatus);
router.patch('/challans/:id/receive-items', staffAuth, receiveItems);
router.get('/challans/:id/pdf',           getChallanPDF);
router.get('/vendor-bills/:id/pdf',       getVendorBillPDF);

// Vendor bills
router.get ('/vendor-bills',             staffAuth, getVendorBills);
router.post('/vendor-bills',             staffAuth, createVendorBill);
router.patch('/vendor-bills/:id/pay',    staffAuth, payVendorBill);

module.exports = router;
