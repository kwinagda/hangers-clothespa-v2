// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMERS CONTROLLER — Phase 3 CRM
// ─────────────────────────────────────────────────────────────────────────────

const prisma                                   = require('../config/database');
const { success, error, notFound, badRequest } = require('../utils/response');

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
  const { phone, name } = req.body;
  if (!phone) return badRequest(res, 'Phone is required');

  try {
    const normalized = phone.replace(/\D/g, '').slice(-10);
    const existing   = await prisma.customer.findUnique({ where: { phone: normalized } });
    if (existing) return badRequest(res, 'Customer with this phone already exists');

    const customer = await prisma.customer.create({
      data: { phone: normalized, name: name || null },
    });
    return success(res, { customer }, 'Customer created', 201);
  } catch (err) {
    return error(res, 'Failed to create customer');
  }
};

// ── PATCH /api/v1/customers/:id ───────────────────────────────────────────────
const updateCustomer = async (req, res) => {
  const { name, dob, mapLocation, tag, notes, notifWhatsApp } = req.body;
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data:  { name, dob: dob ? new Date(dob) : undefined, mapLocation, tag, notes, notifWhatsApp },
    });
    return success(res, { customer });
  } catch (err) {
    return error(res, 'Failed to update customer');
  }
};

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer };
