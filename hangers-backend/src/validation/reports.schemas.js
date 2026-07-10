const { z } = require('zod');

const reportQuerySchema = z.object({
  type: z.string().trim().min(1).max(80),
  from: z.string().trim().optional(),
  to:   z.string().trim().optional(),
}).strict();

module.exports = { reportQuerySchema };
