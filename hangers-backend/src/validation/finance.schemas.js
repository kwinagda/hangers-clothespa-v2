const { z } = require('zod');
const { CORE_PAYMENT_METHODS } = require('../config/master-data');

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
  method: z.enum(CORE_PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
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
  checkoutCouponSchema,
  checkoutLoyaltySchema,
  recordPaymentSchema,
  walletAdjustmentSchema,
  walletApplySchema,
};
