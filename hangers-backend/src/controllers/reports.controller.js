const prisma = require('../config/database');
const { badRequest, error } = require('../utils/response');
const { reportQuerySchema } = require('../validation/reports.schemas');

const ORDER_ONLY_WHERE = { documentType: 'ORDER' };
const FINANCE_ORDER_WHERE = { ...ORDER_ONLY_WHERE, status: { not: 'CANCELLED' } };

const parseLocalDateBoundary = (value, boundary) => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const suffix = boundary === 'end' ? 'T23:59:59.999' : 'T00:00:00.000';
  const parsed = new Date(`${normalized}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

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
          where: { ...dateFilter, ...FINANCE_ORDER_WHERE },
          select: { totalAmount: true, paidAmount: true, writeOffAmount: true, status: true, createdAt: true, paymentStatus: true }
        });
        const revenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const paid    = orders.reduce((s, o) => s + (o.paidAmount || 0) + (o.writeOffAmount || 0), 0);
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
        const attendance = await prisma.attendance.findMany({
          where: { date: { gte: start, lte: end } },
          include: { staff: { select: { name: true } } }
        });
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
          where: { ...dateFilter, ...FINANCE_ORDER_WHERE },
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

module.exports = { getReport };
