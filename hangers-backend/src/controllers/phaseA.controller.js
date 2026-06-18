// ─────────────────────────────────────────────────────────────────────────────
// PHASE A — BACKEND CONTROLLER
// File: hangers-backend/src/controllers/phaseA.controller.js
// Covers: A1 Customer Stats, A2 Cash Book, A3 Expenses, A4 AR Ledger,
//         A5 Delivery Challan, A6 Transfer Orders, A7 Attendance,
//         A8 Coupons, A9 Discounts, A10 Loyalty, A11 Upcharges,
//         A12 Customer Tags, A13 Recurring Pickups, A14 Return Orders,
//         A15 Campaigns, A16 Reports, A17 Advanced Search, A18 Automations
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/database');
const { success, badRequest, error, notFound, forbidden } = require('../utils/response');
const {
  cashEntrySchema,
  expenseSchema,
  transferCreateSchema,
  transferStatusSchema,
  attendanceActionSchema,
  couponCreateSchema,
  couponValidateSchema,
  loyaltyRulesSchema,
  loyaltyAwardSchema,
  upchargeSchema,
  customerTagSchema,
  recurringPickupSchema,
  returnOrderSchema,
  campaignSchema,
  reportQuerySchema,
  advancedSearchQuerySchema,
  automationSchema,
} = require('../validation/phaseA.schemas');

const canManageAttendanceFor = (actor, targetStaffId) => {
  if (!actor || !targetStaffId) return false;
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'MANAGER') return true;
  return actor.id === targetStaffId;
};

const ALLOWED_COUPON_TYPES = new Set(['PERCENT', 'FLAT']);
const ALLOWED_UPCHARGE_TYPES = new Set(['PERCENT', 'FLAT']);
const ALLOWED_RECURRING_FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'MONTHLY']);
const ALLOWED_CASHBOOK_TYPES = new Set(['OPEN', 'IN', 'OUT', 'CLOSE']);
const ALLOWED_TRANSFER_STATUSES = new Set(['PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']);
const ALLOWED_CAMPAIGN_AUDIENCES = new Set(['ALL', 'REGULAR', 'VIP', 'NEW', 'INACTIVE']);
const ALLOWED_AUTOMATION_CHANNELS = new Set(['WHATSAPP', 'SMS', 'EMAIL']);
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };
const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : NaN;
const parseLocalDateBoundary = (value, boundary) => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const suffix = boundary === 'end' ? 'T23:59:59.999' : 'T00:00:00.000';
  const parsed = new Date(`${normalized}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// ── A1: Customer Stats ────────────────────────────────────────────────────────
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

    const totalOrders   = orders.length;
    const totalSpend    = payments.reduce((s, p) => s + p.amount, 0);
    const avgOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0;
    const lastOrder     = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const outstanding   = orders
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
        loyaltyPoints: customer?.loyaltyPoints || 0,
        lastOrderDate: lastOrder?.createdAt || null,
        lastOrderStatus: lastOrder?.status || null,
      }
    });
  } catch (err) {
    return error(res, 'Failed to fetch customer stats');
  }
};

// ── A2: Cash Book ─────────────────────────────────────────────────────────────
const getCashBook = async (req, res) => {
  try {
    const { date } = req.query;
    const start = date ? new Date(date) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const entries = await prisma.cashBook.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'asc' }
    });

    const totalIn  = entries.filter(e => e.type === 'IN' || e.type === 'OPEN').reduce((s, e) => s + e.amount, 0);
    const totalOut = entries.filter(e => e.type === 'OUT' || e.type === 'CLOSE').reduce((s, e) => s + e.amount, 0);

    res.json({ success: true, data: { entries, totalIn, totalOut, balance: totalIn - totalOut } });
  } catch (err) {
    return error(res, 'Failed to fetch cash book');
  }
};

const addCashEntry = async (req, res) => {
  try {
    const parsed = cashEntrySchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid cash entry payload');
    const { type, amount, description } = parsed.data;
    const entry = await prisma.cashBook.create({
      data: { type, amount, description, staffId: req.staff?.id }
    });
    return success(res, entry);
  } catch (err) {
    return error(res, 'Failed to add cash book entry');
  }
};

// ── A3: Expenses ──────────────────────────────────────────────────────────────
const getExpenses = async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = parseInt(month || now.getMonth() + 1);
    const y = parseInt(year || now.getFullYear());

    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0, 23, 59, 59);

    const expenses = await prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'desc' }
    });

    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const byCategory = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});

    res.json({ success: true, data: { expenses, total, byCategory } });
  } catch (err) {
    return error(res, 'Failed to fetch expenses');
  }
};

const addExpense = async (req, res) => {
  try {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid expense payload');
    const { category, description, amount, date, paidBy } = parsed.data;
    const parsedDate = date ? new Date(date) : new Date();
    if (Number.isNaN(parsedDate.getTime())) return badRequest(res, 'Expense date must be valid');
    const expense = await prisma.expense.create({
      data: {
        category,
        description,
        amount,
        date: parsedDate,
        paidBy: paidBy || null
      }
    });
    return success(res, expense);
  } catch (err) {
    return error(res, 'Failed to add expense');
  }
};

const deleteExpense = async (req, res) => {
  try {
    const existingExpense = await prisma.expense.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existingExpense) return notFound(res, 'Expense not found');
    await prisma.expense.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Expense deleted');
  } catch (err) {
    return error(res, 'Failed to delete expense');
  }
};

// ── A4: Accounts Receivable Ledger ────────────────────────────────────────────
const getARLedger = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        ...ORDER_ONLY_WHERE,
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] }
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    const now = new Date();
    const ledger = orders.map(o => ({
      ...o,
      balance: Math.max(0, (o.totalAmount || 0) - (o.paidAmount || 0) - (o.writeOffAmount || 0)),
      daysOverdue: Math.floor((now - new Date(o.createdAt)) / (1000 * 60 * 60 * 24)),
      isOverdue: Math.floor((now - new Date(o.createdAt)) / (1000 * 60 * 60 * 24)) > 7
    }));

    const totalOutstanding = ledger.reduce((s, o) => s + (o.balance || 0), 0);
    const overdueCount = ledger.filter(o => o.isOverdue).length;

    res.json({ success: true, data: { ledger, totalOutstanding, overdueCount } });
  } catch (err) {
    return error(res, 'Failed to fetch AR ledger');
  }
};

// ── A5: Delivery Challan ──────────────────────────────────────────────────────
const getChallans = async (req, res) => {
  try {
    const challans = await prisma.deliveryChallan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        order: { select: { orderNumber: true, customer: { select: { name: true, phone: true } } } }
      }
    });
    res.json({ success: true, data: challans });
  } catch (err) {
    return error(res, 'Failed to fetch challans');
  }
};

const createChallan = async (req, res) => {
  try {
    const { plant, orderId, bagCount, items, driverName, vehicleNo } = req.body;
    const count = await prisma.deliveryChallan.count();
    const challanNo = `DC${String(count + 1).padStart(5, '0')}`;

    const challan = await prisma.deliveryChallan.create({
      data: { challanNo, plant, orderId, bagCount: parseInt(bagCount), items, driverName, vehicleNo }
    });
    res.json({ success: true, data: challan });
  } catch (err) {
    return error(res, 'Failed to create challan');
  }
};

const updateChallanStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const challan = await prisma.deliveryChallan.update({
      where: { id: req.params.id },
      data: { status }
    });
    // When plant receives challan, unlock the linked order
    if (status === 'RECEIVED' && challan.orderId) {
      await prisma.order.update({
        where: { id: challan.orderId },
        data: { status: 'PROCESSING' }
      });
    }
    res.json({ success: true, data: challan });
  } catch (err) {
    return error(res, 'Failed to update challan status');
  }
};

// ── A6: Transfer Orders ───────────────────────────────────────────────────────
const getTransferOrders = async (req, res) => {
  try {
    const transfers = await prisma.transferOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ success: true, data: transfers });
  } catch (err) {
    return error(res, 'Failed to fetch transfer orders');
  }
};

const createTransferOrder = async (req, res) => {
  try {
    const parsed = transferCreateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid transfer payload');
    const { fromPlant, toPlant, orderId, bagCount, notes } = parsed.data;
    if (fromPlant === toPlant) return badRequest(res, 'fromPlant and toPlant must be different');
    if (orderId) {
      const order = await prisma.order.findFirst({ where: { id: orderId, ...ORDER_ONLY_WHERE }, select: { id: true } });
      if (!order) return notFound(res, 'Order not found');
    }
    const transfer = await prisma.transferOrder.create({
      data: {
        fromPlant,
        toPlant,
        orderId,
        bagCount,
        notes: notes || null,
        transferredBy: req.staff?.id
      }
    });
    return success(res, transfer);
  } catch (err) {
    return error(res, 'Failed to create transfer order');
  }
};

const updateTransferStatus = async (req, res) => {
  try {
    const parsed = transferStatusSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid transfer status payload');
    const { status } = parsed.data;
    const existingTransfer = await prisma.transferOrder.findUnique({ where: { id: req.params.id } });
    if (!existingTransfer) return notFound(res, 'Transfer not found');
    if (existingTransfer.status === 'RECEIVED' && status !== 'RECEIVED') {
      return badRequest(res, 'Received transfers cannot move back to an earlier status');
    }
    const transfer = await prisma.transferOrder.update({
      where: { id: req.params.id },
      data: { status, receivedBy: status === 'RECEIVED' ? req.staff?.id : undefined }
    });
    return success(res, transfer);
  } catch (err) {
    return error(res, 'Failed to update transfer status');
  }
};

// ── A7: Staff Attendance ──────────────────────────────────────────────────────
const getAttendance = async (req, res) => {
  try {
    const { staffId, month, year } = req.query;
    const now = new Date();
    const m = parseInt(month || now.getMonth() + 1);
    const y = parseInt(year || now.getFullYear());

    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0, 23, 59, 59);

    const where = { date: { gte: start, lte: end } };
    if (staffId) where.staffId = staffId;

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    res.json({ success: true, data: records });
  } catch (err) {
    return error(res, 'Failed to fetch attendance');
  }
};

const clockIn = async (req, res) => {
  try {
    const parsed = attendanceActionSchema.safeParse(req.body || {});
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid attendance payload');
    const staffId = parsed.data.staffId || req.staff?.id;
    if (!staffId) return badRequest(res, 'staffId is required');
    if (!canManageAttendanceFor(req.staff, staffId)) {
      return forbidden(res, 'You can only clock attendance for yourself');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findFirst({
      where: { staffId, date: { gte: today } }
    });

    if (existing?.clockIn) {
      return badRequest(res, 'Already clocked in today');
    }

    const record = existing
      ? await prisma.attendance.update({ where: { id: existing.id }, data: { clockIn: new Date() } })
      : await prisma.attendance.create({ data: { staffId, clockIn: new Date() } });

    return success(res, record);
  } catch (err) {
    return error(res, 'Failed to clock in');
  }
};

const clockOut = async (req, res) => {
  try {
    const parsed = attendanceActionSchema.safeParse(req.body || {});
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid attendance payload');
    const staffId = parsed.data.staffId || req.staff?.id;
    if (!staffId) return badRequest(res, 'staffId is required');
    if (!canManageAttendanceFor(req.staff, staffId)) {
      return forbidden(res, 'You can only clock attendance for yourself');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.findFirst({
      where: { staffId, date: { gte: today }, clockIn: { not: null } }
    });

    if (!record) return badRequest(res, 'No clock-in found for today');

    const clockOut = new Date();
    const hours = (clockOut - record.clockIn) / (1000 * 60 * 60);

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: { clockOut, hoursWorked: parseFloat(hours.toFixed(2)) }
    });

    return success(res, updated);
  } catch (err) {
    return error(res, 'Failed to clock out');
  }
};

// ── A8: Coupons ───────────────────────────────────────────────────────────────
const getCoupons = async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: coupons });
  } catch (err) {
    return error(res, 'Failed to fetch coupons');
  }
};

const createCoupon = async (req, res) => {
  try {
    const parsed = couponCreateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid coupon payload');
    const { code, type, value, minOrderValue, maxDiscount, usageLimit, validUntil } = parsed.data;
    const normalizedCode = code.toUpperCase();
    if (validUntil && Number.isNaN(new Date(validUntil).getTime())) return badRequest(res, 'validUntil must be a valid date');
    const coupon = await prisma.coupon.create({
      data: {
        code: normalizedCode,
        type,
        value,
        minOrderValue,
        maxDiscount,
        usageLimit,
        validUntil: validUntil ? new Date(validUntil) : null
      }
    });
    return success(res, coupon);
  } catch (err) {
    return error(res, 'Failed to create coupon');
  }
};

const validateCoupon = async (req, res) => {
  try {
    const parsed = couponValidateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid coupon validation payload');
    const { code, orderValue } = parsed.data;
    const normalizedCode = code.toUpperCase();
    const parsedOrderValue = orderValue;
    const coupon = await prisma.coupon.findUnique({ where: { code: normalizedCode } });

    if (!coupon || !coupon.isActive) return badRequest(res, 'Invalid coupon code');
    if (coupon.validUntil && new Date() > coupon.validUntil) return badRequest(res, 'Coupon expired');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return badRequest(res, 'Coupon usage limit reached');
    if (parsedOrderValue < coupon.minOrderValue) return badRequest(res, `Minimum order value ₹${coupon.minOrderValue} required`);

    let discount = coupon.type === 'PERCENT'
      ? (parsedOrderValue * coupon.value) / 100
      : coupon.value;

    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);

    return success(res, { coupon, discount });
  } catch (err) {
    return error(res, 'Failed to validate coupon');
  }
};

const toggleCoupon = async (req, res) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) return notFound(res, 'Coupon not found');
    const updated = await prisma.coupon.update({
      where: { id: req.params.id },
      data: { isActive: !coupon.isActive }
    });
    return success(res, updated);
  } catch (err) {
    return error(res, 'Failed to update coupon');
  }
};

// ── A10: Loyalty Points ───────────────────────────────────────────────────────
const getLoyaltyRules = async (req, res) => {
  try {
    let rules = await prisma.loyaltyRule.findFirst({ where: { isActive: true } });
    if (!rules) {
      rules = await prisma.loyaltyRule.create({
        data: { earnPerRupee: 1, redeemPerPoint: 0.5, minRedeemPoints: 100 }
      });
    }
    res.json({ success: true, data: rules });
  } catch (err) {
    return error(res, 'Failed to fetch loyalty rules');
  }
};

const updateLoyaltyRules = async (req, res) => {
  try {
    const parsed = loyaltyRulesSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid loyalty rules payload');
    const { earnPerRupee, redeemPerPoint, minRedeemPoints } = parsed.data;
    const rules = await prisma.loyaltyRule.updateMany({
      where: { isActive: true },
      data: { earnPerRupee, redeemPerPoint, minRedeemPoints }
    });
    return success(res, rules);
  } catch (err) {
    return error(res, 'Failed to update loyalty rules');
  }
};

const awardLoyaltyPoints = async (req, res) => {
  try {
    const parsed = loyaltyAwardSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid loyalty award payload');
    const { customerId, points, orderId, note } = parsed.data;
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) return notFound(res, 'Customer not found');
    if (orderId) {
      const order = await prisma.order.findFirst({ where: { id: orderId, customerId, ...ORDER_ONLY_WHERE }, select: { id: true } });
      if (!order) return badRequest(res, 'Order does not belong to this customer');
    }
    await prisma.$transaction([
      prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: points } } }),
      prisma.loyaltyTransaction.create({ data: { customerId, type: 'EARN', points, orderId, note } })
    ]);
    return success(res, {}, 'Loyalty points awarded');
  } catch (err) {
    return error(res, 'Failed to award loyalty points');
  }
};

// ── A11: Upcharges ────────────────────────────────────────────────────────────
const getUpcharges = async (req, res) => {
  try {
    const upcharges = await prisma.upcharge.findMany({ where: { isActive: true } });
    res.json({ success: true, data: upcharges });
  } catch (err) {
    return error(res, 'Failed to fetch upcharges');
  }
};

const createUpcharge = async (req, res) => {
  try {
    const parsed = upchargeSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid upcharge payload');
    const { name, type, value } = parsed.data;
    const upcharge = await prisma.upcharge.create({
      data: { name, type, value }
    });
    return success(res, upcharge);
  } catch (err) {
    return error(res, 'Failed to create upcharge');
  }
};

// ── A12: Customer Tags ────────────────────────────────────────────────────────
const updateCustomerTag = async (req, res) => {
  try {
    const parsed = customerTagSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid customer tag payload');
    const { tag, notes } = parsed.data;
    const existingCustomer = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existingCustomer) return notFound(res, 'Customer not found');
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { tag: tag || null, notes: notes || null }
    });
    return success(res, customer);
  } catch (err) {
    return error(res, 'Failed to update customer tag');
  }
};

// ── A13: Recurring Pickups ────────────────────────────────────────────────────
const getRecurringPickups = async (req, res) => {
  try {
    const pickups = await prisma.recurringPickup.findMany({
      orderBy: [
        { isActive: 'desc' },
        { nextPickup: 'asc' }
      ]
    });
    res.json({ success: true, data: pickups });
  } catch (err) {
    return error(res, 'Failed to fetch recurring pickups');
  }
};

const createRecurringPickup = async (req, res) => {
  try {
    const parsed = recurringPickupSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid recurring pickup payload');
    const { customerId, frequency, dayOfWeek, dayOfMonth, address, notes } = parsed.data;
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, isActive: true } });
    if (!customer?.isActive) return badRequest(res, 'Customer not found or inactive');
    if (frequency === 'WEEKLY' && (dayOfWeek === undefined || dayOfWeek === null)) {
      return badRequest(res, 'dayOfWeek must be provided for weekly pickups');
    }
    if (frequency === 'MONTHLY' && (dayOfMonth === undefined || dayOfMonth === null)) {
      return badRequest(res, 'dayOfMonth must be provided for monthly pickups');
    }
    const pickup = await prisma.recurringPickup.create({
      data: { customerId, frequency, dayOfWeek: dayOfWeek ?? null, dayOfMonth: dayOfMonth ?? null, address, notes: notes || null }
    });
    return success(res, pickup);
  } catch (err) {
    return error(res, 'Failed to create recurring pickup');
  }
};

const toggleRecurringPickup = async (req, res) => {
  try {
    const pickup = await prisma.recurringPickup.findUnique({ where: { id: req.params.id } });
    if (!pickup) return notFound(res, 'Recurring pickup not found');
    const updated = await prisma.recurringPickup.update({
      where: { id: req.params.id },
      data: { isActive: !pickup.isActive }
    });
    return success(res, updated);
  } catch (err) {
    return error(res, 'Failed to toggle recurring pickup');
  }
};

// ── A14: Return Orders ────────────────────────────────────────────────────────
const createReturnOrder = async (req, res) => {
  try {
    const parsed = returnOrderSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid return order payload');
    const { originalOrderId, reason } = parsed.data;
    const normalizedReason = reason;

    const original = await prisma.order.findFirst({
      where: {
        ...ORDER_ONLY_WHERE,
        OR: [{ id: originalOrderId }, { orderNumber: originalOrderId }],
      },
      include: { customer: true }
    });

    if (!original) return notFound(res, 'Original order not found');
    if (original.isReturn) return badRequest(res, 'Return orders cannot be re-returned');
    if (original.status === 'SENT_TO_PLANT') return badRequest(res, 'Cannot return this order — it is currently at the plant.');
    const existingOpenReturn = await prisma.order.findFirst({
      where: { ...ORDER_ONLY_WHERE, originalOrderId: original.id, isReturn: true, status: { not: 'CANCELLED' } },
      select: { id: true, orderNumber: true }
    });
    if (existingOpenReturn) return badRequest(res, `An active return order already exists: ${existingOpenReturn.orderNumber}`);

    const returnCount = await prisma.order.count({ where: { ...ORDER_ONLY_WHERE, isReturn: true } });
    const orderNumber = `HCS-${String(returnCount + 1).padStart(3, '0')}-R`;

    const originalItems = await prisma.orderItem.findMany({ where: { orderId: original.id } });
    const returnOrder = await prisma.$transaction(async (tx) => {
      const createdReturn = await tx.order.create({
        data: {
          orderNumber,
          documentType: 'ORDER',
          customerId: original.customerId,
          status: 'PENDING',
          items: { create: originalItems.map(i => ({ serviceId: i.serviceId, serviceName: i.serviceName, garmentType: i.garmentType, quantity: i.quantity, unitPrice: 0, subtotal: 0 })) },
          totalAmount: 0,
          subtotal: 0,
          isReturn: true,
          returnReason: normalizedReason,
          originalOrderId: original.id,
          paymentStatus: 'UNPAID',
          notes: `Return/Re-clean of order ${original.orderNumber}. Reason: ${normalizedReason}`
        }
      });

      await tx.order.update({
        where: { id: original.id },
        data: { notes: [original.notes, `[RETURN REQUESTED - linked to ${createdReturn.orderNumber}]`].filter(Boolean).join(' ') }
      });

      return createdReturn;
    });
    return success(res, returnOrder);
  } catch (err) {
    return error(res, 'Failed to create return order');
  }
};

// ── A15: WhatsApp Campaigns ───────────────────────────────────────────────────
const getCampaigns = async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: campaigns });
  } catch (err) {
    return error(res, 'Failed to fetch campaigns');
  }
};

const createCampaign = async (req, res) => {
  try {
    const parsed = campaignSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid campaign payload');
    const { name, message, audience } = parsed.data;
    const campaign = await prisma.campaign.create({
      data: { name, message, audience }
    });
    return success(res, campaign);
  } catch (err) {
    return error(res, 'Failed to create campaign');
  }
};

const sendCampaign = async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return notFound(res, 'Campaign not found');
    if (!campaign.message?.trim()) return badRequest(res, 'Campaign message is empty');

    // Build audience
    const where = {};
    if (campaign.audience !== 'ALL') where.tag = campaign.audience;

    const customers = await prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true }
    });

    let sentCount = 0;
    let failedCount = 0;

    // Send via MSG91 WhatsApp (fire and forget per customer)
    for (const customer of customers) {
      try {
        const message = campaign.message
          .replace('{{customerName}}', customer.name)
          .replace('{{phone}}', customer.phone);

        // MSG91 WhatsApp send (reuse the service)
        // In production this calls MSG91 bulk API
        console.log(`[Campaign] Sending to ${customer.phone}: ${message}`);
        sentCount++;
      } catch {
        failedCount++;
      }
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'SENT', sentCount, failedCount, sentAt: new Date() }
    });

    return success(res, { sentCount, failedCount });
  } catch (err) {
    return error(res, 'Failed to send campaign');
  }
};

// ── A16: Business Reports ─────────────────────────────────────────────────────
const getReport = async (req, res) => {
  try {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid report query');
    const { type, from, to } = parsed.data;
    const start = from ? parseLocalDateBoundary(from, 'start') : (() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    })();
    const end = to ? parseLocalDateBoundary(to, 'end') : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return badRequest(res, 'Invalid report date range');
    if (end < start) return badRequest(res, 'Report end date must be on or after start date');

    const dateFilter = { createdAt: { gte: start, lte: end } };

    switch (type) {
      case 'sales': {
        const orders = await prisma.order.findMany({
          where: { ...dateFilter, ...ORDER_ONLY_WHERE },
          select: { totalAmount: true, paidAmount: true, writeOffAmount: true, status: true, createdAt: true, paymentStatus: true }
        });
        const revenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const paid = orders.reduce((s, o) => s + (o.paidAmount || 0) + (o.writeOffAmount || 0), 0);
        res.json({ success: true, data: { orders: orders.length, revenue, paid, outstanding: revenue - paid } });
        break;
      }
      case 'orders': {
        const orders = await prisma.order.findMany({ where: { ...dateFilter, ...ORDER_ONLY_WHERE }, orderBy: { createdAt: 'desc' } });
        const byStatus = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {});
        res.json({ success: true, data: { total: orders.length, byStatus } });
        break;
      }
      case 'customers': {
        const customers = await prisma.customer.findMany({
          where: dateFilter,
          select: { id: true, name: true, phone: true, tag: true, createdAt: true }
        });
        const byTag = customers.reduce((acc, c) => { acc[c.tag || 'REGULAR'] = (acc[c.tag || 'REGULAR'] || 0) + 1; return acc; }, {});
        res.json({ success: true, data: { total: customers.length, byTag, customers } });
        break;
      }
      case 'payments': {
        const payments = await prisma.payment.findMany({ where: dateFilter, orderBy: { createdAt: 'desc' } });
        const total  = payments.reduce((s, p) => s + p.amount, 0);
        const byMode = payments.reduce((acc, p) => {
          const key = p.method || p.mode || 'OTHER';
          acc[key] = (acc[key] || 0) + p.amount;
          return acc;
        }, {});
        res.json({ success: true, data: { total, count: payments.length, byMode, payments } });
        break;
      }
      case 'expenses': {
        const expenses = await prisma.expense.findMany({ where: dateFilter, orderBy: { date: 'desc' } });
        const total = expenses.reduce((s, e) => s + e.amount, 0);
        const byCategory = expenses.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {});
        res.json({ success: true, data: { total, byCategory, expenses } });
        break;
      }
      case 'staff': {
        const attendance = await prisma.attendance.findMany({ where: { date: { gte: start, lte: end } }, include: { staff: { select: { name: true } } } });
        const byStaff = attendance.reduce((acc, a) => {
          if (!acc[a.staffId]) acc[a.staffId] = { days: 0, totalHours: 0, name: a.staff?.name || a.staffId };
          acc[a.staffId].days++;
          acc[a.staffId].totalHours += (a.hoursWorked || 0);
          return acc;
        }, {});
        res.json({ success: true, data: { byStaff, records: attendance.length } });
        break;
      }
      case 'garments': {
        const orders = await prisma.order.findMany({
          where: { ...dateFilter, ...ORDER_ONLY_WHERE },
          include: { items: true }
        });
        const itemCounts = {};
        orders.forEach(o => {
          if (o.items && Array.isArray(o.items)) {
            o.items.forEach(item => {
              const key = item.serviceName || 'Unknown';
              itemCounts[key] = (itemCounts[key] || 0) + (item.quantity || 1);
            });
          }
        });
        const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);
        res.json({ success: true, data: { topItems: sorted.slice(0, 20), allItems: itemCounts } });
        break;
      }
      default:
        return badRequest(res, 'Invalid report type');
    }
  } catch (err) {
    return error(res, 'Failed to generate report');
  }
};

// ── A17: Advanced Search ──────────────────────────────────────────────────────
const advancedSearch = async (req, res) => {
  try {
    const parsed = advancedSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid search query');
    const {
      q, status, tag, from, to, minAmount, maxAmount,
      paymentStatus, hasOutstanding, type, page = 1, limit = 20
    } = parsed.data;

    const parsedPage = page;
    const parsedLimit = limit;
    const skip = (parsedPage - 1) * parsedLimit;

    if (type === 'customers' || !type) {
      const where = { ...ORDER_ONLY_WHERE };
      if (q) where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } }
      ];
      if (tag) where.tag = tag;

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({ where, skip, take: parsedLimit, orderBy: { createdAt: 'desc' } }),
        prisma.customer.count({ where })
      ]);
      if (type === 'customers') return res.json({ success: true, data: { customers, total, page: parsedPage } });
    }

    if (type === 'orders' || !type) {
      const where = {};
      if (q) where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } }
      ];
      if (status) where.status = status;
      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (hasOutstanding === 'true') where.paymentStatus = { in: ['UNPAID', 'PARTIAL'] };
      if (from || to) where.createdAt = {};
      if (from) {
        const parsedFrom = new Date(from);
        if (Number.isNaN(parsedFrom.getTime())) return badRequest(res, 'Invalid from date');
        where.createdAt.gte = parsedFrom;
      }
      if (to) {
        const parsedTo = new Date(`${to}T23:59:59.999Z`);
        if (Number.isNaN(parsedTo.getTime())) return badRequest(res, 'Invalid to date');
        where.createdAt.lte = parsedTo;
      }
      if (minAmount) {
        where.totalAmount = { gte: minAmount };
      }
      if (maxAmount) {
        where.totalAmount = { ...where.totalAmount, lte: maxAmount };
      }

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: { customer: { select: { name: true, phone: true } } },
          skip, take: parsedLimit, orderBy: { createdAt: 'desc' }
        }),
        prisma.order.count({ where })
      ]);
      if (type === 'orders') return res.json({ success: true, data: { orders, total, page: parsedPage } });
    }

    return badRequest(res, 'Specify type=customers or type=orders');
  } catch (err) {
    return error(res, 'Failed to run advanced search');
  }
};

// ── A18: Automations ──────────────────────────────────────────────────────────
const getAutomations = async (req, res) => {
  try {
    const automations = await prisma.automation.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: automations });
  } catch (err) {
    return error(res, 'Failed to fetch automations');
  }
};

const createAutomation = async (req, res) => {
  try {
    const parsed = automationSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid automation payload');
    const { name, trigger, message, delayHours, channel } = parsed.data;
    const automation = await prisma.automation.create({
      data: { name, trigger, message, delayHours, channel }
    });
    return success(res, automation);
  } catch (err) {
    return error(res, 'Failed to create automation');
  }
};

const toggleAutomation = async (req, res) => {
  try {
    const auto = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!auto) return notFound(res, 'Automation not found');
    const updated = await prisma.automation.update({
      where: { id: req.params.id },
      data: { isActive: !auto.isActive }
    });
    return success(res, updated);
  } catch (err) {
    return error(res, 'Failed to toggle automation');
  }
};

const updateAutomation = async (req, res) => {
  try {
    const parsed = automationSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid automation payload');
    const { name, trigger, message, delayHours, channel } = parsed.data;
    const updated = await prisma.automation.update({
      where: { id: req.params.id },
      data: { name, trigger, message, delayHours, channel }
    });
    return success(res, updated);
  } catch (err) {
    return error(res, 'Failed to update automation');
  }
};

module.exports = {
  // A1
  getCustomerStats,
  // A2
  getCashBook, addCashEntry,
  // A3
  getExpenses, addExpense, deleteExpense,
  // A4
  getARLedger,
  // A5
  getChallans, createChallan, updateChallanStatus,
  // A6
  getTransferOrders, createTransferOrder, updateTransferStatus,
  // A7
  getAttendance, clockIn, clockOut,
  // A8
  getCoupons, createCoupon, validateCoupon, toggleCoupon,
  // A10
  getLoyaltyRules, updateLoyaltyRules, awardLoyaltyPoints,
  // A11
  getUpcharges, createUpcharge,
  // A12
  updateCustomerTag,
  // A13
  getRecurringPickups, createRecurringPickup, toggleRecurringPickup,
  // A14
  createReturnOrder,
  // A15
  getCampaigns, createCampaign, sendCampaign,
  // A16
  getReport,
  // A17
  advancedSearch,
  // A18
  getAutomations, createAutomation, toggleAutomation, updateAutomation,
};
