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
  enabled: z.boolean().optional(),
  provider: z.string().trim().optional(),
  vpa: z.string().trim().optional(),
  payeeName: z.string().trim().optional(),
  currency: z.string().trim().optional(),
}).strict().optional();

const updateSettingsSchema = z.object(schemaShape).strict().refine(
  (value) => Object.keys(value).length > 0,
  'At least one setting is required'
);

module.exports = { updateSettingsSchema };
