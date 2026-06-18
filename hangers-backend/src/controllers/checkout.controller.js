// ── ADD THESE TO phaseA.controller.js (or create checkout.controller.js) ────

const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');
const { checkoutCouponSchema, checkoutLoyaltySchema } = require('../validation/finance.schemas');
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

// POST /api/v1/checkout/validate-coupon
const validateCoupon = async (req, res) => {
  try {
    const parsed = checkoutCouponSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid coupon validation payload');
    const { code, orderTotal } = parsed.data;
    const normalizedCode = code.toUpperCase();
    const parsedOrderTotal = orderTotal;

    const coupon = await prisma.coupon.findUnique({ where: { code: normalizedCode } });
    if (!coupon)          return badRequest(res, 'Invalid coupon code');
    if (!coupon.isActive) return badRequest(res, 'This coupon is no longer active');

    const now = new Date();
    if (coupon.validFrom > now)                          return badRequest(res, 'Coupon not yet valid');
    if (coupon.validUntil && coupon.validUntil < now)    return badRequest(res, 'Coupon has expired');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return badRequest(res, 'Coupon usage limit reached');
    if (parsedOrderTotal < coupon.minOrderValue)         return badRequest(res, `Minimum order value ₹${coupon.minOrderValue} required`);

    let discount = 0;
    if (coupon.type === 'PERCENTAGE' || coupon.type === 'PERCENT') {
      discount = (parsedOrderTotal * coupon.value) / 100;
      if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    } else {
      discount = coupon.value;
    }
    discount = Math.min(discount, parsedOrderTotal);

    return success(res, {
      coupon:   { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value },
      discount: Math.round(discount),
    }, `Coupon applied — ₹${Math.round(discount)} off`);
  } catch (e) {
    return error(res, 'Failed to validate coupon');
  }
};

// POST /api/v1/checkout/validate-loyalty
const validateLoyalty = async (req, res) => {
  try {
    const parsed = checkoutLoyaltySchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid loyalty validation payload');
    const { customerId, pointsToRedeem, orderTotal } = parsed.data;
    const parsedPoints = pointsToRedeem;
    const parsedOrderTotal = orderTotal;

    const [customer, settings] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId }, select: { loyaltyPoints: true } }),
      prisma.setting.findMany({ where: { key: { in: ['loyalty_rupee_per_point', 'loyalty_min_redeem_points'] } } })
    ]);

    if (!customer) return badRequest(res, 'Customer not found');

    const settingsMap = {};
    settings.forEach(s => { settingsMap[s.key] = parseFloat(s.value); });

    const rupeePerPoint   = settingsMap['loyalty_rupee_per_point']   || 0.1;
    const minRedeemPoints = settingsMap['loyalty_min_redeem_points'] || 100;

    if (customer.loyaltyPoints < minRedeemPoints) return badRequest(res, `Minimum ${minRedeemPoints} points required to redeem`);
    if (parsedPoints > customer.loyaltyPoints)    return badRequest(res, `Only ${customer.loyaltyPoints} points available`);

    const discount = Math.min(Math.floor(parsedPoints * rupeePerPoint), parsedOrderTotal);

    return success(res, {
      pointsToRedeem: parsedPoints,
      discount,
      remainingPoints: customer.loyaltyPoints - parsedPoints,
    }, `${parsedPoints} points = ₹${discount} discount`);
  } catch (e) {
    return error(res, 'Failed to validate loyalty redemption');
  }
};

// Called after order is DELIVERED — earn loyalty points
const earnLoyaltyPoints = async (orderId, customerId) => {
  try {
    const [order, settings] = await Promise.all([
      prisma.order.findFirst({ where: { id: orderId, ...ORDER_ONLY_WHERE }, select: { totalAmount: true } }),
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
    console.log(`${points} loyalty points earned for customer ${customerId}`);
  } catch (e) {
    console.error('earnLoyaltyPoints error:', e);
  }
};

module.exports = { validateCoupon, validateLoyalty, earnLoyaltyPoints };
