// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER AUTH CONTROLLER — Dev Mode returns OTP in response
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const {
  generateOtp, hashOtp, sendOtp, isDevMode
}                                                  = require('../services/msg91.service');
const { clearAuthThrottle, getAuthThrottleBlock, registerAuthThrottleFailure } = require('../services/authThrottle.service');
const { generateCustomerToken, getTokenExpiry }    = require('../services/jwt.service');
const { log, getRequestMeta }                      = require('../services/activity.service');
const { success, badRequest, error, unauthorized } = require('../utils/response');
const { LANGUAGE_VALUES }                          = require('../config/master-data');
const { REFERRAL_STATUS }                          = require('../services/referral.service');
const { sendOtpSchema, verifyOtpSchema }           = require('../validation/auth.schemas');
const { AUTH_CHALLENGE_PURPOSE, createAuthChallenge, verifyAuthChallenge } = require('../services/authChallenge.service');
const OTP_SEND_MAX_FAILURES = 5;
const OTP_SEND_WINDOW_MS = 10 * 60 * 1000;
const OTP_VERIFY_MAX_FAILURES = 10;
const OTP_VERIFY_WINDOW_MS = 10 * 60 * 1000;

const isValidPhone = (phone) => {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^(\+91|91)?[6-9]\d{9}$/.test(cleaned);
};

// Generate a unique 6-char alphanumeric referral code
const generateReferralCode = async () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = 'HANG' + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const exists = await prisma.customer.findUnique({ where: { referralCode: code } });
    if (!exists) return code;
  }
  return null; // fallback — shouldn't happen
};

const MAX_ACTIVE_CUSTOMER_SESSIONS = 5;

const normalizePhone = (phone) => {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+91')) return cleaned.slice(3);
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned.slice(2);
  return cleaned;
};

const normalizeLanguage = (language) => {
  if (!language) return null;
  const normalized = String(language).trim().toUpperCase();
  return LANGUAGE_VALUES.includes(normalized) ? normalized : null;
};

const normalizeSignupAddress = (rawAddress) => {
  if (!rawAddress || typeof rawAddress !== 'object') return null;

  const label = String(rawAddress.label || 'Home').trim() || 'Home';
  const addressLine1 = String(rawAddress.addressLine1 || rawAddress.address || '').trim();
  const addressLine2 = rawAddress.addressLine2 ? String(rawAddress.addressLine2).trim() : null;
  const landmark = rawAddress.landmark ? String(rawAddress.landmark).trim() : null;
  const city = String(rawAddress.city || '').trim();
  const pincode = String(rawAddress.pincode || '').trim();
  const latitude = rawAddress.latitude !== undefined && rawAddress.latitude !== null ? Number(rawAddress.latitude) : null;
  const longitude = rawAddress.longitude !== undefined && rawAddress.longitude !== null ? Number(rawAddress.longitude) : null;

  return {
    label,
    addressLine1,
    addressLine2: addressLine2 || null,
    landmark: landmark || null,
    city,
    pincode,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
};

const isValidSignupAddress = (address) => {
  if (!address) return false;
  if (!address.addressLine1 || !address.city || !/^\d{6}$/.test(address.pincode)) return false;
  if (address.latitude !== null && (address.latitude < -90 || address.latitude > 90)) return false;
  if (address.longitude !== null && (address.longitude < -180 || address.longitude > 180)) return false;
  return true;
};

const trimCustomerSessions = async (customerId) => {
  const sessions = await prisma.customerSession.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const staleSessionIds = sessions.slice(MAX_ACTIVE_CUSTOMER_SESSIONS).map((session) => session.id);
  if (staleSessionIds.length) {
    await prisma.customerSession.deleteMany({ where: { id: { in: staleSessionIds } } });
  }
};

// ── POST /api/v1/auth/send-otp ────────────────────────────────────────────────
const sendOtpController = async (req, res) => {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Phone number is required');
  const { phone } = parsed.data;

  const normalizedPhone = normalizePhone(phone);

  try {
    const ipScopeKey = (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString().slice(0, 64);
    const [phoneBlockedUntil, ipBlockedUntil] = await Promise.all([
      getAuthThrottleBlock({ scope: 'customer-otp-send:phone', scopeKey: normalizedPhone }),
      getAuthThrottleBlock({ scope: 'customer-otp-send:ip', scopeKey: ipScopeKey }),
    ]);
    if (phoneBlockedUntil || ipBlockedUntil) {
      return badRequest(res, 'Too many OTP requests. Please wait a few minutes and try again.');
    }

    // Expire any old OTPs for this phone
    await prisma.otpVerification.updateMany({
      where: { phone: normalizedPhone, isUsed: false },
      data:  { isUsed: true },
    });

    const otp       = generateOtp();       // Returns '123456' in dev mode
    const hashedOtp = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const existingCustomer = await prisma.customer.findUnique({
      where: { phone: normalizedPhone },
    });

    await prisma.otpVerification.create({
      data: {
        phone:      normalizedPhone,
        otp:        hashedOtp,
        purpose:    'LOGIN',
        expiresAt,
        customerId: existingCustomer?.id || null,
      },
    });
    await createAuthChallenge({
      subjectType: 'customer',
      subjectKey: normalizedPhone,
      purpose: AUTH_CHALLENGE_PURPOSE.CUSTOMER_LOGIN,
      code: otp,
      ttlMs: 10 * 60 * 1000,
      maxAttempts: 5,
      cooldownMs: 60 * 1000,
      metadata: { customerId: existingCustomer?.id || null },
    });

    if (!isDevMode()) { await sendOtp(normalizedPhone, otp); } else { console.log(`\nDEV MODE OTP for ${normalizedPhone}: ${otp}\n`); }

    await log({
      actorType:   'customer',
      actorId:     existingCustomer?.id,
      action:      'OTP_SENT',
      resource:    'otp',
      description: `OTP sent to ${normalizedPhone}`,
      ...getRequestMeta(req),
    });

    const devMode = isDevMode();
    await Promise.all([
      clearAuthThrottle({ scope: 'customer-otp-send:phone', scopeKey: normalizedPhone }),
      clearAuthThrottle({ scope: 'customer-otp-send:ip', scopeKey: ipScopeKey }),
    ]);

    return success(res, {
      phone:      normalizedPhone,
      isNewUser:  !existingCustomer,
      expiresIn:  600,
      channel:    devMode ? 'dev' : 'whatsapp',
      message:    devMode
        ? 'DEV MODE — Use OTP: 123456'
        : `OTP sent to your WhatsApp (+91 ${normalizedPhone})`,
      // In dev mode, send the OTP in the response so app can auto-fill
      ...(devMode && { devOtp: otp }),
    }, devMode ? 'OTP ready - use 123456' : 'OTP sent via WhatsApp');

  } catch (err) {
    console.error('sendOtp error:', err.message);
    await Promise.allSettled([
      registerAuthThrottleFailure({ scope: 'customer-otp-send:phone', scopeKey: normalizedPhone, maxFailures: OTP_SEND_MAX_FAILURES, windowMs: OTP_SEND_WINDOW_MS }),
      registerAuthThrottleFailure({ scope: 'customer-otp-send:ip', scopeKey: (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString().slice(0, 64), maxFailures: OTP_SEND_MAX_FAILURES, windowMs: OTP_SEND_WINDOW_MS }),
    ]);
    return error(res, 'Failed to send OTP. Please try again.');
  }
};

// ── POST /api/v1/auth/verify-otp ──────────────────────────────────────────────
const verifyOtpController = async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid OTP payload');
  const { phone, otp, name, referredByCode, address } = parsed.data;

  const normalizedPhone = normalizePhone(phone);

  try {
    const ipScopeKey = (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString().slice(0, 64);
    const [phoneBlockedUntil, ipBlockedUntil] = await Promise.all([
      getAuthThrottleBlock({ scope: 'customer-otp-verify:phone', scopeKey: normalizedPhone }),
      getAuthThrottleBlock({ scope: 'customer-otp-verify:ip', scopeKey: ipScopeKey }),
    ]);
    if (phoneBlockedUntil || ipBlockedUntil) {
      return badRequest(res, 'Too many OTP attempts. Please wait a few minutes and try again.');
    }

    const otpRecord = await prisma.otpVerification.findFirst({
      where: {
        phone:     normalizedPhone,
        isUsed:    false,
        purpose:   'LOGIN',
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      await Promise.all([
        registerAuthThrottleFailure({ scope: 'customer-otp-verify:phone', scopeKey: normalizedPhone, maxFailures: OTP_VERIFY_MAX_FAILURES, windowMs: OTP_VERIFY_WINDOW_MS }),
        registerAuthThrottleFailure({ scope: 'customer-otp-verify:ip', scopeKey: ipScopeKey, maxFailures: OTP_VERIFY_MAX_FAILURES, windowMs: OTP_VERIFY_WINDOW_MS }),
      ]);
      return badRequest(res, 'OTP expired or not found. Please request a new one.');
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data:  { isUsed: true },
      });
      return badRequest(res, 'Too many wrong attempts. Please request a new OTP.');
    }

    const verification = await verifyAuthChallenge({
      subjectType: 'customer',
      subjectKey: normalizedPhone,
      purpose: AUTH_CHALLENGE_PURPOSE.CUSTOMER_LOGIN,
      code: otp,
    });
    if (!verification.ok) {
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data:  {
          attempts: { increment: 1 },
          ...(verification.reason === 'LOCKED' ? { isUsed: true } : {}),
        },
      });
      await Promise.all([
        registerAuthThrottleFailure({ scope: 'customer-otp-verify:phone', scopeKey: normalizedPhone, maxFailures: OTP_VERIFY_MAX_FAILURES, windowMs: OTP_VERIFY_WINDOW_MS }),
        registerAuthThrottleFailure({ scope: 'customer-otp-verify:ip', scopeKey: ipScopeKey, maxFailures: OTP_VERIFY_MAX_FAILURES, windowMs: OTP_VERIFY_WINDOW_MS }),
      ]);
      if (verification.reason === 'LOCKED') {
        return badRequest(res, 'Too many wrong attempts. Please request a new OTP.');
      }
      const remaining = verification.remainingAttempts ?? (otpRecord.maxAttempts - otpRecord.attempts - 1);
      return badRequest(res, `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
    }

    // Mark OTP used
    await prisma.otpVerification.update({
      where: { id: otpRecord.id },
      data:  { isUsed: true },
    });

    // Find or create customer
    let customer = await prisma.customer.findUnique({ where: { phone: normalizedPhone } });
    const isNewCustomer = !customer;
    const signupAddress = normalizeSignupAddress(address);

    if (isNewCustomer && address && !isValidSignupAddress(signupAddress)) {
      return badRequest(res, 'Please enter a valid pickup address');
    }

    if (!customer) {
      const referralCode = await generateReferralCode();

      // Look up referrer if code provided
      let referrerId = null;
      if (referredByCode) {
        const referrer = await prisma.customer.findUnique({
          where: { referralCode: referredByCode.toUpperCase().trim() },
          select: { id: true, isActive: true },
        });
        if (!referrer) {
          return badRequest(res, 'Invalid referral code');
        }
        if (!referrer.isActive) {
          return badRequest(res, 'This referral code is no longer active');
        }
        referrerId = referrer.id;
      }

      customer = await prisma.customer.create({
        data: {
          phone:        normalizedPhone,
          name:         name || null,
          referralCode: referralCode || null,
          referredById: referrerId,
        },
      });

      if (signupAddress) {
        await prisma.address.create({
          data: {
            customerId: customer.id,
            ...signupAddress,
            isDefault: true,
          },
        });
      }

      if (referrerId) {
        await prisma.referral.create({
          data: {
            referrerId,
            referredId: customer.id,
            creditAwarded: 0,
            status: REFERRAL_STATUS.PENDING,
          },
        });
      }
    } else if (name && !customer.name) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data:  { name },
      });
    }

    await Promise.all([
      clearAuthThrottle({ scope: 'customer-otp-verify:phone', scopeKey: normalizedPhone }),
      clearAuthThrottle({ scope: 'customer-otp-verify:ip', scopeKey: ipScopeKey }),
    ]);

    const token  = generateCustomerToken(customer);
    const expiry = getTokenExpiry(process.env.JWT_CUSTOMER_EXPIRES_IN || '30d');

    await prisma.customerSession.create({
      data: {
        customerId: customer.id,
        token,
        deviceInfo: req.headers['user-agent'] || null,
        ipAddress:  req.ip || null,
        expiresAt:  expiry,
      },
    });
    await trimCustomerSessions(customer.id);

    await log({
      actorType:   'customer',
      actorId:     customer.id,
      actorName:   customer.name,
      action:      isNewCustomer ? 'CUSTOMER_REGISTERED' : 'CUSTOMER_LOGIN',
      resource:    'customer',
      resourceId:  customer.id,
      description: `${isNewCustomer ? 'New customer' : 'Customer login'}: ${normalizedPhone}`,
      ...getRequestMeta(req),
    });

    // Re-fetch to get latest wallet balance (in case referral credits were just applied)
    const latest = await prisma.customer.findUnique({
      where: { id: customer.id },
      select: { walletBalance: true, referralCode: true },
    });

    return success(res, {
      token,
      customer: {
        id:            customer.id,
        phone:         customer.phone,
        name:          customer.name,
        isNewUser:     isNewCustomer,
        referralCode:  latest?.referralCode,
        walletBalance: latest?.walletBalance || 0,
      },
    }, isNewCustomer ? 'Welcome to Hangers!' : 'Login successful');

  } catch (err) {
    console.error('verifyOtp error:', err);
    return error(res, 'Verification failed. Please try again.');
  }
};

// ── GET /api/v1/auth/me ───────────────────────────────────────────────────────
const getMeController = async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.customer.id },
      select: {
        id: true, phone: true, name: true, createdAt: true,
        referralCode: true, walletBalance: true, preferredLanguage: true, ironSubStatus: true,
        ironSubscription: {
          select: {
            id: true,
            applicationStatus: true,
            appliedAt: true,
            confirmedAt: true,
            updatedAt: true,
          },
        },
        addresses: {
          select: {
            id: true, label: true, addressLine1: true, addressLine2: true,
            landmark: true, city: true, pincode: true, isDefault: true,
          },
          orderBy: { isDefault: 'desc' },
        },
      },
    });
    if (!customer) return unauthorized(res, 'Account not found');
    const derivedStatus = customer.ironSubscription?.applicationStatus || customer.ironSubStatus || null;
    return success(res, {
      customer: {
        ...customer,
        ironSubStatus: derivedStatus,
      },
    });
  } catch (err) {
    return error(res, 'Failed to fetch profile');
  }
};

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────
const logoutController = async (req, res) => {
  try {
    const token = req.authToken || req.headers.authorization?.substring(7);
    if (token) await prisma.customerSession.deleteMany({ where: { token } });
    res.clearCookie('customer_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return success(res, {}, 'Logged out successfully');
  } catch (err) {
    return error(res, 'Logout failed');
  }
};

// ── PATCH /api/v1/auth/profile ────────────────────────────────────────────────
const updateProfileController = async (req, res) => {
  const { name, preferredLanguage } = req.body;
  const customerId = req.customer.id;
  const language = preferredLanguage !== undefined ? normalizeLanguage(preferredLanguage) : undefined;

  if (!name && preferredLanguage === undefined) return badRequest(res, 'Provide name or preferredLanguage to update');
  if (name && name.trim().length < 2) return badRequest(res, 'Name must be at least 2 characters');
  if (preferredLanguage !== undefined && !language) {
    return badRequest(res, 'preferredLanguage must be ENGLISH, HINDI, or MARATHI');
  }

  try {
    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(name  && { name:  name.trim() }),
        ...(language !== undefined && { preferredLanguage: language }),
      },
      select: { id: true, phone: true, name: true, preferredLanguage: true, updatedAt: true },
    });

    await log({
      actorType:   'customer',
      actorId:     customerId,
      actorName:   updated.name,
      action:      'PROFILE_UPDATED',
      resource:    'customer',
      resourceId:  customerId,
      description: `Profile updated: ${Object.keys({ name, preferredLanguage }).filter(k => req.body[k] !== undefined && req.body[k] !== '').join(', ')}`,
      ...getRequestMeta(req),
    });

    return success(res, { customer: updated }, 'Profile updated successfully');
  } catch (err) {
    return error(res, 'Failed to update profile');
  }
};

// ── POST /api/v1/auth/push-token ──────────────────────────────────────────────
const savePushTokenController = async (req, res) => {
  const { pushToken } = req.body;
  const customerId    = req.customer.id;

  if (!pushToken) return badRequest(res, 'Push token is required');

  try {
    await prisma.customer.update({
      where: { id: customerId },
      data:  { pushToken },
    });
    return success(res, {}, 'Push token saved');
  } catch (err) {
    return error(res, 'Failed to save push token');
  }
};

// ── PATCH /api/v1/auth/notifications ─────────────────────────────────────────
const updateNotificationPrefsController = async (req, res) => {
  const { notifWhatsApp, notifPush } = req.body;
  const customerId = req.customer.id;

  try {
    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(notifWhatsApp !== undefined && { notifWhatsApp: Boolean(notifWhatsApp) }),
        ...(notifPush     !== undefined && { notifPush:     Boolean(notifPush)     }),
      },
      select: { notifWhatsApp: true, notifPush: true },
    });
    return success(res, { prefs: updated }, 'Notification preferences saved');
  } catch (err) {
    return error(res, 'Failed to update notification preferences');
  }
};

module.exports = {
  sendOtpController,
  verifyOtpController,
  getMeController,
  logoutController,
  updateProfileController,
  savePushTokenController,
  updateNotificationPrefsController,
};
