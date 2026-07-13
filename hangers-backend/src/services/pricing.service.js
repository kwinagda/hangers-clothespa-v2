const { normalizeOrderItem, roundMoney } = require('../utils/line-pricing');

class CommercialRuleError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.name = 'CommercialRuleError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const hasPermission = (staff, permission) => {
  const permissions = staff?.effectivePermissions || [];
  return permissions.includes('*') || permissions.includes(permission);
};

const requireAdjustmentAuthority = (staff, permission, message) => {
  if (!hasPermission(staff, permission)) {
    throw new CommercialRuleError('COMMERCIAL_APPROVAL_REQUIRED', message, 403, { permission });
  }
};

const requireReason = (reason, message = 'A commercial adjustment reason is required') => {
  if (!reason || String(reason).trim().length < 3) {
    throw new CommercialRuleError('ADJUSTMENT_REASON_REQUIRED', message);
  }
  return String(reason).trim();
};

const calculateUpchargeAmount = (upcharge, unitPrice, quantity) => {
  const value = Number(upcharge.value || 0);
  if (String(upcharge.type || '').toUpperCase() === 'PERCENT') {
    return roundMoney((unitPrice * quantity * value) / 100);
  }
  return roundMoney(value * quantity);
};

const validateCoupon = async (tx, code, eligibleAmount) => {
  if (!code) return null;
  const normalizedCode = String(code).trim().toUpperCase();
  const coupon = await tx.coupon.findUnique({ where: { code: normalizedCode } });
  if (!coupon || !coupon.isActive) {
    throw new CommercialRuleError('INVALID_COUPON', 'Invalid or inactive coupon code');
  }

  const now = new Date();
  if (coupon.validFrom > now) throw new CommercialRuleError('COUPON_NOT_STARTED', 'Coupon is not yet valid');
  if (coupon.validUntil && coupon.validUntil < now) throw new CommercialRuleError('COUPON_EXPIRED', 'Coupon has expired');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new CommercialRuleError('COUPON_EXHAUSTED', 'Coupon usage limit has been reached');
  }
  if (eligibleAmount < Number(coupon.minOrderValue || 0)) {
    throw new CommercialRuleError(
      'COUPON_MINIMUM_NOT_MET',
      `Minimum order value Rs ${Number(coupon.minOrderValue || 0).toFixed(2)} is required`
    );
  }

  const rawDiscount = ['PERCENT', 'PERCENTAGE'].includes(String(coupon.type || '').toUpperCase())
    ? (eligibleAmount * Number(coupon.value || 0)) / 100
    : Number(coupon.value || 0);
  const cappedDiscount = coupon.maxDiscount === null || coupon.maxDiscount === undefined
    ? rawDiscount
    : Math.min(rawDiscount, Number(coupon.maxDiscount));

  return {
    coupon,
    discount: roundMoney(Math.min(eligibleAmount, Math.max(0, cappedDiscount))),
  };
};

const validateLoyalty = async (tx, customerId, requestedPoints, eligibleAmount) => {
  if (!requestedPoints) return null;
  const [customer, rule] = await Promise.all([
    tx.customer.findUnique({ where: { id: customerId }, select: { loyaltyPoints: true } }),
    tx.loyaltyRule.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } }),
  ]);
  if (!customer) throw new CommercialRuleError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
  if (!rule) throw new CommercialRuleError('LOYALTY_NOT_CONFIGURED', 'Loyalty redemption is not configured');
  if (requestedPoints < rule.minRedeemPoints) {
    throw new CommercialRuleError('LOYALTY_MINIMUM_NOT_MET', `Minimum ${rule.minRedeemPoints} points are required`);
  }
  if (requestedPoints > customer.loyaltyPoints) {
    throw new CommercialRuleError('LOYALTY_INSUFFICIENT', `Only ${customer.loyaltyPoints} loyalty points are available`);
  }

  return {
    points: requestedPoints,
    discount: roundMoney(Math.min(eligibleAmount, requestedPoints * Number(rule.redeemPerPoint || 0))),
  };
};

const resolveOrderPricing = async (tx, {
  items,
  customerId,
  couponCode,
  loyaltyPointsRedeemed = 0,
  discount = 0,
  commercialReason,
  staff,
}) => {
  const serviceIds = [...new Set(items.map((item) => item.serviceId).filter(Boolean))];
  const upchargeIds = [...new Set(items.flatMap((item) => item.upchargeIds || []))];
  const [services, upcharges] = await Promise.all([
    serviceIds.length
      ? tx.service.findMany({ where: { id: { in: serviceIds }, isActive: true } })
      : [],
    upchargeIds.length
      ? tx.upcharge.findMany({ where: { id: { in: upchargeIds }, isActive: true } })
      : [],
  ]);
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const upchargeById = new Map(upcharges.map((upcharge) => [upcharge.id, upcharge]));

  const missingServices = serviceIds.filter((id) => !serviceById.has(id));
  if (missingServices.length) {
    throw new CommercialRuleError('INVALID_SERVICE', 'One or more services are inactive or no longer exist', 400, { serviceIds: missingServices });
  }
  const missingUpcharges = upchargeIds.filter((id) => !upchargeById.has(id));
  if (missingUpcharges.length) {
    throw new CommercialRuleError('INVALID_UPCHARGE', 'One or more upcharges are inactive or no longer exist', 400, { upchargeIds: missingUpcharges });
  }

  const adjustmentReason = commercialReason ? String(commercialReason).trim() : null;
  const overrideDetails = [];
  const pricedItems = items.map((item, index) => {
    const service = item.serviceId ? serviceById.get(item.serviceId) : null;
    if (service?.category === 'DAILY_IRON') {
      throw new CommercialRuleError('DAILY_IRON_ORDER_FORBIDDEN', 'Daily Iron usage must use the Daily Iron billing flow');
    }

    const isCustom = !service;
    const catalogPrice = service ? Number(service.basePrice) : null;
    const requestedPrice = item.unitPrice === undefined
      ? catalogPrice
      : Number(item.unitPrice);
    if (!(requestedPrice >= 0)) {
      throw new CommercialRuleError('INVALID_PRICE', `Item ${index + 1} has an invalid unit price`);
    }

    const isPriceOverride = isCustom || Math.abs(requestedPrice - catalogPrice) >= 0.005;
    const lineReason = item.priceOverrideReason || adjustmentReason;
    if (isPriceOverride) {
      requireAdjustmentAuthority(staff, 'pricing.override', 'Price overrides and custom items require pricing.override authority');
      requireReason(lineReason, 'A reason is required for each custom item or price override');
      overrideDetails.push({
        line: index + 1,
        serviceId: service?.id || null,
        serviceName: service?.name || item.serviceName,
        catalogPrice,
        appliedPrice: requestedPrice,
        reason: String(lineReason).trim(),
        kind: isCustom ? 'CUSTOM_ITEM' : 'PRICE_OVERRIDE',
      });
    }

    const selectedUpcharges = (item.upchargeIds || []).map((id) => {
      const upcharge = upchargeById.get(id);
      return {
        id: upcharge.id,
        name: upcharge.name,
        type: upcharge.type,
        value: Number(upcharge.value),
        amount: calculateUpchargeAmount(upcharge, requestedPrice, item.quantity),
      };
    });
    const normalized = normalizeOrderItem({
      ...item,
      serviceId: service?.id || null,
      serviceName: service?.name || item.serviceName,
      garmentType: service?.category || item.garmentType,
      baseUnitPrice: catalogPrice ?? requestedPrice,
      unitPrice: requestedPrice,
      upcharges: selectedUpcharges,
    }, { allowUpcharges: true });

    if (normalized.lineDiscountAmount > 0) {
      requireAdjustmentAuthority(staff, 'pricing.discount', 'Line discounts require pricing.discount authority');
      requireReason(adjustmentReason, 'A commercial reason is required for line discounts');
      overrideDetails.push({
        line: index + 1,
        serviceId: normalized.serviceId,
        kind: 'LINE_DISCOUNT',
        discountType: normalized.lineDiscountType,
        discountValue: normalized.lineDiscountValue,
        discountAmount: normalized.lineDiscountAmount,
        reason: adjustmentReason,
      });
    }

    return normalized;
  });

  const subtotal = roundMoney(pricedItems.reduce((sum, item) => sum + item.subtotal, 0));
  const manualDiscount = roundMoney(Math.max(0, Number(discount || 0)));
  if (manualDiscount > subtotal) {
    throw new CommercialRuleError('DISCOUNT_EXCEEDS_SUBTOTAL', 'Order discount cannot exceed the priced subtotal');
  }
  if (manualDiscount > 0) {
    requireAdjustmentAuthority(staff, 'pricing.discount', 'Order discounts require pricing.discount authority');
    requireReason(adjustmentReason, 'A commercial reason is required for an order discount');
  }

  const hasManualAdjustment = manualDiscount > 0 || overrideDetails.some((entry) => entry.kind === 'LINE_DISCOUNT');
  if (couponCode && (hasManualAdjustment || loyaltyPointsRedeemed > 0)) {
    throw new CommercialRuleError('INCENTIVE_STACKING_FORBIDDEN', 'Coupons cannot be stacked with manual or loyalty discounts');
  }
  if (loyaltyPointsRedeemed > 0 && hasManualAdjustment) {
    throw new CommercialRuleError('INCENTIVE_STACKING_FORBIDDEN', 'Loyalty redemption cannot be stacked with manual discounts');
  }

  const afterManual = roundMoney(subtotal - manualDiscount);
  const coupon = await validateCoupon(tx, couponCode, afterManual);
  const afterCoupon = roundMoney(afterManual - (coupon?.discount || 0));
  const loyalty = await validateLoyalty(tx, customerId, loyaltyPointsRedeemed, afterCoupon);
  const totalAmount = roundMoney(afterCoupon - (loyalty?.discount || 0));

  if (totalAmount <= 0 && subtotal > 0) {
    requireAdjustmentAuthority(staff, 'pricing.zero_value', 'A zero-value order requires pricing.zero_value authority');
    requireReason(adjustmentReason, 'A reason is required for a zero-value order');
  }

  return {
    items: pricedItems,
    subtotal,
    discount: manualDiscount,
    couponCode: coupon?.coupon.code || null,
    couponDiscount: coupon?.discount || 0,
    coupon: coupon?.coupon || null,
    loyaltyPointsRedeemed: loyalty?.points || 0,
    loyaltyDiscount: loyalty?.discount || 0,
    totalAmount,
    commercialReason: adjustmentReason,
    overrideDetails,
  };
};

const commitPricingBenefits = async (tx, pricing, { customerId, orderId }) => {
  if (pricing.coupon) {
    const result = await tx.coupon.updateMany({
      where: {
        id: pricing.coupon.id,
        ...(pricing.coupon.usageLimit ? { usedCount: { lt: pricing.coupon.usageLimit } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    if (result.count !== 1) {
      throw new CommercialRuleError('COUPON_EXHAUSTED', 'Coupon usage limit was reached by another order');
    }
  }

  if (pricing.loyaltyPointsRedeemed > 0) {
    const result = await tx.customer.updateMany({
      where: { id: customerId, loyaltyPoints: { gte: pricing.loyaltyPointsRedeemed } },
      data: { loyaltyPoints: { decrement: pricing.loyaltyPointsRedeemed } },
    });
    if (result.count !== 1) {
      throw new CommercialRuleError('LOYALTY_INSUFFICIENT', 'Available loyalty points changed; refresh and try again');
    }
    await tx.loyaltyTransaction.create({
      data: {
        customerId,
        type: 'REDEEM',
        points: -pricing.loyaltyPointsRedeemed,
        orderId,
        note: `Redeemed against order ${orderId}`,
      },
    });
  }
};

module.exports = {
  CommercialRuleError,
  commitPricingBenefits,
  resolveOrderPricing,
};
