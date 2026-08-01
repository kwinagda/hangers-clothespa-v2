const crypto = require('crypto');
const prisma = require('../config/database');
const { enqueueNotification, NOTIFY_JOB } = require('../queues');
const { processReferralQualification } = require('./referral.service');
const {
  sendDailyIronBillMessage,
  sendDailyIronLogMessage,
  sendDailyIronPaymentMessage,
  sendOrderStatusMessage,
  sendOrderUpdatedMessage,
  sendPaymentReceivedMessage,
} = require('./whatomate.service');
const { getOrderStatuses } = require('./masterData.service');
const { formatDailyIronLogItems } = require('../utils/daily-iron-summary');

const CAPTURED_PAYMENT_STATUSES = new Set(['CAPTURED', 'SUCCESS', 'PAID']);

const OUTBOX_EVENT = Object.freeze({
  ORDER_STATUS: 'ORDER_STATUS',
  ORDER_UPDATED: 'ORDER_UPDATED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  REFERRAL_QUALIFY: 'REFERRAL_QUALIFY',
  DAILY_IRON_BILL: 'DAILY_IRON_BILL',
  DAILY_IRON_LOG: 'DAILY_IRON_LOG',
  DAILY_IRON_LOG_BATCH: 'DAILY_IRON_LOG_BATCH',
  DAILY_IRON_PAYMENT: 'DAILY_IRON_PAYMENT',
});

const ORDER_NOTIFICATION_EVENTS = new Set([
  OUTBOX_EVENT.ORDER_STATUS,
  OUTBOX_EVENT.ORDER_UPDATED,
  OUTBOX_EVENT.PAYMENT_RECEIVED,
]);

const fallbackNotificationLabel = (eventType, payload = {}) => {
  if (eventType === OUTBOX_EVENT.ORDER_STATUS && payload.status) {
    return String(payload.status).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
  }
  if (eventType === OUTBOX_EVENT.ORDER_UPDATED) return 'Order updated';
  if (eventType === OUTBOX_EVENT.PAYMENT_RECEIVED) return 'Payment received';
  return String(eventType).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
};

const logOrderWhatsAppPending = async (tx, { orderId, eventType, payload, outboxEventId }) => {
  if (!orderId || !ORDER_NOTIFICATION_EVENTS.has(eventType)) return;
  await tx.orderStage.create({
    data: {
      orderId,
      stage: 'WHATSAPP_PENDING',
      eventType: 'NOTIFICATION',
      reasonCode: 'WHATSAPP_PENDING',
      notes: `WhatsApp queued: ${fallbackNotificationLabel(eventType, payload)}`,
      metadata: {
        channel: 'WHATSAPP',
        provider: 'WHATOMATE',
        outboxEventId,
        outboxEventType: eventType,
        outcome: 'PENDING',
        payload,
      },
    },
  });
};

const enqueueOutboxEvent = async (tx, {
  eventType,
  aggregateType,
  aggregateId,
  payload = {},
  dedupeKey,
}) => {
  if (!tx) throw new Error('enqueueOutboxEvent requires a Prisma transaction client');
  const event = await tx.outboxEvent.create({
    data: {
      eventType,
      aggregateType,
      aggregateId,
      payload,
      dedupeKey: dedupeKey || `${eventType}:${aggregateId}:${crypto.randomUUID()}`,
    },
  });
  if (aggregateType === 'order') {
    await logOrderWhatsAppPending(tx, {
      orderId: aggregateId,
      eventType,
      payload,
      outboxEventId: event.id,
    });
  }
  return event;
};

const getOrderForNotification = (orderId) => prisma.order.findUnique({
  where: { id: orderId },
  include: { customer: { select: { id: true, name: true, phone: true, notifWhatsApp: true, notifPush: true, pushToken: true } } },
});

const formatStatusLabel = async (status) => {
  if (!status) return 'Notification';
  const statuses = await getOrderStatuses().catch(() => []);
  const configured = statuses.find((item) => item.key === status)?.label;
  if (configured) return configured;
  return String(status).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
};

const notificationLabelForEvent = async (eventType, payload = {}) => {
  if (eventType === OUTBOX_EVENT.ORDER_UPDATED) {
    if (payload.reason === 'PAYMENT_ENTRY_VOIDED') return 'Order updated - Payment entry voided';
    if (payload.reason) return `Order updated - ${await formatStatusLabel(payload.reason)}`;
    return 'Order updated';
  }
  if (eventType === OUTBOX_EVENT.PAYMENT_RECEIVED) return 'Payment received';
  if (eventType === OUTBOX_EVENT.ORDER_STATUS) return await formatStatusLabel(payload.status);
  return await formatStatusLabel(eventType);
};

const logOrderWhatsAppStage = async ({ order, eventType, payload, outcome, error }) => {
  if (!order?.id) return;
  const failed = outcome === 'FAILED';
  const skipped = outcome === 'SKIPPED';
  const label = await notificationLabelForEvent(eventType, payload);
  await prisma.orderStage.create({
    data: {
      orderId: order.id,
      stage: failed ? 'WHATSAPP_FAILED' : skipped ? 'WHATSAPP_SKIPPED' : 'WHATSAPP_SENT',
      eventType: 'NOTIFICATION',
      reasonCode: `WHATSAPP_${outcome}`,
      notes: failed
        ? `WhatsApp failed: ${label}${error ? ` - ${String(error).slice(0, 180)}` : ''}`
        : skipped
          ? `WhatsApp skipped: ${label}${error ? ` - ${String(error).slice(0, 180)}` : ''}`
          : `WhatsApp sent: ${label}`,
      metadata: {
        channel: 'WHATSAPP',
        provider: 'WHATOMATE',
        outboxEventType: eventType,
        outcome,
        orderNumber: order.orderNumber || null,
        customerId: order.customer?.id || null,
        payload,
        error: error ? String(error).slice(0, 500) : null,
      },
    },
  });
};

const handleOutboxEvent = async (event) => {
  const payload = event.payload || {};
  switch (event.eventType) {
    case OUTBOX_EVENT.ORDER_STATUS: {
      const order = await getOrderForNotification(event.aggregateId);
      if (!order) return;
      if (order.customer?.notifWhatsApp === false) {
        await logOrderWhatsAppStage({ order, eventType: event.eventType, payload, outcome: 'SKIPPED', error: 'customer WhatsApp disabled' });
      } else {
        const sent = await sendOrderStatusMessage(order, payload.status || order.status, { throwOnFailure: true });
        if (!sent) throw new Error('Order status provider did not accept the message');
        await logOrderWhatsAppStage({ order, eventType: event.eventType, payload, outcome: 'SENT' });
      }
      if (payload.push && order.customer?.notifPush && order.customer?.pushToken) {
        await enqueueNotification(NOTIFY_JOB.PUSH, {
          token: order.customer.pushToken,
          title: payload.push.title,
          body: payload.push.body,
          payload: { orderId: order.id, status: payload.status || order.status },
        });
      }
      return;
    }
    case OUTBOX_EVENT.ORDER_UPDATED: {
      const order = await getOrderForNotification(event.aggregateId);
      if (!order) return;
      if (order.customer?.notifWhatsApp === false) {
        await logOrderWhatsAppStage({ order, eventType: event.eventType, payload, outcome: 'SKIPPED', error: 'customer WhatsApp disabled' });
        return;
      }
      const sent = await sendOrderUpdatedMessage(order, { throwOnFailure: true });
      if (!sent) throw new Error('Order update provider did not accept the message');
      await logOrderWhatsAppStage({ order, eventType: event.eventType, payload, outcome: 'SENT' });
      return;
    }
    case OUTBOX_EVENT.PAYMENT_RECEIVED: {
      const [order, payment] = await Promise.all([
        getOrderForNotification(event.aggregateId),
        prisma.payment.findUnique({ where: { id: payload.paymentId } }),
      ]);
      if (!order || !payment) return;
      if (order.customer?.notifWhatsApp === false) {
        await logOrderWhatsAppStage({ order, eventType: event.eventType, payload, outcome: 'SKIPPED', error: 'customer WhatsApp disabled' });
        return;
      }
      if (payment.kind !== 'RECEIPT' || !CAPTURED_PAYMENT_STATUSES.has(payment.status)) {
        await logOrderWhatsAppStage({ order, eventType: event.eventType, payload, outcome: 'SKIPPED', error: `payment is ${payment.kind}/${payment.status}` });
        return;
      }
      const sent = await sendPaymentReceivedMessage(order, payment.amount, payment.method, {
        idempotencyKey: `payment-received:${payment.id}`,
        throwOnFailure: true,
      });
      if (!sent) throw new Error('Payment provider did not accept the message');
      await logOrderWhatsAppStage({ order, eventType: event.eventType, payload, outcome: 'SENT' });
      return;
    }
    case OUTBOX_EVENT.REFERRAL_QUALIFY:
      await processReferralQualification(event.aggregateId);
      return;
    case OUTBOX_EVENT.DAILY_IRON_BILL: {
      const bill = await prisma.ironBill.findUnique({
        where: { id: event.aggregateId },
        include: { customer: true },
      });
      if (!bill || bill.customer?.notifWhatsApp === false) return;
      const sent = await sendDailyIronBillMessage({
        customer: bill.customer,
        subscription: { id: bill.subscriptionId },
        bill,
      });
      if (!sent) throw new Error('Daily Iron bill provider did not accept the message');
      return;
    }
    case OUTBOX_EVENT.DAILY_IRON_LOG: {
      const log = await prisma.ironLog.findUnique({
        where: { id: event.aggregateId },
        include: { customer: true, subscription: true },
      });
      if (!log || log.status !== 'ACTIVE' || log.customer?.notifWhatsApp === false) return;
      const monthStart = new Date(log.date);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
      const totals = await prisma.ironLog.aggregate({
        where: { customerId: log.customerId, status: 'ACTIVE', date: { gte: monthStart, lte: monthEnd } },
        _sum: { pieces: true, amount: true },
      });
      const sent = await sendDailyIronLogMessage({
        customer: log.customer,
        subscription: log.subscription,
        log,
        monthToDate: { pieces: totals._sum.pieces || 0, amount: totals._sum.amount || 0 },
      });
      if (!sent) throw new Error('Daily Iron log provider did not accept the message');
      await prisma.ironLog.update({ where: { id: log.id }, data: { whatsappSent: true } });
      return;
    }
    case OUTBOX_EVENT.DAILY_IRON_LOG_BATCH: {
      const logIds = Array.isArray(payload.logIds) ? payload.logIds.filter(Boolean) : [];
      if (!logIds.length) return;
      const logs = await prisma.ironLog.findMany({
        where: { id: { in: logIds } },
        include: { customer: true, subscription: true },
        orderBy: { createdAt: 'asc' },
      });
      const activeLogs = logs.filter((log) => log.status === 'ACTIVE');
      if (!activeLogs.length) return;
      const firstLog = activeLogs[0];
      if (firstLog.customer?.notifWhatsApp === false) return;
      const monthStart = new Date(firstLog.date);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
      const totals = await prisma.ironLog.aggregate({
        where: { customerId: firstLog.customerId, status: 'ACTIVE', date: { gte: monthStart, lte: monthEnd } },
        _sum: { pieces: true, amount: true },
      });
      const totalPieces = activeLogs.reduce((sum, log) => sum + Number(log.pieces || 0), 0);
      const sent = await sendDailyIronLogMessage({
        customer: firstLog.customer,
        subscription: firstLog.subscription,
        log: {
          id: `batch:${logIds.join(':')}`,
          date: firstLog.date,
          pieces: totalPieces,
          serviceName: formatDailyIronLogItems(activeLogs),
        },
        monthToDate: { pieces: totals._sum.pieces || 0, amount: totals._sum.amount || 0 },
      });
      if (!sent) throw new Error('Daily Iron batch log provider did not accept the message');
      await prisma.ironLog.updateMany({ where: { id: { in: activeLogs.map((log) => log.id) } }, data: { whatsappSent: true } });
      return;
    }
    case OUTBOX_EVENT.DAILY_IRON_PAYMENT: {
      const [bill, payment] = await Promise.all([
        prisma.ironBill.findUnique({ where: { id: event.aggregateId }, include: { customer: true } }),
        prisma.payment.findUnique({ where: { id: payload.paymentId } }),
      ]);
      if (!bill || !payment || bill.customer?.notifWhatsApp === false) return;
      const sent = await sendDailyIronPaymentMessage({
        customer: bill.customer,
        subscription: { id: bill.subscriptionId },
        bill,
        amount: payment.amount,
        method: payment.method,
      });
      if (!sent) throw new Error('Daily Iron payment provider did not accept the message');
      return;
    }
    default:
      throw new Error(`Unsupported outbox event: ${event.eventType}`);
  }
};

const claimOutboxBatch = async (limit = 25) => prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw`
    SELECT "id"
    FROM "outbox_events"
    WHERE "status" IN ('PENDING', 'FAILED')
      AND "nextAttemptAt" <= NOW()
      AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '5 minutes')
    ORDER BY "createdAt"
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}
  `;
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  await tx.outboxEvent.updateMany({
    where: { id: { in: ids } },
    data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 } },
  });
  return tx.outboxEvent.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: 'asc' } });
});

const processOutboxBatch = async ({ limit = 25 } = {}) => {
  const events = await claimOutboxBatch(limit);
  for (const event of events) {
    try {
      await handleOutboxEvent(event);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date(), lockedAt: null, lastError: null },
      });
    } catch (error) {
      if ([OUTBOX_EVENT.ORDER_STATUS, OUTBOX_EVENT.ORDER_UPDATED, OUTBOX_EVENT.PAYMENT_RECEIVED].includes(event.eventType)) {
        const order = await getOrderForNotification(event.aggregateId).catch(() => null);
        await logOrderWhatsAppStage({
          order,
          eventType: event.eventType,
          payload: event.payload || {},
          outcome: 'FAILED',
          error: error?.message || error,
        }).catch((stageError) => {
          console.error('[outbox] failed to log WhatsApp failure stage:', stageError?.message || stageError);
        });
      }
      const attempts = Number(event.attempts || 1);
      const dead = attempts >= 10;
      const delayMs = Math.min(60 * 60 * 1000, 1000 * (2 ** Math.min(attempts, 12)));
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: dead ? 'DEAD' : 'FAILED',
          nextAttemptAt: new Date(Date.now() + delayMs),
          lockedAt: null,
          lastError: String(error?.message || error).slice(0, 1000),
        },
      });
    }
  }
  return events.length;
};

module.exports = {
  OUTBOX_EVENT,
  enqueueOutboxEvent,
  handleOutboxEvent,
  processOutboxBatch,
};
