const express = require('express');
const router = express.Router();
const { getPublicInvoice, getPublicDailyIronLogs, getPublicQuotation, getPublicRateChart, getPublicSiteProfile, getPublicBlogPosts, getPublicBlogPost, getPublicSuburbPages, getPublicSuburbPage, createPublicPickupRequest, ingestQueuedPickupRequest, sendPublicPickupOtp, verifyPublicPickupOtp, createPublicRazorpayOrder, verifyPublicRazorpayPayment, receivePublicRazorpayCallback, getPublicRazorpayCheckoutStatus, reconcilePublicRazorpayCheckout, assignPublicRazorpayCheckoutExperiment, recordPublicRazorpayCheckoutExperimentEvent, recordPublicRazorpayClientEvent } = require('../controllers/public.controller');
const { publicShareLimiter, publicCheckoutReconcileLimiter, otpSendLimiter, otpVerifyLimiter } = require('../middleware/rateLimit');

router.use(publicShareLimiter);
router.get('/invoices/:slug', getPublicInvoice);
router.post('/invoices/:slug/payment/experiment/assign', assignPublicRazorpayCheckoutExperiment);
router.post('/invoices/:slug/payment/experiment/events', recordPublicRazorpayCheckoutExperimentEvent);
router.post('/invoices/:slug/payment/client-events', recordPublicRazorpayClientEvent);
router.post('/invoices/:slug/payment/create-order', createPublicRazorpayOrder);
router.post('/invoices/:slug/payment/verify', verifyPublicRazorpayPayment);
router.post('/invoices/:slug/payment/callback', receivePublicRazorpayCallback);
router.get('/invoices/:slug/payment/status', getPublicRazorpayCheckoutStatus);
router.post('/invoices/:slug/payment/reconcile', publicCheckoutReconcileLimiter, reconcilePublicRazorpayCheckout);
router.get('/daily-iron/:slug', getPublicDailyIronLogs);
router.get('/quotations/:slug', getPublicQuotation);
router.get('/rate-chart', getPublicRateChart);
router.get('/site-profile', getPublicSiteProfile);
router.get('/blog-posts', getPublicBlogPosts);
router.get('/blog-posts/:slug', getPublicBlogPost);
router.get('/pickup-zones', getPublicSuburbPages);
router.get('/pickup-zones/:slug', getPublicSuburbPage);
router.post('/pickup-requests/send-otp', otpSendLimiter, sendPublicPickupOtp);
router.post('/pickup-requests/verify-otp', otpVerifyLimiter, verifyPublicPickupOtp);
router.post('/pickup-requests', otpVerifyLimiter, createPublicPickupRequest);
router.post('/pickup-requests/queued-ingest', ingestQueuedPickupRequest);

module.exports = router;
