const prisma = require('../config/database');
const { success, created, error, badRequest, notFound, forbidden } = require('../utils/response');
const {
  sendDailyIronLogMessage,
  sendDailyIronBillMessage,
  sendDailyIronPaymentMessage,
} = require('../services/whatomate.service');
const {
  ACTIVE_IRON_SUB_STATUSES,
  DEFAULT_LANGUAGE,
  IRON_SUBSCRIPTION_STATUSES,
  LANGUAGE_VALUES,
  LOCKED_BILL_STATUSES,
} = require('../config/master-data');
const { getCorePaymentMethods } = require('../services/masterData.service');
const { normalizePaymentMethod } = require('../utils/payment-method');

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const startOfMonth = (value) => {
  const date = new Date(value.getFullYear(), value.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfMonth = (value) => {
  const date = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date;
};

const monthLabel = (value) => value.toLocaleDateString('en-IN', {
  month: 'long',
  year: 'numeric',
});

const formatLogDate = (value) => value.toLocaleDateString('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const normalizeLanguage = (language) => {
  if (!language) return DEFAULT_LANGUAGE;
  const normalized = String(language).trim().toUpperCase();
  return LANGUAGE_VALUES.includes(normalized) ? normalized : DEFAULT_LANGUAGE;
};

const syncCustomerSubscriptionStatus = async (tx, customerId, applicationStatus) => {
  await tx.customer.update({
    where: { id: customerId },
    data: { ironSubStatus: applicationStatus || null },
  });
};

const resolveIronRate = async (serviceId) => {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true, category: true, basePrice: true, isActive: true },
  });

  if (!service || service.category !== 'DAILY_IRON' || !service.isActive) {
    throw new Error('INVALID_DAILY_IRON_SERVICE');
  }

  return service.basePrice;
};

const getCustomerSubscription = async (customerId) => prisma.ironSubscription.findUnique({
  where: { customerId },
  include: {
    customer: {
      select: {
        id: true,
        name: true,
        phone: true,
        preferredLanguage: true,
        ironSubStatus: true,
      },
    },
    confirmedBy: {
      select: { id: true, name: true, role: true },
    },
    _count: {
      select: { logs: true, bills: true },
    },
  },
});

const getMonthlyRunningTotals = async (customerId, logDate) => {
  const aggregate = await prisma.ironLog.aggregate({
    where: {
      customerId,
      date: {
        gte: startOfMonth(logDate),
        lte: endOfMonth(logDate),
      },
    },
    _sum: {
      pieces: true,
      amount: true,
    },
  });

  return {
    pieces: aggregate._sum.pieces || 0,
    amount: aggregate._sum.amount || 0,
  };
};

const generateBillNumber = async (tx, periodEnd) => {
  const month = String(periodEnd.getMonth() + 1).padStart(2, '0');
  const year = periodEnd.getFullYear();
  const prefix = `IRON-${month}${year}-`;
  const count = await tx.ironBill.count({
    where: {
      billNumber: { startsWith: prefix },
    },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

const buildLogWhere = (customerId, start, end) => ({
  customerId,
  date: {
    gte: startOfDay(start),
    lte: endOfDay(end),
  },
});

const findStaffSubscriptionOr404 = async (customerId, res) => {
  const subscription = await getCustomerSubscription(customerId);
  if (!subscription) {
    notFound(res, 'Iron subscription not found');
    return null;
  }
  return subscription;
};

const listSubscriptions = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) {
      const normalizedStatus = String(status).trim().toUpperCase();
      if (!IRON_SUBSCRIPTION_STATUSES.includes(normalizedStatus)) return badRequest(res, 'Invalid subscription status filter');
      where.applicationStatus = normalizedStatus;
    }

    const subscriptions = await prisma.ironSubscription.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
            ironSubStatus: true,
          },
        },
        confirmedBy: {
          select: { id: true, name: true },
        },
        _count: {
          select: { logs: true, bills: true },
        },
      },
      orderBy: [
        { applicationStatus: 'asc' },
        { appliedAt: 'desc' },
      ],
    });

    return success(res, { subscriptions });
  } catch (err) {
    console.error('listSubscriptions error:', err);
    return error(res, 'Failed to fetch iron subscriptions');
  }
};

const getSubscription = async (req, res) => {
  try {
    const subscription = await findStaffSubscriptionOr404(req.params.customerId, res);
    if (!subscription) return null;
    return success(res, { subscription });
  } catch (err) {
    console.error('getSubscription error:', err);
    return error(res, 'Failed to fetch iron subscription');
  }
};

const createSubscription = async (req, res) => {
  const { customerId, notes, applicationStatus } = req.body;
  if (!customerId) return badRequest(res, 'customerId is required');

  const targetStatus = (applicationStatus || 'ACTIVE').toUpperCase();
  if (!IRON_SUBSCRIPTION_STATUSES.includes(targetStatus)) {
    return badRequest(res, 'Invalid applicationStatus');
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    });
    if (!customer) return notFound(res, 'Customer not found');

    const existing = await prisma.ironSubscription.findUnique({ where: { customerId } });
    if (existing) return badRequest(res, 'Customer already has an iron subscription');

    const subscription = await prisma.$transaction(async (tx) => {
      const createdSubscription = await tx.ironSubscription.create({
        data: {
          customerId,
          notes: notes || null,
          applicationStatus: targetStatus,
          confirmedAt: targetStatus === 'ACTIVE' ? new Date() : null,
          confirmedById: targetStatus === 'ACTIVE' ? req.staff.id : null,
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              preferredLanguage: true,
            },
          },
        },
      });

      await syncCustomerSubscriptionStatus(tx, customerId, targetStatus);
      return createdSubscription;
    });

    return created(res, { subscription }, 'Iron subscription created');
  } catch (err) {
    console.error('createSubscription error:', err);
    return error(res, 'Failed to create iron subscription');
  }
};

const confirmSubscription = async (req, res) => {
  try {
    const existing = await prisma.ironSubscription.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Iron subscription not found');
    if (existing.applicationStatus !== 'PENDING_REVIEW') {
      return badRequest(res, 'Only pending subscriptions can be confirmed');
    }

    const subscription = await prisma.$transaction(async (tx) => {
      const updated = await tx.ironSubscription.update({
        where: { id: req.params.id },
        data: {
          applicationStatus: 'ACTIVE',
          confirmedAt: new Date(),
          confirmedById: req.staff.id,
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              preferredLanguage: true,
            },
          },
        },
      });

      await syncCustomerSubscriptionStatus(tx, updated.customerId, 'ACTIVE');
      return updated;
    });

    return success(res, { subscription }, 'Subscription confirmed');
  } catch (err) {
    console.error('confirmSubscription error:', err);
    return error(res, 'Failed to confirm subscription');
  }
};

const updateSubscriptionStatus = async (req, res) => {
  const { status, notes } = req.body;
  const nextStatus = String(status || '').trim().toUpperCase();

  if (!IRON_SUBSCRIPTION_STATUSES.filter((status) => status !== 'PENDING_REVIEW').includes(nextStatus)) {
    return badRequest(res, 'status must be ACTIVE, PAUSED, or CANCELLED');
  }

  try {
    const existing = await prisma.ironSubscription.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Iron subscription not found');

    const subscription = await prisma.$transaction(async (tx) => {
      const updated = await tx.ironSubscription.update({
        where: { id: req.params.id },
        data: {
          applicationStatus: nextStatus,
          notes: notes !== undefined ? notes : existing.notes,
          confirmedAt: nextStatus === 'ACTIVE' && !existing.confirmedAt ? new Date() : existing.confirmedAt,
          confirmedById: nextStatus === 'ACTIVE' && !existing.confirmedById ? req.staff.id : existing.confirmedById,
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              preferredLanguage: true,
            },
          },
        },
      });

      await syncCustomerSubscriptionStatus(tx, updated.customerId, nextStatus);
      return updated;
    });

    return success(res, { subscription }, 'Subscription status updated');
  } catch (err) {
    console.error('updateSubscriptionStatus error:', err);
    return error(res, 'Failed to update subscription status');
  }
};

const getLogs = async (req, res) => {
  try {
    const subscription = await findStaffSubscriptionOr404(req.params.customerId, res);
    if (!subscription) return null;

    const logs = await prisma.ironLog.findMany({
      where: { customerId: req.params.customerId },
      include: {
        service: { select: { id: true, name: true, category: true } },
        loggedBy: { select: { id: true, name: true } },
        bill: { select: { id: true, billNumber: true, status: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return success(res, { subscription, logs });
  } catch (err) {
    console.error('getLogs error:', err);
    return error(res, 'Failed to fetch iron logs');
  }
};

const listAllLogs = async (req, res) => {
  const requestedDate = toDate(req.query.date);
  const requestedStart = toDate(req.query.start);
  const requestedEnd = toDate(req.query.end);
  const customerId = req.query.customerId ? String(req.query.customerId) : undefined;

  const start = requestedDate || requestedStart || new Date();
  const end = requestedDate || requestedEnd || start;
  if (end < start) return badRequest(res, 'end must be on or after start');

  try {
    const where = {
      date: {
        gte: startOfDay(start),
        lte: endOfDay(end),
      },
      ...(customerId ? { customerId } : {}),
    };

    const logs = await prisma.ironLog.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
            ironSubStatus: true,
          },
        },
        service: { select: { id: true, name: true, category: true } },
        loggedBy: { select: { id: true, name: true } },
        bill: { select: { id: true, billNumber: true, status: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const summary = logs.reduce((acc, log) => {
      acc.totalLogs += 1;
      acc.totalPieces += log.pieces || 0;
      acc.totalAmount += log.amount || 0;
      if (log.billId) acc.billedLogs += 1;
      else acc.openLogs += 1;
      if (log.customerId) acc.customerIds.add(log.customerId);
      return acc;
    }, {
      totalLogs: 0,
      totalPieces: 0,
      totalAmount: 0,
      billedLogs: 0,
      openLogs: 0,
      customerIds: new Set(),
    });

    const customerMap = new Map();
    logs.forEach((log) => {
      const key = log.customerId;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customerId: key,
          name: log.customer?.name || 'Unnamed Customer',
          phone: log.customer?.phone || '',
          ironSubStatus: log.customer?.ironSubStatus || null,
          logCount: 0,
          totalPieces: 0,
          totalAmount: 0,
          lastLogAt: log.date,
        });
      }

      const current = customerMap.get(key);
      current.logCount += 1;
      current.totalPieces += log.pieces || 0;
      current.totalAmount += log.amount || 0;
      if (new Date(log.date) > new Date(current.lastLogAt)) current.lastLogAt = log.date;
    });

    const customers = Array.from(customerMap.values()).sort((a, b) => {
      if (b.totalPieces !== a.totalPieces) return b.totalPieces - a.totalPieces;
      return new Date(b.lastLogAt).getTime() - new Date(a.lastLogAt).getTime();
    });

    return success(res, {
      summary: {
        totalLogs: summary.totalLogs,
        totalPieces: summary.totalPieces,
        totalAmount: Number(summary.totalAmount.toFixed(2)),
        billedLogs: summary.billedLogs,
        openLogs: summary.openLogs,
        activeCustomers: summary.customerIds.size,
        rangeStart: startOfDay(start),
        rangeEnd: endOfDay(end),
      },
      customers,
      logs,
    });
  } catch (err) {
    console.error('listAllLogs error:', err);
    return error(res, 'Failed to fetch iron logs');
  }
};

const getLogsByPeriod = async (req, res) => {
  const start = toDate(req.query.start);
  const end = toDate(req.query.end);
  if (!start || !end) return badRequest(res, 'Valid start and end query params are required');
  if (end < start) return badRequest(res, 'end must be on or after start');

  try {
    const logs = await prisma.ironLog.findMany({
      where: buildLogWhere(req.params.customerId, start, end),
      include: {
        service: { select: { id: true, name: true, category: true } },
        loggedBy: { select: { id: true, name: true } },
        bill: { select: { id: true, billNumber: true, status: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const totals = logs.reduce((acc, log) => {
      acc.pieces += log.pieces;
      acc.amount += log.amount;
      return acc;
    }, { pieces: 0, amount: 0 });

    return success(res, { logs, totals });
  } catch (err) {
    console.error('getLogsByPeriod error:', err);
    return error(res, 'Failed to fetch iron logs for period');
  }
};

const createLog = async (req, res) => {
  const { customerId, serviceId, date, pieces, notes } = req.body;
  const logDate = toDate(date) || new Date();
  const piecesCount = Number(pieces);

  if (!customerId || !serviceId) return badRequest(res, 'customerId and serviceId are required');
  if (!Number.isInteger(piecesCount) || piecesCount <= 0) return badRequest(res, 'pieces must be a positive integer');

  try {
    const subscription = await prisma.ironSubscription.findUnique({
      where: { customerId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
            notifWhatsApp: true,
          },
        },
      },
    });

    if (!subscription) return notFound(res, 'Iron subscription not found');
    if (!ACTIVE_IRON_SUB_STATUSES.includes(subscription.applicationStatus)) {
      return badRequest(res, `Subscription is ${subscription.applicationStatus} and cannot accept new logs`);
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, name: true, category: true, basePrice: true, isActive: true },
    });
    if (!service || service.category !== 'DAILY_IRON' || !service.isActive) {
      return badRequest(res, 'Selected service is not an active DAILY_IRON item');
    }

    const ratePerPiece = await resolveIronRate(serviceId);
    const amount = Number((piecesCount * ratePerPiece).toFixed(2));

    const logEntry = await prisma.ironLog.create({
      data: {
        subscriptionId: subscription.id,
        customerId,
        serviceId,
        serviceName: service.name,
        date: logDate,
        pieces: piecesCount,
        ratePerPiece,
        amount,
        notes: notes || null,
        loggedById: req.staff.id,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
            notifWhatsApp: true,
          },
        },
        loggedBy: { select: { id: true, name: true } },
      },
    });

    const runningTotals = await getMonthlyRunningTotals(customerId, logDate);
    let whatsappSent = false;

    if (logEntry.customer?.notifWhatsApp !== false) {
      whatsappSent = await sendDailyIronLogMessage({
        customer: {
          ...logEntry.customer,
          preferredLanguage: normalizeLanguage(logEntry.customer.preferredLanguage),
        },
        subscription,
        log: {
          ...logEntry,
          dateLabel: formatLogDate(logDate),
        },
        monthToDate: runningTotals,
      });
    }

    const updatedLog = await prisma.ironLog.update({
      where: { id: logEntry.id },
      data: { whatsappSent },
      include: {
        service: { select: { id: true, name: true, category: true } },
        loggedBy: { select: { id: true, name: true } },
      },
    });

    return created(res, {
      log: updatedLog,
      monthToDate: runningTotals,
    }, 'Iron log created');
  } catch (err) {
    console.error('createLog error:', err);
    if (err.message === 'INVALID_DAILY_IRON_SERVICE') return badRequest(res, 'Invalid DAILY_IRON service');
    return error(res, 'Failed to create iron log');
  }
};

const createLogsBatch = async (req, res) => {
  const { customerId, date, notes, items } = req.body;
  const logDate = toDate(date) || new Date();
  const inputItems = Array.isArray(items) ? items : [];

  if (!customerId) return badRequest(res, 'customerId is required');
  if (!inputItems.length) return badRequest(res, 'At least one Daily Iron item is required');

  const normalizedItems = inputItems.map((item) => ({
    serviceId: String(item?.serviceId || '').trim(),
    pieces: Number(item?.pieces),
    notes: item?.notes || notes || null,
  }));

  if (normalizedItems.some((item) => !item.serviceId)) return badRequest(res, 'serviceId is required for every item');
  if (normalizedItems.some((item) => !Number.isInteger(item.pieces) || item.pieces <= 0)) {
    return badRequest(res, 'pieces must be a positive integer for every item');
  }

  try {
    const subscription = await prisma.ironSubscription.findUnique({
      where: { customerId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
            notifWhatsApp: true,
          },
        },
      },
    });

    if (!subscription) return notFound(res, 'Iron subscription not found');
    if (!ACTIVE_IRON_SUB_STATUSES.includes(subscription.applicationStatus)) {
      return badRequest(res, `Subscription is ${subscription.applicationStatus} and cannot accept new logs`);
    }

    const serviceIds = [...new Set(normalizedItems.map((item) => item.serviceId))];
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, category: true, basePrice: true, isActive: true },
    });
    const serviceById = new Map(services.map((service) => [service.id, service]));

    const invalid = normalizedItems.find((item) => {
      const service = serviceById.get(item.serviceId);
      return !service || service.category !== 'DAILY_IRON' || !service.isActive;
    });
    if (invalid) return badRequest(res, 'Every item must be an active DAILY_IRON service');

    const createdLogs = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const item of normalizedItems) {
        const service = serviceById.get(item.serviceId);
        const ratePerPiece = Number(service.basePrice || 0);
        rows.push(await tx.ironLog.create({
          data: {
            subscriptionId: subscription.id,
            customerId,
            serviceId: item.serviceId,
            serviceName: service.name,
            date: logDate,
            pieces: item.pieces,
            ratePerPiece,
            amount: Number((item.pieces * ratePerPiece).toFixed(2)),
            notes: item.notes,
            loggedById: req.staff.id,
          },
          include: {
            service: { select: { id: true, name: true, category: true } },
            loggedBy: { select: { id: true, name: true } },
          },
        }));
      }
      return rows;
    });

    const runningTotals = await getMonthlyRunningTotals(customerId, logDate);
    let whatsappSent = false;

    if (subscription.customer?.notifWhatsApp !== false) {
      const itemSummary = createdLogs
        .map((log) => `${log.serviceName} x${log.pieces}`)
        .join(', ');
      const totalPieces = createdLogs.reduce((sum, log) => sum + Number(log.pieces || 0), 0);

      whatsappSent = await sendDailyIronLogMessage({
        customer: {
          ...subscription.customer,
          preferredLanguage: normalizeLanguage(subscription.customer.preferredLanguage),
        },
        subscription,
        log: {
          date: logDate,
          pieces: totalPieces,
          serviceName: itemSummary,
          dateLabel: formatLogDate(logDate),
        },
        monthToDate: runningTotals,
      });
    }

    if (whatsappSent) {
      await prisma.ironLog.updateMany({
        where: { id: { in: createdLogs.map((log) => log.id) } },
        data: { whatsappSent: true },
      });
    }

    return created(res, {
      logs: createdLogs.map((log) => ({ ...log, whatsappSent })),
      monthToDate: runningTotals,
    }, 'Iron logs created');
  } catch (err) {
    console.error('createLogsBatch error:', err);
    return error(res, 'Failed to create iron logs');
  }
};

const deleteLog = async (req, res) => {
  try {
    const logEntry = await prisma.ironLog.findUnique({ where: { id: req.params.id } });
    if (!logEntry) return notFound(res, 'Iron log not found');
    if (logEntry.billId) return badRequest(res, 'Billed log entries cannot be deleted');

    await prisma.ironLog.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Iron log deleted');
  } catch (err) {
    console.error('deleteLog error:', err);
    return error(res, 'Failed to delete iron log');
  }
};

const generateBill = async (req, res) => {
  const { customerId, billingPeriodStart, carryForwardNotes, notes } = req.body;
  const periodStart = toDate(billingPeriodStart);
  if (!customerId || !periodStart) {
    return badRequest(res, 'customerId and billingPeriodStart are required');
  }

  const periodEnd = endOfMonth(periodStart);

  try {
    const subscription = await prisma.ironSubscription.findUnique({
      where: { customerId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
            notifWhatsApp: true,
          },
        },
      },
    });

    if (!subscription) return notFound(res, 'Iron subscription not found');

    const existingBill = await prisma.ironBill.findFirst({
      where: {
        customerId,
        billingPeriodStart: startOfDay(periodStart),
      },
    });

    if (existingBill && LOCKED_BILL_STATUSES.includes(existingBill.status)) {
      return badRequest(res, `Bill is already ${existingBill.status} and cannot be regenerated`);
    }

    const logs = await prisma.ironLog.findMany({
      where: {
        customerId,
        date: {
          gte: startOfDay(periodStart),
          lte: periodEnd,
        },
        OR: [
          { billId: null },
          ...(existingBill ? [{ billId: existingBill.id }] : []),
        ],
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    if (!logs.length) return badRequest(res, 'No eligible log entries found for this billing period');

    const totals = logs.reduce((acc, log) => {
      acc.totalPieces += log.pieces;
      acc.totalAmount += log.amount;
      return acc;
    }, { totalPieces: 0, totalAmount: 0 });

    const bill = await prisma.$transaction(async (tx) => {
      if (existingBill) {
        await tx.ironLog.updateMany({
          where: { billId: existingBill.id },
          data: { billId: null },
        });
      }

      const persistedBill = existingBill
        ? await tx.ironBill.update({
            where: { id: existingBill.id },
            data: {
              subscriptionId: subscription.id,
              billingPeriodEnd: periodEnd,
              totalPieces: totals.totalPieces,
              totalAmount: Number(totals.totalAmount.toFixed(2)),
              carryForwardNotes: carryForwardNotes || null,
              notes: notes || null,
              status: 'DRAFT',
            },
          })
        : await tx.ironBill.create({
            data: {
              billNumber: await generateBillNumber(tx, periodEnd),
              customerId,
              subscriptionId: subscription.id,
              billingPeriodStart: startOfDay(periodStart),
              billingPeriodEnd: periodEnd,
              totalPieces: totals.totalPieces,
              totalAmount: Number(totals.totalAmount.toFixed(2)),
              carryForwardNotes: carryForwardNotes || null,
              notes: notes || null,
            },
          });

      await tx.ironLog.updateMany({
        where: { id: { in: logs.map((log) => log.id) } },
        data: { billId: persistedBill.id },
      });

      return tx.ironBill.findUnique({
        where: { id: persistedBill.id },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              preferredLanguage: true,
              notifWhatsApp: true,
            },
          },
          logs: {
            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    return success(res, { bill }, existingBill ? 'Draft bill regenerated' : 'Bill generated');
  } catch (err) {
    console.error('generateBill error:', err);
    return error(res, 'Failed to generate iron bill');
  }
};

const listBillsForCustomer = async (req, res) => {
  try {
    const bills = await prisma.ironBill.findMany({
      where: { customerId: req.params.customerId },
      include: {
        logs: {
          select: { id: true },
        },
      },
      orderBy: [{ billingPeriodStart: 'desc' }, { createdAt: 'desc' }],
    });
    return success(res, { bills });
  } catch (err) {
    console.error('listBillsForCustomer error:', err);
    return error(res, 'Failed to fetch iron bills');
  }
};

const getBillById = async (req, res) => {
  try {
    const bill = await prisma.ironBill.findUnique({
      where: { id: req.params.billId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
            notifWhatsApp: true,
          },
        },
        logs: {
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          include: {
            loggedBy: { select: { id: true, name: true } },
            service: { select: { id: true, name: true, category: true } },
          },
        },
      },
    });
    if (!bill) return notFound(res, 'Iron bill not found');
    return success(res, { bill });
  } catch (err) {
    console.error('getBillById error:', err);
    return error(res, 'Failed to fetch iron bill');
  }
};

const sendBill = async (req, res) => {
  try {
    const bill = await prisma.ironBill.findUnique({
      where: { id: req.params.billId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
            notifWhatsApp: true,
          },
        },
      },
    });
    if (!bill) return notFound(res, 'Iron bill not found');
    if (!bill.totalAmount || bill.totalAmount <= 0) return badRequest(res, 'Cannot send a zero-value bill');

    const whatsappSent = bill.customer?.notifWhatsApp !== false
      ? await sendDailyIronBillMessage({
          customer: {
            ...bill.customer,
            preferredLanguage: normalizeLanguage(bill.customer.preferredLanguage),
          },
          subscription: { id: bill.subscriptionId },
          bill: {
            ...bill,
            monthLabel: monthLabel(bill.billingPeriodEnd),
          },
        })
      : false;

    const updated = await prisma.ironBill.update({
      where: { id: bill.id },
      data: { status: 'SENT' },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
          },
        },
      },
    });

    return success(res, { bill: updated, whatsappSent }, 'Iron bill sent');
  } catch (err) {
    console.error('sendBill error:', err);
    return error(res, 'Failed to send iron bill');
  }
};

const recordBillPayment = async (req, res) => {
  const { amount, paymentMethod } = req.body;
  const paymentAmount = Number(amount);
  if (!(paymentAmount > 0)) return badRequest(res, 'amount must be greater than 0');
  const normalizedMethod = normalizePaymentMethod(paymentMethod || 'CASH');
  const corePaymentMethods = await getCorePaymentMethods();
  if (!corePaymentMethods.includes(normalizedMethod)) {
    return badRequest(res, `paymentMethod must be one of: ${corePaymentMethods.join(', ')}`);
  }

  try {
    const bill = await prisma.ironBill.findUnique({
      where: { id: req.params.billId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });
    if (!bill) return notFound(res, 'Iron bill not found');
    const balanceDue = Math.max(0, Number((bill.totalAmount - bill.paidAmount).toFixed(2)));
    if (balanceDue <= 0) return badRequest(res, 'Bill is already fully paid');
    const appliedAmount = Math.min(paymentAmount, balanceDue);

    const nextPaidAmount = Number((bill.paidAmount + appliedAmount).toFixed(2));
    const nextStatus = nextPaidAmount >= bill.totalAmount ? 'PAID' : 'PARTIAL';

    const updated = await prisma.ironBill.update({
      where: { id: bill.id },
      data: {
        paidAmount: nextPaidAmount,
        paymentMethod: normalizedMethod,
        paidAt: nextStatus === 'PAID' ? new Date() : bill.paidAt,
        status: nextStatus,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    sendDailyIronPaymentMessage({
      customer: updated.customer,
      subscription: { id: updated.subscriptionId },
      bill: updated,
      amount: appliedAmount,
      method: normalizedMethod,
    }).catch((err) => {
      console.error('[Whatomate] Iron bill payment notification failed:', err?.message || err);
    });

    return success(res, { bill: updated }, 'Payment recorded');
  } catch (err) {
    console.error('recordBillPayment error:', err);
    return error(res, 'Failed to record bill payment');
  }
};

const applyForSubscription = async (req, res) => {
  const { notes } = req.body;

  try {
    const existing = await prisma.ironSubscription.findUnique({
      where: { customerId: req.customer.id },
    });

    if (existing && IRON_SUBSCRIPTION_STATUSES.filter((status) => status !== 'CANCELLED').includes(existing.applicationStatus)) {
      return badRequest(res, `Subscription is already ${existing.applicationStatus}`);
    }

    const subscription = await prisma.$transaction(async (tx) => {
      const next = existing
        ? await tx.ironSubscription.update({
            where: { id: existing.id },
            data: {
              applicationStatus: 'PENDING_REVIEW',
              notes: notes !== undefined ? notes : existing.notes,
              appliedAt: new Date(),
            },
          })
        : await tx.ironSubscription.create({
            data: {
              customerId: req.customer.id,
              applicationStatus: 'PENDING_REVIEW',
              notes: notes || null,
            },
          });

      await syncCustomerSubscriptionStatus(tx, req.customer.id, 'PENDING_REVIEW');
      return next;
    });

    return created(res, { subscription }, 'Daily iron application submitted');
  } catch (err) {
    console.error('applyForSubscription error:', err);
    return error(res, 'Failed to submit daily iron application');
  }
};

const getOwnSubscription = async (req, res) => {
  try {
    const subscription = await prisma.ironSubscription.findUnique({
      where: { customerId: req.customer.id },
      include: {
        _count: { select: { logs: true, bills: true } },
      },
    });
    return success(res, { subscription });
  } catch (err) {
    console.error('getOwnSubscription error:', err);
    return error(res, 'Failed to fetch subscription');
  }
};

const getOwnLogs = async (req, res) => {
  try {
    const logs = await prisma.ironLog.findMany({
      where: { customerId: req.customer.id },
      include: {
        bill: { select: { id: true, billNumber: true, status: true } },
        service: { select: { id: true, name: true, category: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return success(res, { logs });
  } catch (err) {
    console.error('getOwnLogs error:', err);
    return error(res, 'Failed to fetch logs');
  }
};

const getOwnLogsByMonth = async (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  if (!month || !year) return badRequest(res, 'month and year are required');
  if (!Number.isInteger(month) || month < 1 || month > 12) return badRequest(res, 'month must be between 1 and 12');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return badRequest(res, 'year must be valid');

  try {
    const start = new Date(year, month - 1, 1);
    const end = endOfMonth(start);
    const logs = await prisma.ironLog.findMany({
      where: buildLogWhere(req.customer.id, start, end),
      include: {
        bill: { select: { id: true, billNumber: true, status: true } },
        service: { select: { id: true, name: true, category: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const totals = logs.reduce((acc, log) => {
      acc.pieces += log.pieces;
      acc.amount += log.amount;
      return acc;
    }, { pieces: 0, amount: 0 });

    return success(res, { logs, totals });
  } catch (err) {
    console.error('getOwnLogsByMonth error:', err);
    return error(res, 'Failed to fetch monthly logs');
  }
};

const getOwnBills = async (req, res) => {
  try {
    const bills = await prisma.ironBill.findMany({
      where: { customerId: req.customer.id },
      include: {
        logs: {
          select: { id: true },
        },
      },
      orderBy: [{ billingPeriodStart: 'desc' }, { createdAt: 'desc' }],
    });
    return success(res, { bills });
  } catch (err) {
    console.error('getOwnBills error:', err);
    return error(res, 'Failed to fetch bills');
  }
};

const pauseOwnSubscription = async (req, res) => {
  try {
    const subscription = await prisma.ironSubscription.findUnique({
      where: { customerId: req.customer.id },
    });
    if (!subscription) return notFound(res, 'Iron subscription not found');
    if (subscription.applicationStatus !== 'ACTIVE') {
      return forbidden(res, 'Only active subscriptions can be paused');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.ironSubscription.update({
        where: { id: subscription.id },
        data: { applicationStatus: 'PAUSED' },
      });
      await syncCustomerSubscriptionStatus(tx, req.customer.id, 'PAUSED');
      return next;
    });

    return success(res, { subscription: updated }, 'Subscription paused');
  } catch (err) {
    console.error('pauseOwnSubscription error:', err);
    return error(res, 'Failed to pause subscription');
  }
};

module.exports = {
  listSubscriptions,
  getSubscription,
  createSubscription,
  confirmSubscription,
  updateSubscriptionStatus,
  listAllLogs,
  getLogs,
  getLogsByPeriod,
  createLog,
  createLogsBatch,
  deleteLog,
  generateBill,
  listBillsForCustomer,
  getBillById,
  sendBill,
  recordBillPayment,
  applyForSubscription,
  getOwnSubscription,
  getOwnLogs,
  getOwnLogsByMonth,
  getOwnBills,
  pauseOwnSubscription,
  resolveIronRate,
};
