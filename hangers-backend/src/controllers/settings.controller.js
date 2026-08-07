// ── Settings Controller ───────────────────────────────────────────────────────
const prisma = require('../config/database');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { updateSettingsSchema } = require('../validation/settings.schemas');
const { log, getRequestMeta } = require('../services/activity.service');
const { success, badRequest, error } = require('../utils/response');
const {
  PRINT_LAYOUT_SETTING_KEY,
  PAYMENT_QR_SETTING_KEY,
  DEFAULT_PRINT_LAYOUT_SETTINGS,
  DEFAULT_PAYMENT_QR_SETTINGS,
} = require('../config/print-settings');
const { normalizePaymentQrSettings, getPaymentQrSettings } = require('../services/payment-account-settings.service');

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
      return normalizePaymentQrSettings(JSON.parse(setting.value));
    } catch {
      return normalizePaymentQrSettings(DEFAULT_PAYMENT_QR_SETTINGS);
    }
  }
  return setting.value;
};

const mergePrintDefaults = (stored, defaults) => {
  if (Array.isArray(defaults)) return Array.isArray(stored) && stored.length ? stored : defaults;
  if (defaults && typeof defaults === 'object') {
    const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    return Object.entries(defaults).reduce((result, [key, defaultValue]) => {
      result[key] = mergePrintDefaults(source[key], defaultValue);
      return result;
    }, { ...source });
  }
  return stored === undefined || stored === null ? defaults : stored;
};

const normalisePrintLayoutSettings = (value) => {
  const merged = mergePrintDefaults(value, DEFAULT_PRINT_LAYOUT_SETTINGS);
  if (merged.bag?.title === 'Label Tags') {
    merged.bag = {
      ...merged.bag,
      title: DEFAULT_PRINT_LAYOUT_SETTINGS.bag.title,
      description: DEFAULT_PRINT_LAYOUT_SETTINGS.bag.description,
    };
  }
  merged.label = {
    ...merged.label,
    description: DEFAULT_PRINT_LAYOUT_SETTINGS.label.description,
    size: DEFAULT_PRINT_LAYOUT_SETTINGS.label.size,
    presets: DEFAULT_PRINT_LAYOUT_SETTINGS.label.presets,
  };
  return merged;
};

const serialiseSettingValue = (key, value) => {
  if (key === PRINT_LAYOUT_SETTING_KEY || key === PAYMENT_QR_SETTING_KEY) return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  return String(Number(value));
};

const publicOriginFromRequest = (req) => {
  const configured = String(process.env.PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
};

const persistPaymentQrUploads = async (settings, req) => {
  if (!settings || typeof settings !== 'object' || !Array.isArray(settings.accounts)) return settings;
  const origin = publicOriginFromRequest(req);
  if (!origin) return settings;
  const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'payment-qr');
  await fs.mkdir(uploadDir, { recursive: true });

  const accounts = await Promise.all(settings.accounts.map(async (account) => {
    const dataUrl = String(account.qrImageDataUrl || '').trim();
    if (!dataUrl) return account;
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-zA-Z0-9+/=\s]+)$/);
    if (!match) return account;
    const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const ext = contentType === 'image/jpeg' ? 'jpg' : contentType.replace('image/', '');
    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!buffer.length) return account;
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);
    const safeAccountId = String(account.id || 'account').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'account';
    const filename = `${safeAccountId}-${hash}.${ext}`;
    await fs.writeFile(path.join(uploadDir, filename), buffer, { flag: 'w' });
    return {
      ...account,
      qrImageUrl: `${origin}/uploads/payment-qr/${filename}`,
      qrImageDataUrl: '',
    };
  }));

  return { ...settings, accounts };
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
    settings.forEach(s => {
      const parsed = parseSettingValue(s);
      map[s.key] = s.key === PRINT_LAYOUT_SETTING_KEY ? normalisePrintLayoutSettings(parsed) : parsed;
    });
    const printSetting = settings.find((setting) => setting.key === PRINT_LAYOUT_SETTING_KEY);
    if (printSetting && JSON.stringify(map[PRINT_LAYOUT_SETTING_KEY]) !== printSetting.value) {
      await prisma.setting.update({
        where: { key: PRINT_LAYOUT_SETTING_KEY },
        data: { value: JSON.stringify(map[PRINT_LAYOUT_SETTING_KEY]) },
      });
    }
    return success(res, { settings, map });
  } catch (e) {
    return error(res, 'Failed to fetch settings');
  }
};

// PATCH /api/v1/settings — update one or more settings
const updateSettings = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload[PAYMENT_QR_SETTING_KEY]) {
      payload[PAYMENT_QR_SETTING_KEY] = await persistPaymentQrUploads(payload[PAYMENT_QR_SETTING_KEY], req);
    }
    const parsed = updateSettingsSchema.safeParse(payload);
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

const getPaymentAccountQrImage = async (req, res) => {
  try {
    const settings = await getPaymentQrSettings();
    const account = settings.accounts.find((item) => item.id === req.params.accountId);
    if (!account?.qrImageDataUrl) return res.status(404).send('QR image not found');

    const match = String(account.qrImageDataUrl).match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/);
    if (!match) return res.status(422).send('Stored QR image is invalid');

    const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(buffer);
  } catch (e) {
    return error(res, 'Failed to load payment QR image');
  }
};

module.exports = { getSettings, updateSettings, getPublicSettings, getPaymentAccountQrImage };
