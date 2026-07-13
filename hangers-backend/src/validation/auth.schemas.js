const { z } = require('zod');

const indianPhoneSchema = z
  .string()
  .trim()
  .regex(/^(\+91|91)?[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number');

const emailSchema = z.string().trim().email().transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password cannot exceed 128 characters')
  .refine(
    (value) =>
      /[A-Z]/.test(value) &&
      /[a-z]/.test(value) &&
      /\d/.test(value) &&
      /[^A-Za-z0-9]/.test(value),
    'Password must include uppercase, lowercase, number, and symbol'
  );

const sendOtpSchema = z.object({
  phone: indianPhoneSchema,
}).strict();

const signupAddressSchema = z.object({
  label: z.string().trim().min(1).max(30).optional(),
  addressLine1: z.string().trim().min(3).max(160).optional(),
  address: z.string().trim().min(3).max(160).optional(),
  addressLine2: z.string().trim().max(160).optional(),
  landmark: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
}).strict().optional();

const verifyOtpSchema = z.object({
  phone: indianPhoneSchema,
  otp: z.string().trim().regex(/^\d{4,6}$/, 'OTP must be 4 to 6 digits'),
  name: z.string().trim().min(2).max(120).optional(),
  referredByCode: z.string().trim().min(4).max(32).optional(),
  address: signupAddressSchema,
}).strict();

const staffLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
}).strict();

const staffChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
}).strict();

const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: indianPhoneSchema,
  email: emailSchema.optional().nullable(),
  password: passwordSchema,
  role: z.string().trim().min(2).max(64),
}).strict();

const staffUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: indianPhoneSchema.optional(),
  email: emailSchema.optional().nullable(),
  role: z.string().trim().min(2).max(64).optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update'
);

module.exports = {
  sendOtpSchema,
  verifyOtpSchema,
  staffLoginSchema,
  staffChangePasswordSchema,
  staffCreateSchema,
  staffUpdateSchema,
  passwordSchema,
};
