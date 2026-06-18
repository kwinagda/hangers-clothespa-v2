const { z } = require('zod');

const automationSchema = z.object({
  name:       z.string().trim().min(1).max(120),
  trigger:    z.string().trim().min(1).max(120),
  message:    z.string().trim().min(1).max(1000),
  delayHours: z.coerce.number().int().min(0).optional().default(0),
  channel:    z.enum(['WHATSAPP', 'SMS', 'EMAIL']).optional().default('WHATSAPP'),
}).strict();

module.exports = { automationSchema };
