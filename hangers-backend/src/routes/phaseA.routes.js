// ─────────────────────────────────────────────────────────────────────────────
// PHASE A — ROUTES
// File: hangers-backend/src/routes/phaseA.routes.js
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');

const {
  getCustomerStats,
  getCashBook, addCashEntry,
  getExpenses, addExpense, deleteExpense,
  getARLedger,
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

const adminRoles = requireRole('SUPER_ADMIN', 'MANAGER');
const financeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS');
const officeRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'COUNTER_STAFF', 'ACCOUNTS');
const plantTransferRoles = requireRole('SUPER_ADMIN', 'MANAGER', 'PLANT_MANAGER');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const crmAccess = requireServiceAccess('CRM');
const financeAccess = requireServiceAccess('FINANCE');
const reportsAccess = requireServiceAccess('REPORTS');
const marketingAccess = requireServiceAccess('MARKETING');
const plantAccess = requireServiceAccess('PLANT');

// A1 — Customer stats
router.get('/customers/:id/stats', staffAuth, crmAccess, officeRoles, getCustomerStats);

// A2 — Cash book
router.get('/cashbook',      staffAuth, financeAccess, financeRoles, getCashBook);
router.post('/cashbook',     staffAuth, financeAccess, financeRoles, addCashEntry);

// A3 — Expenses
router.get('/expenses',      staffAuth, financeAccess, financeRoles, getExpenses);
router.post('/expenses',     staffAuth, financeAccess, financeRoles, addExpense);
router.delete('/expenses/:id', staffAuth, financeAccess, financeRoles, deleteExpense);

// A4 — AR Ledger
router.get('/ar-ledger',     staffAuth, financeAccess, financeRoles, getARLedger);

// A6 — Transfer Orders
router.get('/transfers',              staffAuth, plantAccess, plantTransferRoles, getTransferOrders);
router.post('/transfers',             staffAuth, plantAccess, plantTransferRoles, createTransferOrder);
router.patch('/transfers/:id/status', staffAuth, plantAccess, plantTransferRoles, updateTransferStatus);

// A7 — Attendance
router.get('/attendance',    staffAuth, crmAccess, adminRoles, getAttendance);
router.post('/attendance/clock-in',  staffAuth, clockIn);
router.post('/attendance/clock-out', staffAuth, clockOut);

// A8 — Coupons
router.get('/coupons',               staffAuth, crmAccess, officeRoles, getCoupons);
router.post('/coupons',              staffAuth, crmAccess, adminRoles, createCoupon);
router.post('/coupons/validate',     staffAuth, crmAccess, officeRoles, validateCoupon);
router.patch('/coupons/:id/toggle',  staffAuth, crmAccess, adminRoles, toggleCoupon);

// A10 — Loyalty
router.get('/loyalty/rules',         staffAuth, crmAccess, officeRoles, getLoyaltyRules);
router.put('/loyalty/rules',         staffAuth, crmAccess, adminRoles, updateLoyaltyRules);
router.post('/loyalty/award',        staffAuth, crmAccess, officeRoles, awardLoyaltyPoints);

// A11 — Upcharges
router.get('/upcharges',             staffAuth, crmAccess, officeRoles, getUpcharges);
router.post('/upcharges',            staffAuth, crmAccess, adminRoles, createUpcharge);

// A12 — Customer tag
router.patch('/customers/:id/tag',   staffAuth, crmAccess, officeRoles, updateCustomerTag);

// A13 — Recurring pickups
router.get('/recurring-pickups',              staffAuth, crmAccess, officeRoles, getRecurringPickups);
router.post('/recurring-pickups',             staffAuth, crmAccess, officeRoles, createRecurringPickup);
router.patch('/recurring-pickups/:id/toggle', staffAuth, crmAccess, officeRoles, toggleRecurringPickup);

// A14 — Return orders
router.post('/orders/return',        staffAuth, crmAccess, officeRoles, createReturnOrder);

// A15 — Campaigns
router.get('/campaigns',             staffAuth, marketingAccess, adminRoles, getCampaigns);
router.post('/campaigns',            staffAuth, marketingAccess, adminRoles, createCampaign);
router.post('/campaigns/:id/send',   staffAuth, marketingAccess, adminRoles, sendCampaign);

// A16 — Reports
router.get('/reports',               staffAuth, reportsAccess, officeRoles, getReport);

// A17 — Advanced search
router.get('/search',                staffAuth, crmAccess, officeRoles, advancedSearch);

// A18 — Automations
router.get('/automations',              staffAuth, marketingAccess, adminRoles, getAutomations);
router.post('/automations',             staffAuth, marketingAccess, adminRoles, createAutomation);
router.patch('/automations/:id/toggle', staffAuth, marketingAccess, adminRoles, toggleAutomation);
router.put('/automations/:id',          staffAuth, marketingAccess, adminRoles, updateAutomation);

module.exports = router;
