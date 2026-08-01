const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const listOrderTimelineLogs = async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 100, 200);
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const skip = (page - 1) * limit;
    const where = {};

    if (req.query.eventType && req.query.eventType !== 'ALL') {
      where.eventType = String(req.query.eventType);
    }
    if (req.query.stage && req.query.stage !== 'ALL') {
      where.stage = String(req.query.stage);
    }
    if (req.query.channel === 'WHATSAPP') {
      where.eventType = 'NOTIFICATION';
      where.stage = { in: ['WHATSAPP_FAILED', 'WHATSAPP_SENT', 'WHATSAPP_SKIPPED'] };
    }
    if (req.query.outcome === 'FAILED') {
      where.stage = 'WHATSAPP_FAILED';
    }
    if (req.query.outcome === 'SENT') {
      where.stage = 'WHATSAPP_SENT';
    }
    if (req.query.search) {
      const search = String(req.query.search).trim();
      if (search.length < 2) return badRequest(res, 'Search must be at least 2 characters');
      where.order = {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
          { customer: { phone: { contains: search.replace(/\D/g, '') } } },
        ],
      };
    }

    const [logs, total] = await Promise.all([
      prisma.orderStage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              customer: { select: { id: true, name: true, phone: true } },
            },
          },
          changedBy: { select: { id: true, name: true, role: true } },
        },
      }),
      prisma.orderStage.count({ where }),
    ]);

    return success(res, {
      logs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('listOrderTimelineLogs error:', err);
    return error(res, 'Failed to fetch logs');
  }
};

module.exports = {
  listOrderTimelineLogs,
};
