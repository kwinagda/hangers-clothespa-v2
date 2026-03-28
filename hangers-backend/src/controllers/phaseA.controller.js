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

// ── A1: Customer Stats ────────────────────────────────────────────────────────
const getCustomerStats = async (req, res) => {
  try {
    const { id } = req.params;

    const [orders, payments] = await Promise.all([
      prisma.order.findMany({
        where: { customerId: id },
        select: { id: true, totalAmount: true, status: true, createdAt: true, paymentStatus: true }
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
      .reduce((s, o) => s + ((o.totalAmount - (o.paidAmount || 0)) || 0), 0);
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

const addCashEntry = async (req, res) => {
  try {
    const { type, amount, description } = req.body;
    const entry = await prisma.cashBook.create({
      data: { type, amount: parseFloat(amount), description, staffId: req.staff?.id }
    });
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

const addExpense = async (req, res) => {
  try {
    const { category, description, amount, date, paidBy } = req.body;
    const expense = await prisma.expense.create({
      data: {
        category,
        description,
        amount: parseFloat(amount),
        date: date ? new Date(date) : new Date(),
        paidBy
      }
    });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteExpense = async (req, res) => {
  try {
    await prisma.expense.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A4: Accounts Receivable Ledger ────────────────────────────────────────────
const getARLedger = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
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
      daysOverdue: Math.floor((now - new Date(o.createdAt)) / (1000 * 60 * 60 * 24)),
      isOverdue: Math.floor((now - new Date(o.createdAt)) / (1000 * 60 * 60 * 24)) > 7
    }));

    const totalOutstanding = ledger.reduce((s, o) => s + (o.totalAmountAmount || 0), 0);
    const overdueCount = ledger.filter(o => o.isOverdue).length;

    res.json({ success: true, data: { ledger, totalOutstanding, overdueCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

const createTransferOrder = async (req, res) => {
  try {
    const { fromPlant, toPlant, orderId, bagCount, notes } = req.body;
    const transfer = await prisma.transferOrder.create({
      data: {
        fromPlant,
        toPlant,
        orderId,
        bagCount: parseInt(bagCount),
        notes,
        transferredBy: req.staff?.id
      }
    });
    res.json({ success: true, data: transfer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateTransferStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const transfer = await prisma.transferOrder.update({
      where: { id: req.params.id },
      data: { status, receivedBy: status === 'RECEIVED' ? req.staff?.id : undefined }
    });
    res.json({ success: true, data: transfer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

const clockIn = async (req, res) => {
  try {
    const { staffId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findFirst({
      where: { staffId, date: { gte: today } }
    });

    if (existing?.clockIn) {
      return res.json({ success: false, message: 'Already clocked in today' });
    }

    const record = existing
      ? await prisma.attendance.update({ where: { id: existing.id }, data: { clockIn: new Date() } })
      : await prisma.attendance.create({ data: { staffId, clockIn: new Date() } });

    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const clockOut = async (req, res) => {
  try {
    const { staffId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.findFirst({
      where: { staffId, date: { gte: today }, clockIn: { not: null } }
    });

    if (!record) return res.json({ success: false, message: 'No clock-in found for today' });

    const clockOut = new Date();
    const hours = (clockOut - record.clockIn) / (1000 * 60 * 60);

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: { clockOut, hoursWorked: parseFloat(hours.toFixed(2)) }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A8: Coupons ───────────────────────────────────────────────────────────────
const getCoupons = async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createCoupon = async (req, res) => {
  try {
    const { code, type, value, minOrderValue, maxDiscount, usageLimit, validUntil } = req.body;
    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        type,
        value: parseFloat(value),
        minOrderValue: parseFloat(minOrderValue || 0),
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit) : null,
        validUntil: validUntil ? new Date(validUntil) : null
      }
    });
    res.json({ success: true, data: coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const validateCoupon = async (req, res) => {
  try {
    const { code, orderValue } = req.body;
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });

    if (!coupon || !coupon.isActive) return res.json({ success: false, message: 'Invalid coupon code' });
    if (coupon.validUntil && new Date() > coupon.validUntil) return res.json({ success: false, message: 'Coupon expired' });
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return res.json({ success: false, message: 'Coupon usage limit reached' });
    if (parseFloat(orderValue) < coupon.minOrderValue) return res.json({ success: false, message: `Minimum order value ₹${coupon.minOrderValue} required` });

    let discount = coupon.type === 'PERCENT'
      ? (parseFloat(orderValue) * coupon.value) / 100
      : coupon.value;

    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);

    res.json({ success: true, data: { coupon, discount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const toggleCoupon = async (req, res) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    const updated = await prisma.coupon.update({
      where: { id: req.params.id },
      data: { isActive: !coupon.isActive }
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateLoyaltyRules = async (req, res) => {
  try {
    const { earnPerRupee, redeemPerPoint, minRedeemPoints } = req.body;
    const rules = await prisma.loyaltyRule.updateMany({
      where: { isActive: true },
      data: { earnPerRupee: parseFloat(earnPerRupee), redeemPerPoint: parseFloat(redeemPerPoint), minRedeemPoints: parseInt(minRedeemPoints) }
    });
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const awardLoyaltyPoints = async (req, res) => {
  try {
    const { customerId, points, orderId, note } = req.body;
    await prisma.$transaction([
      prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: points } } }),
      prisma.loyaltyTransaction.create({ data: { customerId, type: 'EARN', points, orderId, note } })
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A11: Upcharges ────────────────────────────────────────────────────────────
const getUpcharges = async (req, res) => {
  try {
    const upcharges = await prisma.upcharge.findMany({ where: { isActive: true } });
    res.json({ success: true, data: upcharges });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createUpcharge = async (req, res) => {
  try {
    const { name, type, value } = req.body;
    const upcharge = await prisma.upcharge.create({
      data: { name, type, value: parseFloat(value) }
    });
    res.json({ success: true, data: upcharge });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A12: Customer Tags ────────────────────────────────────────────────────────
const updateCustomerTag = async (req, res) => {
  try {
    const { tag, notes } = req.body;
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { tag, notes }
    });
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A13: Recurring Pickups ────────────────────────────────────────────────────
const getRecurringPickups = async (req, res) => {
  try {
    const pickups = await prisma.recurringPickup.findMany({
      where: { isActive: true },
      orderBy: { nextPickup: 'asc' }
    });
    res.json({ success: true, data: pickups });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createRecurringPickup = async (req, res) => {
  try {
    const { customerId, frequency, dayOfWeek, dayOfMonth, address, notes } = req.body;
    const pickup = await prisma.recurringPickup.create({
      data: { customerId, frequency, dayOfWeek, dayOfMonth, address, notes }
    });
    res.json({ success: true, data: pickup });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const toggleRecurringPickup = async (req, res) => {
  try {
    const pickup = await prisma.recurringPickup.findUnique({ where: { id: req.params.id } });
    const updated = await prisma.recurringPickup.update({
      where: { id: req.params.id },
      data: { isActive: !pickup.isActive }
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A14: Return Orders ────────────────────────────────────────────────────────
const createReturnOrder = async (req, res) => {
  try {
    const { originalOrderId, reason, items } = req.body;

    const original = await prisma.order.findFirst({
      where: { OR: [{ id: originalOrderId }, { orderNumber: originalOrderId }] },
      include: { customer: true }
    });

    if (!original) return res.status(404).json({ success: false, message: 'Original order not found' });
    if (original.status === 'SENT_TO_PLANT') return res.status(400).json({ success: false, message: 'Cannot return this order — it is currently at the plant.' });

    const returnCount = await prisma.order.count({ where: { isReturn: true } });
    const orderNumber = `HCS-${String(returnCount + 1).padStart(3, '0')}-R`;

    const originalItems = await prisma.orderItem.findMany({ where: { orderId: original.id } });
    const returnOrder = await prisma.order.create({
      data: {
        orderNumber,
        customerId: original.customerId,
        status: 'PENDING',
        items: { create: originalItems.map(i => ({ serviceId: i.serviceId, serviceName: i.serviceName, garmentType: i.garmentType, quantity: i.quantity, unitPrice: 0, subtotal: 0 })) },
        totalAmount: 0,
        subtotal: 0,
        isReturn: true,
        returnReason: reason,
        originalOrderId,
        paymentStatus: 'UNPAID',
        notes: `Return/Re-clean of order ${original.orderNumber}. Reason: ${reason}`
      }
    });

    // Mark original order as returned
    await prisma.order.update({
      where: { id: original.id },
      data: { status: 'CANCELLED', notes: (original.notes || '') + ' [RETURNED - linked to ' + returnOrder.orderNumber + ']' }
    });
    res.json({ success: true, data: returnOrder });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A15: WhatsApp Campaigns ───────────────────────────────────────────────────
const getCampaigns = async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: campaigns });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createCampaign = async (req, res) => {
  try {
    const { name, message, audience } = req.body;
    const campaign = await prisma.campaign.create({
      data: { name, message, audience }
    });
    res.json({ success: true, data: campaign });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const sendCampaign = async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

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

    res.json({ success: true, data: { sentCount, failedCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A16: Business Reports ─────────────────────────────────────────────────────
const getReport = async (req, res) => {
  try {
    const { type, from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().setDate(1));
    const end = to ? new Date(to + "T23:59:59.999Z") : new Date();

    const dateFilter = { createdAt: { gte: start, lte: end } };

    switch (type) {
      case 'sales': {
        const orders = await prisma.order.findMany({
          where: dateFilter,
          select: { totalAmount: true, status: true, createdAt: true, paymentStatus: true }
        });
        const revenue = orders.reduce((s, o) => s + (o.totalAmountAmount || 0), 0);
        const paid    = orders.filter(o => o.paymentStatus === 'PAID').reduce((s, o) => s + (o.totalAmountAmount || 0), 0);
        res.json({ success: true, data: { orders: orders.length, revenue, paid, outstanding: revenue - paid } });
        break;
      }
      case 'orders': {
        const orders = await prisma.order.findMany({ where: dateFilter, orderBy: { createdAt: 'desc' } });
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
        const byMode = payments.reduce((acc, p) => { acc[p.mode] = (acc[p.mode] || 0) + p.amount; return acc; }, {});
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
          where: dateFilter,
          include: { items: true }
        });
        const itemCounts = {};
        orders.forEach(o => {
          if (o.items && Array.isArray(o.items)) {
            o.items.forEach(item => {
              itemCounts[item.serviceName||item.name||"Unknown"] = (itemCounts[item.name] || 0) + (item.quantity || 1);
            });
          }
        });
        const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);
        res.json({ success: true, data: { topItems: sorted.slice(0, 20), allItems: itemCounts } });
        break;
      }
      default:
        res.status(400).json({ success: false, message: 'Invalid report type' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A17: Advanced Search ──────────────────────────────────────────────────────
const advancedSearch = async (req, res) => {
  try {
    const {
      q, status, tag, from, to, minAmount, maxAmount,
      paymentStatus, hasOutstanding, type, plant, page = 1, limit = 20
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (type === 'customers' || !type) {
      const where = {};
      if (q) where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } }
      ];
      if (tag) where.tag = tag;

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt: 'desc' } }),
        prisma.customer.count({ where })
      ]);
      if (type === 'customers') return res.json({ success: true, data: { customers, total, page: parseInt(page) } });
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
      if (from || to) where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
      if (minAmount) where.total = { gte: parseFloat(minAmount) };
      if (maxAmount) where.total = { ...where.total, lte: parseFloat(maxAmount) };

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: { customer: { select: { name: true, phone: true } } },
          skip, take: parseInt(limit), orderBy: { createdAt: 'desc' }
        }),
        prisma.order.count({ where })
      ]);
      if (type === 'orders') return res.json({ success: true, data: { orders, total, page: parseInt(page) } });
    }

    res.json({ success: false, message: 'Specify type=customers or type=orders' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── A18: Automations ──────────────────────────────────────────────────────────
const getAutomations = async (req, res) => {
  try {
    const automations = await prisma.automation.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: automations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createAutomation = async (req, res) => {
  try {
    const { name, trigger, message, delayHours, channel } = req.body;
    const automation = await prisma.automation.create({
      data: { name, trigger, message, delayHours: parseInt(delayHours || 0), channel: channel || 'WHATSAPP' }
    });
    res.json({ success: true, data: automation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const toggleAutomation = async (req, res) => {
  try {
    const auto = await prisma.automation.findUnique({ where: { id: req.params.id } });
    const updated = await prisma.automation.update({
      where: { id: req.params.id },
      data: { isActive: !auto.isActive }
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateAutomation = async (req, res) => {
  try {
    const { name, trigger, message, delayHours, channel } = req.body;
    const updated = await prisma.automation.update({
      where: { id: req.params.id },
      data: { name, trigger, message, delayHours: parseInt(delayHours || 0), channel }
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
