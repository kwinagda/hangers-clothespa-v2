const { z } = require('zod');

const optionalTrimmed = (max = 500) => z.string().trim().max(max).optional().nullable();

const transferCreateSchema = z.object({
  fromPlant: z.string().trim().min(1).max(120),
  toPlant:   z.string().trim().min(1).max(120),
  orderId:   z.string().trim().min(1).optional().nullable(),
  bagCount:  z.coerce.number().int().positive(),
  notes:     optionalTrimmed(500),
}).strict();

const transferStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']),
}).strict();

module.exports = { transferCreateSchema, transferStatusSchema };
