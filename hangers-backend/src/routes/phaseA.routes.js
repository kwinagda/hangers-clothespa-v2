// ─────────────────────────────────────────────────────────────────────────────
// PHASE A — ROUTES
// File: hangers-backend/src/routes/phaseA.routes.js
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');

const {
  getCustomerStats,
  getCashBook, addCashEntry,
  getExpenses, addExpense, deleteExpense,
  getARLedger,
  getChallans, createChallan, updateChallanStatus,
  getTransferOrders, createTransferOrder, updateTransferStatus,
  getAttendance, clockIn, clockOut,
  getCoupons, createCoupon, validateCoupon, toggleCoupon,
  getLoyaltyRules, updateLoyaltyRules, awardLoyaltyPoints,
  getUpcharges, createUpcharge,
  updateCustomerTag,
  getRecurringPickups, createRecurringPickup, toggleRecurringPickup,
  createReturnOrder,
  getCampaigns, createCampaign, sendCampaign,
  getReport,
  advancedSearch,
  getAutomations, createAutomation, toggleAutomation, updateAutomation,
} = require('../controllers/phaseA.controller');

// A1 — Customer stats
router.get('/customers/:id/stats', staffAuth, getCustomerStats);

// A2 — Cash book
router.get('/cashbook',      staffAuth, getCashBook);
router.post('/cashbook',     staffAuth, addCashEntry);

// A3 — Expenses
router.get('/expenses',      staffAuth, getExpenses);
router.post('/expenses',     staffAuth, addExpense);
router.delete('/expenses/:id', staffAuth, deleteExpense);

// A4 — AR Ledger
router.get('/ar-ledger',     staffAuth, getARLedger);

// A5 — Delivery Challans
router.get('/challans',              staffAuth, getChallans);
router.post('/challans',             staffAuth, createChallan);
router.patch('/challans/:id/status', staffAuth, updateChallanStatus);

// A6 — Transfer Orders
router.get('/transfers',              staffAuth, getTransferOrders);
router.post('/transfers',             staffAuth, createTransferOrder);
router.patch('/transfers/:id/status', staffAuth, updateTransferStatus);

// A7 — Attendance
router.get('/attendance',    staffAuth, getAttendance);
router.post('/attendance/clock-in',  staffAuth, clockIn);
router.post('/attendance/clock-out', staffAuth, clockOut);

// A8 — Coupons
router.get('/coupons',               staffAuth, getCoupons);
router.post('/coupons',              staffAuth, createCoupon);
router.post('/coupons/validate',     staffAuth, validateCoupon);
router.patch('/coupons/:id/toggle',  staffAuth, toggleCoupon);

// A10 — Loyalty
router.get('/loyalty/rules',         staffAuth, getLoyaltyRules);
router.put('/loyalty/rules',         staffAuth, updateLoyaltyRules);
router.post('/loyalty/award',        staffAuth, awardLoyaltyPoints);

// A11 — Upcharges
router.get('/upcharges',             staffAuth, getUpcharges);
router.post('/upcharges',            staffAuth, createUpcharge);

// A12 — Customer tag
router.patch('/customers/:id/tag',   staffAuth, updateCustomerTag);

// A13 — Recurring pickups
router.get('/recurring-pickups',              staffAuth, getRecurringPickups);
router.post('/recurring-pickups',             staffAuth, createRecurringPickup);
router.patch('/recurring-pickups/:id/toggle', staffAuth, toggleRecurringPickup);

// A14 — Return orders
router.post('/orders/return',        staffAuth, createReturnOrder);

// A15 — Campaigns
router.get('/campaigns',             staffAuth, getCampaigns);
router.post('/campaigns',            staffAuth, createCampaign);
router.post('/campaigns/:id/send',   staffAuth, sendCampaign);

// A16 — Reports
router.get('/reports',               staffAuth, getReport);

// A17 — Advanced search
router.get('/search',                staffAuth, advancedSearch);

// A18 — Automations
router.get('/automations',              staffAuth, getAutomations);
router.post('/automations',             staffAuth, createAutomation);
router.patch('/automations/:id/toggle', staffAuth, toggleAutomation);
router.put('/automations/:id',          staffAuth, updateAutomation);

module.exports = router;
