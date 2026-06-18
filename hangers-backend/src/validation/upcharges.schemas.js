const { z } = require('zod');

const positiveMoney = z.coerce.number().finite().positive();

const upchargeSchema = z.object({
  name:  z.string().trim().min(1).max(120),
  type:  z.enum(['PERCENT', 'FLAT']),
  value: positiveMoney,
}).strict();

module.exports = { upchargeSchema };
