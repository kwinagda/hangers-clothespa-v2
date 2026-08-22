const { z } = require('zod');
const { PRINT_LAYOUT_SETTING_KEY, PAYMENT_QR_SETTING_KEY } = require('../config/print-settings');

const numericSettingKeys = [
  'writeoff_max_amount',
  'loyalty_points_per_rupee',
  'loyalty_rupee_per_point',
  'loyalty_min_redeem_points',
  'referral_reward_percent',
  'referral_reward_cap',
  'referral_min_order_amount',
];

const schemaShape = Object.fromEntries(
  numericSettingKeys.map((key) => [key, z.coerce.number().finite().min(0).optional()])
);

schemaShape.referral_program_enabled = z.union([
  z.boolean(),
  z.string().trim().transform((value) => {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw new Error('referral_program_enabled must be boolean');
  }),
]).optional();

schemaShape[PRINT_LAYOUT_SETTING_KEY] = z.record(z.any()).optional();
schemaShape[PAYMENT_QR_SETTING_KEY] = z.object({
  provider: z.string().trim().optional(),
  vpa: z.string().trim().optional(),
  gpayNumber: z.string().trim().optional(),
  payeeName: z.string().trim().optional(),
  defaultAccountId: z.string().trim().optional(),
  accounts: z.array(z.object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1).max(80),
    isDefault: z.boolean().optional(),
    provider: z.string().trim().optional(),
    vpa: z.string().trim().optional(),
    gpayNumber: z.string().trim().regex(/^\d{10}$/, 'GPay number must be exactly 10 digits').or(z.literal('')).optional(),
    payeeName: z.string().trim().optional(),
    qrImageUrl: z.string().trim().url('QR image URL must be valid').or(z.literal('')).optional(),
    qrImageDataUrl: z.string().trim().optional(),
  }).strict()).max(20).optional(),
}).strict().superRefine((value, ctx) => {
  const accounts = value.accounts || [];
  const ids = new Set();
  for (const account of accounts) {
    if (ids.has(account.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Payment account IDs must be unique', path: ['accounts'] });
    }
    ids.add(account.id);
    if (account.vpa && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{2,64}$/.test(account.vpa)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'UPI ID format should look like name@bank', path: ['accounts'] });
    }
    if (!account.vpa && !account.gpayNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Payment account requires UPI ID or GPay number', path: ['accounts'] });
    }
  }
  if (accounts.length && value.defaultAccountId && !ids.has(value.defaultAccountId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Default payment account must exist in accounts', path: ['defaultAccountId'] });
  }
}).optional();

schemaShape.public_site_profile = z.object({
  businessName: z.string().trim().min(1).max(120), phone: z.string().trim().regex(/^\+91\d{10}$/), email: z.string().trim().email(),
  address: z.string().trim().min(10).max(500), mapUrl: z.string().trim().url(), instagramUrl: z.string().trim().url(),
  googleRating: z.number().min(0).max(5), googleReviewCount: z.number().int().min(0), establishedYear: z.number().int().min(1900).max(new Date().getFullYear()),
  openingHours: z.array(z.object({ label: z.string().trim().min(1), hours: z.string().trim().min(1) })).min(1),
  pickupZones: z.array(z.string().trim().min(1)).min(1), pickupMinimumOrder: z.number().finite().min(0),
  featuredServices: z.array(z.object({ key: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(80), description: z.string().trim().min(1).max(220) }).strict()).min(1).max(8),
  turnaround: z.object({ dryCleaning: z.string().trim().min(1), curtains: z.string().trim().min(1) }), curtainRemovalInstallation: z.boolean(),
}).strict().optional();

const updateSettingsSchema = z.object(schemaShape).strict().refine(
  (value) => Object.keys(value).length > 0,
  'At least one setting is required'
);

module.exports = { updateSettingsSchema };
