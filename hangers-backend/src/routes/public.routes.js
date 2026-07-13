const express = require('express');
const router = express.Router();
const { getPublicInvoice, getPublicDailyIronLogs, getPublicQuotation } = require('../controllers/public.controller');
const { publicShareLimiter } = require('../middleware/rateLimit');

router.use(publicShareLimiter);
router.get('/invoices/:slug', getPublicInvoice);
router.get('/daily-iron/:slug', getPublicDailyIronLogs);
router.get('/quotations/:slug', getPublicQuotation);

module.exports = router;
