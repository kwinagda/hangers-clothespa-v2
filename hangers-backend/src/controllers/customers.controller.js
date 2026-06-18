// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMERS CONTROLLER — Phase 3 CRM
// ─────────────────────────────────────────────────────────────────────────────

const prisma                                   = require('../config/database');
const { success, error, notFound, badRequest } = require('../utils/response');
const { ADDRESS_LABELS, CUSTOMER_TAGS, DEFAULT_LANGUAGE, LANGUAGE_VALUES } = require('../config/master-data');
const { getReferralProgramSettings, REFERRAL_STATUS } = require('../services/referral.service');

const VALID_ADDRESS_LABELS = new Set(ADDRESS_LABELS.map((label) => label.value));
const VALID_CUSTOMER_TAGS = new Set(CUSTOMER_TAGS.map((tag) => tag.value));

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const isValidPhone = (value) => /^[6-9]\d{9}$/.test(String(value || '').replace(/\D/g, '').slice(-10));
const isValidPincode = (value) => !value || /^\d{6}$/.test(String(value).trim());
const isValidLatitude = (value) => value === null || (Number.isFinite(value) && value >= -90 && value <= 90);
const isValidLongitude = (value) => value === null || (Number.isFinite(value) && value >= -180 && value <= 180);

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
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const parseDateBoundary = (value, endOfDay = false) => {
  if (!value) return null;
  const parsed = new Date(`${String(value).trim()}${endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// ── GET /api/v1/customers ─────────────────────────────────────────────────────
const listCustomers = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 30), 100);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

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
          _count:  { select: { orders: { where: ORDER_ONLY_WHERE } } },
          orders:  {
            where: ORDER_ONLY_WHERE,
            take:    1,
            orderBy: { createdAt: 'desc' },
            select:  { orderNumber: true, status: true, createdAt: true, totalAmount: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.customer.count({ where }),
    ]);

    return success(res, {
      customers,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
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
        referrer: {
          select: {
            id: true,
            name: true,
            phone: true,
            referralCode: true,
          },
        },
        referralsMade: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            referred: {
              select: {
                id: true,
                name: true,
                phone: true,
                createdAt: true,
              },
            },
          },
        },
        orders:    {
          where: ORDER_ONLY_WHERE,
          orderBy: { createdAt: 'desc' },
          take:    20,
          include: { items: true },
        },
        _count: { select: { orders: { where: ORDER_ONLY_WHERE } } },
      },
    });
    if (!customer) return notFound(res, 'Customer not found');

    // Calculate lifetime value
    const ltv = await prisma.order.aggregate({
      where: { customerId: customer.id, documentType: 'ORDER', status: 'DELIVERED' },
      _sum:  { totalAmount: true },
    });

    const paymentEvents = await prisma.payment.findMany({
      where: {
        OR: [
          { customerId: customer.id },
          { order: { customerId: customer.id } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            paymentStatus: true,
            status: true,
          },
        },
        collectedByStaff: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    const referralProgram = await getReferralProgramSettings(prisma);
    const rewardedReferrals = customer.referralsMade.filter((referral) => referral.status === REFERRAL_STATUS.REWARDED);
    const pendingReferrals = customer.referralsMade.filter((referral) => referral.status === REFERRAL_STATUS.PENDING);
    const referralSummary = {
      referralCode: customer.referralCode || null,
      referredBy: customer.referrer || null,
      referredCount: rewardedReferrals.length,
      pendingCount: pendingReferrals.length,
      totalEarned: rewardedReferrals.reduce((sum, referral) => sum + Number(referral.creditAwarded || 0), 0),
      program: referralProgram,
      recentReferrals: customer.referralsMade.map((referral) => ({
        id: referral.id,
        status: referral.status,
        creditAwarded: referral.creditAwarded,
        createdAt: referral.createdAt,
        rewardedAt: referral.rewardedAt,
        referred: referral.referred,
      })),
    };
    const notificationSummary = {
      preferredLanguage: customer.preferredLanguage || DEFAULT_LANGUAGE,
      notifWhatsApp: customer.notifWhatsApp !== false,
      notifPush: customer.notifPush !== false,
      hasPushToken: Boolean(customer.pushToken),
      pushTokenPreview: customer.pushToken
        ? `${String(customer.pushToken).slice(0, 14)}...${String(customer.pushToken).slice(-6)}`
        : null,
    };
    const paymentSummary = {
      totalEvents: paymentEvents.length,
      totalRecorded: paymentEvents.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      onlineEvents: paymentEvents.filter((payment) => payment.method === 'RAZORPAY').length,
      lastPaymentAt: paymentEvents[0]?.createdAt || null,
    };

    return success(res, {
      customer,
      lifetimeValue: ltv._sum.totalAmount || 0,
      referralSummary,
      notificationSummary,
      paymentSummary,
      paymentEvents,
    });
  } catch (err) {
    return error(res, 'Failed to fetch customer');
  }
};

// ── GET /api/v1/customers/referrals/report ───────────────────────────────────
const getReferralReport = async (req, res) => {
  try {
    const from = parseDateBoundary(req.query.from, false);
    const to = parseDateBoundary(req.query.to, true);
    if ((req.query.from && !from) || (req.query.to && !to)) {
      return badRequest(res, 'Invalid referral report date range');
    }

    const where = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const [referrals, totals, topReferrersRaw, settings] = await Promise.all([
      prisma.referral.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          referrer: {
            select: { id: true, name: true, phone: true, referralCode: true, walletBalance: true },
          },
          referred: {
            select: { id: true, name: true, phone: true, createdAt: true },
          },
        },
      }),
      prisma.referral.aggregate({
        where,
        _count: { id: true },
        _sum: { creditAwarded: true },
      }),
      prisma.referral.groupBy({
        by: ['referrerId'],
        where: { ...where, status: REFERRAL_STATUS.REWARDED },
        _count: { id: true },
        _sum: { creditAwarded: true },
        _max: { createdAt: true },
        orderBy: { _count: { id: 'desc' } },
        take: 15,
      }),
      getReferralProgramSettings(prisma),
    ]);

    const referrerIds = topReferrersRaw.map((item) => item.referrerId);
    const referrers = referrerIds.length
      ? await prisma.customer.findMany({
          where: { id: { in: referrerIds } },
          select: { id: true, name: true, phone: true, referralCode: true, walletBalance: true },
        })
      : [];
    const referrerMap = Object.fromEntries(referrers.map((item) => [item.id, item]));

    const topReferrers = topReferrersRaw.map((item) => ({
      referrer: referrerMap[item.referrerId] || { id: item.referrerId, name: 'Unknown customer', phone: null, referralCode: null, walletBalance: 0 },
      referredCount: item._count.id,
      totalEarned: Number(item._sum.creditAwarded || 0),
      lastReferralAt: item._max.createdAt || null,
    }));

    return success(res, {
      summary: {
        totalReferrals: totals._count.id || 0,
        totalCreditsAwarded: Number(totals._sum.creditAwarded || 0),
        uniqueReferrers: topReferrers.length,
        rewardedReferrals: referrals.filter((item) => item.status === REFERRAL_STATUS.REWARDED).length,
        pendingReferrals: referrals.filter((item) => item.status === REFERRAL_STATUS.PENDING).length,
        window: {
          from: from ? from.toISOString() : null,
          to: to ? to.toISOString() : null,
        },
      },
      program: settings,
      topReferrers,
      recentReferrals: referrals,
    });
  } catch (err) {
    return error(res, 'Failed to fetch referral report');
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
    if (!isValidPhone(normalized)) return badRequest(res, 'Please enter a valid 10-digit Indian mobile number');
    if (name !== undefined && name !== null && String(name).trim().length && String(name).trim().length < 2) {
      return badRequest(res, 'Name must be at least 2 characters');
    }
    const existing   = await prisma.customer.findUnique({ where: { phone: normalized } });
    if (existing) return badRequest(res, 'Customer with this phone already exists');

    const customer = await prisma.customer.create({
      data: {
        phone: normalized,
        name: name?.trim() || null,
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
  if (name !== undefined && name !== null && String(name).trim().length && String(name).trim().length < 2) {
    return badRequest(res, 'Name must be at least 2 characters');
  }
  if (tag !== undefined && tag !== null && tag !== '' && !VALID_CUSTOMER_TAGS.has(String(tag).trim().toUpperCase())) {
    return badRequest(res, 'Invalid customer tag');
  }
  if (dob !== undefined && dob !== null && Number.isNaN(new Date(dob).getTime())) {
    return badRequest(res, 'Invalid date of birth');
  }
  if (notifWhatsApp !== undefined && typeof notifWhatsApp !== 'boolean') {
    return badRequest(res, 'notifWhatsApp must be true or false');
  }

  try {
    const existing = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) return notFound(res, 'Customer not found');

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data:  {
        ...(name !== undefined && { name: name?.trim() || null }),
        dob: dob ? new Date(dob) : undefined,
        mapLocation,
        ...(tag !== undefined && { tag: tag ? String(tag).trim().toUpperCase() : null }),
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
    if (!VALID_ADDRESS_LABELS.has(payload.label)) return badRequest(res, 'Invalid address label');
    if (!isValidPincode(payload.pincode)) return badRequest(res, 'Pincode must be a 6-digit value');
    if (!isValidLatitude(payload.latitude) || !isValidLongitude(payload.longitude)) {
      return badRequest(res, 'Invalid address coordinates');
    }

    const existingCount = await prisma.address.count({ where: { customerId: customer.id } });
    const makeDefault = req.body.setAsDefault === true || existingCount === 0;

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

// ── GET /api/v1/customers/:id/stats ──────────────────────────────────────────
const getCustomerStats = async (req, res) => {
  try {
    const { id } = req.params;

    const [orders, payments] = await Promise.all([
      prisma.order.findMany({
        where: { customerId: id, ...ORDER_ONLY_WHERE },
        select: { id: true, totalAmount: true, paidAmount: true, writeOffAmount: true, status: true, createdAt: true, paymentStatus: true }
      }),
      prisma.payment.findMany({
        where: { customerId: id },
        select: { amount: true, createdAt: true }
      })
    ]);

    const totalOrders    = orders.length;
    const totalSpend     = payments.reduce((s, p) => s + p.amount, 0);
    const avgOrderValue  = totalOrders > 0 ? totalSpend / totalOrders : 0;
    const lastOrder      = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const outstanding    = orders
      .filter(o => o.paymentStatus === 'UNPAID' || o.paymentStatus === 'PARTIAL')
      .reduce((s, o) => s + Math.max(0, (o.totalAmount - (o.paidAmount || 0) - (o.writeOffAmount || 0)) || 0), 0);
    const completedOrders = orders.filter(o => o.status === 'DELIVERED').length;

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { loyaltyPoints: true }
    });

    res.json({
      success: true,
      data: {
        totalOrders,
        totalSpend,
        avgOrderValue,
        outstanding,
        completedOrders,
        loyaltyPoints:   customer?.loyaltyPoints || 0,
        lastOrderDate:   lastOrder?.createdAt || null,
        lastOrderStatus: lastOrder?.status || null,
      }
    });
  } catch (err) {
    return error(res, 'Failed to fetch customer stats');
  }
};

// ── PATCH /api/v1/customers/:id/tag ──────────────────────────────────────────
const { z } = require('zod');
const customerTagSchema = z.object({
  tag:   z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
}).strict();

const updateCustomerTag = async (req, res) => {
  try {
    const parsed = customerTagSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid customer tag payload');
    const { tag, notes } = parsed.data;
    const existingCustomer = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existingCustomer) return notFound(res, 'Customer not found');
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data:  { tag: tag || null, notes: notes || null }
    });
    return success(res, customer);
  } catch (err) {
    return error(res, 'Failed to update customer tag');
  }
};

module.exports = { listCustomers, getCustomer, getReferralReport, createCustomer, updateCustomer, addCustomerAddress, getCustomerStats, updateCustomerTag };
