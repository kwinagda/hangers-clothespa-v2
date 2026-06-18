const { z } = require('zod');

const money         = z.coerce.number().finite();
const positiveMoney = z.coerce.number().finite().positive();

const couponCreateSchema = z.object({
  code:          z.string().trim().min(1).max(64),
  type:          z.enum(['PERCENT', 'FLAT']),
  value:         positiveMoney,
  minOrderValue: money.min(0).optional().default(0),
  maxDiscount:   money.min(0).optional().nullable(),
  usageLimit:    z.coerce.number().int().positive().optional().nullable(),
  validUntil:    z.string().trim().optional().nullable(),
}).strict();

const couponValidateSchema = z.object({
  code:       z.string().trim().min(1).max(64),
  orderValue: money.min(0),
}).strict();

module.exports = { couponCreateSchema, couponValidateSchema };
