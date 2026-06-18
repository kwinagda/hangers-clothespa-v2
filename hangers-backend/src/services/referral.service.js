const prisma = require('../config/database');

const REFERRAL_SETTING_DEFAULTS = {
  referral_reward_percent: 20,
  referral_reward_cap: 200,
  referral_min_order_amount: 300,
  referral_program_enabled: 1,
};

const REFERRAL_STATUS = {
  PENDING: 'PENDING',
  REWARDED: 'REWARDED',
  REJECTED: 'REJECTED',
};

const REFERRAL_REASON = {
  REFERRER: 'REFERRAL_REWARD_REFERRER',
  REFERRED: 'REFERRAL_REWARD_REFERRED',
};

const normalizeSettingValue = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getReferralProgramSettings = async (tx = prisma) => {
  const keys = Object.keys(REFERRAL_SETTING_DEFAULTS);
  const settings = await tx.setting.findMany({ where: { key: { in: keys } } });
  const map = { ...REFERRAL_SETTING_DEFAULTS };
  settings.forEach((setting) => {
    map[setting.key] = normalizeSettingValue(setting.value, REFERRAL_SETTING_DEFAULTS[setting.key]);
  });
  return {
    enabled: map.referral_program_enabled > 0,
    rewardPercent: Math.max(0, map.referral_reward_percent),
    rewardCap: Math.max(0, map.referral_reward_cap),
    minOrderAmount: Math.max(0, map.referral_min_order_amount),
  };
};

const calculateReferralReward = (orderTotal, settings) => {
  const subtotal = Number(orderTotal || 0);
  if (subtotal <= 0 || settings.rewardPercent <= 0) return 0;
  const rawReward = (subtotal * settings.rewardPercent) / 100;
  const cappedReward = settings.rewardCap > 0 ? Math.min(rawReward, settings.rewardCap) : rawReward;
  return Number(cappedReward.toFixed(2));
};

const processReferralQualification = async (orderId) => {
  if (!orderId) return { processed: false, reason: 'missing_order_id' };

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        customerId: true,
        totalAmount: true,
        paidAmount: true,
        writeOffAmount: true,
        paymentStatus: true,
        status: true,
        createdAt: true,
      },
    });

    if (!order?.customerId) return { processed: false, reason: 'order_missing_customer' };
    if (order.status !== 'DELIVERED' || order.paymentStatus !== 'PAID') {
      return { processed: false, reason: 'order_not_qualifying' };
    }

    const referral = await tx.referral.findUnique({
      where: { referredId: order.customerId },
      include: {
        referrer: { select: { id: true, isActive: true } },
      },
    });

    if (!referral || referral.status !== REFERRAL_STATUS.PENDING) {
      return { processed: false, reason: 'no_pending_referral' };
    }
    if (!referral.referrer?.isActive) {
      await tx.referral.update({
        where: { id: referral.id },
        data: { status: REFERRAL_STATUS.REJECTED },
      });
      return { processed: false, reason: 'inactive_referrer' };
    }

    const settings = await getReferralProgramSettings(tx);
    if (!settings.enabled) return { processed: false, reason: 'program_disabled' };
    if (Number(order.totalAmount || 0) < settings.minOrderAmount) {
      return { processed: false, reason: 'below_min_order_amount' };
    }

    const firstQualifyingOrder = await tx.order.findFirst({
      where: {
        customerId: order.customerId,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        totalAmount: { gte: settings.minOrderAmount },
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });

    if (!firstQualifyingOrder || firstQualifyingOrder.id !== order.id) {
      return { processed: false, reason: 'not_first_qualifying_order' };
    }

    const rewardAmount = calculateReferralReward(order.totalAmount, settings);
    if (rewardAmount <= 0) return { processed: false, reason: 'zero_reward' };

    const rewardTimestamp = new Date();

    await tx.customer.update({
      where: { id: referral.referrerId },
      data: { walletBalance: { increment: rewardAmount } },
    });
    await tx.walletTransaction.create({
      data: {
        customerId: referral.referrerId,
        amount: rewardAmount,
        type: 'CREDIT',
        reason: REFERRAL_REASON.REFERRER,
        orderId: order.id,
      },
    });

    await tx.customer.update({
      where: { id: referral.referredId },
      data: { walletBalance: { increment: rewardAmount } },
    });
    await tx.walletTransaction.create({
      data: {
        customerId: referral.referredId,
        amount: rewardAmount,
        type: 'CREDIT',
        reason: REFERRAL_REASON.REFERRED,
        orderId: order.id,
      },
    });

    await tx.referral.update({
      where: { id: referral.id },
      data: {
        creditAwarded: rewardAmount,
        rewardPercent: settings.rewardPercent,
        status: REFERRAL_STATUS.REWARDED,
        qualifiedAt: rewardTimestamp,
        rewardedAt: rewardTimestamp,
        qualifyingOrderId: order.id,
      },
    });

    return { processed: true, rewardAmount, referralId: referral.id };
  });
};

module.exports = {
  REFERRAL_REASON,
  REFERRAL_SETTING_DEFAULTS,
  REFERRAL_STATUS,
  calculateReferralReward,
  getReferralProgramSettings,
  processReferralQualification,
};
