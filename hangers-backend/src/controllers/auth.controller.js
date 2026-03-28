// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER AUTH CONTROLLER — Dev Mode returns OTP in response
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const {
  generateOtp, hashOtp, verifyOtpHash, sendOtp
}                                                  = require('../services/msg91.service');
const { generateCustomerToken, getTokenExpiry }    = require('../services/jwt.service');
const { log, getRequestMeta }                      = require('../services/activity.service');
const { success, badRequest, error, unauthorized } = require('../utils/response');

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

const REFERRAL_CREDIT = 100; // ₹100 per successful referral

const normalizePhone = (phone) => {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+91')) return cleaned.slice(3);
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned.slice(2);
  return cleaned;
};

const isDevMode = () => { const k = process.env.MSG91_AUTH_KEY || ''; return !k || k.length < 10; };

// ── POST /api/v1/auth/send-otp ────────────────────────────────────────────────
const sendOtpController = async (req, res) => {
  const { phone } = req.body;

  if (!phone) return badRequest(res, 'Phone number is required');
  if (!isValidPhone(phone)) return badRequest(res, 'Please enter a valid 10-digit Indian mobile number');

  const normalizedPhone = normalizePhone(phone);

  try {
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

    if (!isDevMode()) { await sendOtp(normalizedPhone, otp); } else { console.log(`\n🔐 DEV MODE OTP for ${normalizedPhone}: ${otp}\n`); }

    await log({
      actorType:   'customer',
      actorId:     existingCustomer?.id,
      action:      'OTP_SENT',
      resource:    'otp',
      description: `OTP sent to ${normalizedPhone}`,
      ...getRequestMeta(req),
    });

    const devMode = isDevMode();

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
    }, devMode ? 'OTP ready — use 123456' : 'OTP sent via WhatsApp');

  } catch (err) {
    console.error('sendOtp error:', err.message);
    return error(res, 'Failed to send OTP. Please try again.');
  }
};

// ── POST /api/v1/auth/verify-otp ──────────────────────────────────────────────
const verifyOtpController = async (req, res) => {
  const { phone, otp, name, email, referredByCode } = req.body;

  if (!phone) return badRequest(res, 'Phone number is required');
  if (!otp)   return badRequest(res, 'OTP is required');
  if (!isValidPhone(phone)) return badRequest(res, 'Invalid phone number');

  const normalizedPhone = normalizePhone(phone);

  try {
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
      return badRequest(res, 'OTP expired or not found. Please request a new one.');
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data:  { isUsed: true },
      });
      return badRequest(res, 'Too many wrong attempts. Please request a new OTP.');
    }

    const isValid = await verifyOtpHash(otp, otpRecord.otp);
    if (!isValid) {
      await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data:  { attempts: { increment: 1 } },
      });
      const remaining = otpRecord.maxAttempts - otpRecord.attempts - 1;
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

    if (!customer) {
      const referralCode = await generateReferralCode();

      // Look up referrer if code provided
      let referrerId = null;
      if (referredByCode) {
        const referrer = await prisma.customer.findUnique({
          where: { referralCode: referredByCode.toUpperCase().trim() },
        });
        if (referrer) referrerId = referrer.id;
      }

      customer = await prisma.customer.create({
        data: {
          phone:        normalizedPhone,
          name:         name || null,
          email:        email || null,
          referralCode: referralCode || null,
          referredById: referrerId,
        },
      });

      // Award referral credits to both parties
      if (referrerId) {
        await prisma.$transaction([
          // Credit referrer
          prisma.customer.update({
            where: { id: referrerId },
            data:  { walletBalance: { increment: REFERRAL_CREDIT } },
          }),
          prisma.walletTransaction.create({
            data: { customerId: referrerId, amount: REFERRAL_CREDIT, type: 'CREDIT', reason: 'REFERRAL' },
          }),
          // Credit new customer
          prisma.customer.update({
            where: { id: customer.id },
            data:  { walletBalance: { increment: REFERRAL_CREDIT } },
          }),
          prisma.walletTransaction.create({
            data: { customerId: customer.id, amount: REFERRAL_CREDIT, type: 'CREDIT', reason: 'REFERRAL' },
          }),
          // Record referral
          prisma.referral.create({
            data: { referrerId, referredId: customer.id, creditAwarded: REFERRAL_CREDIT },
          }),
        ]);
      }
    } else if (name && !customer.name) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data:  { name, email: email || customer.email },
      });
    }

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
        email:         customer.email,
        isNewUser:     isNewCustomer,
        referralCode:  latest?.referralCode,
        walletBalance: latest?.walletBalance || 0,
      },
    }, isNewCustomer ? 'Welcome to Hangers! 🧺' : 'Login successful');

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
        id: true, phone: true, name: true, email: true, createdAt: true,
        referralCode: true, walletBalance: true,
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
    return success(res, { customer });
  } catch (err) {
    return error(res, 'Failed to fetch profile');
  }
};

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────
const logoutController = async (req, res) => {
  try {
    const token = req.headers.authorization?.substring(7);
    if (token) await prisma.customerSession.deleteMany({ where: { token } });
    return success(res, {}, 'Logged out successfully');
  } catch (err) {
    return error(res, 'Logout failed');
  }
};

// ── PATCH /api/v1/auth/profile ────────────────────────────────────────────────
const updateProfileController = async (req, res) => {
  const { name, email } = req.body;
  const customerId = req.customer.id;

  if (!name && !email) return badRequest(res, 'Provide name or email to update');
  if (name && name.trim().length < 2) return badRequest(res, 'Name must be at least 2 characters');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest(res, 'Invalid email address');

  try {
    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(name  && { name:  name.trim() }),
        ...(email && { email: email.toLowerCase().trim() }),
      },
      select: { id: true, phone: true, name: true, email: true, updatedAt: true },
    });

    await log({
      actorType:   'customer',
      actorId:     customerId,
      actorName:   updated.name,
      action:      'PROFILE_UPDATED',
      resource:    'customer',
      resourceId:  customerId,
      description: `Profile updated: ${Object.keys({ name, email }).filter(k => req.body[k]).join(', ')}`,
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
