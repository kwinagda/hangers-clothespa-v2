const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { loyaltyRulesSchema, loyaltyAwardSchema } = require('../validation/loyalty.schemas');

const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const getLoyaltyRules = async (req, res) => {
  try {
    let rules = await prisma.loyaltyRule.findFirst({ where: { isActive: true } });
    if (!rules) {
      rules = await prisma.loyaltyRule.create({
        data: { earnPerRupee: 1, redeemPerPoint: 0.5, minRedeemPoints: 100 }
      });
    }
    res.json({ success: true, data: rules });
  } catch (err) {
    return error(res, 'Failed to fetch loyalty rules');
  }
};

const updateLoyaltyRules = async (req, res) => {
  try {
    const parsed = loyaltyRulesSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid loyalty rules payload');
    const { earnPerRupee, redeemPerPoint, minRedeemPoints } = parsed.data;
    const rules = await prisma.loyaltyRule.updateMany({
      where: { isActive: true },
      data:  { earnPerRupee, redeemPerPoint, minRedeemPoints }
    });
    return success(res, rules);
  } catch (err) {
    return error(res, 'Failed to update loyalty rules');
  }
};

const awardLoyaltyPoints = async (req, res) => {
  try {
    const parsed = loyaltyAwardSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid loyalty award payload');
    const { customerId, points, orderId, note } = parsed.data;
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) return notFound(res, 'Customer not found');
    if (orderId) {
      const order = await prisma.order.findFirst({ where: { id: orderId, customerId, ...ORDER_ONLY_WHERE }, select: { id: true } });
      if (!order) return badRequest(res, 'Order does not belong to this customer');
    }
    await prisma.$transaction([
      prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: points } } }),
      prisma.loyaltyTransaction.create({ data: { customerId, type: 'EARN', points, orderId, note } })
    ]);
    return success(res, {}, 'Loyalty points awarded');
  } catch (err) {
    return error(res, 'Failed to award loyalty points');
  }
};

module.exports = { getLoyaltyRules, updateLoyaltyRules, awardLoyaltyPoints };
