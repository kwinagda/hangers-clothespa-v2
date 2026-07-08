const prisma = require('../config/database');
const { badRequest, error } = require('../utils/response');
const { advancedSearchQuerySchema } = require('../validation/search.schemas');
const { buildOrderSearchOr } = require('../utils/order-search');

const advancedSearch = async (req, res) => {
  try {
    const parsed = advancedSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid search query');
    const {
      q, status, tag, from, to, minAmount, maxAmount,
      paymentStatus, hasOutstanding, type, page = 1, limit = 20
    } = parsed.data;

    const skip = (page - 1) * limit;

    if (type === 'customers' || !type) {
      const where = {};
      if (q) where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } }
      ];
      if (tag) where.tag = tag;

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
        prisma.customer.count({ where })
      ]);
      if (type === 'customers') return res.json({ success: true, data: { customers, total, page } });
    }

    if (type === 'orders' || !type) {
      const where = {};
      if (q) where.OR = buildOrderSearchOr(q);
      if (status) where.status = status;
      if (hasOutstanding === 'true') {
        const outstanding = ['UNPAID', 'PARTIAL'];
        where.paymentStatus = (paymentStatus && outstanding.includes(paymentStatus))
          ? paymentStatus
          : { in: outstanding };
      } else if (paymentStatus) {
        where.paymentStatus = paymentStatus;
      }
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
      if (minAmount) where.totalAmount = { gte: minAmount };
      if (maxAmount) where.totalAmount = { ...where.totalAmount, lte: maxAmount };

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: { customer: { select: { name: true, phone: true } } },
          skip, take: limit, orderBy: { createdAt: 'desc' }
        }),
        prisma.order.count({ where })
      ]);
      if (type === 'orders') return res.json({ success: true, data: { orders, total, page } });
    }

    return badRequest(res, 'Specify type=customers or type=orders');
  } catch (err) {
    return error(res, 'Failed to run advanced search');
  }
};

module.exports = { advancedSearch };
