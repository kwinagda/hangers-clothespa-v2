const express = require('express');
const router = express.Router();
const { getPublicInvoice, getPublicDailyIronLogs } = require('../controllers/public.controller');

router.get('/invoices/:slug', getPublicInvoice);
router.get('/daily-iron/:slug', getPublicDailyIronLogs);

module.exports = router;
