// ── Settings Controller ───────────────────────────────────────────────────────
const prisma = require('../config/database');
const { updateSettingsSchema } = require('../validation/settings.schemas');
const { log, getRequestMeta } = require('../services/activity.service');
const { success, badRequest, error } = require('../utils/response');
const {
  PRINT_LAYOUT_SETTING_KEY,
  PAYMENT_QR_SETTING_KEY,
  DEFAULT_PRINT_LAYOUT_SETTINGS,
  DEFAULT_PAYMENT_QR_SETTINGS,
} = require('../config/print-settings');

const ALLOWED_SETTING_KEYS = new Set([
  'writeoff_max_amount',
  'loyalty_points_per_rupee',
  'loyalty_rupee_per_point',
  'loyalty_min_redeem_points',
  'referral_reward_percent',
  'referral_reward_cap',
  'referral_min_order_amount',
  'referral_program_enabled',
  PRINT_LAYOUT_SETTING_KEY,
  PAYMENT_QR_SETTING_KEY,
]);

const parseSettingValue = (setting) => {
  if (!setting) return setting;
  if (setting.key === PRINT_LAYOUT_SETTING_KEY) {
    try {
      return JSON.parse(setting.value);
    } catch {
      return DEFAULT_PRINT_LAYOUT_SETTINGS;
    }
  }
  if (setting.key === PAYMENT_QR_SETTING_KEY) {
    try {
      return JSON.parse(setting.value);
    } catch {
      return DEFAULT_PAYMENT_QR_SETTINGS;
    }
  }
  return setting.value;
};

const serialiseSettingValue = (key, value) => {
  if (key === PRINT_LAYOUT_SETTING_KEY || key === PAYMENT_QR_SETTING_KEY) return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  return String(Number(value));
};

const ensureJsonSetting = async (key, value) => {
  const existing = await prisma.setting.findUnique({ where: { key } });
  if (existing) return existing;
  return prisma.setting.create({
    data: {
      key,
      value: JSON.stringify(value),
    },
  });
};

// GET /api/v1/settings — get all settings
const getSettings = async (req, res) => {
  try {
    await ensureJsonSetting(PRINT_LAYOUT_SETTING_KEY, DEFAULT_PRINT_LAYOUT_SETTINGS);
    await ensureJsonSetting(PAYMENT_QR_SETTING_KEY, DEFAULT_PAYMENT_QR_SETTINGS);
    const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    const map = {};
    settings.forEach(s => { map[s.key] = parseSettingValue(s); });
    return success(res, { settings, map });
  } catch (e) {
    return error(res, 'Failed to fetch settings');
  }
};

// PATCH /api/v1/settings — update one or more settings
const updateSettings = async (req, res) => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid settings payload');
    const updates = parsed.data;
    const entries = Object.entries(updates);
    const results = await Promise.all(
      entries.map(([key, value]) =>
        prisma.setting.upsert({
          where:  { key },
          update: { value: serialiseSettingValue(key, value), updatedBy: req.staff?.id || null },
          create: { key, value: serialiseSettingValue(key, value), updatedBy: req.staff?.id || null },
        })
      )
    );
    await log({
      actorType: 'staff',
      actorId: req.staff?.id,
      actorName: req.staff?.name,
      action: 'SETTINGS_UPDATED',
      resource: 'settings',
      description: `Updated settings: ${entries.map(([key]) => key).join(', ')}`,
      metadata: Object.fromEntries(entries),
      ...getRequestMeta(req),
    });
    return success(res, results, 'Settings updated');
  } catch (e) {
    return error(res, 'Failed to update settings');
  }
};

// GET /api/v1/settings/public — get settings needed by POS/frontend (no auth)
const getPublicSettings = async (req, res) => {
  try {
    const keys = ['writeoff_max_amount', 'loyalty_points_per_rupee', 'loyalty_rupee_per_point', 'loyalty_min_redeem_points', 'referral_reward_percent', 'referral_reward_cap', 'referral_min_order_amount', 'referral_program_enabled'];
    const settings = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const map = {};
    settings.forEach(s => { map[s.key] = parseFloat(s.value) || 0; });
    return success(res, map);
  } catch (e) {
    return error(res, 'Failed to fetch public settings');
  }
};

module.exports = { getSettings, updateSettings, getPublicSettings };
