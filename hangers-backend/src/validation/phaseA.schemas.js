const { z } = require('zod');

const money = z.coerce.number().finite();
const positiveMoney = z.coerce.number().finite().positive();
const optionalTrimmed = (max = 500) => z.string().trim().max(max).optional().nullable();

const cashEntrySchema = z.object({
  type: z.enum(['OPEN', 'IN', 'OUT', 'CLOSE']),
  amount: money.min(0),
  description: z.string().trim().min(1).max(240),
}).strict();

const expenseSchema = z.object({
  category: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  amount: positiveMoney,
  date: z.string().trim().optional().nullable(),
  paidBy: optionalTrimmed(120),
}).strict();

const transferCreateSchema = z.object({
  fromPlant: z.string().trim().min(1).max(120),
  toPlant: z.string().trim().min(1).max(120),
  orderId: z.string().trim().min(1).optional().nullable(),
  bagCount: z.coerce.number().int().positive(),
  notes: optionalTrimmed(500),
}).strict();

const transferStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']),
}).strict();

const attendanceActionSchema = z.object({
  staffId: z.string().trim().min(1).optional(),
}).strict();

const couponCreateSchema = z.object({
  code: z.string().trim().min(1).max(64),
  type: z.enum(['PERCENT', 'FLAT']),
  value: positiveMoney,
  minOrderValue: money.min(0).optional().default(0),
  maxDiscount: money.min(0).optional().nullable(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  validUntil: z.string().trim().optional().nullable(),
}).strict();

const couponValidateSchema = z.object({
  code: z.string().trim().min(1).max(64),
  orderValue: money.min(0),
}).strict();

const loyaltyRulesSchema = z.object({
  earnPerRupee: money.min(0),
  redeemPerPoint: money.min(0),
  minRedeemPoints: z.coerce.number().int().min(0),
}).strict();

const loyaltyAwardSchema = z.object({
  customerId: z.string().trim().min(1),
  points: z.coerce.number().int().positive(),
  orderId: z.string().trim().min(1).optional().nullable(),
  note: optionalTrimmed(240),
}).strict();

const upchargeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['PERCENT', 'FLAT']),
  value: positiveMoney,
}).strict();

const customerTagSchema = z.object({
  tag: optionalTrimmed(60),
  notes: optionalTrimmed(500),
}).strict();

const recurringPickupSchema = z.object({
  customerId: z.string().trim().min(1),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional().nullable(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
  address: z.string().trim().min(1).max(240),
  notes: optionalTrimmed(500),
}).strict();

const returnOrderSchema = z.object({
  originalOrderId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500),
}).strict();

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  audience: z.enum(['ALL', 'REGULAR', 'VIP', 'NEW', 'INACTIVE']),
}).strict();

const reportQuerySchema = z.object({
  type: z.enum(['sales', 'orders', 'customers', 'payments', 'expenses', 'staff', 'garments']),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
}).strict();

const advancedSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().max(64).optional(),
  tag: z.string().trim().max(64).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  minAmount: money.min(0).optional(),
  maxAmount: money.min(0).optional(),
  paymentStatus: z.string().trim().max(64).optional(),
  hasOutstanding: z.enum(['true', 'false']).optional(),
  type: z.enum(['customers', 'orders']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict();

const automationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  delayHours: z.coerce.number().int().min(0).optional().default(0),
  channel: z.enum(['WHATSAPP', 'SMS', 'EMAIL']).optional().default('WHATSAPP'),
}).strict();

module.exports = {
  cashEntrySchema,
  expenseSchema,
  transferCreateSchema,
  transferStatusSchema,
  attendanceActionSchema,
  couponCreateSchema,
  couponValidateSchema,
  loyaltyRulesSchema,
  loyaltyAwardSchema,
  upchargeSchema,
  customerTagSchema,
  recurringPickupSchema,
  returnOrderSchema,
  campaignSchema,
  reportQuerySchema,
  advancedSearchQuerySchema,
  automationSchema,
};
