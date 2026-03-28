// ── Settings Controller ───────────────────────────────────────────────────────
const prisma = require('../config/database');

const ok  = (res, data, msg = 'Success') => res.json({ success: true, message: msg, data });
const bad = (res, msg) => res.status(400).json({ success: false, message: msg });
const err = (res, e)   => res.status(500).json({ success: false, message: e.message });

// GET /api/v1/settings — get all settings
const getSettings = async (req, res) => {
  try {
    const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    const map = {};
    settings.forEach(s => { map[s.key] = s.value; });
    ok(res, { settings, map });
  } catch (e) { err(res, e); }
};

// PATCH /api/v1/settings — update one or more settings
const updateSettings = async (req, res) => {
  try {
    const updates = req.body; // { key: value, key2: value2 }
    const results = await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.setting.upsert({
          where:  { key },
          update: { value: String(value), updatedBy: req.staff?.id || null },
          create: { key, value: String(value), updatedBy: req.staff?.id || null },
        })
      )
    );
    ok(res, results, 'Settings updated');
  } catch (e) { err(res, e); }
};

// GET /api/v1/settings/public — get settings needed by POS/frontend (no auth)
const getPublicSettings = async (req, res) => {
  try {
    const keys = ['writeoff_max_amount', 'loyalty_points_per_rupee', 'loyalty_rupee_per_point', 'loyalty_min_redeem_points'];
    const settings = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const map = {};
    settings.forEach(s => { map[s.key] = parseFloat(s.value) || 0; });
    ok(res, map);
  } catch (e) { err(res, e); }
};

module.exports = { getSettings, updateSettings, getPublicSettings };
