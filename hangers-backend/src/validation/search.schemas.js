const { z } = require('zod');

const money = z.coerce.number().finite();

const advancedSearchQuerySchema = z.object({
  q:              z.string().trim().max(120).optional(),
  status:         z.string().trim().max(64).optional(),
  tag:            z.string().trim().max(64).optional(),
  from:           z.string().trim().optional(),
  to:             z.string().trim().optional(),
  minAmount:      money.min(0).optional(),
  maxAmount:      money.min(0).optional(),
  paymentStatus:  z.string().trim().max(64).optional(),
  hasOutstanding: z.enum(['true', 'false']).optional(),
  type:           z.enum(['customers', 'orders']).optional(),
  page:           z.coerce.number().int().positive().optional().default(1),
  limit:          z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict();

module.exports = { advancedSearchQuerySchema };
