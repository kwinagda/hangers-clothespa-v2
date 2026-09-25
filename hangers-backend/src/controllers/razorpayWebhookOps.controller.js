const prisma = require('../config/database');
const { success } = require('../utils/response');
const { paymentApiError } = require('../utils/payment-api-error');
const { getRequestMeta, writeAuditEvent } = require('../services/activity.service');
const { businessDateKey, parseBusinessDateBoundary } = require('../utils/business-time');

const REPLAYABLE_STATUSES = ['REVIEW', 'RETRY', 'FAILED', 'RETRYABLE'];
const CHECKOUT_ATTEMPT_STATUSES = ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'FAILED', 'CREATE_FAILED', 'REVIEW', 'CAPTURED'];
const redactOperatorReason = (value) => String(value || '')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
  .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[redacted-number]')
  .replace(/\b\d{4,16}\b/g, '[redacted-number]')
  .trim()
  .slice(0, 240);

const listRazorpayWebhookEvents = async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const requested = String(req.query.status || 'REVIEW,RETRY').split(',').map((value) => value.trim().toUpperCase());
  const statuses = requested.filter((status) => REPLAYABLE_STATUSES.includes(status));
  if (!statuses.length) {
    return paymentApiError(res, { statusCode: 400, code: 'WEBHOOK_STATUS_FILTER_INVALID', message: 'Choose a supported webhook status filter.', requestId: req.id, retryable: false });
  }

  try {
    const where = { status: { in: statuses } };
    const [events, total] = await Promise.all([
      prisma.razorpayWebhookEvent.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, eventId: true, event: true, paymentId: true, orderId: true,
          refundId: true, settlementId: true, disputeId: true, status: true, attempts: true,
          nextAttemptAt: true, processedAt: true, error: true, createdAt: true, updatedAt: true,
        },
      }),
      prisma.razorpayWebhookEvent.count({ where }),
    ]);
    return success(res, { events, pagination: { page, limit, total } });
  } catch {
    return paymentApiError(res, { statusCode: 500, code: 'WEBHOOK_QUEUE_READ_FAILED', message: 'Could not load Razorpay webhook recovery queue.', requestId: req.id, retryable: true });
  }
};

const listRazorpayDisputeCases = async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  try {
    const [items, total] = await Promise.all([
      prisma.razorpayDisputeCase.findMany({
        orderBy: [{ respondBy: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, providerDisputeId: true, providerPaymentId: true, localPaymentId: true,
          amountPaise: true, amountDeductedPaise: true, currency: true, status: true,
          linkStatus: true, phase: true, reasonCode: true, respondBy: true,
          lastEventId: true, lastEventType: true, mode: true, lastSyncedAt: true, createdAt: true, updatedAt: true,
        },
      }),
      prisma.razorpayDisputeCase.count(),
    ]);
    return success(res, {
      disputes: items.map((item) => ({
        ...item,
        amountPaise: String(item.amountPaise),
        amountDeductedPaise: String(item.amountDeductedPaise),
      })),
      pagination: { page, limit, total },
    });
  } catch {
    return paymentApiError(res, { statusCode: 500, code: 'RAZORPAY_DISPUTE_LIST_FAILED', message: 'Could not load Razorpay dispute cases.', requestId: req.id, retryable: true });
  }
};

const listRazorpayCheckoutAttempts = async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const requestedStatuses = req.query.status == null || req.query.status === ''
    ? null
    : String(req.query.status).split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  const mode = req.query.mode == null || req.query.mode === '' ? null : String(req.query.mode).trim().toUpperCase();
  if ((requestedStatuses && (!requestedStatuses.length || requestedStatuses.some((status) => !CHECKOUT_ATTEMPT_STATUSES.includes(status))))
    || (mode && !['TEST', 'LIVE'].includes(mode))) {
    return paymentApiError(res, {
      statusCode: 400,
      code: 'CHECKOUT_ATTEMPT_FILTER_INVALID',
      message: 'Choose a supported checkout status and TEST or LIVE mode.',
      requestId: req.id,
      retryable: false,
    });
  }

  try {
    const where = {
      ...(requestedStatuses ? { status: { in: [...new Set(requestedStatuses)] } } : {}),
      ...(mode ? { mode } : {}),
    };
    const [attempts, total] = await Promise.all([
      prisma.razorpayCheckoutAttempt.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, invoiceNumber: true, amountPaise: true, currency: true, mode: true, status: true,
          razorpayOrderId: true, razorpayPaymentId: true, requestId: true, failureCode: true,
          providerMethod: true, providerMethodDetail: true, providerErrorCode: true,
          providerErrorSource: true, providerErrorStep: true, providerErrorReason: true,
          createdAt: true, updatedAt: true, completedAt: true,
        },
      }),
      prisma.razorpayCheckoutAttempt.count({ where }),
    ]);
    return success(res, {
      attempts: attempts.map((attempt) => ({ ...attempt, amountPaise: String(attempt.amountPaise) })),
      pagination: { page, limit, total },
    });
  } catch {
    return paymentApiError(res, {
      statusCode: 500,
      code: 'CHECKOUT_ATTEMPT_LIST_FAILED',
      message: 'Could not load Razorpay checkout attempts.',
      requestId: req.id,
      retryable: true,
    });
  }
};

const getRazorpayCheckoutMethodOutcomes = async (req, res) => {
  const mode = req.query.mode == null || req.query.mode === '' ? null : String(req.query.mode).trim().toUpperCase();
  const today = businessDateKey(new Date());
  const defaultFrom = new Date(`${today}T00:00:00.000Z`);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const from = req.query.from == null ? businessDateKey(defaultFrom) : String(req.query.from);
  const to = req.query.to == null ? today : String(req.query.to);
  const start = parseBusinessDateBoundary(from, 'start');
  const end = parseBusinessDateBoundary(to, 'end');
  if (!start || !end || businessDateKey(start) !== from || businessDateKey(end) !== to || end < start
    || (start && end && end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000)
    || (mode && !['TEST', 'LIVE'].includes(mode))) {
    return paymentApiError(res, {
      statusCode: 400,
      code: 'CHECKOUT_ANALYTICS_FILTER_INVALID',
      message: 'Choose a valid date range and TEST or LIVE mode.',
      requestId: req.id,
      retryable: false,
    });
  }

  try {
    const rows = await prisma.razorpayCheckoutAttempt.groupBy({
      by: ['providerMethod', 'mode', 'status'],
      where: { createdAt: { gte: start, lte: end }, ...(mode ? { mode } : {}) },
      _count: { _all: true },
      _sum: { amountPaise: true },
    });
    return success(res, {
      from,
      to,
      mode: mode || 'ALL',
      groups: rows.map((row) => ({
        providerMethod: row.providerMethod,
        mode: row.mode,
        status: row.status,
        count: row._count._all,
        amountPaise: String(row._sum.amountPaise || 0n),
      })),
    });
  } catch {
    return paymentApiError(res, {
      statusCode: 500,
      code: 'CHECKOUT_ANALYTICS_READ_FAILED',
      message: 'Could not load Razorpay checkout method outcomes.',
      requestId: req.id,
      retryable: true,
    });
  }
};

const getRazorpayCheckoutExperimentReport = async (req, res) => {
  const config = require('../utils/razorpay-checkout-experiment').getExperimentConfig();
  if (!config.enabled) {
    return paymentApiError(res, {
      statusCode: 404,
      code: 'CHECKOUT_EXPERIMENT_DISABLED',
      message: 'The Test Mode checkout experiment is not enabled.',
      requestId: req.id,
      retryable: false,
    });
  }

  const today = businessDateKey(new Date());
  const defaultFromDate = new Date(`${today}T00:00:00.000Z`);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const from = req.query.from == null ? businessDateKey(defaultFromDate) : String(req.query.from);
  const to = req.query.to == null ? today : String(req.query.to);
  const start = parseBusinessDateBoundary(from, 'start');
  const end = parseBusinessDateBoundary(to, 'end');
  if (!start || !end || businessDateKey(start) !== from || businessDateKey(end) !== to || end < start
    || end.getTime() - start.getTime() > 90 * 24 * 60 * 60 * 1000) {
    return paymentApiError(res, {
      statusCode: 400,
      code: 'CHECKOUT_EXPERIMENT_RANGE_INVALID',
      message: 'Choose a valid experiment date range of no more than 90 days.',
      requestId: req.id,
      retryable: false,
    });
  }

  try {
    const [events, capturedAttempts] = await Promise.all([
      prisma.$queryRaw`
        SELECT "variant", "eventType", COUNT(*)::int AS "eventCount",
               COUNT(DISTINCT "visitorHash")::int AS "visitorCount"
        FROM "razorpay_checkout_experiment_events"
        WHERE "experimentId" = 'invoice_checkout_presentation_v1'
          AND "mode" = 'TEST'
          AND "createdAt" >= ${start} AND "createdAt" <= ${end}
        GROUP BY "variant", "eventType"
        ORDER BY "variant", "eventType"
      `,
      prisma.razorpayCheckoutAttempt.groupBy({
        by: ['experimentVariant', 'experimentVisitorHash'],
        where: {
          experimentId: 'invoice_checkout_presentation_v1',
          mode: 'TEST',
          status: 'CAPTURED',
          experimentVisitorHash: { not: null },
          createdAt: { gte: start, lte: end },
        },
        _count: { _all: true },
        _sum: { amountPaise: true },
      }),
    ]);

    const byVariant = Object.fromEntries(['A', 'B'].map((variant) => [variant, {
      exposures: 0, exposedVisitors: 0, ctaClicks: 0, ctaVisitors: 0,
      checkoutOpenRequests: 0, checkoutRequestVisitors: 0, dismissed: 0, dismissedVisitors: 0,
      handlerCallbacks: 0, handlerCallbackVisitors: 0, paymentFailedCallbacks: 0, paymentFailureVisitors: 0,
      clientErrors: 0, errorVisitors: 0,
      serverVerifiedCaptureAttempts: 0, serverVerifiedCaptureVisitors: 0, capturedPaise: '0',
    }]));
    const metricMap = {
      EXPOSURE: ['exposures', 'exposedVisitors'],
      CTA_CLICK: ['ctaClicks', 'ctaVisitors'],
      CHECKOUT_OPEN_REQUESTED: ['checkoutOpenRequests', 'checkoutRequestVisitors'],
      CHECKOUT_DISMISSED: ['dismissed', 'dismissedVisitors'],
      CHECKOUT_HANDLER_RETURNED: ['handlerCallbacks', 'handlerCallbackVisitors'],
      PAYMENT_FAILED_CALLBACK: ['paymentFailedCallbacks', 'paymentFailureVisitors'],
      CLIENT_ERROR: ['clientErrors', 'errorVisitors'],
    };
    for (const row of events) {
      const summary = byVariant[row.variant];
      if (!summary) continue;
      if (row.eventType === 'CRM_CAPTURED') continue;
      const keys = metricMap[row.eventType];
      if (keys) {
        summary[keys[0]] = Number(row.eventCount) || 0;
        summary[keys[1]] = Number(row.visitorCount) || 0;
      }
    }
    for (const row of capturedAttempts) {
      const summary = byVariant[row.experimentVariant];
      if (!summary) continue;
      summary.serverVerifiedCaptureAttempts += row._count._all;
      summary.serverVerifiedCaptureVisitors += 1;
      summary.capturedPaise = String(BigInt(summary.capturedPaise) + BigInt(row._sum.amountPaise || 0n));
    }
    return success(res, {
      experimentId: 'invoice_checkout_presentation_v1',
      mode: 'TEST',
      from,
      to,
      variants: byVariant,
      decision: {
        minimumExposedVisitorsPerVariant: 200,
        primaryMetric: 'unique visitors with a server-verified CRM capture / unique exposed visitors',
        guardrails: ['client error rate', 'abandonment rate', 'payment correctness regressions'],
        winnerDeclared: false,
      },
    });
  } catch {
    return paymentApiError(res, {
      statusCode: 500,
      code: 'CHECKOUT_EXPERIMENT_REPORT_FAILED',
      message: 'Could not load the Test Mode checkout experiment report.',
      requestId: req.id,
      retryable: true,
    });
  }
};

const replayRazorpayWebhookEvent = async (req, res) => {
  const reason = redactOperatorReason(req.body?.reason);
  if (reason.length < 8) {
    return paymentApiError(res, {
      statusCode: 400,
      code: 'WEBHOOK_REPLAY_REASON_REQUIRED',
      message: 'Enter a recovery reason of at least 8 characters.',
      requestId: req.id,
      retryable: false,
      fieldErrors: [{ field: 'reason', code: 'REQUIRED', message: 'Provide a short operational reason.' }],
    });
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`SELECT "id" FROM "razorpay_webhook_events" WHERE "id" = ${req.params.id} FOR UPDATE`;
      if (!rows.length) return { kind: 'NOT_FOUND' };
      const current = await tx.razorpayWebhookEvent.findUnique({ where: { id: req.params.id } });
      if (!REPLAYABLE_STATUSES.includes(current.status)) return { kind: 'NOT_REPLAYABLE', status: current.status };

      const updated = await tx.razorpayWebhookEvent.update({
        where: { id: current.id },
        data: { status: 'RECEIVED', attempts: 0, nextAttemptAt: new Date(), lockedAt: null, processedAt: null, error: null },
      });
      await writeAuditEvent(tx, {
        actorType: 'staff',
        actorId: req.staff?.id,
        actorName: req.staff?.name,
        action: 'RAZORPAY_WEBHOOK_MANUAL_REPLAY_REQUESTED',
        status: 'SUCCESS',
        resource: 'razorpay_webhook',
        resourceId: current.eventId,
        description: `Staff requested replay of Razorpay ${current.event} event`,
        metadata: {
          provider: 'RAZORPAY',
          webhookRecordId: current.id,
          eventId: current.eventId,
          event: current.event,
          priorStatus: current.status,
          priorAttempts: current.attempts,
          priorErrorCode: current.error,
          replayReason: reason,
          requestId: req.id || null,
          idempotencyKey: req.idempotencyKey || null,
        },
        ...getRequestMeta(req),
      });
      return { kind: 'REQUEUED', event: updated };
    }, { isolationLevel: 'Serializable' });

    if (outcome.kind === 'NOT_FOUND') return paymentApiError(res, { statusCode: 404, code: 'WEBHOOK_EVENT_NOT_FOUND', message: 'Razorpay webhook event was not found.', requestId: req.id, retryable: false });
    if (outcome.kind === 'NOT_REPLAYABLE') return paymentApiError(res, { statusCode: 409, code: 'WEBHOOK_EVENT_NOT_REPLAYABLE', message: `Event is ${outcome.status}; only failed, retryable, or review events can be replayed.`, requestId: req.id, retryable: false, action: 'CHECK_CURRENT_STATE' });
    return success(res, { eventId: outcome.event.eventId, status: outcome.event.status }, 'Razorpay webhook event queued for replay');
  } catch {
    return paymentApiError(res, { statusCode: 500, code: 'WEBHOOK_REPLAY_FAILED', message: 'Could not queue this webhook event for replay.', requestId: req.id, retryable: true });
  }
};

module.exports = { listRazorpayWebhookEvents, listRazorpayDisputeCases, listRazorpayCheckoutAttempts, getRazorpayCheckoutMethodOutcomes, getRazorpayCheckoutExperimentReport, replayRazorpayWebhookEvent };
