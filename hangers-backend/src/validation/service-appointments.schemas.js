const { z } = require('zod');

const money = z.coerce.number().finite().min(0).max(1000000000).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
  'Money values may have at most two decimal places'
);

const serviceAppointmentEditSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  items: z.array(z.object({
    id: z.string().trim().min(1).optional(),
    serviceId: z.string().trim().min(1).nullable().optional(),
    description: z.string().trim().min(1).max(160),
    quantity: z.coerce.number().int().positive().max(999),
    unitPrice: money,
    lineDiscountType: z.enum(['FLAT', 'PERCENT']).nullable().optional(),
    lineDiscountValue: money.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  }).strict()).min(1).max(100),
  discountType: z.enum(['FLAT', 'PERCENT']).default('FLAT'),
  discountValue: money.default(0),
  commercialReason: z.string().trim().min(3).max(500),
}).strict().superRefine((data, ctx) => {
  if (data.discountType === 'PERCENT' && data.discountValue > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Percentage discount cannot exceed 100', path: ['discountValue'] });
  }
});

module.exports = { serviceAppointmentEditSchema };
