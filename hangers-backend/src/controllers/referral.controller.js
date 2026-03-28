// ─────────────────────────────────────────────────────────────────────────────
// REFERRAL CONTROLLER
// GET /api/v1/customer/referral  — referral code + stats
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { success, error } = require('../utils/response');

// GET /api/v1/customer/referral
const getReferralInfo = async (req, res) => {
  const customerId = req.customer.id;

  try {
    const [customer, referrals] = await Promise.all([
      prisma.customer.findUnique({
        where:  { id: customerId },
        select: { referralCode: true, walletBalance: true },
      }),
      prisma.referral.findMany({
        where:   { referrerId: customerId },
        include: { referred: { select: { name: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

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
