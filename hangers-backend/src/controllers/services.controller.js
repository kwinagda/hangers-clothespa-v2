// ─────────────────────────────────────────────────────────────────────────────
// SERVICES CONTROLLER — Pricing catalog
// GET /api/v1/services      — public, returns catalog grouped by category
// PUT /api/v1/services      — staff-only, replaces full catalog
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');

// ── GET /api/v1/services ──────────────────────────────────────────────────────
const getServices = async (req, res) => {
  try {
    const { category } = req.query;
    const where = { isActive: true };
    if (category) where.category = String(category).trim();

    const services = await prisma.service.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select:  { id: true, name: true, category: true, basePrice: true },
    });

    // Group by category
    const grouped = {};
    for (const s of services) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push({ id: s.id, name: s.name, price: s.basePrice });
    }
    const catalog = Object.entries(grouped).map(([category, items]) => ({ category, items }));

    return success(res, { catalog, total: services.length });
  } catch (err) {
    console.error('getServices error:', err);
    return error(res, 'Failed to fetch services');
  }
};

// ── PUT /api/v1/services ──────────────────────────────────────────────────────
// Body: { catalog: [{ category, items: [{ name, price }] }] }
const upsertServices = async (req, res) => {
  const { catalog } = req.body;

  if (!Array.isArray(catalog) || !catalog.length) {
    return badRequest(res, 'catalog array is required');
  }

  // Flatten catalog into rows
  const rows = [];
  for (const cat of catalog) {
    if (!cat.category || !Array.isArray(cat.items)) continue;
    cat.items.forEach((item, idx) => {
      if (!item.name) return;
      rows.push({
        name:      item.name,
        category:  cat.category,
        basePrice: parseFloat(item.price) || 0,
        isActive:  true,
        sortOrder: idx,
      });
    });
  }

  if (!rows.length) return badRequest(res, 'No valid items in catalog');

  try {
    // Fetch all current services
    const existing = await prisma.service.findMany({ select: { id: true, name: true, category: true } });
    const existingMap = {};
    for (const s of existing) existingMap[`${s.category}::${s.name}`] = s.id;

    const toUpdate = [];
    const toCreate = [];

    for (const row of rows) {
      const key = `${row.category}::${row.name}`;
      if (existingMap[key]) {
        toUpdate.push({ id: existingMap[key], ...row });
      } else {
        toCreate.push(row);
      }
    }

    // Determine IDs that are no longer in the new catalog — soft-deactivate them
    const newKeys = new Set(rows.map(r => `${r.category}::${r.name}`));
    const toDeactivate = existing
      .filter(s => !newKeys.has(`${s.category}::${s.name}`))
      .map(s => s.id);

    await prisma.$transaction([
      // Deactivate removed items
      ...(toDeactivate.length ? [prisma.service.updateMany({
        where: { id: { in: toDeactivate } },
        data:  { isActive: false },
      })] : []),
      // Update existing
      ...toUpdate.map(({ id, ...data }) => prisma.service.update({ where: { id }, data })),
      // Create new
      ...(toCreate.length ? [prisma.service.createMany({ data: toCreate })] : []),
    ]);

    return success(res, {
      updated:     toUpdate.length,
      created:     toCreate.length,
      deactivated: toDeactivate.length,
    }, `Catalog saved — ${rows.length} services`);
  } catch (err) {
    console.error('upsertServices error:', err);
    return error(res, 'Failed to update catalog');
  }
};

module.exports = { getServices, upsertServices };
