const { z } = require('zod');

const campaignSchema = z.object({
  name:     z.string().trim().min(1).max(120),
  message:  z.string().trim().min(1).max(1000),
  audience: z.enum(['ALL', 'REGULAR', 'VIP', 'NEW', 'INACTIVE']),
}).strict();

module.exports = { campaignSchema };
