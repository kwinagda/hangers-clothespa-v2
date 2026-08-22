const express = require('express');
const router = express.Router();
const { getPublicInvoice, getPublicDailyIronLogs, getPublicQuotation, getPublicRateChart, getPublicSiteProfile, createPublicPickupRequest, ingestQueuedPickupRequest, sendPublicPickupOtp, verifyPublicPickupOtp } = require('../controllers/public.controller');
const { publicShareLimiter, otpSendLimiter, otpVerifyLimiter } = require('../middleware/rateLimit');

router.use(publicShareLimiter);
router.get('/invoices/:slug', getPublicInvoice);
router.get('/daily-iron/:slug', getPublicDailyIronLogs);
router.get('/quotations/:slug', getPublicQuotation);
router.get('/rate-chart', getPublicRateChart);
router.get('/site-profile', getPublicSiteProfile);
router.post('/pickup-requests/send-otp', otpSendLimiter, sendPublicPickupOtp);
router.post('/pickup-requests/verify-otp', otpVerifyLimiter, verifyPublicPickupOtp);
router.post('/pickup-requests', otpVerifyLimiter, createPublicPickupRequest);
router.post('/pickup-requests/queued-ingest', ingestQueuedPickupRequest);

module.exports = router;
