const crypto = require('crypto');
const prisma = require('../config/database');
const { enqueueNotification, NOTIFY_JOB } = require('../queues');
const { processReferralQualification } = require('./referral.service');
const {
  sendDailyIronBillMessage,
  sendDailyIronLogMessage,
  sendDailyIronPaymentMessage,
  sendOrderUpdatedMessage,
  sendPaymentReceivedMessage,
} = require('./whatomate.service');

const OUTBOX_EVENT = Object.freeze({
  ORDER_STATUS: 'ORDER_STATUS',
  ORDER_UPDATED: 'ORDER_UPDATED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  REFERRAL_QUALIFY: 'REFERRAL_QUALIFY',
  DAILY_IRON_BILL: 'DAILY_IRON_BILL',
  DAILY_IRON_LOG: 'DAILY_IRON_LOG',
  DAILY_IRON_PAYMENT: 'DAILY_IRON_PAYMENT',
});

const enqueueOutboxEvent = (tx, {
  eventType,
  aggregateType,
  aggregateId,
  payload = {},
  dedupeKey,
}) => {
  if (!tx) throw new Error('enqueueOutboxEvent requires a Prisma transaction client');
  return tx.outboxEvent.create({
    data: {
      eventType,
      aggregateType,
      aggregateId,
      payload,
      dedupeKey: dedupeKey || `${eventType}:${aggregateId}:${crypto.randomUUID()}`,
    },
  });
};

const getOrderForNotification = (orderId) => prisma.order.findUnique({
  where: { id: orderId },
  include: { customer: { select: { id: true, name: true, phone: true, notifWhatsApp: true, notifPush: true, pushToken: true } } },
});

const handleOutboxEvent = async (event) => {
  const payload = event.payload || {};
  switch (event.eventType) {
    case OUTBOX_EVENT.ORDER_STATUS: {
      const order = await getOrderForNotification(event.aggregateId);
      if (!order) return;
      if (order.customer?.notifWhatsApp !== false) {
        await enqueueNotification(NOTIFY_JOB.ORDER_STATUS, { order, status: payload.status || order.status });
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
      if (!order || order.customer?.notifWhatsApp === false) return;
      const sent = await sendOrderUpdatedMessage(order);
      if (!sent) throw new Error('Order update provider did not accept the message');
      return;
    }
    case OUTBOX_EVENT.PAYMENT_RECEIVED: {
      const [order, payment] = await Promise.all([
        getOrderForNotification(event.aggregateId),
        prisma.payment.findUnique({ where: { id: payload.paymentId } }),
      ]);
      if (!order || !payment || order.customer?.notifWhatsApp === false) return;
      const sent = await sendPaymentReceivedMessage(order, payment.amount, payment.method);
      if (!sent) throw new Error('Payment provider did not accept the message');
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
