const { z } = require('zod');

const orderStatusUpdateSchema = z.object({
  status: z.string().trim().min(2).max(64),
  notes:  z.string().trim().max(500).optional(),
}).strict();

const orderItemSchema = z.object({
  serviceId:          z.string().trim().min(1).optional().nullable(),
  serviceName:        z.string().trim().min(1).max(120),
  garmentType:        z.string().trim().min(1).max(120),
  variant:            z.string().trim().max(80).optional().nullable(),
  quantity:           z.coerce.number().int().min(1).max(999),
  unitPrice:          z.coerce.number().finite().min(0),
  baseUnitPrice:      z.coerce.number().finite().min(0).optional().nullable(),
  lineDiscountType:   z.enum(['PERCENT', 'FLAT']).optional().nullable(),
  lineDiscountValue:  z.coerce.number().finite().min(0).optional(),
  upcharges:          z.string().trim().max(500).optional().nullable(),
  tagNumber:          z.string().trim().max(80).optional().nullable(),
  notes:              z.string().trim().max(500).optional().nullable(),
});

const createOrderSchema = z.object({
  customerId:   z.string().trim().min(1),
  documentType: z.enum(['ORDER', 'QUOTATION']).optional(),
  source:       z.string().trim().max(40).optional(),
  pickupDate:   z.coerce.date().optional().nullable(),
  deliveryDate: z.coerce.date().optional().nullable(),
  pickupAddress: z.string().trim().max(500).optional().nullable(),
  pickupSlot:   z.string().trim().max(80).optional().nullable(),
  notes:        z.string().trim().max(1000).optional().nullable(),
  couponCode:   z.string().trim().max(64).optional().nullable(),
  items:        z.array(orderItemSchema).min(1).max(200),
}).strict();

const updateOrderSchema = z.object({
  pickupDate:   z.coerce.date().optional().nullable(),
  deliveryDate: z.coerce.date().optional().nullable(),
  pickupAddress: z.string().trim().max(500).optional().nullable(),
  pickupSlot:   z.string().trim().max(80).optional().nullable(),
  notes:        z.string().trim().max(1000).optional().nullable(),
  assignedToId: z.string().trim().min(1).optional().nullable(),
}).strict();

const addItemsSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(200),
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

const deliveryOtpVerifySchema = z.object({
  otp: z.string().trim().min(4).max(6),
}).strict();

module.exports = {
  orderStatusUpdateSchema,
  orderItemSchema,
  createOrderSchema,
  updateOrderSchema,
  addItemsSchema,
  assignOrderSchema,
  deliveryFailSchema,
  collectCashSchema,
  deliveryOtpVerifySchema,
};
