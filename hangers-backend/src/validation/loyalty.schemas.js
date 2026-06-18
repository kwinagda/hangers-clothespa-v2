const { z } = require('zod');

const money           = z.coerce.number().finite();
const optionalTrimmed = (max = 500) => z.string().trim().max(max).optional().nullable();

const loyaltyRulesSchema = z.object({
  earnPerRupee:    money.min(0),
  redeemPerPoint:  money.min(0),
  minRedeemPoints: z.coerce.number().int().min(0),
}).strict();

const loyaltyAwardSchema = z.object({
  customerId: z.string().trim().min(1),
  points:     z.coerce.number().int().positive(),
  orderId:    z.string().trim().min(1).optional().nullable(),
  note:       optionalTrimmed(240),
}).strict();

module.exports = { loyaltyRulesSchema, loyaltyAwardSchema };
