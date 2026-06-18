const { z } = require('zod');

const optionalTrimmed = (max = 500) => z.string().trim().max(max).optional().nullable();

const recurringPickupSchema = z.object({
  customerId:  z.string().trim().min(1),
  frequency:   z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  dayOfWeek:   z.coerce.number().int().min(0).max(6).optional().nullable(),
  dayOfMonth:  z.coerce.number().int().min(1).max(31).optional().nullable(),
  address:     z.string().trim().min(1).max(240),
  notes:       optionalTrimmed(500),
}).strict();

module.exports = { recurringPickupSchema };
