const { z } = require('zod');

const money          = z.coerce.number().finite();
const positiveMoney  = z.coerce.number().finite().positive();
const optionalTrimmed = (max = 500) => z.string().trim().max(max).optional().nullable();

const expenseSchema = z.object({
  category:    z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  amount:      positiveMoney,
  date:        z.string().trim().optional().nullable(),
  paidBy:      optionalTrimmed(120),
}).strict();

module.exports = { expenseSchema };
