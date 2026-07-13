const prisma = require('../config/database');
const { success, created, error, badRequest, notFound, forbidden } = require('../utils/response');
const {
  ACTIVE_IRON_SUB_STATUSES,
  IRON_SUBSCRIPTION_STATUSES,
  LOCKED_BILL_STATUSES,
} = require('../config/master-data');
const { getCorePaymentMethods } = require('../services/masterData.service');
const { normalizePaymentMethod } = require('../utils/payment-method');
const { nextDocumentNumber } = require('../services/document-number.service');
const { BillingRuleError, ensureIronBillInvoice, refreshIronBillInvoice } = require('../services/billing.service');
const { PaymentRuleError, recordInvoiceSettlement } = require('../services/payment.service');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { OUTBOX_EVENT, enqueueOutboxEvent } = require('../services/outbox.service');

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

const syncCustomerSubscriptionStatus = async (tx, customerId, applicationStatus) => {
  await tx.customer.update({
    where: { id: customerId },
    data: { ironSubStatus: applicationStatus || null },
  });
};

const resolveIronRate = async (serviceId, customerId = null, client = prisma) => {
  const [service, customer] = await Promise.all([
    client.service.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true, category: true, basePrice: true, isActive: true },
    }),
    customerId ? client.customer.findUnique({ where: { id: customerId }, select: { ironRateOverride: true } }) : null,
  ]);

  if (!service || service.category !== 'DAILY_IRON' || !service.isActive) {
    throw Object.assign(new Error('Selected service is not an active Daily Iron service'), { code: 'INVALID_DAILY_IRON_SERVICE' });
  }
  if (!(Number(service.basePrice) > 0)) {
    throw Object.assign(new Error('Selected Daily Iron item must be priced before logging'), { code: 'INVALID_DAILY_IRON_SERVICE' });
  }

  const override = Number(customer?.ironRateOverride || 0);
  return {
    rate: override > 0 ? override : Number(service.basePrice),
    source: override > 0 ? 'CUSTOMER_OVERRIDE' : 'CATALOG',
    catalogRate: Number(service.basePrice),
  };
};

const normalizeIronServiceDate = (value) => startOfDay(value);
const validateIronServiceDate = (value) => {
  const serviceDate = normalizeIronServiceDate(value);
  const today = startOfDay(new Date());
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - Math.max(0, Number(process.env.IRON_LOG_BACKDATE_DAYS || 7)));
  if (serviceDate > today) throw new Error('FUTURE_IRON_LOG_DATE');
  if (serviceDate < earliest) throw new Error('IRON_LOG_BACKDATE_LIMIT');
  return serviceDate;
};

const isBillableDailyIronService = (service) =>
  Boolean(service && service.category === 'DAILY_IRON' && service.isActive && Number(service.basePrice) > 0);

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
      status: 'ACTIVE',
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
  return nextDocumentNumber({
    tx,
    documentType: 'IRON_BILL',
    period: `${year}-${month}`,
    prefix: `IRON-${month}${year}-`,
    padding: 4,
  });
};

const buildLogWhere = (customerId, start, end) => ({
  customerId,
  status: 'ACTIVE',
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
      status: 'ACTIVE',
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
  const piecesCount = Number(pieces);

  if (!customerId || !serviceId) return badRequest(res, 'customerId and serviceId are required');
  if (!Number.isInteger(piecesCount) || piecesCount <= 0) return badRequest(res, 'pieces must be a positive integer');

  try {
    const logDate = validateIronServiceDate(toDate(date) || new Date());
    const logEntry = await prisma.$transaction(async (tx) => {
      const subscriptionRef = await tx.ironSubscription.findUnique({ where: { customerId }, select: { id: true } });
      if (!subscriptionRef) throw Object.assign(new Error('Iron subscription not found'), { code: 'SUBSCRIPTION_NOT_FOUND' });
      await tx.$queryRaw`SELECT "id" FROM iron_subscriptions WHERE "id" = ${subscriptionRef.id} FOR UPDATE`;
      const subscription = await tx.ironSubscription.findUnique({
        where: { id: subscriptionRef.id },
        include: { customer: { select: { id: true, name: true, phone: true, preferredLanguage: true, notifWhatsApp: true } } },
      });
      if (!ACTIVE_IRON_SUB_STATUSES.includes(subscription.applicationStatus)) {
        throw Object.assign(new Error(`Subscription is ${subscription.applicationStatus} and cannot accept new logs`), { code: 'SUBSCRIPTION_INACTIVE' });
      }
      const rate = await resolveIronRate(serviceId, customerId, tx);
      const service = await tx.service.findUnique({ where: { id: serviceId }, select: { id: true, name: true, category: true, basePrice: true, isActive: true } });
      if (!isBillableDailyIronService(service)) throw Object.assign(new Error('Selected Daily Iron item must be active and priced before logging'), { code: 'INVALID_DAILY_IRON_SERVICE' });
      const amount = Number((piecesCount * rate.rate).toFixed(2));
      const createdLog = await tx.ironLog.create({
        data: {
          subscriptionId: subscription.id, customerId, serviceId, serviceName: service.name,
          date: logDate, pieces: piecesCount, ratePerPiece: rate.rate, amount,
          rateSource: rate.source,
          pricingSnapshot: { source: rate.source, catalogRate: rate.catalogRate, appliedRate: rate.rate, resolvedAt: new Date().toISOString() },
          notes: notes || null, loggedById: req.staff.id,
        },
        include: { service: true, customer: true, loggedBy: { select: { id: true, name: true } } },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'DAILY_IRON_LOG_CREATED', resource: 'iron_log', resourceId: createdLog.id,
        description: `${service.name} x${piecesCount} logged for ${subscription.customer.name || subscription.customer.phone}`,
        metadata: { customerId, serviceId, serviceDate: logDate, pieces: piecesCount, rateSource: rate.source, rate: rate.rate, amount },
        ...getRequestMeta(req),
      });
      if (subscription.customer.notifWhatsApp !== false) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.DAILY_IRON_LOG, aggregateType: 'iron_log', aggregateId: createdLog.id,
          payload: {}, dedupeKey: `daily-iron-log:${createdLog.id}`,
        });
      }
      return createdLog;
    }, { isolationLevel: 'Serializable' });
    const runningTotals = await getMonthlyRunningTotals(customerId, logDate);
    return created(res, {
      log: logEntry,
      monthToDate: runningTotals,
      notificationQueued: logEntry.customer?.notifWhatsApp !== false,
    }, 'Iron log created');
  } catch (err) {
    console.error('createLog error:', err);
    if (err.code === 'SUBSCRIPTION_NOT_FOUND') return notFound(res, err.message);
    if (['SUBSCRIPTION_INACTIVE', 'INVALID_DAILY_IRON_SERVICE'].includes(err.code)) return badRequest(res, err.message);
    if (err.message === 'FUTURE_IRON_LOG_DATE') return badRequest(res, 'Daily Iron service date cannot be in the future');
    if (err.message === 'IRON_LOG_BACKDATE_LIMIT') return badRequest(res, `Daily Iron service date cannot be more than ${process.env.IRON_LOG_BACKDATE_DAYS || 7} days old`);
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'This customer and service already have a Daily Iron log for that date; use a correction instead' });
    if (err.message === 'UNPRICED_DAILY_IRON_SERVICE') return badRequest(res, 'Selected Daily Iron item must be priced before logging');
    return error(res, 'Failed to create iron log');
  }
};

const createLogsBatch = async (req, res) => {
  const { customerId, date, notes, items } = req.body;
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
  if (new Set(normalizedItems.map((item) => item.serviceId)).size !== normalizedItems.length) {
    return badRequest(res, 'Each Daily Iron service may appear only once per service date');
  }

  try {
    const logDate = validateIronServiceDate(toDate(date) || new Date());
    const createdLogs = await prisma.$transaction(async (tx) => {
      const subscriptionRef = await tx.ironSubscription.findUnique({ where: { customerId }, select: { id: true } });
      if (!subscriptionRef) throw Object.assign(new Error('Iron subscription not found'), { code: 'SUBSCRIPTION_NOT_FOUND' });
      await tx.$queryRaw`SELECT "id" FROM iron_subscriptions WHERE "id" = ${subscriptionRef.id} FOR UPDATE`;
      const subscription = await tx.ironSubscription.findUnique({
        where: { id: subscriptionRef.id },
        include: { customer: { select: { id: true, name: true, phone: true, notifWhatsApp: true } } },
      });
      if (!ACTIVE_IRON_SUB_STATUSES.includes(subscription.applicationStatus)) {
        throw Object.assign(new Error(`Subscription is ${subscription.applicationStatus} and cannot accept new logs`), { code: 'SUBSCRIPTION_INACTIVE' });
      }
      const serviceIds = normalizedItems.map((item) => item.serviceId);
      const services = await tx.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true, category: true, basePrice: true, isActive: true },
      });
      const serviceById = new Map(services.map((service) => [service.id, service]));
      if (normalizedItems.some((item) => !isBillableDailyIronService(serviceById.get(item.serviceId)))) {
        throw Object.assign(new Error('Every Daily Iron item must be active and priced before logging'), { code: 'INVALID_DAILY_IRON_SERVICE' });
      }
      const rows = [];
      for (const item of normalizedItems) {
        const service = serviceById.get(item.serviceId);
        const rate = await resolveIronRate(item.serviceId, customerId, tx);
        rows.push(await tx.ironLog.create({
          data: {
            subscriptionId: subscription.id,
            customerId,
            serviceId: item.serviceId,
            serviceName: service.name,
            date: logDate,
            pieces: item.pieces,
            ratePerPiece: rate.rate,
            amount: Number((item.pieces * rate.rate).toFixed(2)),
            rateSource: rate.source,
            pricingSnapshot: { source: rate.source, catalogRate: rate.catalogRate, appliedRate: rate.rate, resolvedAt: new Date().toISOString() },
            notes: item.notes,
            loggedById: req.staff.id,
          },
          include: {
            service: { select: { id: true, name: true, category: true } },
            loggedBy: { select: { id: true, name: true } },
          },
        }));
      }
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'DAILY_IRON_LOG_BATCH_CREATED', resource: 'iron_subscription', resourceId: subscription.id,
        description: `${rows.length} Daily Iron service lines logged for ${subscription.customer.name || subscription.customer.phone}`,
        metadata: { customerId, serviceDate: logDate, logs: rows.map((log) => ({ id: log.id, serviceId: log.serviceId, pieces: log.pieces, rate: log.ratePerPiece, amount: log.amount })) },
        ...getRequestMeta(req),
      });
      if (subscription.customer.notifWhatsApp !== false) {
        for (const log of rows) {
          await enqueueOutboxEvent(tx, {
            eventType: OUTBOX_EVENT.DAILY_IRON_LOG, aggregateType: 'iron_log', aggregateId: log.id,
            payload: {}, dedupeKey: `daily-iron-log:${log.id}`,
          });
        }
      }
      return rows;
    }, { isolationLevel: 'Serializable' });

    const runningTotals = await getMonthlyRunningTotals(customerId, logDate);
    return created(res, {
      logs: createdLogs,
      monthToDate: runningTotals,
      notificationsQueued: createdLogs.length,
    }, 'Iron logs created');
  } catch (err) {
    console.error('createLogsBatch error:', err);
    if (err.code === 'SUBSCRIPTION_NOT_FOUND') return notFound(res, err.message);
    if (['SUBSCRIPTION_INACTIVE', 'INVALID_DAILY_IRON_SERVICE'].includes(err.code)) return badRequest(res, err.message);
    if (err.message === 'FUTURE_IRON_LOG_DATE') return badRequest(res, 'Daily Iron service date cannot be in the future');
    if (err.message === 'IRON_LOG_BACKDATE_LIMIT') return badRequest(res, `Daily Iron service date cannot be more than ${process.env.IRON_LOG_BACKDATE_DAYS || 7} days old`);
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'One or more services already have a Daily Iron log for that date; use a correction instead' });
    return error(res, 'Failed to create iron logs');
  }
};

const deleteLog = async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) return badRequest(res, 'A void reason is required');
  try {
    const logEntry = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM iron_logs WHERE "id" = ${req.params.id} FOR UPDATE`;
      const existing = await tx.ironLog.findUnique({ where: { id: req.params.id } });
      if (!existing) throw Object.assign(new Error('Iron log not found'), { code: 'LOG_NOT_FOUND' });
      if (existing.status === 'VOID') throw Object.assign(new Error('Iron log is already voided'), { code: 'LOG_ALREADY_VOID' });
      if (existing.billId) throw Object.assign(new Error('Billed log entries require a credit note or void/rebill workflow'), { code: 'LOG_BILLED' });
      const voided = await tx.ironLog.update({
        where: { id: existing.id },
        data: { status: 'VOID', voidedAt: new Date(), voidedById: req.staff.id, voidReason: reason, whatsappSent: false },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'DAILY_IRON_LOG_VOIDED', resource: 'iron_log', resourceId: voided.id,
        description: `${voided.serviceName} x${voided.pieces} voided for ${new Date(voided.date).toISOString().slice(0, 10)}`,
        metadata: { customerId: voided.customerId, serviceId: voided.serviceId, amount: voided.amount, reason },
        ...getRequestMeta(req),
      });
      return voided;
    }, { isolationLevel: 'Serializable' });
    return success(res, { log: logEntry }, 'Iron log voided; original retained');
  } catch (err) {
    console.error('deleteLog error:', err);
    if (err.code === 'LOG_NOT_FOUND') return notFound(res, err.message);
    if (['LOG_ALREADY_VOID', 'LOG_BILLED'].includes(err.code)) return badRequest(res, err.message);
    return error(res, 'Failed to delete iron log');
  }
};

const generateBill = async (req, res) => {
  const { customerId, billingPeriodStart, carryForwardNotes, notes } = req.body;
  const periodStart = toDate(billingPeriodStart);
  if (!customerId || !periodStart) {
    return badRequest(res, 'customerId and billingPeriodStart are required');
  }

  const normalizedPeriodStart = startOfMonth(periodStart);
  const periodEnd = endOfMonth(normalizedPeriodStart);

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
        billingPeriodStart: normalizedPeriodStart,
      },
    });

    if (existingBill && LOCKED_BILL_STATUSES.includes(existingBill.status)) {
      return badRequest(res, `Bill is already ${existingBill.status} and cannot be regenerated`);
    }

    const logs = await prisma.ironLog.findMany({
      where: {
        customerId,
        date: {
          gte: normalizedPeriodStart,
          lte: periodEnd,
        },
        status: 'ACTIVE',
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
              billingPeriodStart: normalizedPeriodStart,
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

      const invoice = await refreshIronBillInvoice(
        tx,
        persistedBill.id,
        req.staff?.id,
        existingBill ? 'DAILY_IRON_BILL_REGENERATED' : 'DAILY_IRON_BILL_GENERATED'
      );
      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: existingBill ? 'DAILY_IRON_BILL_REGENERATED' : 'DAILY_IRON_BILL_GENERATED',
        resource: 'invoice',
        resourceId: invoice.id,
        description: `${persistedBill.billNumber} generated as ${invoice.invoiceNumber}`,
        metadata: {
          billId: persistedBill.id,
          billNumber: persistedBill.billNumber,
          invoiceNumber: invoice.invoiceNumber,
          totalPieces: totals.totalPieces,
          totalAmount: Number(totals.totalAmount.toFixed(2)),
        },
        ...getRequestMeta(req),
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
          invoice: true,
        },
      });
    }, { isolationLevel: 'Serializable' });

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
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "iron_bills" WHERE "id" = ${req.params.billId} FOR UPDATE`;
      const bill = await tx.ironBill.findUnique({
        where: { id: req.params.billId },
        include: {
          customer: { select: { id: true, name: true, phone: true, preferredLanguage: true, notifWhatsApp: true } },
        },
      });
      if (!bill) throw new BillingRuleError('IRON_BILL_NOT_FOUND', 'Iron bill not found', 404);
      if (!(Number(bill.totalAmount) > 0)) throw new BillingRuleError('ZERO_VALUE_BILL', 'Cannot send a zero-value bill');
      if (bill.status === 'PAID') throw new BillingRuleError('BILL_ALREADY_PAID', 'A paid bill does not need to be sent again');

      const invoice = await ensureIronBillInvoice(tx, bill.id, req.staff?.id);
      const updated = await tx.ironBill.update({
        where: { id: bill.id },
        data: { status: Number(invoice.paidAmount || 0) > 0 ? 'PARTIAL' : 'SENT' },
        include: { customer: { select: { id: true, name: true, phone: true, preferredLanguage: true, notifWhatsApp: true } }, invoice: true },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'DAILY_IRON_BILL_SENT', resource: 'invoice', resourceId: invoice.id,
        description: `${invoice.invoiceNumber} queued for customer delivery`,
        metadata: { billId: bill.id, billNumber: bill.billNumber, customerId: bill.customerId },
        ...getRequestMeta(req),
      });
      if (bill.customer?.notifWhatsApp !== false) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.DAILY_IRON_BILL,
          aggregateType: 'iron_bill',
          aggregateId: bill.id,
          payload: { invoiceId: invoice.id },
          dedupeKey: `daily-iron-bill:${bill.id}:invoice-v${invoice.version}`,
        });
      }
      return { bill: updated, notificationQueued: bill.customer?.notifWhatsApp !== false };
    }, { isolationLevel: 'Serializable' });

    return success(res, result, 'Iron bill queued for delivery');
  } catch (err) {
    console.error('sendBill error:', err);
    if (err instanceof BillingRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to send iron bill');
  }
};

const recordBillPayment = async (req, res) => {
  const { amount, paymentMethod, reference, notes } = req.body;
  const paymentAmount = Number(amount);
  if (!(paymentAmount > 0)) return badRequest(res, 'amount must be greater than 0');
  const normalizedMethod = normalizePaymentMethod(paymentMethod || 'CASH');
  const corePaymentMethods = await getCorePaymentMethods();
  if (!corePaymentMethods.includes(normalizedMethod)) {
    return badRequest(res, `paymentMethod must be one of: ${corePaymentMethods.join(', ')}`);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await ensureIronBillInvoice(tx, req.params.billId, req.staff?.id);
      const settlement = await recordInvoiceSettlement(tx, {
        invoiceId: invoice.id,
        amount: paymentAmount,
        method: normalizedMethod,
        reference,
        notes,
        staff: req.staff,
        idempotencyKey: req.idempotencyKey,
      });
      await tx.ironBill.update({
        where: { id: req.params.billId },
        data: { paymentMethod: normalizedMethod },
      });
      const bill = await tx.ironBill.findUnique({
        where: { id: req.params.billId },
        include: { customer: { select: { id: true, name: true, phone: true, notifWhatsApp: true } }, invoice: true },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'DAILY_IRON_PAYMENT_RECORDED', resource: 'payment', resourceId: settlement.payment.id,
        description: `Rs ${paymentAmount.toFixed(2)} collected against ${invoice.invoiceNumber}`,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          billId: bill.id,
          billNumber: bill.billNumber,
          method: normalizedMethod,
          balanceDue: Number(settlement.invoice.balanceDue || 0),
        },
        ...getRequestMeta(req),
      });
      if (bill.customer?.notifWhatsApp !== false) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.DAILY_IRON_PAYMENT,
          aggregateType: 'iron_bill',
          aggregateId: bill.id,
          payload: { paymentId: settlement.payment.id, invoiceId: invoice.id },
          dedupeKey: `daily-iron-payment:${settlement.payment.id}`,
        });
      }
      return { bill, payment: settlement.payment, invoice: settlement.invoice };
    }, { isolationLevel: 'Serializable' });

    return success(res, result, 'Payment recorded');
  } catch (err) {
    console.error('recordBillPayment error:', err);
    if (err instanceof BillingRuleError || err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      return badRequest(res, err.message);
    }
    if (err?.code === 'P2034') return res.status(409).json({ success: false, message: 'Payment conflicted with another update; retry with the same idempotency key' });
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
      where: { customerId: req.customer.id, status: 'ACTIVE' },
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
  isBillableDailyIronService,
};
