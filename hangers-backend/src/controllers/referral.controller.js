// ─────────────────────────────────────────────────────────────────────────────
// REFERRAL CONTROLLER
// GET /api/v1/customer/referral  — referral code + stats
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { success, error } = require('../utils/response');

const generateReferralCode = async () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = 'HANG' + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const exists = await prisma.customer.findUnique({ where: { referralCode: code } });
    if (!exists) return code;
  }
  return null;
};

// GET /api/v1/customer/referral
const getReferralInfo = async (req, res) => {
  const customerId = req.customer.id;

  try {
    let customer = await prisma.customer.findUnique({
      where:  { id: customerId },
      select: { referralCode: true, walletBalance: true },
    });

    if (customer && !customer.referralCode) {
      const referralCode = await generateReferralCode();
      if (referralCode) {
        customer = await prisma.customer.update({
          where: { id: customerId },
          data: { referralCode },
          select: { referralCode: true, walletBalance: true },
        });
      }
    }

    const referrals = await prisma.referral.findMany({
      where:   { referrerId: customerId },
      include: { referred: { select: { name: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const totalEarned = referrals.reduce((s, r) => s + r.creditAwarded, 0);

    return success(res, {
      referralCode:   customer?.referralCode,
      walletBalance:  customer?.walletBalance || 0,
      referralCount:  referrals.length,
      totalEarned,
      referrals: referrals.map(r => ({
        name:         r.referred.name || 'Anonymous',
        joinedAt:     r.referred.createdAt,
        creditEarned: r.creditAwarded,
      })),
    });
  } catch (err) {
    return error(res, 'Failed to fetch referral info');
  }
};

module.exports = { getReferralInfo };
