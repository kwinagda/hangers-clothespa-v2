const { z } = require('zod');

const reportQuerySchema = z.object({
  type: z.enum(['sales', 'orders', 'customers', 'payments', 'expenses', 'staff', 'garments']),
  from: z.string().trim().optional(),
  to:   z.string().trim().optional(),
}).strict();

module.exports = { reportQuerySchema };
