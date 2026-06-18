// ─────────────────────────────────────────────────────────────────────────────
// AUTH ROUTES — Customer OTP Authentication
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { otpSendLimiter, otpVerifyLimiter } = require('../middleware/rateLimit');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');

const {
  sendOtpController,
  verifyOtpController,
  getMeController,
  logoutController,
  updateProfileController,
  savePushTokenController,
  updateNotificationPrefsController,
} = require('../controllers/auth.controller');

const { customerAuth } = require('../middleware/auth');

router.use(privateNoStore);
router.use(requireTrustedWrite);

// Public routes (no auth needed)
router.post('/send-otp',   otpSendLimiter, sendOtpController);
router.post('/verify-otp', otpVerifyLimiter, verifyOtpController);

// Protected routes (customer must be logged in)
router.get   ('/me',            customerAuth, getMeController);
router.post  ('/logout',        customerAuth, logoutController);
router.patch ('/profile',       customerAuth, updateProfileController);
router.post  ('/push-token',    customerAuth, savePushTokenController);
router.patch ('/notifications', customerAuth, updateNotificationPrefsController);

module.exports = router;
