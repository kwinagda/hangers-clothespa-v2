const { z } = require('zod');

const money = z.coerce.number().finite();

const cashEntrySchema = z.object({
  type:        z.enum(['OPEN', 'IN', 'OUT', 'CLOSE']),
  amount:      money.min(0),
  description: z.string().trim().min(1).max(240),
}).strict();

module.exports = { cashEntrySchema };
