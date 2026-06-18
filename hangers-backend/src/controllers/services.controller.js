// ─────────────────────────────────────────────────────────────────────────────
// SERVICES CONTROLLER — Pricing catalog
// GET /api/v1/services      — public, returns catalog grouped by category
// PUT /api/v1/services      — staff-only, replaces full catalog
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');

const parsePositivePrice = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const parseSortOrder = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeServicePayload = (body, options = {}) => {
  const {
    requireCategory = false,
    requireName = false,
    requirePrice = false,
    allowIsActive = false,
  } = options;

  const data = {};

  if (body.category !== undefined) {
    const category = String(body.category || '').trim();
    if (!category) return { error: 'category is required' };
    data.category = category;
  } else if (requireCategory) {
    return { error: 'category is required' };
  }

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'name is required' };
    data.name = name;
  } else if (requireName) {
    return { error: 'name is required' };
  }

  const rawPrice = body.price !== undefined ? body.price : body.basePrice;
  if (rawPrice !== undefined) {
    const basePrice = parsePositivePrice(rawPrice);
    if (basePrice === null) return { error: 'price must be a valid non-negative number' };
    data.basePrice = basePrice;
  } else if (requirePrice) {
    return { error: 'price is required' };
  }

  if (body.sortOrder !== undefined) {
    const sortOrder = parseSortOrder(body.sortOrder);
    if (sortOrder === null) return { error: 'sortOrder must be a positive integer' };
    data.sortOrder = sortOrder;
  }

  if (allowIsActive && body.isActive !== undefined) {
    data.isActive = Boolean(body.isActive);
  }

  return { data };
};

const getCategorySortOrder = async (category) => {
  const aggregate = await prisma.service.aggregate({
    where: { category },
    _max: { sortOrder: true },
  });
  return (aggregate._max.sortOrder || 0) + 1;
};

const ensureUniqueServiceName = async ({ category, name, excludeId = null }) => {
  const existing = await prisma.service.findFirst({
    where: {
      category,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, isActive: true, name: true },
  });
  return existing;
};

// ── GET /api/v1/services ──────────────────────────────────────────────────────
const getServices = async (req, res) => {
  try {
    const { category } = req.query;
    const where = { isActive: true };
    if (category) {
      const normalizedCategory = String(category).trim();
      if (!normalizedCategory) return badRequest(res, 'category cannot be empty');
      where.category = normalizedCategory;
    }

    const services = await prisma.service.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select:  { id: true, name: true, category: true, basePrice: true, sortOrder: true },
    });

    // Group by category
    const grouped = {};
    for (const s of services) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push({ id: s.id, name: s.name, price: s.basePrice, sortOrder: s.sortOrder });
    }
    const catalog = Object.entries(grouped).map(([category, items]) => ({ category, items }));

    return success(res, { catalog, total: services.length });
  } catch (err) {
    console.error('getServices error:', err);
    return error(res, 'Failed to fetch services');
  }
};

// ── POST /api/v1/services ────────────────────────────────────────────────────
// Body: { category, name, price, sortOrder? }
const createServiceItem = async (req, res) => {
  const parsed = normalizeServicePayload(req.body || {}, {
    requireCategory: true,
    requireName: true,
    requirePrice: true,
  });
  if (parsed.error) return badRequest(res, parsed.error);

  try {
    const { category, name, basePrice } = parsed.data;
    const duplicate = await ensureUniqueServiceName({ category, name });
    const sortOrder = parsed.data.sortOrder || await getCategorySortOrder(category);

    if (duplicate?.isActive) {
      return badRequest(res, `Service "${duplicate.name}" already exists in ${category}`);
    }

    if (duplicate && !duplicate.isActive) {
      const service = await prisma.service.update({
        where: { id: duplicate.id },
        data: { category, name, basePrice, sortOrder, isActive: true },
      });
      return success(res, { service }, `Service "${service.name}" reactivated`);
    }

    const service = await prisma.service.create({
      data: {
        category,
        name,
        basePrice,
        sortOrder,
        isActive: true,
      },
    });

    return success(res, { service }, `Service "${service.name}" created`, 201);
  } catch (err) {
    console.error('createServiceItem error:', err);
    return error(res, 'Failed to create service item');
  }
};

// ── PATCH /api/v1/services/:id ───────────────────────────────────────────────
const updateServiceItem = async (req, res) => {
  const parsed = normalizeServicePayload(req.body || {}, { allowIsActive: true });
  if (parsed.error) return badRequest(res, parsed.error);
  if (!Object.keys(parsed.data).length) return badRequest(res, 'At least one field is required');

  try {
    const existing = await prisma.service.findUnique({
      where: { id: req.params.id },
      select: { id: true, category: true, name: true, isActive: true },
    });
    if (!existing) return notFound(res, 'Service item not found');

    const category = parsed.data.category || existing.category;
    const name = parsed.data.name || existing.name;
    const duplicate = await ensureUniqueServiceName({ category, name, excludeId: existing.id });

    if (duplicate?.isActive) {
      return badRequest(res, `Service "${duplicate.name}" already exists in ${category}`);
    }

    const updateData = {
      ...parsed.data,
      category,
      name,
    };
    if (!updateData.sortOrder) delete updateData.sortOrder;

    const service = await prisma.service.update({
      where: { id: existing.id },
      data: updateData,
    });

    return success(res, { service }, `Service "${service.name}" updated`);
  } catch (err) {
    console.error('updateServiceItem error:', err);
    return error(res, 'Failed to update service item');
  }
};

// ── DELETE /api/v1/services/:id ──────────────────────────────────────────────
const deactivateServiceItem = async (req, res) => {
  try {
    const existing = await prisma.service.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, isActive: true },
    });
    if (!existing) return notFound(res, 'Service item not found');
    if (!existing.isActive) return success(res, {}, `Service "${existing.name}" is already inactive`);

    await prisma.service.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    return success(res, {}, `Service "${existing.name}" deactivated`);
  } catch (err) {
    console.error('deactivateServiceItem error:', err);
    return error(res, 'Failed to deactivate service item');
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
    const category = String(cat.category || '').trim();
    if (!category || !Array.isArray(cat.items)) continue;
    cat.items.forEach((item, idx) => {
      const name = String(item.name || '').trim();
      const price = parsePositivePrice(item.price);
      if (!name || price === null) return;
      rows.push({
        name,
        category,
        basePrice: price,
        isActive:  true,
        sortOrder: idx + 1,
      });
    });
  }

  if (!rows.length) return badRequest(res, 'No valid items in catalog');
  if (new Set(rows.map((row) => `${row.category}::${row.name.toLowerCase()}`)).size !== rows.length) {
    return badRequest(res, 'Duplicate service names within the same category are not allowed');
  }

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

module.exports = { getServices, upsertServices, createServiceItem, updateServiceItem, deactivateServiceItem };
