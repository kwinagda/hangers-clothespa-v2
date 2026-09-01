const prisma = require('../config/database');
const { success, created, error, badRequest, notFound, forbidden } = require('../utils/response');
const {
  ACTIVE_IRON_SUB_STATUSES,
  IRON_SUBSCRIPTION_STATUSES,
} = require('../config/master-data');
const { getCorePaymentMethods } = require('../services/masterData.service');
const { normalizePaymentMethod } = require('../utils/payment-method');
const { nextDocumentNumber } = require('../services/document-number.service');
const { BillingRuleError, ensureIronBillInvoice, refreshIronBillInvoice } = require('../services/billing.service');
const { PaymentRuleError, recordInvoiceSettlement, reverseInvoicePaymentCorrection } = require('../services/payment.service');
const { writeAuditEvent, getRequestMeta } = require('../services/activity.service');
const { OUTBOX_EVENT, enqueueOutboxEvent } = require('../services/outbox.service');
const { resolveDailyIronBillMode } = require('../utils/daily-iron-billing');

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

const normalizeManualIronRate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw Object.assign(new Error('Daily Iron rate must be greater than zero'), { code: 'INVALID_DAILY_IRON_RATE' });
  }
  return Number(rate.toFixed(2));
};

const resolveAppliedIronRate = (resolvedRate, manualRate, reason) => {
  if (manualRate === null || Math.abs(manualRate - resolvedRate.rate) < 0.005) {
    return {
      rate: resolvedRate.rate,
      source: resolvedRate.source,
      snapshot: {
        source: resolvedRate.source,
        catalogRate: resolvedRate.catalogRate,
        appliedRate: resolvedRate.rate,
        resolvedAt: new Date().toISOString(),
      },
    };
  }
  const trimmedReason = String(reason || '').trim();
  if (trimmedReason.length < 3) {
    throw Object.assign(new Error('Daily Iron manual rate requires a reason'), { code: 'IRON_RATE_REASON_REQUIRED' });
  }
  return {
    rate: manualRate,
    source: 'MANUAL_OVERRIDE',
    snapshot: {
      source: 'MANUAL_OVERRIDE',
      resolvedSource: resolvedRate.source,
      catalogRate: resolvedRate.catalogRate,
      resolvedRate: resolvedRate.rate,
      appliedRate: manualRate,
      reason: trimmedReason,
      resolvedAt: new Date().toISOString(),
    },
  };
};

const normalizeIronBatchItems = (items, batchNotes = null) => {
  const inputItems = Array.isArray(items) ? items : [];
  return inputItems.map((item) => ({
    serviceId: String(item?.serviceId || '').trim(),
    pieces: Number(item?.pieces),
    ratePerPiece: normalizeManualIronRate(item?.ratePerPiece ?? item?.unitPrice),
    notes: item?.notes || batchNotes || null,
  }));
};

const logDailyIronRejected = async (req, {
  customerId,
  sourceOrderId,
  message,
  metadata = {},
}) => {
  if (!customerId && !sourceOrderId) return;
  try {
    await prisma.$transaction(async (tx) => {
      if (sourceOrderId) {
        await tx.orderStage.create({
          data: {
            orderId: sourceOrderId,
            stage: 'DAILY_IRON_LOG_FAILED',
            eventType: 'DAILY_IRON',
            reasonCode: 'DAILY_IRON_REJECTED',
            notes: `Daily Iron logs failed: ${message}`,
            changedById: req.staff?.id || null,
            metadata: {
              customerId: customerId || null,
              ...metadata,
            },
          },
        });
      }
      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'DAILY_IRON_LOG_REJECTED',
        status: 'FAILED',
        resource: sourceOrderId ? 'order' : 'customer',
        resourceId: sourceOrderId || customerId || null,
        description: message,
        metadata: {
          customerId: customerId || null,
          sourceOrderId: sourceOrderId || null,
          ...metadata,
        },
        ...getRequestMeta(req),
      });
    });
  } catch (logErr) {
    console.error('logDailyIronRejected error:', logErr.message);
  }
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

const isBeforeToday = (value) => startOfDay(value).getTime() < startOfDay(new Date()).getTime();

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

const getMonthlySummary = async (req, res) => {
  const month = String(req.query.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return badRequest(res, 'month must use YYYY-MM format');
  const periodStart = startOfMonth(new Date(`${month}-01T00:00:00`));
  const periodEnd = endOfMonth(periodStart);

  try {
    const [subscriptions, logs, bills] = await Promise.all([
      prisma.ironSubscription.findMany({
        where: { applicationStatus: 'ACTIVE' },
        include: { customer: { select: { id: true, name: true, phone: true, ironSubStatus: true } } },
        orderBy: { customer: { name: 'asc' } },
      }),
      prisma.ironLog.findMany({
        where: { date: { gte: periodStart, lte: periodEnd } },
        include: {
          service: { select: { id: true, name: true } },
          bill: { select: { id: true, billNumber: true, status: true } },
          loggedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.ironBill.findMany({
        where: { billingPeriodStart: periodStart },
        select: { id: true, billNumber: true, customerId: true, totalPieces: true, totalAmount: true, paidAmount: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const byCustomer = new Map(subscriptions.map((subscription) => [subscription.customerId, {
      subscriptionId: subscription.id,
      customer: subscription.customer,
      days: {}, logs: [], bills: [], totalPieces: 0, totalAmount: 0, unbilledPieces: 0, unbilledAmount: 0,
    }]));
    for (const log of logs) {
      if (!byCustomer.has(log.customerId)) continue;
      const row = byCustomer.get(log.customerId);
      const day = new Date(log.date).getDate();
      row.logs.push(log);
      if (log.status !== 'ACTIVE') continue;
      row.totalPieces += log.pieces;
      row.totalAmount += Number(log.amount);
      if (!log.billId) { row.unbilledPieces += log.pieces; row.unbilledAmount += Number(log.amount); }
      if (!row.days[day]) row.days[day] = { pieces: 0, amount: 0, logs: [] };
      row.days[day].pieces += log.pieces;
      row.days[day].amount += Number(log.amount);
      row.days[day].logs.push(log);
    }
    for (const bill of bills) if (byCustomer.has(bill.customerId)) byCustomer.get(bill.customerId).bills.push(bill);

    const customers = Array.from(byCustomer.values()).map((row) => {
      const billed = row.bills.length > 0;
      const paid = billed && row.bills.every((bill) => String(bill.status).toUpperCase() === 'PAID');
      const partiallyPaid = row.bills.some((bill) => Number(bill.paidAmount) > 0 && String(bill.status).toUpperCase() !== 'PAID');
      return {
        ...row,
        totalAmount: Number(row.totalAmount.toFixed(2)),
        unbilledAmount: Number(row.unbilledAmount.toFixed(2)),
        billingStatus: row.unbilledPieces > 0 ? (billed ? 'PARTIALLY_BILLED' : 'UNBILLED') : paid ? 'PAID' : partiallyPaid ? 'PARTIALLY_PAID' : billed ? 'BILLED' : 'NO_ACTIVITY',
      };
    });
    const activeRows = customers.filter((row) => row.totalPieces > 0 || row.bills.length > 0);
    const summary = activeRows.reduce((acc, row) => ({
      customers: acc.customers + 1,
      totalPieces: acc.totalPieces + row.totalPieces,
      totalAmount: acc.totalAmount + row.totalAmount,
      unbilledAmount: acc.unbilledAmount + row.unbilledAmount,
    }), { customers: 0, totalPieces: 0, totalAmount: 0, unbilledAmount: 0 });
    return success(res, { month, daysInMonth: periodEnd.getDate(), summary: { ...summary, totalAmount: Number(summary.totalAmount.toFixed(2)), unbilledAmount: Number(summary.unbilledAmount.toFixed(2)) }, customers });
  } catch (err) {
    console.error('getMonthlySummary error:', err);
    return error(res, 'Failed to fetch Daily Iron monthly summary');
  }
};

const dailyIronTimelineTitle = (action, status) => {
  if (action === 'DAILY_IRON_WHATSAPP_PENDING') return 'WhatsApp Queued';
  if (action === 'DAILY_IRON_WHATSAPP_SENT') return 'WhatsApp Sent';
  if (action === 'DAILY_IRON_WHATSAPP_FAILED') return 'WhatsApp Failed';
  if (action === 'DAILY_IRON_WHATSAPP_SKIPPED') return 'WhatsApp Skipped';
  if (action === 'DAILY_IRON_LOG_CREATED') return 'Daily Iron Logged';
  if (action === 'DAILY_IRON_LOG_BATCH_CREATED') return 'Daily Iron Logged';
  if (action === 'DAILY_IRON_DAY_SHEET_CUSTOMER_LOGGED') return 'Day Sheet Saved';
  if (action === 'DAILY_IRON_DAY_SHEET_CREATED') return 'Day Sheet Completed';
  if (action === 'DAILY_IRON_LOG_CORRECTED') return 'Daily Iron Corrected';
  if (action === 'DAILY_IRON_LOG_VOIDED') return 'Daily Iron Voided';
  if (action === 'DAILY_IRON_BILL_GENERATED') return 'Daily Iron Bill Generated';
  if (action === 'DAILY_IRON_BILL_SENT') return 'Daily Iron Bill Sent';
  if (action === 'DAILY_IRON_PAYMENT_RECORDED') return 'Daily Iron Payment Recorded';
  if (action === 'DAILY_IRON_PAYMENT_REVERSED') return 'Daily Iron Payment Reversed';
  if (status === 'FAILED') return 'Daily Iron Action Failed';
  return String(action || 'DAILY_IRON_EVENT').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
};

const outboxTimelineTitle = (eventType, status) => {
  if (status === 'PROCESSED') return 'WhatsApp Sent';
  if (status === 'FAILED' || status === 'DEAD') return 'WhatsApp Failed';
  if (status === 'PROCESSING') return 'WhatsApp Processing';
  if (status === 'PENDING') return 'WhatsApp Queued';
  return String(eventType || 'WHATSAPP').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
};

const listDailyIronTimeline = async (req, res) => {
  const requestedDate = toDate(req.query.date);
  const requestedStart = toDate(req.query.start);
  const requestedEnd = toDate(req.query.end);
  const customerId = req.query.customerId ? String(req.query.customerId) : undefined;

  const start = requestedDate || requestedStart || new Date();
  const end = requestedDate || requestedEnd || start;
  if (end < start) return badRequest(res, 'end must be on or after start');

  try {
    const logWhere = {
      date: {
        gte: startOfDay(start),
        lte: endOfDay(end),
      },
      ...(customerId ? { customerId } : {}),
    };
    const logs = await prisma.ironLog.findMany({
      where: logWhere,
      select: {
        id: true,
        subscriptionId: true,
        customerId: true,
        serviceName: true,
        date: true,
        amount: true,
        status: true,
        createdAt: true,
        customer: { select: { id: true, name: true, phone: true } },
        loggedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const logIds = logs.map((log) => log.id);
    const logById = new Map(logs.map((log) => [log.id, log]));
    const customerBySubscription = new Map();
    logs.forEach((log) => {
      if (!customerBySubscription.has(log.subscriptionId)) customerBySubscription.set(log.subscriptionId, log.customer);
    });

    const [audits, outboxEvents] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          action: { startsWith: 'DAILY_IRON' },
          createdAt: {
            gte: startOfDay(start),
            lte: endOfDay(end),
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.outboxEvent.findMany({
        where: {
          eventType: { in: [OUTBOX_EVENT.DAILY_IRON_LOG, OUTBOX_EVENT.DAILY_IRON_LOG_BATCH, OUTBOX_EVENT.DAILY_IRON_BILL, OUTBOX_EVENT.DAILY_IRON_PAYMENT] },
          createdAt: {
            gte: startOfDay(start),
            lte: endOfDay(end),
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const relatedLogIds = new Set(logIds);
    audits.forEach((audit) => {
      const metadata = audit.metadata || {};
      if (metadata.logId) relatedLogIds.add(metadata.logId);
      if (metadata.payload?.logId) relatedLogIds.add(metadata.payload.logId);
      if (Array.isArray(metadata.payload?.logIds)) metadata.payload.logIds.forEach((id) => id && relatedLogIds.add(id));
      if (Array.isArray(metadata.logIds)) metadata.logIds.forEach((id) => id && relatedLogIds.add(id));
      if (Array.isArray(metadata.logs)) metadata.logs.forEach((log) => log?.id && relatedLogIds.add(log.id));
      if (logById.has(audit.resourceId)) relatedLogIds.add(audit.resourceId);
    });
    outboxEvents.forEach((event) => {
      if (event.eventType === OUTBOX_EVENT.DAILY_IRON_LOG) relatedLogIds.add(event.aggregateId);
      if (Array.isArray(event.payload?.logIds)) event.payload.logIds.forEach((id) => id && relatedLogIds.add(id));
    });
    const missingLogIds = [...relatedLogIds].filter((id) => id && !logById.has(id));
    if (missingLogIds.length) {
      const relatedLogs = await prisma.ironLog.findMany({
        where: { id: { in: missingLogIds } },
        select: {
          id: true,
          subscriptionId: true,
          customerId: true,
          serviceName: true,
          date: true,
          amount: true,
          status: true,
          createdAt: true,
          customer: { select: { id: true, name: true, phone: true } },
          loggedBy: { select: { id: true, name: true, role: true } },
        },
      });
      relatedLogs.forEach((log) => {
        logById.set(log.id, log);
        if (!customerBySubscription.has(log.subscriptionId)) customerBySubscription.set(log.subscriptionId, log.customer);
      });
    }

    const auditedOutboxIds = new Set(audits.map((audit) => audit.metadata?.outboxEventId).filter(Boolean));
    const events = [];

    audits.forEach((audit) => {
      const metadata = audit.metadata || {};
      const relatedLogId = metadata.logId || metadata.payload?.logId || metadata.payload?.logIds?.[0] || metadata.logIds?.[0] || metadata.logs?.[0]?.id || (logById.has(audit.resourceId) ? audit.resourceId : null);
      const relatedLog = relatedLogId ? logById.get(relatedLogId) : null;
      const customer = relatedLog?.customer || customerBySubscription.get(audit.resourceId) || null;
      events.push({
        id: audit.id,
        source: 'AUDIT_LOG',
        createdAt: audit.createdAt,
        customerId: metadata.customerId || relatedLog?.customerId || customer?.id || null,
        customer,
        title: dailyIronTimelineTitle(audit.action, audit.status),
        stage: audit.action,
        eventType: String(audit.action || '').includes('WHATSAPP') ? 'NOTIFICATION' : 'ACTIVITY',
        status: audit.status,
        notes: audit.description,
        metadata,
        actorName: audit.actorName,
        resource: audit.resource,
        resourceId: audit.resourceId,
      });
    });

    outboxEvents
      .filter((event) => !auditedOutboxIds.has(event.id))
      .forEach((event) => {
        const logId = event.eventType === OUTBOX_EVENT.DAILY_IRON_LOG
          ? event.aggregateId
          : Array.isArray(event.payload?.logIds) ? event.payload.logIds[0] : null;
        const log = logId ? logById.get(logId) : null;
        const customer = log?.customer || customerBySubscription.get(event.aggregateId) || null;
        events.push({
          id: `outbox:${event.id}`,
          source: 'OUTBOX_EVENT',
          createdAt: event.updatedAt || event.createdAt,
          customerId: log?.customerId || customer?.id || null,
          customer,
          title: outboxTimelineTitle(event.eventType, event.status),
          stage: event.status === 'FAILED' || event.status === 'DEAD' ? 'DAILY_IRON_WHATSAPP_FAILED' : event.status === 'PROCESSED' ? 'DAILY_IRON_WHATSAPP_SENT' : 'DAILY_IRON_WHATSAPP_PENDING',
          eventType: 'NOTIFICATION',
          status: event.status,
          notes: event.lastError ? `WhatsApp failed: ${event.lastError}` : outboxTimelineTitle(event.eventType, event.status),
          metadata: {
            outboxEventId: event.id,
            outboxEventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            attempts: event.attempts,
            payload: event.payload || {},
          },
          actorName: 'WhatsApp worker',
          resource: event.aggregateType,
          resourceId: event.aggregateId,
        });
      });

    const filteredEvents = customerId ? events.filter((event) => event.customerId === customerId) : events;
    filteredEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return success(res, {
      events: filteredEvents,
      summary: {
        total: filteredEvents.length,
        failed: filteredEvents.filter((event) => event.stage.includes('FAILED') || event.status === 'FAILED').length,
        sent: filteredEvents.filter((event) => event.stage.includes('SENT') || event.status === 'PROCESSED').length,
        rangeStart: startOfDay(start),
        rangeEnd: endOfDay(end),
      },
    });
  } catch (err) {
    console.error('listDailyIronTimeline error:', err);
    return error(res, 'Failed to fetch Daily Iron timeline');
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
  let manualRate = null;

  if (!customerId || !serviceId) return badRequest(res, 'customerId and serviceId are required');
  if (!Number.isInteger(piecesCount) || piecesCount <= 0) return badRequest(res, 'pieces must be a positive integer');
  try {
    manualRate = normalizeManualIronRate(req.body?.ratePerPiece ?? req.body?.unitPrice);
  } catch (err) {
    return badRequest(res, err.message);
  }

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
      const resolvedRate = await resolveIronRate(serviceId, customerId, tx);
      const service = await tx.service.findUnique({ where: { id: serviceId }, select: { id: true, name: true, category: true, basePrice: true, isActive: true } });
      if (!isBillableDailyIronService(service)) throw Object.assign(new Error('Selected Daily Iron item must be active and priced before logging'), { code: 'INVALID_DAILY_IRON_SERVICE' });
      const appliedRate = resolveAppliedIronRate(resolvedRate, manualRate, notes);
      const amount = Number((piecesCount * appliedRate.rate).toFixed(2));
      const createdLog = await tx.ironLog.create({
        data: {
          subscriptionId: subscription.id, customerId, serviceId, serviceName: service.name,
          date: logDate, pieces: piecesCount, ratePerPiece: appliedRate.rate, amount,
          rateSource: appliedRate.source,
          pricingSnapshot: appliedRate.snapshot,
          notes: notes || null, loggedById: req.staff.id,
        },
        include: { service: true, customer: true, loggedBy: { select: { id: true, name: true } } },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: 'DAILY_IRON_LOG_CREATED', resource: 'iron_log', resourceId: createdLog.id,
        description: `${service.name} x${piecesCount} logged for ${subscription.customer.name || subscription.customer.phone}`,
        metadata: { customerId, serviceId, serviceDate: logDate, pieces: piecesCount, rateSource: appliedRate.source, rate: appliedRate.rate, amount },
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
    if (['SUBSCRIPTION_INACTIVE', 'INVALID_DAILY_IRON_SERVICE', 'INVALID_DAILY_IRON_RATE', 'IRON_RATE_REASON_REQUIRED'].includes(err.code)) return badRequest(res, err.message);
    if (err.message === 'FUTURE_IRON_LOG_DATE') return badRequest(res, 'Daily Iron service date cannot be in the future');
    if (err.message === 'IRON_LOG_BACKDATE_LIMIT') return badRequest(res, `Daily Iron service date cannot be more than ${process.env.IRON_LOG_BACKDATE_DAYS || 7} days old`);
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Daily Iron log conflicts with an existing unique record; retry after refreshing the page' });
    if (err.message === 'UNPRICED_DAILY_IRON_SERVICE') return badRequest(res, 'Selected Daily Iron item must be priced before logging');
    return error(res, 'Failed to create iron log');
  }
};

const createLogsBatch = async (req, res) => {
  const { customerId, date, notes, items, sourceOrderId } = req.body;
  const inputItems = Array.isArray(items) ? items : [];

  if (!customerId) {
    await logDailyIronRejected(req, {
      sourceOrderId,
      message: 'Daily Iron logs rejected: customerId is required',
      metadata: { itemCount: inputItems.length },
    });
    return badRequest(res, 'customerId is required');
  }
  if (!inputItems.length) {
    await logDailyIronRejected(req, {
      customerId,
      sourceOrderId,
      message: 'Daily Iron logs rejected: at least one Daily Iron item is required',
      metadata: { itemCount: inputItems.length },
    });
    return badRequest(res, 'At least one Daily Iron item is required');
  }

  let normalizedItems;
  try {
    normalizedItems = normalizeIronBatchItems(inputItems, notes);
  } catch (err) {
    await logDailyIronRejected(req, {
      customerId,
      sourceOrderId,
      message: err.message,
      metadata: { itemCount: inputItems.length },
    });
    return badRequest(res, err.message);
  }

  if (normalizedItems.some((item) => !item.serviceId)) {
    await logDailyIronRejected(req, {
      customerId,
      sourceOrderId,
      message: 'Daily Iron logs rejected: serviceId is required for every item',
      metadata: { itemCount: inputItems.length },
    });
    return badRequest(res, 'serviceId is required for every item');
  }
  if (normalizedItems.some((item) => !Number.isInteger(item.pieces) || item.pieces <= 0)) {
    await logDailyIronRejected(req, {
      customerId,
      sourceOrderId,
      message: 'Daily Iron logs rejected: pieces must be a positive integer for every item',
      metadata: { itemCount: inputItems.length },
    });
    return badRequest(res, 'pieces must be a positive integer for every item');
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
        const resolvedRate = await resolveIronRate(item.serviceId, customerId, tx);
        const appliedRate = resolveAppliedIronRate(resolvedRate, item.ratePerPiece, item.notes);
        rows.push(await tx.ironLog.create({
          data: {
            subscriptionId: subscription.id,
            customerId,
            serviceId: item.serviceId,
            serviceName: service.name,
            date: logDate,
            pieces: item.pieces,
            ratePerPiece: appliedRate.rate,
            amount: Number((item.pieces * appliedRate.rate).toFixed(2)),
            rateSource: appliedRate.source,
            pricingSnapshot: appliedRate.snapshot,
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
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.DAILY_IRON_LOG_BATCH,
          aggregateType: 'iron_subscription',
          aggregateId: subscription.id,
          payload: { logIds: rows.map((log) => log.id) },
          dedupeKey: `daily-iron-log-batch:${rows.map((log) => log.id).join(':')}`,
        });
      }
      return rows;
    }, { isolationLevel: 'Serializable' });

    const runningTotals = await getMonthlyRunningTotals(customerId, logDate);
    return created(res, {
      logs: createdLogs,
      monthToDate: runningTotals,
      notificationsQueued: createdLogs.length ? 1 : 0,
    }, 'Iron logs created');
  } catch (err) {
    console.error('createLogsBatch error:', err);
    const responseMessage = err.message === 'FUTURE_IRON_LOG_DATE'
      ? 'Daily Iron service date cannot be in the future'
      : err.message === 'IRON_LOG_BACKDATE_LIMIT'
        ? `Daily Iron service date cannot be more than ${process.env.IRON_LOG_BACKDATE_DAYS || 7} days old`
        : err.code === 'P2002'
          ? 'Daily Iron log conflicts with an existing unique record; retry after refreshing the page'
          : err.message || 'Failed to create iron logs';
    await logDailyIronRejected(req, {
      customerId,
      sourceOrderId,
      message: responseMessage,
      metadata: {
        code: err.code || null,
        itemCount: inputItems.length,
        serviceDate: date || null,
        items: normalizedItems.map((item) => ({
          serviceId: item.serviceId,
          pieces: item.pieces,
          hasManualRate: item.ratePerPiece !== null,
        })),
      },
    });
    if (err.code === 'SUBSCRIPTION_NOT_FOUND') return notFound(res, err.message);
    if (['SUBSCRIPTION_INACTIVE', 'INVALID_DAILY_IRON_SERVICE', 'INVALID_DAILY_IRON_RATE', 'IRON_RATE_REASON_REQUIRED'].includes(err.code)) return badRequest(res, err.message);
    if (err.message === 'FUTURE_IRON_LOG_DATE') return badRequest(res, 'Daily Iron service date cannot be in the future');
    if (err.message === 'IRON_LOG_BACKDATE_LIMIT') return badRequest(res, `Daily Iron service date cannot be more than ${process.env.IRON_LOG_BACKDATE_DAYS || 7} days old`);
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Daily Iron log conflicts with an existing unique record; retry after refreshing the page' });
    return error(res, 'Failed to create iron logs');
  }
};

const createDaySheet = async (req, res) => {
  const { date, rows } = req.body;
  const inputRows = Array.isArray(rows) ? rows : [];

  if (!inputRows.length) return badRequest(res, 'At least one customer row is required');

  const normalizedRows = [];
  const rowErrors = [];
  for (let index = 0; index < inputRows.length; index += 1) {
    const row = inputRows[index] || {};
    const customerId = String(row.customerId || '').trim();
    const inputItems = Array.isArray(row.items) ? row.items : [];
    let items = [];

    try {
      items = normalizeIronBatchItems(inputItems, row.notes);
    } catch (err) {
      rowErrors.push({ row: index + 1, customerId: customerId || null, message: err.message });
      continue;
    }

    if (!customerId) {
      rowErrors.push({ row: index + 1, customerId: null, message: 'customerId is required' });
      continue;
    }
    if (!items.length) {
      rowErrors.push({ row: index + 1, customerId, message: 'At least one Daily Iron item is required' });
      continue;
    }
    if (items.some((item) => !item.serviceId)) {
      rowErrors.push({ row: index + 1, customerId, message: 'serviceId is required for every item' });
      continue;
    }
    if (items.some((item) => !Number.isInteger(item.pieces) || item.pieces <= 0)) {
      rowErrors.push({ row: index + 1, customerId, message: 'pieces must be a positive integer for every item' });
      continue;
    }

    normalizedRows.push({ row: index + 1, customerId, notes: row.notes || null, items });
  }

  if (rowErrors.length) {
    await writeAuditEvent(prisma, {
      actorType: 'staff',
      actorId: req.staff?.id,
      actorName: req.staff?.name,
      action: 'DAILY_IRON_DAY_SHEET_REJECTED',
      status: 'FAILED',
      resource: 'iron_sheet',
      description: 'Daily Iron day sheet rejected before saving',
      metadata: { rowErrors, rowCount: inputRows.length, serviceDate: date || null },
      ...getRequestMeta(req),
    });
    return badRequest(res, 'Daily Iron sheet has invalid rows', rowErrors);
  }

  try {
    const logDate = validateIronServiceDate(toDate(date) || new Date());
    const customerIds = [...new Set(normalizedRows.map((row) => row.customerId))];
    const serviceIds = [...new Set(normalizedRows.flatMap((row) => row.items.map((item) => item.serviceId)))];

    const createdByCustomer = await prisma.$transaction(async (tx) => {
      const subscriptions = await tx.ironSubscription.findMany({
        where: { customerId: { in: customerIds } },
        include: {
          customer: {
            select: { id: true, name: true, phone: true, preferredLanguage: true, notifWhatsApp: true },
          },
        },
      });
      const subscriptionByCustomerId = new Map(subscriptions.map((subscription) => [subscription.customerId, subscription]));

      const subscriptionErrors = [];
      for (const row of normalizedRows) {
        const subscription = subscriptionByCustomerId.get(row.customerId);
        if (!subscription) {
          subscriptionErrors.push({ row: row.row, customerId: row.customerId, message: 'Iron subscription not found' });
        } else if (!ACTIVE_IRON_SUB_STATUSES.includes(subscription.applicationStatus)) {
          subscriptionErrors.push({ row: row.row, customerId: row.customerId, message: `Subscription is ${subscription.applicationStatus} and cannot accept new logs` });
        }
      }
      if (subscriptionErrors.length) {
        const err = Object.assign(new Error('Daily Iron sheet has subscription issues'), {
          code: 'DAY_SHEET_SUBSCRIPTION_ERROR',
          rowErrors: subscriptionErrors,
        });
        throw err;
      }

      for (const subscription of subscriptions) {
        await tx.$queryRaw`SELECT "id" FROM iron_subscriptions WHERE "id" = ${subscription.id} FOR UPDATE`;
      }

      const services = await tx.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true, category: true, basePrice: true, isActive: true },
      });
      const serviceById = new Map(services.map((service) => [service.id, service]));
      const serviceErrors = [];
      for (const row of normalizedRows) {
        for (const item of row.items) {
          if (!isBillableDailyIronService(serviceById.get(item.serviceId))) {
            serviceErrors.push({ row: row.row, customerId: row.customerId, serviceId: item.serviceId, message: 'Every Daily Iron item must be active and priced before logging' });
          }
        }
      }
      if (serviceErrors.length) {
        const err = Object.assign(new Error('Daily Iron sheet has service pricing issues'), {
          code: 'DAY_SHEET_SERVICE_ERROR',
          rowErrors: serviceErrors,
        });
        throw err;
      }

      const resultRows = [];
      for (const row of normalizedRows) {
        const subscription = subscriptionByCustomerId.get(row.customerId);
        const logs = [];
        for (const item of row.items) {
          const service = serviceById.get(item.serviceId);
          const resolvedRate = await resolveIronRate(item.serviceId, row.customerId, tx);
          const appliedRate = resolveAppliedIronRate(resolvedRate, item.ratePerPiece, item.notes);
          logs.push(await tx.ironLog.create({
            data: {
              subscriptionId: subscription.id,
              customerId: row.customerId,
              serviceId: item.serviceId,
              serviceName: service.name,
              date: logDate,
              pieces: item.pieces,
              ratePerPiece: appliedRate.rate,
              amount: Number((item.pieces * appliedRate.rate).toFixed(2)),
              rateSource: appliedRate.source,
              pricingSnapshot: appliedRate.snapshot,
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
          actorType: 'staff',
          actorId: req.staff?.id,
          actorName: req.staff?.name,
          action: 'DAILY_IRON_DAY_SHEET_CUSTOMER_LOGGED',
          resource: 'iron_subscription',
          resourceId: subscription.id,
          description: `${logs.length} Daily Iron service lines logged for ${subscription.customer.name || subscription.customer.phone}`,
          metadata: {
            customerId: row.customerId,
            serviceDate: logDate,
            logs: logs.map((log) => ({ id: log.id, serviceId: log.serviceId, pieces: log.pieces, rate: log.ratePerPiece, amount: log.amount })),
          },
          ...getRequestMeta(req),
        });

        if (subscription.customer.notifWhatsApp !== false) {
          await enqueueOutboxEvent(tx, {
            eventType: OUTBOX_EVENT.DAILY_IRON_LOG_BATCH,
            aggregateType: 'iron_subscription',
            aggregateId: subscription.id,
            payload: { logIds: logs.map((log) => log.id) },
            dedupeKey: `daily-iron-day-sheet:${subscription.id}:${logs.map((log) => log.id).join(':')}`,
          });
        }

        resultRows.push({
          customerId: row.customerId,
          customer: subscription.customer,
          logs,
          notificationQueued: subscription.customer.notifWhatsApp !== false,
        });
      }

      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'DAILY_IRON_DAY_SHEET_CREATED',
        resource: 'iron_sheet',
        description: `${resultRows.length} Daily Iron customer rows saved`,
        metadata: {
          serviceDate: logDate,
          customerCount: resultRows.length,
          logCount: resultRows.reduce((sum, row) => sum + row.logs.length, 0),
          customerIds,
        },
        ...getRequestMeta(req),
      });

      return resultRows;
    }, { isolationLevel: 'Serializable' });

    return created(res, {
      rows: createdByCustomer,
      summary: {
        customers: createdByCustomer.length,
        logs: createdByCustomer.reduce((sum, row) => sum + row.logs.length, 0),
        pieces: createdByCustomer.reduce((sum, row) => sum + row.logs.reduce((lineSum, log) => lineSum + Number(log.pieces || 0), 0), 0),
        amount: Number(createdByCustomer.reduce((sum, row) => sum + row.logs.reduce((lineSum, log) => lineSum + Number(log.amount || 0), 0), 0).toFixed(2)),
        notificationsQueued: createdByCustomer.filter((row) => row.notificationQueued).length,
      },
    }, 'Daily Iron sheet saved');
  } catch (err) {
    console.error('createDaySheet error:', err);
    const rowErrors = Array.isArray(err.rowErrors) ? err.rowErrors : null;
    await writeAuditEvent(prisma, {
      actorType: 'staff',
      actorId: req.staff?.id,
      actorName: req.staff?.name,
      action: 'DAILY_IRON_DAY_SHEET_FAILED',
      status: 'FAILED',
      resource: 'iron_sheet',
      description: err.message || 'Daily Iron day sheet failed',
      metadata: {
        code: err.code || null,
        rowErrors,
        rowCount: inputRows.length,
        serviceDate: date || null,
      },
      ...getRequestMeta(req),
    });
    if (rowErrors) return badRequest(res, err.message, rowErrors);
    if (['FUTURE_IRON_LOG_DATE', 'IRON_LOG_BACKDATE_LIMIT'].includes(err.message)) {
      return badRequest(res, err.message === 'FUTURE_IRON_LOG_DATE'
        ? 'Daily Iron service date cannot be in the future'
        : `Daily Iron service date cannot be more than ${process.env.IRON_LOG_BACKDATE_DAYS || 7} days old`);
    }
    if (['INVALID_DAILY_IRON_SERVICE', 'INVALID_DAILY_IRON_RATE', 'IRON_RATE_REASON_REQUIRED'].includes(err.code)) return badRequest(res, err.message);
    return error(res, 'Failed to save Daily Iron sheet');
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

const correctLog = async (req, res) => {
  const nextPieces = Number(req.body?.pieces);
  const reason = String(req.body?.reason || '').trim();
  const notes = req.body?.notes !== undefined ? String(req.body.notes || '').slice(0, 160) : undefined;
  let manualRate = null;
  const hasRateInput = req.body?.ratePerPiece !== undefined && req.body?.ratePerPiece !== null && req.body?.ratePerPiece !== '';

  if (!Number.isInteger(nextPieces) || nextPieces <= 0) return badRequest(res, 'pieces must be a positive integer');
  if (reason.length < 3) return badRequest(res, 'A correction reason is required');
  try {
    if (hasRateInput) manualRate = normalizeManualIronRate(req.body.ratePerPiece);
  } catch (err) {
    return badRequest(res, err.message);
  }

  try {
    const corrected = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM iron_logs WHERE "id" = ${req.params.id} FOR UPDATE`;
      const existing = await tx.ironLog.findUnique({
        where: { id: req.params.id },
        include: {
          service: { select: { id: true, name: true, category: true, basePrice: true, isActive: true } },
          customer: { select: { id: true, name: true, phone: true, notifWhatsApp: true } },
          bill: { select: { id: true, billNumber: true, status: true } },
        },
      });
      if (!existing) throw Object.assign(new Error('Iron log not found'), { code: 'LOG_NOT_FOUND' });
      if (existing.status !== 'ACTIVE') throw Object.assign(new Error('Only active Daily Iron logs can be corrected'), { code: 'LOG_NOT_ACTIVE' });
      if (existing.billId) throw Object.assign(new Error(`This log is already billed in ${existing.bill?.billNumber || 'a bill'}; use bill correction/void-rebill instead`), { code: 'LOG_BILLED' });
      if (isBeforeToday(existing.date) && !['SUPER_ADMIN', 'MANAGER'].includes(req.staff?.role)) {
        throw Object.assign(new Error('Older Daily Iron logs can be corrected only by a manager or super admin'), { code: 'OLD_LOG_RESTRICTED' });
      }
      if (isBeforeToday(existing.date) && reason.length < 10) {
        throw Object.assign(new Error('Older Daily Iron corrections require a clear reason'), { code: 'OLD_LOG_REASON_REQUIRED' });
      }

      let appliedRate = {
        rate: Number(existing.ratePerPiece),
        source: existing.rateSource || 'CATALOG',
        snapshot: existing.pricingSnapshot || null,
      };
      if (hasRateInput) {
        const resolvedRate = await resolveIronRate(existing.serviceId, existing.customerId, tx);
        appliedRate = resolveAppliedIronRate(resolvedRate, manualRate, reason);
      }

      const before = {
        pieces: existing.pieces,
        ratePerPiece: Number(existing.ratePerPiece),
        amount: Number(existing.amount),
        notes: existing.notes || null,
      };
      const amount = Number((nextPieces * appliedRate.rate).toFixed(2));
      const updated = await tx.ironLog.update({
        where: { id: existing.id },
        data: {
          pieces: nextPieces,
          ratePerPiece: appliedRate.rate,
          amount,
          rateSource: appliedRate.source,
          pricingSnapshot: appliedRate.snapshot || existing.pricingSnapshot,
          notes: notes !== undefined ? notes : existing.notes,
          whatsappSent: false,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, preferredLanguage: true, ironSubStatus: true } },
          service: { select: { id: true, name: true, category: true } },
          loggedBy: { select: { id: true, name: true } },
          bill: { select: { id: true, billNumber: true, status: true } },
        },
      });

      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'DAILY_IRON_LOG_CORRECTED',
        resource: 'iron_log',
        resourceId: updated.id,
        description: `${updated.serviceName} corrected from ${before.pieces} pcs to ${updated.pieces} pcs`,
        metadata: {
          customerId: updated.customerId,
          serviceId: updated.serviceId,
          serviceDate: updated.date,
          reason,
          before,
          after: {
            pieces: updated.pieces,
            ratePerPiece: Number(updated.ratePerPiece),
            amount: Number(updated.amount),
            notes: updated.notes || null,
          },
          olderDate: isBeforeToday(updated.date),
        },
        ...getRequestMeta(req),
      });

      if (updated.customer?.notifWhatsApp !== false) {
        await enqueueOutboxEvent(tx, {
          eventType: OUTBOX_EVENT.DAILY_IRON_LOG,
          aggregateType: 'iron_log',
          aggregateId: updated.id,
          payload: { reason: 'CORRECTION' },
          dedupeKey: `daily-iron-log-correction:${updated.id}:${Date.now()}`,
        });
      }

      return updated;
    }, { isolationLevel: 'Serializable' });

    return success(res, { log: corrected }, 'Iron log corrected');
  } catch (err) {
    console.error('correctLog error:', err);
    if (err.code === 'LOG_NOT_FOUND') return notFound(res, err.message);
    if (['LOG_NOT_ACTIVE', 'LOG_BILLED', 'OLD_LOG_REASON_REQUIRED', 'INVALID_DAILY_IRON_RATE', 'IRON_RATE_REASON_REQUIRED'].includes(err.code)) return badRequest(res, err.message);
    if (err.code === 'OLD_LOG_RESTRICTED') return forbidden(res, err.message);
    return error(res, 'Failed to correct iron log');
  }
};

const getLogRules = async (req, res) => success(res, {
  today: startOfDay(new Date()),
  backdateDays: Math.max(0, Number(process.env.IRON_LOG_BACKDATE_DAYS || 7)),
  futureDatesAllowed: false,
  correction: {
    unbilledOnly: true,
    reasonRequired: true,
    olderDateManagerOnly: true,
    billedLogMessage: 'Billed logs require bill correction/void-rebill; direct quantity edit is locked.',
  },
});

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

    const billsForPeriod = await prisma.ironBill.findMany({
      where: {
        customerId,
        billingPeriodStart: normalizedPeriodStart,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    const {
      existingDraftBill: existingBill,
      lockedBills,
      mode: billMode,
    } = resolveDailyIronBillMode(billsForPeriod);

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
          billMode,
          supplementalForBillIds: lockedBills.map((bill) => bill.id),
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

    return success(
      res,
      { bill },
      existingBill ? 'Draft bill regenerated' : billMode === 'SUPPLEMENTAL' ? 'Supplemental bill generated' : 'Bill generated'
    );
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
        invoice: {
          include: {
            allocations: {
              include: { payment: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
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
  const { amount = 0, paymentMethod, reference, notes, writeOffAmount = 0, writeOffReason, effectiveAt } = req.body;
  const paymentAmount = Number(amount);
  const writeOff = Number(writeOffAmount || 0);
  if (!(paymentAmount > 0 || writeOff > 0)) return badRequest(res, 'payment or write-off amount is required');
  const normalizedMethod = paymentAmount > 0 ? normalizePaymentMethod(paymentMethod || 'CASH') : null;
  const corePaymentMethods = await getCorePaymentMethods();
  if (paymentAmount > 0 && !corePaymentMethods.includes(normalizedMethod)) {
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
        writeOffAmount: writeOff,
        writeOffReason,
        staff: req.staff,
        idempotencyKey: req.idempotencyKey,
        effectiveAt: effectiveAt ? new Date(effectiveAt) : undefined,
      });
      if (normalizedMethod) {
        await tx.ironBill.update({
          where: { id: req.params.billId },
          data: { paymentMethod: normalizedMethod },
        });
      }
      const bill = await tx.ironBill.findUnique({
        where: { id: req.params.billId },
        include: { customer: { select: { id: true, name: true, phone: true, notifWhatsApp: true } }, invoice: true },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff', actorId: req.staff?.id, actorName: req.staff?.name,
        action: paymentAmount > 0 ? 'DAILY_IRON_PAYMENT_RECORDED' : 'DAILY_IRON_WRITE_OFF_RECORDED',
        resource: settlement.payment ? 'payment' : 'financial_adjustment',
        resourceId: settlement.payment?.id || settlement.adjustment?.id || bill.id,
        description: paymentAmount > 0
          ? `Rs ${paymentAmount.toFixed(2)} collected against ${invoice.invoiceNumber}`
          : `Rs ${writeOff.toFixed(2)} written off against ${invoice.invoiceNumber}`,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          billId: bill.id,
          billNumber: bill.billNumber,
          method: normalizedMethod,
          writeOffAmount: writeOff,
          balanceDue: Number(settlement.invoice.balanceDue || 0),
        },
        ...getRequestMeta(req),
      });
      if (settlement.payment && bill.customer?.notifWhatsApp !== false) {
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

const reverseBillPayment = async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) return badRequest(res, 'A correction reason is required');

  try {
    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.ironBill.findUnique({
        where: { id: req.params.billId },
        include: { invoice: true, customer: { select: { id: true, name: true, phone: true } } },
      });
      if (!bill) throw new PaymentRuleError('IRON_BILL_NOT_FOUND', 'Iron bill not found', 404);
      const invoice = bill.invoice || await ensureIronBillInvoice(tx, bill.id, req.staff?.id);
      const reversal = await reverseInvoicePaymentCorrection(tx, {
        invoiceId: invoice.id,
        paymentId: req.params.paymentId,
        reason,
        staff: req.staff,
      });
      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'DAILY_IRON_PAYMENT_ENTRY_VOIDED',
        resource: 'payment',
        resourceId: reversal.payment.id,
        description: `Mistaken payment entry voided for ${bill.billNumber}: ${reason}`,
        metadata: {
          billId: bill.id,
          billNumber: bill.billNumber,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          paymentId: req.params.paymentId,
          balanceDue: Number(reversal.invoice?.balanceDue || 0),
        },
        ...getRequestMeta(req),
      });
      return { bill, payment: reversal.payment, invoice: reversal.invoice };
    }, { isolationLevel: 'Serializable' });

    return success(res, result, 'Payment entry voided');
  } catch (err) {
    console.error('reverseBillPayment error:', err);
    if (err instanceof BillingRuleError || err instanceof PaymentRuleError) {
      if (err.statusCode === 404) return notFound(res, err.message);
      if (err.statusCode === 403) return forbidden(res, err.message);
      return badRequest(res, err.message);
    }
    return error(res, 'Failed to void payment entry');
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
  getMonthlySummary,
  listDailyIronTimeline,
  getLogs,
  getLogsByPeriod,
  createLog,
  createLogsBatch,
  createDaySheet,
  correctLog,
  deleteLog,
  getLogRules,
  generateBill,
  listBillsForCustomer,
  getBillById,
  sendBill,
  recordBillPayment,
  reverseBillPayment,
  applyForSubscription,
  getOwnSubscription,
  getOwnLogs,
  getOwnLogsByMonth,
  getOwnBills,
  pauseOwnSubscription,
  resolveIronRate,
  normalizeManualIronRate,
  resolveAppliedIronRate,
  normalizeIronBatchItems,
  isBillableDailyIronService,
};
