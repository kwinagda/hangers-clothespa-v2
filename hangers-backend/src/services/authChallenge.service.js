const prisma = require('../config/database');
const { hashOtp, verifyOtpHash } = require('./msg91.service');
const { createHash, randomBytes } = require('crypto');

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
  WEBSITE_PICKUP_REQUEST: 'WEBSITE_PICKUP_REQUEST',
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

const findActiveChallenge = async ({ subjectType, subjectKey, purpose, tx = prisma }) => {
  const challenge = await tx.authChallenge.findFirst({
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
    await tx.authChallenge.update({
      where: { id: challenge.id },
      data: { status: AUTH_CHALLENGE_STATUS.EXPIRED },
    });
    return null;
  }

  return challenge;
};

const verifyAuthChallenge = async ({ subjectType, subjectKey, purpose, code, tx = prisma }) => {
  const challenge = await findActiveChallenge({ subjectType, subjectKey, purpose, tx });
  if (!challenge) {
    return { ok: false, reason: 'NOT_FOUND', message: 'Challenge expired or not found' };
  }

  const isValid = await verifyOtpHash(code, challenge.hashedCode);
  if (!isValid) {
    const nextAttempts = challenge.attemptCount + 1;
    const locked = nextAttempts >= challenge.maxAttempts;
    await tx.authChallenge.update({
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

  const verified = await tx.authChallenge.update({
    where: { id: challenge.id },
    data: {
      status: AUTH_CHALLENGE_STATUS.VERIFIED,
      consumedAt: new Date(),
    },
  });

  return { ok: true, challenge: verified };
};

const hashVerificationToken = (token) => createHash('sha256').update(token).digest('hex');

const verifyAuthChallengeAndIssueToken = async ({
  subjectType,
  subjectKey,
  purpose,
  code,
  tokenTtlMs = 10 * 60 * 1000,
}) => prisma.$transaction(async (tx) => {
  const verification = await verifyAuthChallenge({ subjectType, subjectKey, purpose, code, tx });
  if (!verification.ok) return verification;

  const verificationToken = randomBytes(32).toString('base64url');
  const tokenExpiresAt = new Date(Date.now() + tokenTtlMs);
  const challenge = await tx.authChallenge.update({
    where: { id: verification.challenge.id },
    data: {
      verificationTokenHash: hashVerificationToken(verificationToken),
      verificationTokenExpiresAt: tokenExpiresAt,
      verificationTokenConsumedAt: null,
    },
  });

  return { ok: true, challenge, verificationToken, tokenExpiresAt };
});

const consumeAuthChallengeToken = async ({ subjectType, subjectKey, purpose, token, tx = prisma }) => {
  const tokenHash = hashVerificationToken(token);
  const challenge = await tx.authChallenge.findUnique({ where: { verificationTokenHash: tokenHash } });
  const now = new Date();
  if (
    !challenge
    || challenge.subjectType !== subjectType
    || challenge.subjectKey !== subjectKey
    || challenge.purpose !== purpose
    || challenge.status !== AUTH_CHALLENGE_STATUS.VERIFIED
    || challenge.verificationTokenConsumedAt
    || !challenge.verificationTokenExpiresAt
    || challenge.verificationTokenExpiresAt <= now
  ) {
    return { ok: false, reason: 'INVALID_TOKEN', message: 'Mobile verification has expired' };
  }

  const consumed = await tx.authChallenge.updateMany({
    where: {
      id: challenge.id,
      verificationTokenHash: tokenHash,
      verificationTokenConsumedAt: null,
      verificationTokenExpiresAt: { gt: now },
    },
    data: { verificationTokenConsumedAt: now },
  });
  if (consumed.count !== 1) {
    return { ok: false, reason: 'TOKEN_ALREADY_USED', message: 'Mobile verification has already been used' };
  }

  return { ok: true, challenge: { ...challenge, verificationTokenConsumedAt: now } };
};

module.exports = {
  AUTH_CHALLENGE_PURPOSE,
  AUTH_CHALLENGE_STATUS,
  createAuthChallenge,
  expirePreviousChallenges,
  findActiveChallenge,
  verifyAuthChallenge,
  verifyAuthChallengeAndIssueToken,
  consumeAuthChallengeToken,
};
