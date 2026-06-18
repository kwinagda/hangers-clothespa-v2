const prisma = require('../config/database');
const { hashOtp, verifyOtpHash } = require('./msg91.service');

const AUTH_CHALLENGE_STATUS = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  EXPIRED: 'EXPIRED',
  LOCKED: 'LOCKED',
  CANCELLED: 'CANCELLED',
};

const AUTH_CHALLENGE_PURPOSE = {
  CUSTOMER_LOGIN: 'CUSTOMER_LOGIN',
  DELIVERY_CONFIRMATION: 'DELIVERY_CONFIRMATION',
};

const expirePreviousChallenges = async ({ subjectType, subjectKey, purpose }) => {
  await prisma.authChallenge.updateMany({
    where: {
      subjectType,
      subjectKey,
      purpose,
      status: AUTH_CHALLENGE_STATUS.PENDING,
    },
    data: { status: AUTH_CHALLENGE_STATUS.CANCELLED },
  });
};

const createAuthChallenge = async ({
  subjectType,
  subjectKey,
  purpose,
  code,
  ttlMs,
  maxAttempts = 5,
  cooldownMs = 0,
  metadata = null,
}) => {
  if (cooldownMs > 0) {
    const blocked = await prisma.authChallenge.findFirst({
      where: {
        subjectType,
        subjectKey,
        purpose,
        status: AUTH_CHALLENGE_STATUS.PENDING,
        cooldownUntil: { gt: new Date() },
      },
    });
    if (blocked) {
      const secondsLeft = Math.ceil((new Date(blocked.cooldownUntil) - Date.now()) / 1000);
      const err = new Error('Resend cooldown active');
      err.code = 'OTP_COOLDOWN';
      err.secondsLeft = secondsLeft;
      throw err;
    }
  }

  await expirePreviousChallenges({ subjectType, subjectKey, purpose });
  const hashedCode = await hashOtp(code);
  const now = Date.now();

  return prisma.authChallenge.create({
    data: {
      subjectType,
      subjectKey,
      purpose,
      hashedCode,
      maxAttempts,
      expiresAt: new Date(now + ttlMs),
      cooldownUntil: cooldownMs > 0 ? new Date(now + cooldownMs) : null,
      lastSentAt: new Date(now),
      metadata,
    },
  });
};

const findActiveChallenge = async ({ subjectType, subjectKey, purpose }) => {
  const challenge = await prisma.authChallenge.findFirst({
    where: {
      subjectType,
      subjectKey,
      purpose,
      status: AUTH_CHALLENGE_STATUS.PENDING,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge) return null;

  if (challenge.expiresAt <= new Date()) {
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { status: AUTH_CHALLENGE_STATUS.EXPIRED },
    });
    return null;
  }

  return challenge;
};

const verifyAuthChallenge = async ({ subjectType, subjectKey, purpose, code }) => {
  const challenge = await findActiveChallenge({ subjectType, subjectKey, purpose });
  if (!challenge) {
    return { ok: false, reason: 'NOT_FOUND', message: 'Challenge expired or not found' };
  }

  const isValid = await verifyOtpHash(code, challenge.hashedCode);
  if (!isValid) {
    const nextAttempts = challenge.attemptCount + 1;
    const locked = nextAttempts >= challenge.maxAttempts;
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: {
        attemptCount: nextAttempts,
        status: locked ? AUTH_CHALLENGE_STATUS.LOCKED : AUTH_CHALLENGE_STATUS.PENDING,
      },
    });
    return {
      ok: false,
      reason: locked ? 'LOCKED' : 'INVALID',
      message: locked ? 'Too many wrong attempts' : 'Incorrect verification code',
      remainingAttempts: Math.max(0, challenge.maxAttempts - nextAttempts),
    };
  }

  const verified = await prisma.authChallenge.update({
    where: { id: challenge.id },
    data: {
      status: AUTH_CHALLENGE_STATUS.VERIFIED,
      consumedAt: new Date(),
    },
  });

  return { ok: true, challenge: verified };
};

module.exports = {
  AUTH_CHALLENGE_PURPOSE,
  AUTH_CHALLENGE_STATUS,
  createAuthChallenge,
  expirePreviousChallenges,
  findActiveChallenge,
  verifyAuthChallenge,
};
