const express = require('express');
const router = express.Router();
const { getPublicInvoice, getPublicDailyIronLogs, getPublicQuotation, getPublicRateChart, getPublicSiteProfile, getPublicBlogPosts, getPublicBlogPost, getPublicSuburbPages, getPublicSuburbPage, getPublicServicePages, getPublicServicePage, createPublicPickupRequest, ingestQueuedPickupRequest, sendPublicPickupOtp, verifyPublicPickupOtp, createPublicRazorpayOrder, verifyPublicRazorpayPayment, getPublicRazorpayCheckoutStatus, assignPublicRazorpayCheckoutExperiment, recordPublicRazorpayCheckoutExperimentEvent } = require('../controllers/public.controller');
const { publicShareLimiter, otpSendLimiter, otpVerifyLimiter } = require('../middleware/rateLimit');

// publicShareLimiter guards guessable share-token lookups (invoice/daily-iron/quotation
// slugs) and the payment flows behind them, where brute-force enumeration is a real risk.
// It is scoped to those routes only, not applied router-wide: the marketing-content
// endpoints below are non-sensitive and read-only, and every public page render fans out
// into several of them server-side (metadata + page body each fetch independently), so a
// tight per-share-link budget was starving ordinary page loads. They still sit behind the
// generous app-wide globalApiLimiter (1200 req/15min) applied at the /api/v1 level.
router.get('/invoices/:slug', publicShareLimiter, getPublicInvoice);
router.post('/invoices/:slug/payment/experiment/assign', publicShareLimiter, assignPublicRazorpayCheckoutExperiment);
router.post('/invoices/:slug/payment/experiment/events', publicShareLimiter, recordPublicRazorpayCheckoutExperimentEvent);
router.post('/invoices/:slug/payment/create-order', publicShareLimiter, createPublicRazorpayOrder);
router.post('/invoices/:slug/payment/verify', publicShareLimiter, verifyPublicRazorpayPayment);
router.get('/invoices/:slug/payment/status', publicShareLimiter, getPublicRazorpayCheckoutStatus);
router.get('/daily-iron/:slug', publicShareLimiter, getPublicDailyIronLogs);
router.get('/quotations/:slug', publicShareLimiter, getPublicQuotation);
router.get('/rate-chart', getPublicRateChart);
router.get('/site-profile', getPublicSiteProfile);
router.get('/blog-posts', getPublicBlogPosts);
router.get('/blog-posts/:slug', getPublicBlogPost);
router.get('/pickup-zones', getPublicSuburbPages);
router.get('/pickup-zones/:slug', getPublicSuburbPage);
router.get('/service-pages', getPublicServicePages);
router.get('/service-pages/:service/:suburb', getPublicServicePage);
router.post('/pickup-requests/send-otp', otpSendLimiter, sendPublicPickupOtp);
router.post('/pickup-requests/verify-otp', otpVerifyLimiter, verifyPublicPickupOtp);
router.post('/pickup-requests', otpVerifyLimiter, createPublicPickupRequest);
router.post('/pickup-requests/queued-ingest', ingestQueuedPickupRequest);

module.exports = router;
