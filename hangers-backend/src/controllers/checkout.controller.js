// ── ADD THESE TO phaseA.controller.js (or create checkout.controller.js) ────

const prisma = require('../config/database');
const ok  = (res, data, msg = 'Success') => res.json({ success: true, message: msg, data });
const bad = (res, msg) => res.status(400).json({ success: false, message: msg });
const err = (res, e)   => res.status(500).json({ success: false, message: e.message });

// POST /api/v1/checkout/validate-coupon
const validateCoupon = async (req, res) => {
  try {
    const { code, orderTotal, customerId } = req.body;
    if (!code) return bad(res, 'Coupon code required');

    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon)          return bad(res, 'Invalid coupon code');
    if (!coupon.isActive) return bad(res, 'This coupon is no longer active');

    const now = new Date();
    if (coupon.validFrom > now)                          return bad(res, 'Coupon not yet valid');
    if (coupon.validUntil && coupon.validUntil < now)    return bad(res, 'Coupon has expired');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return bad(res, 'Coupon usage limit reached');
    if (orderTotal < coupon.minOrderValue)               return bad(res, `Minimum order value ₹${coupon.minOrderValue} required`);

    let discount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discount = (orderTotal * coupon.value) / 100;
      if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    } else {
      discount = coupon.value;
    }
    discount = Math.min(discount, orderTotal);

    ok(res, {
      coupon:   { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value },
      discount: Math.round(discount),
    }, `Coupon applied — ₹${Math.round(discount)} off`);
  } catch (e) { err(res, e); }
};

// POST /api/v1/checkout/validate-loyalty
const validateLoyalty = async (req, res) => {
  try {
    const { customerId, pointsToRedeem, orderTotal } = req.body;
    if (!customerId)     return bad(res, 'Customer required');
    if (!pointsToRedeem) return bad(res, 'Points to redeem required');

    const [customer, settings] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId }, select: { loyaltyPoints: true } }),
      prisma.setting.findMany({ where: { key: { in: ['loyalty_rupee_per_point', 'loyalty_min_redeem_points'] } } })
    ]);

    if (!customer) return bad(res, 'Customer not found');

    const settingsMap = {};
    settings.forEach(s => { settingsMap[s.key] = parseFloat(s.value); });

    const rupeePerPoint   = settingsMap['loyalty_rupee_per_point']   || 0.1;
    const minRedeemPoints = settingsMap['loyalty_min_redeem_points'] || 100;

    if (customer.loyaltyPoints < minRedeemPoints) return bad(res, `Minimum ${minRedeemPoints} points required to redeem`);
    if (pointsToRedeem > customer.loyaltyPoints)  return bad(res, `Only ${customer.loyaltyPoints} points available`);

    const discount = Math.min(Math.floor(pointsToRedeem * rupeePerPoint), orderTotal);

    ok(res, {
      pointsToRedeem,
      discount,
      remainingPoints: customer.loyaltyPoints - pointsToRedeem,
    }, `${pointsToRedeem} points = ₹${discount} discount`);
  } catch (e) { err(res, e); }
};

// Called after order is DELIVERED — earn loyalty points
const earnLoyaltyPoints = async (orderId, customerId) => {
  try {
    const [order, settings] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId }, select: { totalAmount: true } }),
      prisma.setting.findMany({ where: { key: 'loyalty_points_per_rupee' } })
    ]);
    if (!order) return;

    const pointsPerRupee = parseFloat(settings[0]?.value || '1');
    const points = Math.floor(order.totalAmount * pointsPerRupee);
    if (points <= 0) return;

    await Promise.all([
      prisma.customer.update({
        where: { id: customerId },
        data:  { loyaltyPoints: { increment: points } }
      }),
      prisma.loyaltyTransaction.create({
        data: { customerId, type: 'EARN', points, orderId, note: `Earned on delivery of order` }
      })
    ]);
    console.log(`✓ ${points} loyalty points earned for customer ${customerId}`);
  } catch (e) {
    console.error('earnLoyaltyPoints error:', e);
  }
};

module.exports = { validateCoupon, validateLoyalty, earnLoyaltyPoints };
