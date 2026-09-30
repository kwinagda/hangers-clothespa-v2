const { z } = require('zod');

const positiveMoneySchema = z.coerce.number().finite().positive();

const checkoutCouponSchema = z.object({
  code: z.string().trim().min(1).max(64),
  orderTotal: z.coerce.number().finite().min(0),
  customerId: z.string().trim().min(1).optional(),
}).strict();

const checkoutLoyaltySchema = z.object({
  customerId: z.string().trim().min(1),
  pointsToRedeem: z.coerce.number().int().positive(),
  orderTotal: z.coerce.number().finite().min(0),
}).strict();

const recordPaymentSchema = z.object({
  orderId: z.string().trim().min(1),
  amount: positiveMoneySchema,
  method: z.string().trim().min(1).max(64),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  effectiveAt: z.coerce.date().refine((date) => date <= new Date(), 'Payment date cannot be in the future').optional(),
}).strict();

const walletAdjustmentSchema = z.object({
  amount: positiveMoneySchema,
  reason: z.string().trim().min(2).max(240),
  orderId: z.string().trim().min(1).optional().nullable(),
}).strict();

const walletApplySchema = z.object({
  orderId: z.string().trim().min(1),
  amount: positiveMoneySchema,
}).strict();

module.exports = {
  recordReceivablesPaymentSchema: recordPaymentSchema.omit({ orderId: true }).extend({
    customerId: z.string().trim().min(1),
    invoiceIds: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
    orderIds: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
  }).refine((data) => Boolean(data.invoiceIds?.length) !== Boolean(data.orderIds?.length), 'Select invoices or orders')
    .refine((data) => {
      const ids = data.invoiceIds || data.orderIds || [];
      return new Set(ids).size === ids.length;
    }, 'An invoice or order can only be selected once'),
  checkoutCouponSchema,
  checkoutLoyaltySchema,
  recordPaymentSchema,
  walletAdjustmentSchema,
  walletApplySchema,
};
