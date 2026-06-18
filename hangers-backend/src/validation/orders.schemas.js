const { z } = require('zod');

const orderStatusUpdateSchema = z.object({
  status: z.string().trim().min(2).max(64),
  notes: z.string().trim().max(500).optional(),
}).strict();

module.exports = { orderStatusUpdateSchema };
