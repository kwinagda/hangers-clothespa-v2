const rateLimit = require('express-rate-limit');

const buildLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
  });

const globalApiLimiter = buildLimiter(
  15 * 60 * 1000,
  1200,
  'Too many requests. Please slow down and try again later.'
);

const publicShareLimiter = buildLimiter(
  10 * 60 * 1000,
  60,
  'Too many public link requests. Please wait a few minutes and try again.'
);

const otpSendLimiter = buildLimiter(
  10 * 60 * 1000,
  5,
  'Too many OTP requests. Please wait a few minutes and try again.'
);

const otpVerifyLimiter = buildLimiter(
  10 * 60 * 1000,
  10,
  'Too many OTP verification attempts. Please wait a few minutes and try again.'
);

const staffLoginLimiter = buildLimiter(
  15 * 60 * 1000,
  10,
  'Too many staff login attempts. Please wait before trying again.'
);

const pinLoginLimiter = buildLimiter(
  15 * 60 * 1000,
  10,
  'Too many PIN login attempts. Please wait before trying again.'
);

const deliveryOtpSendLimiter = buildLimiter(
  10 * 60 * 1000,
  5,
  'Too many delivery OTP requests. Please wait a few minutes and try again.'
);

const deliveryOtpVerifyLimiter = buildLimiter(
  10 * 60 * 1000,
  10,
  'Too many delivery OTP verification attempts. Please wait a few minutes and try again.'
);

module.exports = {
  buildLimiter,
  globalApiLimiter,
  publicShareLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
  staffLoginLimiter,
  pinLoginLimiter,
  deliveryOtpSendLimiter,
  deliveryOtpVerifyLimiter,
};
