const { z } = require('zod');
const { indianPhoneSchema } = require('./auth.schemas');

const pickupOtpSendSchema = z.object({
  phone: indianPhoneSchema,
}).strict();

const pickupOtpVerifySchema = z.object({
  phone: indianPhoneSchema,
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the complete 6-digit code'),
}).strict();

const pickupRequestDetailsSchema = z.object({
  phone: indianPhoneSchema,
  name: z.string().trim().min(2).max(120),
  addressLine1: z.string().trim().min(5).max(160),
  addressLine2: z.string().trim().max(160).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  items: z.array(z.object({
    serviceKey: z.string().trim().min(1).max(80),
    quantity: z.coerce.number().int().min(1).max(999),
  }).strict()).min(1).max(50),
  preferredDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  preferredSlot: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
}).strict();

const publicPickupRequestSchema = pickupRequestDetailsSchema.extend({
  verificationToken: z.string().trim().min(32).max(120),
}).strict();

const queuedPickupRequestSchema = pickupRequestDetailsSchema.extend({
  externalSource: z.string().trim().min(2).max(80),
  externalRequestId: z.string().trim().min(8).max(120),
  verifiedAt: z.string().trim().datetime().optional().nullable(),
}).strict();

module.exports = { pickupOtpSendSchema, pickupOtpVerifySchema, publicPickupRequestSchema, queuedPickupRequestSchema };
