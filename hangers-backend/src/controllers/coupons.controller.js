const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { couponCreateSchema, couponValidateSchema } = require('../validation/coupons.schemas');

const getCoupons = async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: coupons });
  } catch (err) {
    return error(res, 'Failed to fetch coupons');
  }
};

const createCoupon = async (req, res) => {
  try {
    const parsed = couponCreateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid coupon payload');
    const { code, type, value, minOrderValue, maxDiscount, usageLimit, validUntil } = parsed.data;
    const normalizedCode = code.toUpperCase();
    if (validUntil && Number.isNaN(new Date(validUntil).getTime())) return badRequest(res, 'validUntil must be a valid date');
    const coupon = await prisma.coupon.create({
      data: {
        code: normalizedCode,
        type,
        value,
        minOrderValue,
        maxDiscount,
        usageLimit,
        validUntil: validUntil ? new Date(validUntil) : null
      }
    });
    return success(res, coupon);
  } catch (err) {
    return error(res, 'Failed to create coupon');
  }
};

const validateCoupon = async (req, res) => {
  try {
    const parsed = couponValidateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid coupon validation payload');
    const { code, orderValue } = parsed.data;
    const normalizedCode = code.toUpperCase();
    const coupon = await prisma.coupon.findUnique({ where: { code: normalizedCode } });

    if (!coupon || !coupon.isActive) return badRequest(res, 'Invalid coupon code');
    if (coupon.validUntil && new Date() > coupon.validUntil) return badRequest(res, 'Coupon expired');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return badRequest(res, 'Coupon usage limit reached');
    if (orderValue < coupon.minOrderValue) return badRequest(res, `Minimum order value ₹${coupon.minOrderValue} required`);

    let discount = coupon.type === 'PERCENT'
      ? (orderValue * coupon.value) / 100
      : coupon.value;

    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);

    return success(res, { coupon, discount });
  } catch (err) {
    return error(res, 'Failed to validate coupon');
  }
};

const toggleCoupon = async (req, res) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) return notFound(res, 'Coupon not found');
    const updated = await prisma.coupon.update({
      where: { id: req.params.id },
      data:  { isActive: !coupon.isActive }
    });
    return success(res, updated);
  } catch (err) {
    return error(res, 'Failed to update coupon');
  }
};

module.exports = { getCoupons, createCoupon, validateCoupon, toggleCoupon };
