// ─────────────────────────────────────────────────────────────────────────────
// MSG91 OTP SERVICE — OTPs sent via MSG91 API using AUTH_KEY
// ─────────────────────────────────────────────────────────────────────────────

const axios  = require('axios');
const bcrypt = require('bcryptjs');
const { maskPhone, providerErrorSummary } = require('../utils/redact');

const isDevMode = () => {
  const k = process.env.MSG91_AUTH_KEY || '';
  return process.env.DEV_MODE === 'true'
    || process.env.WA_DELIVERY_OTP_DEV === 'true'
    || !k
    || k.length < 10;
};

// ── OTP generation & hashing ──────────────────────────────────────────────────
const generateOtp = () =>
  isDevMode()
    ? '123456'
    : Math.floor(100000 + Math.random() * 900000).toString();

const generateOtp4 = () =>
  isDevMode()
    ? '1234'
    : Math.floor(1000 + Math.random() * 9000).toString();

const hashOtp = async (otp) => bcrypt.hash(otp, 10);

const verifyOtpHash = async (otp, hash) => bcrypt.compare(otp, hash);

// ── Send OTP via MSG91 ────────────────────────────────────────────────────────
const sendOtp = async (phone, otp) => {
  if (isDevMode()) {
    console.log(`[MSG91 DEV] OTP generated for ${maskPhone(phone)} (redacted)`);
    return { success: true, devMode: true };
  }

  const authKey    = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID || 'hangers_otp';
  const senderId   = process.env.MSG91_SENDER_ID   || 'HNGRS';

  // Format phone — MSG91 needs 91XXXXXXXXXX format
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  const formatted = cleaned.startsWith('91') && cleaned.length === 12
    ? cleaned
    : cleaned.length === 10 ? `91${cleaned}` : cleaned;

  try {
    // MSG91 Send OTP API
    const response = await axios.post(
      'https://api.msg91.com/api/v5/otp',
      {
        template_id: templateId,
        mobile:      formatted,
        authkey:     authKey,
        otp:         otp,
        sender:      senderId,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    console.log('[MSG91] OTP sent');

    if (response.data?.type === 'error') {
      throw new Error(`MSG91 error: ${JSON.stringify(response.data)}`);
    }

    return { success: true, data: response.data };
  } catch (error) {
    if (error.response) {
      console.error('[MSG91] Error response:', providerErrorSummary(error));
      throw new Error(`MSG91 error: ${JSON.stringify(error.response.data)}`);
    }
    console.error('[MSG91] Network error:', error.message);
    throw new Error(`Could not reach MSG91: ${error.message}`);
  }
};

const resendOtp = async (phone, otp) => sendOtp(phone, otp);

module.exports = {
  generateOtp,
  generateOtp4,
  hashOtp,
  verifyOtpHash,
  sendOtp,
  resendOtp,
  isDevMode,
};
