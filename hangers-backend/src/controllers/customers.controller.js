// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMERS CONTROLLER — Phase 3 CRM
// ─────────────────────────────────────────────────────────────────────────────

const prisma                                   = require('../config/database');
const { success, error, notFound, badRequest } = require('../utils/response');
const { DEFAULT_LANGUAGE, LANGUAGE_VALUES }     = require('../config/master-data');

const normalizeLanguage = (value) => {
  if (!value) return DEFAULT_LANGUAGE;
  const normalized = String(value).trim().toUpperCase();
  return LANGUAGE_VALUES.includes(normalized) ? normalized : null;
};

const normalizeCustomerAddressInput = (body) => {
  const line1 = body.line1?.trim() || body.addressLine1?.trim() || body.address?.trim() || '';
  const line2 = body.line2?.trim() || body.addressLine2?.trim() || null;
  const landmark = body.landmark?.trim() || null;
  const city = body.city?.trim() || '';
  const pincode = body.pincode?.trim() || '';
  const latitude = body.lat !== undefined ? Number(body.lat) : body.latitude !== undefined ? Number(body.latitude) : null;
  const longitude = body.lng !== undefined ? Number(body.lng) : body.longitude !== undefined ? Number(body.longitude) : null;

  return {
    label: body.label?.trim() || 'Home',
    addressLine1: line1,
    addressLine2: line2,
    landmark,
    city,
    pincode,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
};

// ── GET /api/v1/customers ─────────────────────────────────────────────────────
const listCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 30, search } = req.query;

    const where = {};
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          _count:  { select: { orders: true } },
          orders:  {
            take:    1,
            orderBy: { createdAt: 'desc' },
            select:  { orderNumber: true, status: true, createdAt: true, totalAmount: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip:    (Number(page) - 1) * Number(limit),
        take:    Number(limit),
      }),
      prisma.customer.count({ where }),
    ]);

    return success(res, {
      customers,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    return error(res, 'Failed to fetch customers');
  }
};

// ── GET /api/v1/customers/:id ─────────────────────────────────────────────────
const getCustomer = async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where:   { id: req.params.id },
      include: {
        addresses: true,
        orders:    {
          orderBy: { createdAt: 'desc' },
          take:    20,
          include: { items: true },
        },
        _count: { select: { orders: true } },
      },
    });
    if (!customer) return notFound(res, 'Customer not found');

    // Calculate lifetime value
    const ltv = await prisma.order.aggregate({
      where: { customerId: customer.id, status: 'DELIVERED' },
      _sum:  { totalAmount: true },
    });

    return success(res, { customer, lifetimeValue: ltv._sum.totalAmount || 0 });
  } catch (err) {
    return error(res, 'Failed to fetch customer');
  }
};

// ── POST /api/v1/customers ────────────────────────────────────────────────────
const createCustomer = async (req, res) => {
  const { phone, name, preferredLanguage } = req.body;
  if (!phone) return badRequest(res, 'Phone is required');

  const language = preferredLanguage !== undefined ? normalizeLanguage(preferredLanguage) : DEFAULT_LANGUAGE;
  if (preferredLanguage !== undefined && !language) {
    return badRequest(res, 'preferredLanguage must be ENGLISH, HINDI, or MARATHI');
  }

  try {
    const normalized = phone.replace(/\D/g, '').slice(-10);
    const existing   = await prisma.customer.findUnique({ where: { phone: normalized } });
    if (existing) return badRequest(res, 'Customer with this phone already exists');

    const customer = await prisma.customer.create({
      data: {
        phone: normalized,
        name: name || null,
        preferredLanguage: language,
      },
    });
    return success(res, { customer }, 'Customer created', 201);
  } catch (err) {
    return error(res, 'Failed to create customer');
  }
};

// ── PATCH /api/v1/customers/:id ───────────────────────────────────────────────
const updateCustomer = async (req, res) => {
  const { name, dob, mapLocation, tag, notes, notifWhatsApp, preferredLanguage } = req.body;
  const language = preferredLanguage !== undefined ? normalizeLanguage(preferredLanguage) : undefined;
  if (preferredLanguage !== undefined && !language) {
    return badRequest(res, 'preferredLanguage must be ENGLISH, HINDI, or MARATHI');
  }

  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data:  {
        name,
        dob: dob ? new Date(dob) : undefined,
        mapLocation,
        tag,
        notes,
        notifWhatsApp,
        ...(language !== undefined && { preferredLanguage: language }),
      },
    });
    return success(res, { customer });
  } catch (err) {
    return error(res, 'Failed to update customer');
  }
};

// ── POST /api/v1/customers/:id/addresses ─────────────────────────────────────
const addCustomerAddress = async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!customer) return notFound(res, 'Customer not found');

    const payload = normalizeCustomerAddressInput(req.body);
    if (!payload.addressLine1) return badRequest(res, 'Address is required');

    const existingCount = await prisma.address.count({ where: { customerId: customer.id } });
    const makeDefault = Boolean(req.body.setAsDefault) || existingCount === 0;

    if (makeDefault) {
      await prisma.address.updateMany({
        where: { customerId: customer.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        customerId: customer.id,
        ...payload,
        isDefault: makeDefault,
      },
    });

    return success(res, { address }, 'Address saved', 201);
  } catch (err) {
    return error(res, 'Failed to save address');
  }
};

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, addCustomerAddress };
