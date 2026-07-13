const { z } = require('zod');

const money = z.coerce.number().finite().min(0).max(1000000000).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
  'Money values may have at most two decimal places'
);

const adjustmentReason = z.string().trim().min(3).max(500);

const orderStatusUpdateSchema = z.object({
  status: z.string().trim().min(2).max(64),
  notes:  z.string().trim().max(500).optional(),
  reasonCode: z.string().trim().min(2).max(64).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
}).strict();

const orderItemSchema = z.object({
  id:                 z.string().trim().min(1).optional(),
  serviceId:          z.string().trim().min(1).optional().nullable(),
  serviceName:        z.string().trim().min(1).max(120).optional(),
  garmentType:        z.string().trim().min(1).max(120).optional(),
  variant:            z.string().trim().max(80).optional().nullable(),
  quantity:           z.coerce.number().int().min(1).max(999),
  unitPrice:          money.optional(),
  baseUnitPrice:      money.optional().nullable(),
  lineDiscountType:   z.enum(['PERCENT', 'FLAT']).optional().nullable(),
  lineDiscountValue:  z.coerce.number().finite().min(0).optional(),
  upchargeIds:        z.array(z.string().trim().min(1)).max(20).optional(),
  priceOverrideReason: adjustmentReason.optional(),
  tagNumber:          z.string().trim().max(80).optional().nullable(),
  notes:              z.string().trim().max(500).optional().nullable(),
}).strict().superRefine((item, ctx) => {
  if (!item.serviceId && (!item.serviceName || !item.garmentType || item.unitPrice === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Custom items require serviceName, garmentType, and unitPrice',
      path: ['serviceId'],
    });
  }
  if (item.lineDiscountType && !(Number(item.lineDiscountValue) > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lineDiscountValue must be positive when lineDiscountType is set',
      path: ['lineDiscountValue'],
    });
  }
});

const createOrderSchema = z.object({
  customerId:   z.string().trim().min(1).optional(),
  customerPhone: z.string().trim().min(5).max(30).optional(),
  customerName: z.string().trim().min(1).max(120).optional().nullable(),
  documentType: z.enum(['ORDER', 'QUOTATION']).optional(),
  source:       z.string().trim().max(40).optional(),
  pickupDate:   z.coerce.date().optional().nullable(),
  deliveryDate: z.coerce.date().optional().nullable(),
  pickupAddress: z.string().trim().max(500).optional().nullable(),
  pickupSlot:   z.string().trim().max(80).optional().nullable(),
  notes:        z.string().trim().max(1000).optional().nullable(),
  couponCode:   z.string().trim().max(64).optional().nullable(),
  discount:     money.optional(),
  loyaltyPointsRedeemed: z.coerce.number().int().positive().optional(),
  walletAmount: money.optional(),
  paymentMethod: z.string().trim().max(80).optional().nullable(),
  paidAmount:   money.optional(),
  writeOffAmount: money.optional(),
  commercialReason: adjustmentReason.optional(),
  writeOffReason: adjustmentReason.optional(),
  items:        z.array(orderItemSchema).min(1).max(200),
}).strict().refine((data) => data.customerId || data.customerPhone, {
  message: 'customerId or customerPhone is required',
  path: ['customerId'],
});

const updateOrderSchema = z.object({
  pickupDate:   z.coerce.date().optional().nullable(),
  deliveryDate: z.coerce.date().optional().nullable(),
  pickupAddress: z.string().trim().max(500).optional().nullable(),
  pickupSlot:   z.string().trim().max(80).optional().nullable(),
  notes:        z.string().trim().max(1000).optional().nullable(),
  assignedToId: z.string().trim().min(1).optional().nullable(),
}).strict();

const addItemsSchema = z.object({
  version: z.coerce.number().int().positive(),
  items: z.array(orderItemSchema).min(1).max(200),
  discount: money.optional(),
  commercialReason: adjustmentReason,
}).strict();

const editOrderSchema = z.object({
  version: z.coerce.number().int().positive(),
  items: z.array(orderItemSchema).min(1).max(200),
  discount: money.optional(),
  deliveryDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  reason: z.string().trim().min(3).max(500),
  commercialReason: adjustmentReason.optional(),
}).strict();

const assignOrderSchema = z.object({
  riderId: z.string().trim().min(1),
}).strict();

const deliveryFailSchema = z.object({
  reason: z.enum(['NOT_HOME', 'REFUSED', 'WRONG_ADDRESS', 'CUSTOMER_CANCELLED', 'OTHER']),
}).strict();

const collectCashSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  notes:  z.string().trim().max(500).optional().nullable(),
}).strict();

const orderPaymentSchema = z.object({
  amount: money,
  method: z.string().trim().min(1).max(64),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  writeOffAmount: money.optional(),
  writeOffReason: adjustmentReason.optional(),
}).strict().refine((data) => data.amount > 0 || Number(data.writeOffAmount || 0) > 0, {
  message: 'A payment or write-off amount is required',
  path: ['amount'],
});

const orderRefundSchema = z.object({
  sourcePaymentId: z.string().trim().min(1),
  amount: money.refine((value) => value > 0, 'Refund amount must be greater than zero'),
  method: z.string().trim().min(1).max(64).optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  reasonCode: z.enum(['ORDER_CANCELLATION', 'SERVICE_FAILURE', 'DUPLICATE_CHARGE', 'PRICE_CORRECTION', 'CUSTOMER_REFUND', 'OTHER']),
  reason: adjustmentReason,
}).strict();

const deliveryOtpVerifySchema = z.object({
  otp: z.string().trim().min(4).max(6),
}).strict();

module.exports = {
  orderStatusUpdateSchema,
  orderItemSchema,
  createOrderSchema,
  updateOrderSchema,
  addItemsSchema,
  editOrderSchema,
  assignOrderSchema,
  deliveryFailSchema,
  collectCashSchema,
  deliveryOtpVerifySchema,
  orderPaymentSchema,
  orderRefundSchema,
};
